/**
 * GlobalProgressBar — premium sticky header with neon orange XP bar.
 *
 * Shows:
 *   • Avatar or gold star level badge
 *   • Neon orange XP bar with shimmer effect
 *   • XP counter (current / needed)
 *   • Focus-time clock
 *
 * Tapping anywhere navigates to /cabinet.
 */

import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRightIcon, ClockIcon, TrophyIcon, UserIcon } from '@heroicons/react/24/outline'
import {
  useProgressStore,
  levelBounds,
  levelProgress,
  formatFocusTime,
} from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { useAuth } from '../context/AuthContext'
import { getLevelTitle } from '../utils/levelTitles'
import NotificationBell from './NotificationBell'

// ── Level colour tiers (orange-forward) ───────────────────────────────────────
function levelGradient(level: number): string {
  if (level >= 50) return 'from-amber-300 to-yellow-600'
  if (level >= 40) return 'from-rose-500 to-pink-700'
  if (level >= 30) return 'from-indigo-500 to-violet-700'
  if (level >= 25) return 'from-fuchsia-400 to-purple-600'
  if (level >= 20) return 'from-rose-400 to-pink-600'
  if (level >= 15) return 'from-violet-400 to-indigo-600'
  if (level >= 10) return 'from-orange-400 to-red-500'
  if (level >= 7)  return 'from-amber-400 to-yellow-500'
  if (level >= 5)  return 'from-purple-400 to-purple-600'
  if (level >= 3)  return 'from-blue-400 to-blue-600'
  if (level >= 2)  return 'from-emerald-400 to-green-500'
  return 'from-slate-400 to-slate-500'
}

function levelLabel(level: number): string {
  return getLevelTitle(level)
}

// ── Component ─────────────────────────────────────────────────────────────────
const GlobalProgressBar: React.FC = () => {
  const navigate = useNavigate()
  const { user: tgUser } = useTelegramWebApp()
  const { totalXP, level, focusSeconds, isInitialized, isSyncing } =
    useProgressStore()

  const { user: authUser, isAuthenticated, isLoading: authLoading } = useAuth()
  const [photoError, setPhotoError] = useState(false)

  // ── SWR: read cached XP/level for instant render (all hooks must be at top) ─
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem('sahifa:xp_cache')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [])

  // Persist live values to localStorage when store initializes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('sahifa:xp_cache', JSON.stringify({ totalXP, level, focusSeconds }))
    }
  }, [isInitialized, totalXP, level, focusSeconds])

  // Telegram mode: use WebApp photo. Web mode: fall back to auth profile photo.
  const rawPhoto = tgUser?.photo_url ?? authUser?.photo_url ?? null
  const photoUrl = (!photoError && rawPhoto) ? rawPhoto : null

  // ── Guest mode: unauthenticated, not loading ─────────────────────────────
  // (ALL hooks are above this point — safe to return early here)
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="sticky top-0 z-50 bg-gradient-to-r from-sahifa-50/90 via-purple-50/60 to-blue-50/90 dark:from-[#1a0808]/95 dark:via-[#0f0818]/95 dark:to-[#08101a]/95 backdrop-blur-xl border-b border-sahifa-200/40 dark:border-[#2A2A2A] px-4 py-2.5">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          {/* Gradient guest avatar */}
          <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-sahifa-400 via-purple-500 to-blue-500 flex items-center justify-center shadow-glow-sm">
            <UserIcon className="w-[18px] h-[18px] text-white" />
          </div>

          {/* Greeting + blurred placeholder stats */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-900 dark:text-white">
                Assalomu alaykum, <span className="text-sahifa-500">Mehmon!</span> 👋
              </span>
              <span className="text-[10px] text-gray-400 dark:text-slate-500 select-none tabular-nums blur-sm">
                0&nbsp;/&nbsp;100&nbsp;XP
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-[#1A1A1A] rounded-full overflow-hidden relative border border-gray-200/70 dark:border-[#2A2A2A]">
              <div className="h-full w-[8%] rounded-full bg-gradient-to-r from-sahifa-200 to-sahifa-300 dark:from-sahifa-900/40 dark:to-sahifa-800/40" />
            </div>
          </div>

          {/* Blurred focus clock */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 select-none blur-sm">
            <ClockIcon className="w-3.5 h-3.5" />
            <span className="font-mono font-semibold">00:00</span>
          </div>

          {/* CTA button */}
          <button
            onClick={() => navigate('/login')}
            className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sahifa-500 to-sahifa-600 text-white text-[11px] font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            O'sishni boshlash 🚀
          </button>
        </div>
      </div>
    )
  }

  // Display values: use live data when ready, otherwise cached
  const displayXP    = isInitialized ? totalXP      : (cached?.totalXP ?? 0)
  const displayLevel = isInitialized ? level        : (cached?.level ?? 1)
  const displayFocus = isInitialized ? focusSeconds : (cached?.focusSeconds ?? 0)

  // Skeleton when no data at all (first-ever visit, authenticated)
  if (!isInitialized && !cached) {
    return (
      <div className="sticky top-0 z-50 bg-white/88 dark:bg-[#0F0F0F]/92 backdrop-blur-xl border-b border-gray-200/70 dark:border-[#2A2A2A] px-4 py-2.5">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-200 dark:bg-[#2A2A2A] animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 bg-gray-200 dark:bg-[#2A2A2A] rounded animate-pulse" />
            <div className="h-2 w-full bg-gray-100 dark:bg-[#1A1A1A] rounded-full" />
          </div>
          <div className="hidden sm:block w-16 h-8 rounded-2xl bg-gray-100 dark:bg-[#1A1A1A] animate-pulse" />
          <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-[#1A1A1A] animate-pulse" />
        </div>
      </div>
    )
  }

  const progress        = levelProgress(displayXP)
  const { start, end }  = levelBounds(displayLevel)
  const xpInLevel       = displayXP - start
  const xpForLevel      = end - start
  const grad            = levelGradient(displayLevel)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Daraja ${displayLevel} — kabinetni ochish`}
      className="sticky top-0 z-50 bg-white/88 dark:bg-[#0F0F0F]/92 backdrop-blur-xl border-b border-gray-200/70 dark:border-[#2A2A2A] px-4 py-2.5 cursor-pointer select-none active:opacity-80 transition-all duration-300"
      onClick={() => navigate('/cabinet')}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/cabinet')}
    >
      <div className="max-w-[1200px] mx-auto flex items-center gap-3">

        {/* ── Avatar / Level badge ─────────────────────────────────────── */}
        <div className="flex-shrink-0 relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="avatar"
              onError={() => setPhotoError(true)}
              className="w-10 h-10 rounded-2xl object-cover shadow-sm ring-1 ring-gray-200 dark:ring-[#2A2A2A]"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}
            >
              <TrophyIcon className="w-4 h-4 text-white" />
            </div>
          )}
          {photoUrl && (
            <div
              className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-sahifa-500 flex items-center justify-center shadow-sm text-white text-[9px] font-black border border-white dark:border-[#0F0F0F]"
            >
              {displayLevel}
            </div>
          )}
        </div>

        {/* ── XP bar ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
              <span className="text-sahifa-500">Level {displayLevel}</span>
              <span className="text-gray-400 dark:text-gray-500 font-medium truncate">{levelLabel(displayLevel)}</span>
            </span>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 tabular-nums ml-2 flex-shrink-0">
              {displayXP.toLocaleString()}&nbsp;/&nbsp;{end.toLocaleString()}&nbsp;XP
            </span>
          </div>

          <div className="h-2 bg-gray-100 dark:bg-[#1A1A1A] rounded-full overflow-hidden relative border border-gray-200/70 dark:border-[#2A2A2A]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sahifa-500 to-sahifa-600"
              initial={false}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
            />
          </div>
        </div>

        {/* ── Focus clock ───────────────────────────────────────────────── */}
        <div className="hidden sm:flex flex-shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 rounded-2xl px-3 py-2 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200/70 dark:border-[#2A2A2A]">
          <ClockIcon className="w-3.5 h-3.5" />
          <span className="font-mono font-semibold tabular-nums text-sahifa-500/80 dark:text-sahifa-400/80">
            {formatFocusTime(displayFocus)}
          </span>
        </div>

        {/* ── Notification Bell — stopPropagation prevents cabinet nav ─── */}
        <div
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <NotificationBell />
        </div>

        <ChevronRightIcon className="w-4 h-4 text-gray-300 dark:text-gray-600" />

        {/* ── Syncing indicator ─────────────────────────────────────────── */}
        {isSyncing && (
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sahifa-400 animate-pulse" />
        )}
      </div>
    </div>
  )
}

export default GlobalProgressBar
