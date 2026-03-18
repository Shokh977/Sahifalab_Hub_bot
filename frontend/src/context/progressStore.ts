/**
 * progressStore — global gamification state (Zustand)
 *
 * XP rules:
 *   Focus:  +10 XP per 5 minutes of active focus (never break time)
 *   Quiz:   +20 XP per correct answer, +100 XP bonus for 100% score
 *
 * Level formula:  Level = floor( sqrt(total_xp / 100) ) + 1
 *
 * Sync strategy (free-tier friendly):
 *   • On timer pause / session complete / skip → immediate sync
 *   • After every quiz verify → immediate sync
 *   • Heartbeat every 5 minutes (set up in ProgressProvider)
 *   • On page unload (beforeunload event in ProgressProvider)
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ── Maths helpers ────────────────────────────────────────────────────────────

/** Level = floor( sqrt(total_xp / 100) ) + 1 */
export const calcLevel = (xp: number): number =>
  Math.floor(Math.sqrt(xp / 100)) + 1

/** XP thresholds for a given level (start = level start, end = level end) */
export const levelBounds = (level: number): { start: number; end: number } => ({
  start: (level - 1) ** 2 * 100,
  end:   level ** 2 * 100,
})

/** 0–1 progress within the current level */
export const levelProgress = (xp: number): number => {
  const level = calcLevel(xp)
  const { start, end } = levelBounds(level)
  if (end === start) return 1
  return Math.max(0, Math.min(1, (xp - start) / (end - start)))
}

/** Format total focus seconds → "HH:MM" */
export const formatFocusTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** XP earned from a given number of focus seconds (+10 per 5 min) */
export const focusSecondsToXP = (seconds: number): number =>
  Math.floor(seconds / 300) * 10

// ── Store interface ──────────────────────────────────────────────────────────

interface ProgressState {
  // Synced with Supabase
  telegramId:        number | null
  firstName:         string
  username:          string
  totalXP:           number
  focusSeconds:      number
  level:             number
  quizzesCompleted:  number

  // Local-only
  pendingFocusSeconds: number   // accumulated since last sync
  isLoading:           boolean
  isSyncing:           boolean
  isInitialized:       boolean

  // Actions
  init:             (telegramId: number, firstName: string, username?: string) => Promise<void>
  addFocusSeconds:  (seconds: number) => void
  addQuizXP:        (score: number, total: number) => void
  syncToSupabase:   () => Promise<void>
  pingPresence:     () => Promise<void>
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useProgressStore = create<ProgressState>((set, get) => ({
  telegramId:          null,
  firstName:           '',
  username:            '',
  totalXP:             0,
  focusSeconds:        0,
  level:               1,
  quizzesCompleted:    0,
  pendingFocusSeconds: 0,
  isLoading:           false,
  isSyncing:           false,
  isInitialized:       false,

  // ── init ────────────────────────────────────────────────────────────────
  init: async (telegramId, firstName, username = '') => {
    // Don't re-init if already initialized for the same user
    if (get().isInitialized && get().telegramId === telegramId) return

    set({ isLoading: true, telegramId, firstName, username })

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('total_xp, focus_seconds, level, quizzes_completed')
        .eq('telegram_id', telegramId)
        .single()

      if (data && !error) {
        set({
          totalXP:          data.total_xp          ?? 0,
          focusSeconds:     data.focus_seconds      ?? 0,
          level:            data.level              ?? 1,
          quizzesCompleted: data.quizzes_completed  ?? 0,
          isInitialized:    true,
        })
      } else {
        // Brand-new user: insert a baseline row
        await supabase.from('profiles').upsert(
          { telegram_id: telegramId, first_name: firstName, username },
          { onConflict: 'telegram_id' },
        )
        set({ isInitialized: true })
      }
    } catch {
      // Offline or misconfigured Supabase — work locally, sync when possible
      set({ isInitialized: true })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── addFocusSeconds ─────────────────────────────────────────────────────
  addFocusSeconds: (seconds: number) => {
    if (seconds <= 0) return
    set((state) => {
      const newFocus = state.focusSeconds + seconds
      // XP delta: floor(newFocus/300)*10 - floor(oldFocus/300)*10
      const xpDelta =
        focusSecondsToXP(newFocus) - focusSecondsToXP(state.focusSeconds)
      const newXP   = state.totalXP + xpDelta
      return {
        focusSeconds:        newFocus,
        pendingFocusSeconds: state.pendingFocusSeconds + seconds,
        totalXP:             newXP,
        level:               calcLevel(newXP),
      }
    })
  },

  // ── addQuizXP ───────────────────────────────────────────────────────────
  addQuizXP: (score: number, total: number) => {
    const gained = score * 20 + (score === total && total > 0 ? 100 : 0)
    if (gained <= 0) return
    set((state) => {
      const newXP = state.totalXP + gained
      return {
        totalXP:          newXP,
        level:            calcLevel(newXP),
        quizzesCompleted: state.quizzesCompleted + 1,
      }
    })
    // Fire-and-forget sync after quiz
    get().syncToSupabase()
  },

  // ── syncToSupabase ──────────────────────────────────────────────────────
  syncToSupabase: async () => {
    const state = get()
    if (!state.telegramId || state.isSyncing || !state.isInitialized) return

    set({ isSyncing: true })
    try {
      await supabase.from('profiles').upsert(
        {
          telegram_id:       state.telegramId,
          first_name:        state.firstName,
          username:          state.username,
          total_xp:          state.totalXP,
          focus_seconds:     state.focusSeconds,
          level:             state.level,
          quizzes_completed: state.quizzesCompleted,
        },
        { onConflict: 'telegram_id' },
      )
      set({ pendingFocusSeconds: 0 })
    } catch {
      // Silent fail — next heartbeat or action will retry
    } finally {
      set({ isSyncing: false })
    }
  },

  pingPresence: async () => {
    const state = get()
    if (!state.telegramId || !state.isInitialized) return

    try {
      await supabase.from('profiles').upsert(
        {
          telegram_id:  state.telegramId,
          first_name:   state.firstName,
          username:     state.username,
          app_online_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_id' },
      )
    } catch {
      // Silent fail — next presence tick will retry
    }
  },
}))
