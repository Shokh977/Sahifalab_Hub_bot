import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const ADMIN_TELEGRAM_IDS = [807466591]

interface MenuItem {
  id: string
  icon: string
  title: string
  titleUz: string
  description: string
  path: string
  iconBg: string      /* subtle icon background */
  accentGlow: string  /* hover glow color */
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'study',
    icon: '🎯',
    title: "Study With Sahifalab",
    titleUz: "O'qish",
    description: 'Focus timer + ambient sounds',
    path: '/study',
    iconBg: 'bg-blue-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(59,130,246,0.2)]',
  },
  {
    id: 'quiz',
    icon: '📝',
    title: 'Quiz',
    titleUz: 'Test',
    description: 'Kitoblar asosida testlar',
    path: '/quiz',
    iconBg: 'bg-purple-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(168,85,247,0.2)]',
  },
  {
    id: 'kitoblar',
    icon: '📚',
    title: 'Kitoblar',
    titleUz: 'Kitoblar',
    description: 'Free & Paid PDFs',
    path: '/kitoblar',
    iconBg: 'bg-sahifa-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(242,103,34,0.25)]',
  },
  {
    id: 'foydaliLinklar',
    icon: '🔗',
    title: 'Foydali Linklar',
    titleUz: 'Resurslar',
    description: 'Resurslar & Videolar',
    path: '/resources',
    iconBg: 'bg-emerald-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]',
  },
  {
    id: 'about',
    icon: '👤',
    title: 'Biz Haqimizda',
    titleUz: 'Haqimizda',
    description: "Bizning hikoyamiz va missiyamiz",
    path: '/about',
    iconBg: 'bg-pink-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(236,72,153,0.2)]',
  },
  {
    id: 'cabinet',
    icon: '🏅',
    title: 'Mening Kabinetim',
    titleUz: 'Kabinet',
    description: 'XP, Daraja va Yutuqlar',
    path: '/cabinet',
    iconBg: 'bg-indigo-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(99,102,241,0.2)]',
  },
  {
    id: 'leaderboard',
    icon: '🏆',
    title: 'Liderlar Jadvali',
    titleUz: 'Reyting',
    description: "Top 10 o'quvchilar",
    path: '/leaderboard',
    iconBg: 'bg-amber-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]',
  },
  {
    id: 'bookSummarizer',
    icon: '🤖',
    title: 'SahifaLab AI',
    titleUz: 'SahifaLab AI',
    description: "Kitob matnini o'zbekcha qisqartiradi",
    path: '/book-summarizer',
    iconBg: 'bg-cyan-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(6,182,212,0.22)]',
  },
]

// Stagger children animation
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const cardVariant = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
}

// ── Card component ──────────────────────────────────────────────────────────
interface CardProps {
  item: MenuItem
  onClick: () => void
  fullWidth?: boolean
}

const MenuCard: React.FC<CardProps> = ({ item, onClick, fullWidth }) => (
  <motion.button
    variants={cardVariant}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`
      relative overflow-hidden
      bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm
      border border-gray-200/60 dark:border-slate-700/50
      rounded-3xl p-5
      transition-all duration-300
      card-glow
      ${item.accentGlow}
      ${fullWidth ? 'col-span-2' : ''}
    `}
  >
    {/* Subtle gradient overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-sahifa-500/[0.03] to-transparent pointer-events-none" />

    <div className={`relative ${fullWidth ? 'flex items-center gap-4' : 'text-center space-y-3'}`}>
      {/* Icon with background */}
      <div className={`
        ${fullWidth ? '' : 'mx-auto'}
        w-14 h-14 rounded-2xl ${item.iconBg}
        flex items-center justify-center
        shadow-sm
      `}>
        <span className="text-3xl">{item.icon}</span>
      </div>

      <div className={fullWidth ? 'text-left' : ''}>
        <h3 className="font-bold text-sm text-gray-900 dark:text-white/90 leading-tight">
          {item.title}
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
          {item.description}
        </p>
      </div>
    </div>
  </motion.button>
)

// ── Main Grid ───────────────────────────────────────────────────────────────
export const MenuGrid: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useTelegramWebApp()
  const isAdmin = user?.id ? ADMIN_TELEGRAM_IDS.includes(user.id) : false

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4"
    >
      {/* Top 4: 2×2 grid */}
      {MENU_ITEMS.slice(0, 4).map((item) => (
        <MenuCard
          key={item.id}
          item={item}
          onClick={() => navigate(item.path)}
        />
      ))}

      {/* About — full-width */}
      <MenuCard
        item={MENU_ITEMS[4]}
        onClick={() => navigate(MENU_ITEMS[4].path)}
        fullWidth
      />

      {/* Cabinet + Leaderboard side by side */}
      {MENU_ITEMS.slice(5, 7).map((item) => (
        <MenuCard
          key={item.id}
          item={item}
          onClick={() => navigate(item.path)}
        />
      ))}

      {/* Book Summarizer — full-width */}
      <MenuCard
        item={MENU_ITEMS[7]}
        onClick={() => navigate(MENU_ITEMS[7].path)}
        fullWidth
      />

      {/* Admin panel — only visible to admins */}
      {isAdmin && (
        <motion.button
          variants={cardVariant}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate('/admin')}
          className="col-span-2 mt-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-gray-100/60 dark:bg-slate-800/40 border border-gray-200/50 dark:border-slate-700/30 text-gray-400 dark:text-slate-500 hover:text-sahifa-400 transition-colors text-xs font-medium"
        >
          <span>🔐</span>
          <span>Admin Panel</span>
        </motion.button>
      )}
    </motion.div>
  )
}

export default MenuGrid
