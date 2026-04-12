/**
 * progressStore — global gamification state (Zustand)
 *
 * XP rules (exponential model):
 *   Focus:  1.66 XP per minute of active focus (≈ 100 XP/hour) — unlimited
 *   Quiz:   25 XP per quiz — server-enforced cap of 100 XP per UTC day
 *   Course: 200 XP per completed course — server-enforced one-time per course
 *
 * Level formula:  Target_XP = 100 × Level^2.5
 *   Level 1  →      0 XP base
 *   Level 10 → 31,623 XP
 *   Level 27 → 378,845 XP  (Sohibqiron — max level)
 *
 * Sync strategy (low-egress):
 *   • Focus XP delta → POST /api/xp/add (source=DEEP_WORK) via Postgres RPC
 *   • Quiz XP        → POST /api/xp/add (source=QUIZ)
 *   • Course XP      → POST /api/xp/add (source=COURSE)
 *   • Presence ping  → POST /api/profiles/sync (focus_seconds, app_online_at)
 *   • Heartbeat every 5 minutes (ProgressProvider)
 *   • On page unload (beforeunload in ProgressProvider)
 */

import { create } from 'zustand'

import { API_BASE } from '../lib/apiUrl'

// ── XP rate constants ────────────────────────────────────────────────────────

/** 1.66 XP per minute of focus (≈ 100 XP/hour) */
export const FOCUS_XP_PER_MINUTE = 1.66

/** XP earned from focus seconds (1.66 XP/min, rounded) */
export const focusSecondsToXP = (seconds: number): number =>
  Math.round((seconds / 60) * FOCUS_XP_PER_MINUTE)

/** Format total focus seconds → "HH:MM" */
export const formatFocusTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Level maths (exponential formula) ────────────────────────────────────────

/**
 * Returns the current level for a given XP total.
 * Formula: level N when 100×(N+1)^2.5 > xp (minimum 1, maximum 27).
 * Mirrors the server-side calculate_level_from_xp() Postgres function exactly.
 */
export const calcLevel = (xp: number): number => {
  let lv = 1
  while (100 * Math.pow(lv + 1, 2.5) <= xp) {
    lv++
    if (lv >= 27) break
  }
  return lv
}

/**
 * XP range for a given level: { start, end }
 *   start = XP at which the user entered this level (0 for level 1)
 *   end   = XP threshold to advance to the next level
 */
export const levelBounds = (level: number): { start: number; end: number } => {
  const start = level <= 1 ? 0 : Math.round(100 * Math.pow(level, 2.5))
  const end   = Math.round(100 * Math.pow(Math.min(level + 1, 28), 2.5))
  return { start, end }
}

/** 0–1 progress within the current level */
export const levelProgress = (xp: number): number => {
  const level = calcLevel(xp)
  const { start, end } = levelBounds(level)
  if (end <= start) return 1
  return Math.max(0, Math.min(1, (xp - start) / (end - start)))
}

// ── Store interface ──────────────────────────────────────────────────────────

interface ProgressState {
  // Synced with server
  telegramId:          number | null
  firstName:           string
  username:            string
  totalXP:             number
  focusSeconds:        number
  totalFocusMinutes:   number     // derived from focusSeconds, stored in DB
  level:               number
  quizzesCompleted:    number
  dailyQuizXP:         number     // quiz XP used today (server cap: 100 XP/day)

  // Local-only
  pendingFocusSeconds: number     // accumulated since last sync
  isLoading:           boolean
  isSyncing:           boolean
  isInitialized:       boolean

  // Actions
  init:            (telegramId: number, firstName: string, username?: string) => Promise<void>
  addFocusSeconds: (seconds: number) => void
  addQuizXP:       (score: number, total: number) => void     // server RPC (25 XP flat)
  addCourseXP:     (courseId: number) => Promise<{ xp_added: number }>
  syncToSupabase:  () => Promise<void>
  pingPresence:    () => Promise<void>
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useProgressStore = create<ProgressState>((set, get) => ({
  telegramId:          null,
  firstName:           '',
  username:            '',
  totalXP:             0,
  focusSeconds:        0,
  totalFocusMinutes:   0,
  level:               1,
  quizzesCompleted:    0,
  dailyQuizXP:         0,
  pendingFocusSeconds: 0,
  isLoading:           false,
  isSyncing:           false,
  isInitialized:       false,

  // ── init ────────────────────────────────────────────────────────────────
  init: async (telegramId, firstName, username = '') => {
    if (get().isInitialized && get().telegramId === telegramId) return

    set({ isLoading: true, telegramId, firstName, username })

    try {
      const res  = await fetch(`${API_BASE}/api/profiles/${telegramId}`)
      const data = res.ok ? await res.json() : null

      if (data) {
        set({
          totalXP:           data.total_xp           ?? 0,
          focusSeconds:      data.focus_seconds       ?? 0,
          totalFocusMinutes: data.total_focus_minutes ?? 0,
          dailyQuizXP:       data.daily_quiz_xp       ?? 0,
          level:             data.level               ?? calcLevel(data.total_xp ?? 0),
          quizzesCompleted:  data.quizzes_completed   ?? 0,
          isInitialized:     true,
        })
      } else {
        // Brand-new user: create a profile row
        await fetch(`${API_BASE}/api/profiles/upsert`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ telegram_id: telegramId, first_name: firstName, username }),
        })
        set({ isInitialized: true })
      }
    } catch {
      // Offline — work locally, sync when possible
      set({ isInitialized: true })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── addFocusSeconds ─────────────────────────────────────────────────────
  // Updates local state for real-time UX; the XP delta is sent to the server
  // via /api/xp/add (DEEP_WORK) on the next syncToSupabase() call.
  addFocusSeconds: (seconds: number) => {
    if (seconds <= 0) return
    set((state) => {
      const newFocusSeconds = state.focusSeconds + seconds
      const xpDelta =
        focusSecondsToXP(newFocusSeconds) - focusSecondsToXP(state.focusSeconds)
      const newXP = state.totalXP + xpDelta
      return {
        focusSeconds:        newFocusSeconds,
        totalFocusMinutes:   Math.floor(newFocusSeconds / 60),
        pendingFocusSeconds: state.pendingFocusSeconds + seconds,
        totalXP:             newXP,
        level:               calcLevel(newXP),
      }
    })
  },

  // ── addQuizXP ───────────────────────────────────────────────────────────
  // Flat 25 XP per quiz (score/total params kept for backward compat).
  // Optimistic local update; server enforces the 100 XP/day daily cap.
  addQuizXP: (_score: number, _total: number) => {
    const state = get()
    if (!state.telegramId) return

    const QUIZ_XP = 25

    // Optimistic update — corrected by server response below
    set(s => ({
      totalXP:          s.totalXP + QUIZ_XP,
      level:            calcLevel(s.totalXP + QUIZ_XP),
      quizzesCompleted: s.quizzesCompleted + 1,
      dailyQuizXP:      Math.min(100, s.dailyQuizXP + QUIZ_XP),
    }))

    // Server enforces daily cap and writes the audit log
    fetch(`${API_BASE}/api/xp/add`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        telegram_id: state.telegramId,
        source:      'QUIZ',
        amount:      QUIZ_XP,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.new_xp !== undefined) {
          set({
            totalXP: data.new_xp,
            level:   data.new_level ?? calcLevel(data.new_xp),
          })
        }
      })
      .catch(() => { /* silent — optimistic state stays until next init */ })
  },

  // ── addCourseXP ─────────────────────────────────────────────────────────
  // 200 XP one-time per course, server-side deduped by courseId.
  addCourseXP: async (courseId: number) => {
    const state = get()
    if (!state.telegramId) return { xp_added: 0 }

    try {
      const res  = await fetch(`${API_BASE}/api/xp/add`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          telegram_id:  state.telegramId,
          source:       'COURSE',
          amount:       200,
          reference_id: courseId,
        }),
      })
      const data = await res.json()
      if (data.new_xp !== undefined && data.xp_added > 0) {
        set({
          totalXP: data.new_xp,
          level:   data.new_level ?? calcLevel(data.new_xp),
        })
      }
      return { xp_added: data.xp_added ?? 0 }
    } catch {
      return { xp_added: 0 }
    }
  },

  // ── syncToSupabase ──────────────────────────────────────────────────────
  syncToSupabase: async () => {
    const state = get()
    if (!state.telegramId || state.isSyncing || !state.isInitialized) return

    set({ isSyncing: true })
    const pendingSeconds = state.pendingFocusSeconds
    const focusXPDelta   = focusSecondsToXP(pendingSeconds)
    const totalFocusMin  = Math.floor(state.focusSeconds / 60)

    try {
      // 1. Report DEEP_WORK XP delta via anti-cheat RPC
      if (focusXPDelta > 0) {
        const xpRes = await fetch(`${API_BASE}/api/xp/add`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            telegram_id: state.telegramId,
            source:      'DEEP_WORK',
            amount:      focusXPDelta,
          }),
        })
        if (xpRes.ok) {
          const data = await xpRes.json()
          if (data.new_xp !== undefined) {
            set({
              totalXP: data.new_xp,
              level:   data.new_level ?? calcLevel(data.new_xp),
            })
          }
        }
      }

      // 2. Sync presence + focus seconds (server owns total_xp via add_xp)
      await fetch(`${API_BASE}/api/profiles/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          telegram_id:         state.telegramId,
          first_name:          state.firstName,
          username:            state.username,
          focus_seconds:       state.focusSeconds,
          total_focus_minutes: totalFocusMin,
          quizzes_completed:   state.quizzesCompleted,
          app_online_at:       new Date().toISOString(),
        }),
      })

      set({
        pendingFocusSeconds: 0,
        totalFocusMinutes:   totalFocusMin,
      })
    } catch {
      // Silent fail — next heartbeat will retry
    } finally {
      set({ isSyncing: false })
    }
  },

  // ── pingPresence ─────────────────────────────────────────────────────────
  pingPresence: async () => {
    const state = get()
    if (!state.telegramId || !state.isInitialized) return

    try {
      await fetch(`${API_BASE}/api/profiles/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          telegram_id:  state.telegramId,
          first_name:   state.firstName,
          username:     state.username,
          app_online_at: new Date().toISOString(),
        }),
      })
    } catch {
      // Silent fail
    }
  },
}))
