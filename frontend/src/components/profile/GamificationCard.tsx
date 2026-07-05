/**
 * GamificationCard — level/rank/XP/streak, this app's differentiator from a
 * plain LinkedIn clone. Re-themed for full light+dark support (the original
 * ProfilePage version was hardcoded dark-only).
 */

import React from 'react'
import { motion } from 'framer-motion'
import { getRankInfo } from '../social/UserIdentity'

interface GamificationCardProps {
  level: number
  levelName?: string | null
  totalXp: number
  nextLevelXp: number
  xpPercent: number
  focusHours: number
  streakDays: number
  longestStreak?: number
}

const GamificationCard: React.FC<GamificationCardProps> = ({
  level, levelName, totalXp, nextLevelXp, xpPercent, focusHours, streakDays, longestStreak,
}) => {
  const rank = getRankInfo(level)

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-white/70 flex items-center gap-2">
          <span className="text-lg leading-none">{rank.emoji}</span> {levelName || rank.title} · Lvl {level}
        </span>
        <span className="text-xs text-gray-400 dark:text-white/30">{xpPercent}%</span>
      </div>

      <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, xpPercent)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
          className="h-full rounded-full bg-gradient-to-r from-sahifa-400 to-sahifa-600"
        />
      </div>
      <p className="text-xs text-gray-400 dark:text-white/30 mt-1.5">
        {totalXp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP
      </p>

      <div className="h-px bg-gray-100 dark:bg-white/[0.06] my-4" />

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { icon: '🔥', label: 'Seriya', value: `${streakDays} kun` },
          { icon: '⏱', label: 'Fokus', value: `${focusHours}soat` },
          { icon: '🏅', label: 'Rekord', value: `${longestStreak ?? streakDays} kun` },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] p-2.5">
            <p className="text-base leading-none">{s.icon}</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GamificationCard
