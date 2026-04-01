import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import {
  BookOpen,
  Bot,
  CalendarDays,
  Crown,
  FolderKanban,
  LayoutDashboard,
  LibraryBig,
  Link2,
  LucideIcon,
  Shield,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'

const ADMIN_TELEGRAM_IDS = [807466591]

interface MenuItem {
  id: string
  icon: LucideIcon
  iconImage?: string   /* optional image URL to replace emoji */
  title: string
  titleUz: string
  description: string
  path: string
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'study',
    icon: Target,
    title: "Study",
    titleUz: "O'qish",
    description: 'Focus timer + ambient sounds',
    path: '/study',
  },
  {
    id: 'quiz',
    icon: FolderKanban,
    title: 'Quiz',
    titleUz: 'Test',
    description: 'Kitoblar asosida testlar',
    path: '/quiz',
  },
  {
    id: 'kitoblar',
    icon: LibraryBig,
    title: 'Kitoblar',
    titleUz: 'Kitoblar',
    description: 'Free & Paid PDFs',
    path: '/kitoblar',
  },
  {
    id: 'foydaliLinklar',
    icon: Link2,
    title: 'Linklar',
    titleUz: 'Resurslar',
    description: 'Resurslar & Videolar',
    path: '/resources',
  },
  {
    id: 'about',
    icon: Sparkles,
    title: 'Haqimizda',
    titleUz: 'Haqimizda',
    description: "Bizning hikoyamiz va missiyamiz",
    path: '/about',
  },
  {
    id: 'cabinet',
    icon: LayoutDashboard,
    title: 'Kabinet',
    titleUz: 'Kabinet',
    description: 'XP, Daraja va Yutuqlar',
    path: '/cabinet',
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    title: 'Reyting',
    titleUz: 'Reyting',
    description: "Top 10 o'quvchilar",
    path: '/leaderboard',
  },
  {
    id: 'bookSummarizer',
    icon: Bot,
    iconImage: '/sahifalab.jpg',
    title: 'SahifaLab AI',
    titleUz: 'SahifaLab AI',
    description: "Kitob haqida suhbat, savol-javob",
    path: '/ai-companion',
  },
  {
    id: 'daily',
    icon: Crown,
    title: 'Daily',
    titleUz: 'Kunlik',
    description: 'Bugungi vazifalar va streak',
    path: '/daily',
  },
  {
    id: 'plans',
    icon: CalendarDays,
    title: 'Plans',
    titleUz: 'Rejalar',
    description: '7/14/30 kunlik yoʻl xaritasi',
    path: '/plans',
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
    whileHover={{ y: -3 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`
      group relative overflow-hidden text-left
      surface-card p-4 min-h-[132px]
      transition-all duration-300 card-glow
    `}
  >
    <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sahifa-500/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

    <div className="relative h-full flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gray-50 dark:bg-[#141414] border border-gray-200/70 dark:border-[#2A2A2A] flex items-center justify-center shadow-sm overflow-hidden text-gray-700 dark:text-gray-200 group-hover:text-sahifa-500 transition-colors">
        {item.iconImage ? (
          <img src={item.iconImage} alt={item.title} className="w-full h-full object-cover rounded-xl" />
        ) : (
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
        )}
        </div>
        <BookOpen className="w-4 h-4 text-gray-200 dark:text-gray-700 group-hover:text-sahifa-400 transition-colors" strokeWidth={1.8} />
      </div>

      <div>
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight line-clamp-2 tracking-[-0.01em]">
          {item.titleUz || item.title}
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400 line-clamp-2">
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
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5"
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
          className="col-span-2 sm:col-span-3 xl:col-span-4 mt-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200/70 dark:border-[#2A2A2A] text-gray-500 dark:text-gray-400 hover:text-sahifa-500 transition-colors text-xs font-medium"
        >
          <Shield className="w-4 h-4" strokeWidth={1.8} />
          <span>Admin Panel</span>
        </motion.button>
      )}
    </motion.div>
  )
}

export default MenuGrid
