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

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  useProgressStore,
  calcLevel,
  levelBounds,
  levelProgress,
  formatFocusTime,
} from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

// ── Level colour tiers (orange-forward) ───────────────────────────────────────
function levelGradient(level: number): string {
  if (level >= 20) return 'from-rose-400 to-pink-600'
  if (level >= 15) return 'from-violet-400 to-indigo-600'
  if (level >= 10) return 'from-sahifa-400 to-red-500'
  if (level >= 7)  return 'from-amber-400 to-sahifa-500'
  if (level >= 5)  return 'from-sahifa-400 to-sahifa-600'
  if (level >= 3)  return 'from-orange-400 to-sahifa-500'
  if (level >= 2)  return 'from-yellow-400 to-sahifa-400'
  return 'from-slate-400 to-slate-500'
}

function levelLabel(level: number): string {
  if (level >= 20) return '💎'
  if (level >= 15) return '👑'
  if (level >= 10) return '🔥'
  if (level >= 7)  return '⚡'
  if (level >= 5)  return '🏆'
  if (level >= 3)  return '📚'
  if (level >= 2)  return '🌿'
  return '🌱'
}

// ── Component ─────────────────────────────────────────────────────────────────
const GlobalProgressBar: React.FC = () => {
  const navigate = useNavigate()
  const { user: tgUser } = useTelegramWebApp()
  const { totalXP, level, focusSeconds, isInitialized, isSyncing } =
    useProgressStore()

  const [photoError, setPhotoError] = useState(false)
  const photoUrl = (!photoError && tgUser?.photo_url) ? tgUser.photo_url : null

  // Don't render until profile is loaded (avoids flash of level 1)
  if (!isInitialized) return null

  const progress        = levelProgress(totalXP)
  const { start, end }  = levelBounds(level)
  const xpInLevel       = totalXP - start
  const xpForLevel      = end - start
  const grad            = levelGradient(level)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Daraja ${level} — kabinetni ochish`}
      className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-sahifa-500/10 px-4 py-2.5 cursor-pointer select-none active:opacity-80 transition-all duration-300"
      onClick={() => navigate('/cabinet')}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/cabinet')}
    >
      <div className="max-w-md mx-auto flex items-center gap-3">

        {/* ── Avatar / Level badge ─────────────────────────────────────── */}
        <div className="flex-shrink-0 relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="avatar"
              onError={() => setPhotoError(true)}
              className="w-10 h-10 rounded-full object-cover shadow-glow-sm ring-2 ring-sahifa-500/20 dark:ring-sahifa-500/30"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex flex-col items-center justify-center shadow-glow-sm`}
            >
              <span className="text-[10px] leading-none">
                {levelLabel(level)}
              </span>
              <span className="text-white text-[10px] font-bold leading-none mt-0.5">
                {level}
              </span>
            </div>
          )}
          {/* Gold star level chip */}
          {photoUrl && (
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-sahifa-500 flex items-center justify-center shadow-glow-sm text-white text-[9px] font-black border border-white dark:border-slate-950"
            >
              {level}
            </div>
          )}
        </div>

        {/* ── XP bar ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-sahifa-600 dark:text-sahifa-300/90 truncate">
              ⭐ Daraja&nbsp;{level}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 tabular-nums ml-2 flex-shrink-0">
              {xpInLevel.toLocaleString()}&nbsp;/&nbsp;{xpForLevel.toLocaleString()}&nbsp;XP
            </span>
          </div>

          {/* Neon progress track */}
          <div className="h-2 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
            <motion.div
              className="h-full rounded-full neon-bar"
              initial={false}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
            />
          </div>
        </div>

        {/* ── Focus clock ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
          <span className="text-sm">⏱</span>
          <span className="font-mono font-semibold tabular-nums text-sahifa-500/80 dark:text-sahifa-400/80">
            {formatFocusTime(focusSeconds)}
          </span>
        </div>

        {/* ── Syncing indicator ─────────────────────────────────────────── */}
        {isSyncing && (
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sahifa-400 animate-pulse" />
        )}
      </div>
    </div>
  )
}

export default GlobalProgressBar
