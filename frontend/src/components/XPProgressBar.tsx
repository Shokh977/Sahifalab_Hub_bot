/**
 * XPProgressBar — Bento-style XP progress card for the Kabinet page.
 *
 * Displays:
 *   • Current rank emoji + title + level badge
 *   • Total XP with animated horizontal progress bar (current → next level)
 *   • "Keyingi darajaga {xp_left} XP yoki {hours_left} soat fokus qoldi"
 *   • Daily quiz XP budget (0–100 XP / 4 quizzes max)
 *   • Total focus time pill
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Zap, BookOpen, Clock } from 'lucide-react'
import { calcLevel, levelBounds, levelProgress, FOCUS_XP_PER_MINUTE } from '../context/progressStore'
import { getLevelInfo, getLevelEmoji } from '../utils/levelTitles'

// ── Types ─────────────────────────────────────────────────────────────────────

interface XPProgressBarProps {
  totalXP:            number
  level:              number
  dailyQuizXP?:       number   // 0–100 XP used today
  totalFocusMinutes?: number   // total lifetime focus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** XP per hour of deep focus (1.66 XP/min × 60) */
const XP_PER_HOUR = FOCUS_XP_PER_MINUTE * 60   // ≈ 99.6

// ── Component ─────────────────────────────────────────────────────────────────

const XPProgressBar: React.FC<XPProgressBarProps> = ({
  totalXP,
  level,
  dailyQuizXP   = 0,
  totalFocusMinutes = 0,
}) => {
  const currentLevel  = calcLevel(totalXP)
  const bounds        = levelBounds(currentLevel)
  const progress      = levelProgress(totalXP)
  const xpLeft        = Math.max(0, bounds.end - totalXP)
  const hoursLeft     = (xpLeft / XP_PER_HOUR).toFixed(1)
  const levelInfo     = getLevelInfo(currentLevel)
  const nextLevelInfo = getLevelInfo(Math.min(27, currentLevel + 1))
  const levelEmoji    = getLevelEmoji(currentLevel)
  const isMaxLevel    = currentLevel >= 27

  // Daily quiz budget
  const QUIZ_DAILY_CAP    = 100
  const QUIZ_XP_EACH      = 25
  const quizUsedToday     = Math.min(QUIZ_DAILY_CAP, dailyQuizXP)
  const quizzesRemaining  = Math.max(0, Math.floor((QUIZ_DAILY_CAP - quizUsedToday) / QUIZ_XP_EACH))
  const quizBarPct        = (quizUsedToday / QUIZ_DAILY_CAP) * 100

  // Focus display
  const focusDisplay = totalFocusMinutes >= 60
    ? `${(totalFocusMinutes / 60).toFixed(1)}h`
    : `${totalFocusMinutes}d`

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-[24px] bg-white dark:bg-[#1C1C22] border border-slate-100 dark:border-white/[0.07] p-5 shadow-sm overflow-hidden relative"
    >
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br from-orange-400/10 to-red-500/5 blur-2xl"
      />

      {/* ── Row 1: Rank + XP count ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-xl shadow-md shadow-orange-500/20 flex-shrink-0">
            {levelEmoji}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
              {levelInfo.title}
            </p>
            <p className="text-xs text-gray-400 dark:text-white/40 leading-tight">
              {isMaxLevel ? 'Maksimal daraja' : `Daraja ${currentLevel}`}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black text-gray-900 dark:text-white tabular-nums leading-none">
            {totalXP.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5">umumiy XP</p>
        </div>
      </div>

      {/* ── Row 2: Progress bar ────────────────────────────────────────────── */}
      <div className="relative z-10 mb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-gray-400 dark:text-white/30">
            Lv {currentLevel}
          </span>
          {!isMaxLevel && (
            <span className="text-[11px] font-medium text-gray-400 dark:text-white/30">
              Lv {currentLevel + 1} — {nextLevelInfo.title}
            </span>
          )}
        </div>

        {/* Track */}
        <div className="h-2.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 via-red-400 to-sahifa-500"
            initial={{ width: 0 }}
            animate={{ width: `${isMaxLevel ? 100 : Math.max(progress * 100, 1.5)}%` }}
            transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
        </div>

        {/* XP labels */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-300 dark:text-white/20 tabular-nums">
            {bounds.start.toLocaleString()} XP
          </span>
          <span className="text-[10px] font-semibold text-gray-400 dark:text-white/30">
            {Math.round(progress * 100)}%
          </span>
          <span className="text-[10px] text-gray-300 dark:text-white/20 tabular-nums">
            {bounds.end.toLocaleString()} XP
          </span>
        </div>
      </div>

      {/* ── Row 3: "Keyingi daraja" hint ─────────────────────────────────── */}
      {!isMaxLevel && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-3 py-2.5 px-3.5 rounded-xl bg-orange-50/70 dark:bg-orange-500/[0.07] border border-orange-100 dark:border-orange-500/15 relative z-10"
        >
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-700 dark:text-orange-300 font-medium leading-snug">
              Keyingi darajaga{' '}
              <span className="font-bold">{xpLeft.toLocaleString()} XP</span>
              {' '}yoki{' '}
              <span className="font-bold">{hoursLeft} soat</span>
              {' '}fokus qoldi
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Row 4: Stats pills ────────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 relative z-10">

        {/* Daily quiz budget */}
        <div className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <BookOpen className="w-3 h-3 text-blue-500 dark:text-blue-400 flex-shrink-0" />
            <p className="text-[10px] font-bold text-gray-400 dark:text-white/30 uppercase tracking-wider">
              Bugungi test
            </p>
          </div>
          {/* Mini bar */}
          <div className="h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden mb-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-500"
              style={{ width: `${quizBarPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-600 dark:text-white/60 tabular-nums">
              {quizUsedToday}/{QUIZ_DAILY_CAP} XP
            </span>
            <span className="text-[10px] text-gray-400 dark:text-white/30">
              {quizzesRemaining} ta qoldi
            </span>
          </div>
        </div>

        {/* Focus time */}
        <div className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            <p className="text-[10px] font-bold text-gray-400 dark:text-white/30 uppercase tracking-wider">
              Jami fokus
            </p>
          </div>
          <p className="text-base font-black text-gray-800 dark:text-white leading-tight tabular-nums">
            {focusDisplay}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">
            {totalFocusMinutes >= 90 ? `≈ ${Math.round(totalFocusMinutes * FOCUS_XP_PER_MINUTE).toLocaleString()} XP` : '—'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default XPProgressBar
