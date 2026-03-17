/**
 * CabinetPage — SAHIFALAB Hub
 *
 * User profile page showing:
 *   • Colour-coded letter avatar + name
 *   • Level card with XP ring
 *   • Stats grid (focus time, quizzes, XP, level)
 *   • Unlockable badges (Yutuqlar)
 *   • Sam's personalised daily advice
 *   • Link to Leaderboard
 */

import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  useProgressStore,
  levelProgress,
  levelBounds,
  formatFocusTime,
} from '../context/progressStore'

// ── Badge definitions ─────────────────────────────────────────────────────────
interface BadgeDef {
  id:       string
  emoji:    string
  name:     string
  desc:     string
  unlocked: (p: { level: number; focusSeconds: number; quizzesCompleted: number; totalXP: number }) => boolean
}

const BADGES: BadgeDef[] = [
  {
    id:       'beginner',
    emoji:    '🌱',
    name:     'Yangi Boshlovchi',
    desc:     'Sayohat boshlandi!',
    unlocked: () => true,
  },
  {
    id:       'reader',
    emoji:    '📚',
    name:     'Kitobxon',
    desc:     'Birinchi test yakunlandi',
    unlocked: (p) => p.quizzesCompleted >= 1,
  },
  {
    id:       'focused1h',
    emoji:    '🎯',
    name:     'Diqqatli',
    desc:     '1 soat fokus vaqti',
    unlocked: (p) => p.focusSeconds >= 3_600,
  },
  {
    id:       'focused5h',
    emoji:    '⚡',
    name:     'Qunt Sohibi',
    desc:     '5 soat fokus vaqti',
    unlocked: (p) => p.focusSeconds >= 18_000,
  },
  {
    id:       'level3',
    emoji:    '📖',
    name:     "O'rganuvchi",
    desc:     "3-darajaga yetish",
    unlocked: (p) => p.level >= 3,
  },
  {
    id:       'level5',
    emoji:    '🏆',
    name:     'Bilim Ustasi',
    desc:     '5-darajaga yetish',
    unlocked: (p) => p.level >= 5,
  },
  {
    id:       'quizmaster',
    emoji:    '💎',
    name:     'Viktorina Ustasi',
    desc:     '10 ta test yakunlandi',
    unlocked: (p) => p.quizzesCompleted >= 10,
  },
  {
    id:       'level10',
    emoji:    '👑',
    name:     "Sam'ning Shogirdi",
    desc:     '10-darajaga yetish',
    unlocked: (p) => p.level >= 10,
  },
  {
    id:       'focused25h',
    emoji:    '🔥',
    name:     "Qo'ymas",
    desc:     '25 soat jami fokus',
    unlocked: (p) => p.focusSeconds >= 90_000,
  },
]

// ── Sam's daily advice pool ───────────────────────────────────────────────────
const SAM_ADVICE = [
  "Har kuni 25 daqiqa sof diqqat — yil oxirida 150 soat! 🚀",
  "O'qish — kelajak o'zingizga eng yaxshi investitsiya. 💡",
  "Har bir to'g'ri javob miyangizga yangi yo'l ochadi. 🧠",
  "Sekin-asta, lekin to'xtamay — bu g'alaba yo'li! 🏆",
  "Bugun o'qiganingiz ertaga sizni ajratib turadi. ✨",
  "Diqqat — eng qimmat resurs. Uni to'g'ri sarfla! ⏰",
  "Muvaffaqiyat — kundalik odatlarning yig'indisi. 🌱",
  "Har bir sessiya kelajak uchun qurilayotgan poydevordir. 🏗️",
  "Qiyin narsalar oson bo'ladi — faqat takrorlash kerak! 🔄",
  "Bilim — hech kim tortib ololmaydigan boylik. 💪",
  "Kichik qadamlar ham uzoq yo'lni bosib o'tadi. 👣",
  "Bugun o'qimasang, ertaga o'kinarsan. Harakatdan to'xtama! 📚",
]

function pickAdvice(telegramId: number | null): string {
  if (!telegramId) return SAM_ADVICE[0]
  const dayOfYear  = Math.floor(Date.now() / 86_400_000)
  return SAM_ADVICE[(telegramId + dayOfYear) % SAM_ADVICE.length]
}

// ── Avatar colour based on telegram_id ───────────────────────────────────────
const AVATAR_COLORS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-emerald-400 to-green-600',
  'from-orange-400 to-amber-600',
  'from-pink-400 to-rose-600',
  'from-indigo-400 to-violet-600',
  'from-teal-400 to-cyan-600',
]

function avatarColor(telegramId: number | null): string {
  if (!telegramId) return AVATAR_COLORS[0]
  return AVATAR_COLORS[telegramId % AVATAR_COLORS.length]
}

// ── Level gradient (matches GlobalProgressBar) ───────────────────────────────
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

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  emoji: string
  label: string
  value: string | number
  sub?: string
}> = ({ emoji, label, value, sub }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-1">
    <span className="text-2xl">{emoji}</span>
    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
    <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
    {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
  </div>
)

// ── SVG Arc for XP ring ───────────────────────────────────────────────────────
const XpRing: React.FC<{ progress: number; level: number }> = ({ progress, level }) => {
  const R         = 54
  const circ      = 2 * Math.PI * R
  const fill      = circ * Math.min(progress, 1)
  const grad      = levelGradient(level)

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="xp-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={level >= 5 ? '#a855f7' : '#3b82f6'} />
            <stop offset="100%" stopColor={level >= 5 ? '#7c3aed' : '#2563eb'} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="8"
          className="stroke-gray-100 dark:stroke-gray-700" />
        <motion.circle
          cx="60" cy="60" r={R} fill="none" strokeWidth="8"
          stroke="url(#xp-ring-grad)"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${fill} ${circ}` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-gray-900 dark:text-white">{level}</span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-widest">
          daraja
        </span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const CabinetPage: React.FC = () => {
  const navigate = useNavigate()
  const {
    telegramId, firstName, username,
    totalXP, focusSeconds, level, quizzesCompleted,
    isLoading,
  } = useProgressStore()

  const progress      = levelProgress(totalXP)
  const { start, end} = levelBounds(level)
  const xpInLevel     = totalXP - start
  const xpForLevel    = end - start
  const grad          = levelGradient(level)
  const advice        = useMemo(() => pickAdvice(telegramId), [telegramId])

  const profileData   = { level, focusSeconds, quizzesCompleted, totalXP }
  const earnedBadges  = BADGES.filter((b) => b.unlocked(profileData))
  const lockedBadges  = BADGES.filter((b) => !b.unlocked(profileData))

  const displayName   = firstName || 'Foydalanuvchi'
  const focusHours    = (focusSeconds / 3600).toFixed(1)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-spin">⏳</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Yuklanmoqda…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-5">

      {/* ── Profile card ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${avatarColor(telegramId)} flex items-center justify-center shadow-md flex-shrink-0`}
          >
            <span className="text-2xl font-black text-white">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Name + handle */}
          <div className="min-w-0">
            <h1 className="text-xl font-black text-gray-900 dark:text-white truncate">
              {displayName}
            </h1>
            {username && (
              <p className="text-sm text-gray-500 dark:text-gray-400">@{username}</p>
            )}
            <div
              className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${grad} text-white text-xs font-semibold shadow-sm`}
            >
              <span>⭐</span>
              <span>Daraja {level}</span>
            </div>
          </div>
        </div>

        {/* XP ring */}
        <div className="mt-4">
          <XpRing progress={progress} level={level} />
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            {xpInLevel.toLocaleString()} / {xpForLevel.toLocaleString()} XP • Jami {totalXP.toLocaleString()} XP
          </p>
        </div>
      </motion.div>

      {/* ── Sam greeting ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 flex gap-3 items-start"
      >
        <span className="text-3xl flex-shrink-0">🧑‍💻</span>
        <div>
          <p className="text-sm font-bold text-amber-900 dark:text-amber-300 mb-0.5">
            Sam aytmoqda:
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
            Assalomu alaykum, <strong>{displayName}</strong>!{' '}
            Bugun <strong>{focusHours}</strong> soat diqqat bilan ishladingiz.{' '}
            {parseFloat(focusHours) >= 1 ? 'Ajoyib natija! 🔥' : "Yana bir sessiya qoldi, uddalaysiz! 💪"}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 italic">
            "{advice}"
          </p>
        </div>
      </motion.div>

      {/* ── Stats grid ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <h2 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
          📊 Statistika
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            emoji="⏱"
            label="Jami Diqqat Vaqti"
            value={formatFocusTime(focusSeconds)}
            sub={`${focusHours} soat`}
          />
          <StatCard
            emoji="📝"
            label="Testlar Yakunlandi"
            value={quizzesCompleted}
            sub={quizzesCompleted === 0 ? 'Hali boshlanmadi' : 'ta test'}
          />
          <StatCard
            emoji="⚡"
            label="Jami XP"
            value={totalXP.toLocaleString()}
            sub="tajriba ballari"
          />
          <StatCard
            emoji="🏅"
            label="Yutuqlar"
            value={`${earnedBadges.length} / ${BADGES.length}`}
            sub="badge qozonildi"
          />
        </div>
      </motion.div>

      {/* ── Badges ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.22 }}
      >
        <h2 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
          🏅 Yutuqlar
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {earnedBadges.map((b) => (
            <motion.div
              key={b.id}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-3 text-center shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className="text-3xl mb-1">{b.emoji}</div>
              <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight">{b.name}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{b.desc}</p>
            </motion.div>
          ))}
          {lockedBadges.map((b) => (
            <div
              key={b.id}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 text-center border border-dashed border-gray-200 dark:border-gray-700 opacity-50"
            >
              <div className="text-3xl mb-1 grayscale">🔒</div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-500 leading-tight">{b.name}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 leading-tight">{b.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Leaderboard link ───────────────────────────────────────────── */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.30 }}
        onClick={() => navigate('/leaderboard')}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-sm shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        <span>🏆</span>
        <span>Liderlar Jadvali</span>
        <span>→</span>
      </motion.button>

    </div>
  )
}

export default CabinetPage
