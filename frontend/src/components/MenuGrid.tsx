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
    title: "Study",
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
    title: 'Linklar',
    titleUz: 'Resurslar',
    description: 'Resurslar & Videolar',
    path: '/resources',
    iconBg: 'bg-emerald-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]',
  },
  {
    id: 'about',
    icon: '👤',
    title: 'Haqimizda',
    titleUz: 'Haqimizda',
    description: "Bizning hikoyamiz va missiyamiz",
    path: '/about',
    iconBg: 'bg-pink-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(236,72,153,0.2)]',
  },
  {
    id: 'cabinet',
    icon: '🏅',
    title: 'Kabinet',
    titleUz: 'Kabinet',
    description: 'XP, Daraja va Yutuqlar',
    path: '/cabinet',
    iconBg: 'bg-indigo-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(99,102,241,0.2)]',
  },
  {
    id: 'leaderboard',
    icon: '🏆',
    title: 'Reyting',
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
    description: "Kitob haqida suhbat, savol-javob",
    path: '/ai-companion',
    iconBg: 'bg-cyan-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(6,182,212,0.22)]',
  },
  {
    id: 'daily',
    icon: '🔥',
    title: 'Daily',
    titleUz: 'Kunlik',
    description: 'Bugungi vazifalar va streak',
    path: '/daily',
    iconBg: 'bg-rose-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(244,63,94,0.22)]',
  },
  {
    id: 'plans',
    icon: '🗓️',
    title: 'Plans',
    titleUz: 'Rejalar',
    description: '7/14/30 kunlik yoʻl xaritasi',
    path: '/plans',
    iconBg: 'bg-teal-500/15',
    accentGlow: 'hover:shadow-[0_0_24px_rgba(20,184,166,0.22)]',
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
}

const MenuCard: React.FC<CardProps> = ({ item, onClick }) => (
  <motion.button
    variants={cardVariant}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`
      relative overflow-hidden
      bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm
      border border-gray-200/60 dark:border-slate-700/50
      rounded-2xl p-2.5 aspect-square
      transition-all duration-300
      card-glow
      ${item.accentGlow}
    `}
  >
    {/* Subtle gradient overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-sahifa-500/[0.03] to-transparent pointer-events-none" />

    <div className="relative h-full text-center flex flex-col items-center justify-center gap-1.5">
      {/* Icon with background */}
      <div className={`
        mx-auto
        w-10 h-10 rounded-xl ${item.iconBg}
        flex items-center justify-center
        shadow-sm
      `}>
        <span className="text-xl">{item.icon}</span>
      </div>

      <div>
        <h3 className="font-bold text-[11px] text-gray-900 dark:text-white/90 leading-tight line-clamp-2">
          {item.titleUz || item.title}
        </h3>
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
      className="grid grid-cols-3 gap-3"
    >
      {MENU_ITEMS.map((item) => (
        <MenuCard
          key={item.id}
          item={item}
          onClick={() => navigate(item.path)}
        />
      ))}

      {/* Admin panel — only visible to admins */}
      {isAdmin && (
        <motion.button
          variants={cardVariant}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate('/admin')}
          className="col-span-3 mt-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-gray-100/60 dark:bg-slate-800/40 border border-gray-200/50 dark:border-slate-700/30 text-gray-400 dark:text-slate-500 hover:text-sahifa-400 transition-colors text-xs font-medium"
        >
          <span>🔐</span>
          <span>Admin Panel</span>
        </motion.button>
      )}
    </motion.div>
  )
}

export default MenuGrid
