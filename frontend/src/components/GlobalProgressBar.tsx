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
import { Award, ChevronRight, Clock3 } from 'lucide-react'
import {
  useProgressStore,
  levelBounds,
  levelProgress,
  formatFocusTime,
} from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { useAuth } from '../context/AuthContext'
import { getLevelTitle } from '../utils/levelTitles'

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

  const { user: authUser } = useAuth()
  const [photoError, setPhotoError] = useState(false)
  // Telegram mode: use WebApp photo. Web mode: fall back to auth profile photo.
  const rawPhoto = tgUser?.photo_url ?? authUser?.photo_url ?? null
  const photoUrl = (!photoError && rawPhoto) ? rawPhoto : null

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
              <Award className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
          )}
          {photoUrl && (
            <div
              className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-sahifa-500 flex items-center justify-center shadow-sm text-white text-[9px] font-black border border-white dark:border-[#0F0F0F]"
            >
              {level}
            </div>
          )}
        </div>

        {/* ── XP bar ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
              <span className="text-sahifa-500">Level {level}</span>
              <span className="text-gray-400 dark:text-gray-500 font-medium truncate">{levelLabel(level)}</span>
            </span>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 tabular-nums ml-2 flex-shrink-0">
              {xpInLevel.toLocaleString()}&nbsp;/&nbsp;{xpForLevel.toLocaleString()}&nbsp;XP
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
          <Clock3 className="w-3.5 h-3.5" strokeWidth={1.9} />
          <span className="font-mono font-semibold tabular-nums text-sahifa-500/80 dark:text-sahifa-400/80">
            {formatFocusTime(focusSeconds)}
          </span>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" strokeWidth={2} />

        {/* ── Syncing indicator ─────────────────────────────────────────── */}
        {isSyncing && (
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sahifa-400 animate-pulse" />
        )}
      </div>
    </div>
  )
}

export default GlobalProgressBar
