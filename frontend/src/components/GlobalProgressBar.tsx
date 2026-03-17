/**
 * GlobalProgressBar — sticky top header visible on every page.
 *
 * Shows:
 *   • Circular level badge (colour changes with level tier)
 *   • XP progress bar toward next level (framer-motion liquid fill)
 *   • XP counter (current / needed)
 *   • Focus-time clock (HH:MM)
 *
 * Tapping anywhere on the bar navigates to /cabinet.
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

// ── Level colour tiers ────────────────────────────────────────────────────────
function levelGradient(level: number): string {
  if (level >= 20) return 'from-rose-400 to-pink-600'
  if (level >= 15) return 'from-indigo-400 to-violet-600'
  if (level >= 10) return 'from-orange-400 to-red-500'
  if (level >= 7)  return 'from-yellow-400 to-amber-500'
  if (level >= 5)  return 'from-purple-400 to-purple-600'
  if (level >= 3)  return 'from-blue-400 to-blue-600'
  if (level >= 2)  return 'from-emerald-400 to-green-500'
  return 'from-gray-400 to-gray-500'
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
      className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 cursor-pointer select-none active:opacity-80 transition-opacity"
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
              className="w-10 h-10 rounded-full object-cover shadow-md ring-2 ring-white dark:ring-gray-800"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex flex-col items-center justify-center shadow-md`}
            >
              <span className="text-white text-[10px] font-bold leading-none">
                {levelLabel(level)}
              </span>
              <span className="text-white text-[10px] font-bold leading-none mt-0.5">
                {level}
              </span>
            </div>
          )}
          {/* Level number chip — shown on top of photo */}
          {photoUrl && (
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow text-white text-[9px] font-black border border-white dark:border-gray-900`}
            >
              {level}
            </div>
          )}
        </div>

        {/* ── XP bar ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
              Daraja&nbsp;{level}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums ml-2 flex-shrink-0">
              {xpInLevel.toLocaleString()}&nbsp;/&nbsp;{xpForLevel.toLocaleString()}&nbsp;XP
            </span>
          </div>

          {/* Progress track */}
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${grad}`}
              initial={false}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}  /* spring-like */
            />
          </div>
        </div>

        {/* ── Focus clock ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="text-base">⏱</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatFocusTime(focusSeconds)}
          </span>
        </div>

        {/* ── Syncing indicator (tiny dot) ──────────────────────────────── */}
        {isSyncing && (
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        )}
      </div>
    </div>
  )
}

export default GlobalProgressBar
