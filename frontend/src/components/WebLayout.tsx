/**
 * WebLayout — full responsive layout for standard browser access.
 *
 * Desktop (lg+):   Fixed 256px sidebar with nav + scrollable content area
 * Tablet/Mobile:   Slide-in drawer sidebar + fixed top header + bottom tab bar
 *
 * Telegram Mini App NEVER uses this component — see TelegramLayout instead.
 */
import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AcademicCapIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  BookOpenIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  CpuChipIcon,
  GlobeAltIcon,
  HomeIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrophyIcon,
  UserGroupIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import ThemeToggle from './ThemeToggle'
import GlobalProgressBar from './GlobalProgressBar'
import { useAuth } from '../context/AuthContext'
import { useProgressStore } from '../context/progressStore'

// ── Logout button ─────────────────────────────────────────────────────────────
const LogoutButton: React.FC = () => {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <button
      onClick={() => { logout(); navigate('/login') }}
      title="Chiqish"
      className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-sahifa-500 hover:bg-sahifa-50 dark:hover:bg-[#202020] transition-colors flex-shrink-0"
    >
      <ArrowLeftOnRectangleIcon className="w-4 h-4" />
    </button>
  )
}

// ── Navigation definitions ────────────────────────────────────────────────────

interface NavItem {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  path: string
}

const NAV_HOME: NavItem[] = [
  { icon: HomeIcon, label: 'Bosh sahifa', path: '/' },
]

const NAV_LEARNING: NavItem[] = [
  { icon: AcademicCapIcon, label: 'Kurslar', path: '/courses' },
  { icon: BriefcaseIcon,   label: 'Ish joyi', path: '/workspace' },
  { icon: RectangleStackIcon, label: 'Test', path: '/quiz' },
  { icon: BookOpenIcon, label: 'Kitoblar', path: '/kitoblar' },
  { icon: LinkIcon, label: 'Resurslar', path: '/resources' },
  { icon: CpuChipIcon, label: 'SAHIFALAB AI', path: '/ai-companion' },
]

const NAV_SOCIAL: NavItem[] = [
  { icon: GlobeAltIcon, label: 'Lenta', path: '/social' },
  { icon: ChatBubbleLeftRightIcon, label: 'Xabarlar', path: '/messenger' },
  { icon: MagnifyingGlassIcon, label: 'Kashfiyot', path: '/discover' },
]

const NAV_SECONDARY: NavItem[] = [
  { icon: Squares2X2Icon, label: 'Kabinet',       path: '/cabinet' },
  { icon: TrophyIcon,     label: 'Reyting',       path: '/leaderboard' },
  { icon: UserGroupIcon,  label: "O'qituvchilar", path: '/teachers' },
  { icon: SparklesIcon,   label: 'Haqimizda',     path: '/about' },
]

// Shown in the mobile bottom tab bar (max 5 items for readability)
const BOTTOM_NAV: NavItem[] = [
  { icon: HomeIcon, label: 'Home', path: '/' },
  { icon: GlobeAltIcon, label: 'Lenta', path: '/social' },
  { icon: ChatBubbleLeftRightIcon, label: 'Xabarlar', path: '/messenger' },
  { icon: MagnifyingGlassIcon, label: 'Kashfiyot', path: '/discover' },
  { icon: Squares2X2Icon, label: 'Kabinet', path: '/cabinet' },
]

// ── Sidebar Nav Item ──────────────────────────────────────────────────────────

const SidebarNavItem: React.FC<NavItem & { active: boolean; onClick?: () => void }> = ({
  icon, label, path, active, onClick,
}) => {
  const Icon = icon
  return (
  <Link
    to={path}
    onClick={onClick}
    className={`
      flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm
      transition-all duration-150 group
      ${active
        ? 'bg-sahifa-500/10 text-sahifa-600 dark:text-sahifa-400 font-semibold'
        : 'font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1A1A1A] hover:text-slate-800 dark:hover:text-slate-200'
      }
    `}
  >
    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
      active ? 'text-sahifa-500' : 'text-slate-400 dark:text-slate-500 group-hover:text-sahifa-500'
    }`} />
    <span className="truncate">{label}</span>
    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sahifa-500 flex-shrink-0" />}
  </Link>
)
}

// ── Sidebar content (shared between fixed desktop + drawer mobile) ────────────

const SidebarContent: React.FC<{ onNavClick?: () => void }> = ({ onNavClick }) => {
  const location = useLocation()
  const { user } = useAuth()
  const { totalXP, level: storeLevel, isInitialized } = useProgressStore()
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const showTeacherSection = user?.role === 'teacher' || user?.role === 'admin'
  const showAdminSection = user?.role === 'admin'
  const isTeacherActive  = showTeacherSection && user?.status !== 'pending'

  // Live gamification values — store is populated by ProgressProvider on both platforms
  const displayLevel = isInitialized ? storeLevel : (user?.level ?? 1)
  const displayXP    = isInitialized ? totalXP    : (user?.total_xp ?? 0)

  return (
    <>
      {/* Logo */}
      <div className="px-4 pt-6 pb-4">
        <Link to="/" onClick={onNavClick} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sahifa-500 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(241,89,41,0.25)]">
            <BookOpenIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-xl font-extrabold tracking-[-0.03em] text-gray-900 dark:text-white">
              SAHIFALAB
            </span>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Premium learning workspace
            </p>
          </div>
        </Link>
      </div>

      {/* ── Prominent Teacher Panel CTA (teacher/admin only) ──────────── */}
      {showTeacherSection && (
        <div className="px-3 mb-3">
          {user?.status === 'pending' ? (
            <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center flex-shrink-0">
                <AcademicCapIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-tight">Ko'rib chiqilmoqda</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight mt-0.5">Admin tasdiqlashi kutilmoqda</p>
              </div>
            </div>
          ) : (
            <Link
              to="/teacher"
              onClick={onNavClick}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-2xl
                transition-all duration-150 group
                ${isActive('/teacher')
                  ? 'bg-sahifa-500 shadow-glow-sm'
                  : 'bg-gradient-to-r from-sahifa-50 to-orange-50 dark:from-sahifa-500/10 dark:to-orange-500/5 hover:from-sahifa-100 dark:hover:from-sahifa-500/20 border border-sahifa-200/70 dark:border-sahifa-500/20'
                }
              `}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isActive('/teacher')
                  ? 'bg-white/20'
                  : 'bg-sahifa-500 shadow-glow-sm'
              }`}>
                <AcademicCapIcon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-bold leading-tight ${isActive('/teacher') ? 'text-white' : 'text-sahifa-600 dark:text-sahifa-400'}`}>
                  O'qituvchi paneli
                </p>
                <p className={`text-[10px] leading-tight mt-0.5 ${isActive('/teacher') ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                  Kurslar, darslar, talabalar
                </p>
              </div>
              <ChevronRightIcon className={`w-3.5 h-3.5 ml-auto flex-shrink-0 ${
                isActive('/teacher') ? 'text-white/70' : 'text-sahifa-400 dark:text-sahifa-600 group-hover:text-sahifa-500'
              }`} />
            </Link>
          )}
        </div>
      )}

      {/* Main nav */}
      <div className="mx-3 h-px bg-slate-100 dark:bg-[#2A2A36] mb-2" />
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_HOME.map(item => (
          <SidebarNavItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 font-semibold">
            Ta'lim
          </p>
        </div>
        {NAV_LEARNING.map(item => (
          <SidebarNavItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] uppercase tracking-widest text-sahifa-500 dark:text-sahifa-600 font-semibold">
            Ijtimoiy
          </p>
        </div>
        {NAV_SOCIAL.map(item => (
          <SidebarNavItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 font-semibold">
            Profil
          </p>
        </div>

        {NAV_SECONDARY.map(item => (
          <SidebarNavItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        {/* Become teacher CTA — any non-teacher active user */}
        {user && user.role !== 'teacher' && user.role !== 'admin' && user.status !== 'pending' && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 font-semibold">
                Karyera
              </p>
            </div>
            <SidebarNavItem
              icon={AcademicCapIcon}
              label="O'qituvchi bo'lish"
              path="/become-teacher"
              active={isActive('/become-teacher')}
              onClick={onNavClick}
            />
          </>
        )}

        {/* Admin section */}
        {showAdminSection && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] uppercase tracking-widest text-red-400 dark:text-red-600 font-semibold">
                Admin
              </p>
            </div>
            <SidebarNavItem
              icon={ShieldCheckIcon}
              label="Admin panel"
              path="/admin"
              active={isActive('/admin')}
              onClick={onNavClick}
            />
          </>
        )}
      </nav>

      {/* Bottom: user card + theme toggle */}
      <div className="px-4 py-4 border-t border-slate-100 dark:border-[#2A2A36] mt-2 space-y-3">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#222230] border border-gray-200/70 dark:border-[#2E2E3A]">
            {user.photo_url ? (
              <img src={user.photo_url} alt={user.first_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{user.first_name.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{user.first_name}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Lv.{displayLevel} · {displayXP.toLocaleString()} XP</p>
            </div>
            <LogoutButton />
          </div>
        )}

        {/* Guest login CTA — shown when not authenticated */}
        {!user && (
          <Link
            to="/login"
            onClick={onNavClick}
            className="flex items-center gap-2.5 px-3 py-3 rounded-2xl bg-gradient-to-r from-sahifa-500/10 to-purple-500/5 border border-sahifa-500/20 dark:border-sahifa-500/15 hover:from-sahifa-500/15 hover:to-purple-500/10 transition-colors group"
          >
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-sahifa-400 via-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-glow-sm">
              <UserIcon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-sahifa-600 dark:text-sahifa-400 leading-tight">Tizimga kirish</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">To'liq imkoniyatlardan foydalaning</p>
            </div>
            <ChevronRightIcon className="w-3.5 h-3.5 text-sahifa-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            @Sahifalab_hub_bot
          </span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  )
}

// ── WebLayout ─────────────────────────────────────────────────────────────────

const WebLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div className="flex h-screen overflow-hidden premium-shell">

      {/* ── Desktop fixed sidebar (lg+) ─────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-r border-slate-200 dark:border-[#2A2A36] bg-white dark:bg-[#1C1C22] overflow-hidden">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay (< lg) ────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] lg:hidden"
            />

            {/* Drawer panel */}
            <motion.aside
              key="drawer-panel"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] z-[60] flex flex-col bg-white dark:bg-[#1C1C22] border-r border-slate-200 dark:border-[#2A2A36] overflow-hidden lg:hidden"
            >
              {/* Close button inside drawer header */}
              <div className="absolute top-5 right-4 z-10">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors text-sm"
                  aria-label="Yopish"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <SidebarContent onNavClick={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Right content column ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top header (< lg) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#2A2A36] bg-white/90 dark:bg-[#1C1C22]/95 backdrop-blur-xl flex-shrink-0 z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
            aria-label="Menyu"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>

          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sahifa-500 text-white flex items-center justify-center">
              <BookOpenIcon className="w-4 h-4" />
            </div>
            <span className="text-base font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
              SAHIFALAB
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* XP Progress bar — sticky to top of content column */}
        <GlobalProgressBar />

        {/* ── Page content ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* ── Mobile bottom tab bar (< lg) ───────────────────────────── */}
        <nav className="lg:hidden flex items-stretch border-t border-slate-200 dark:border-[#2A2A36] bg-white/92 dark:bg-[#1C1C22]/95 backdrop-blur-xl flex-shrink-0 z-30">
          {BOTTOM_NAV.map(item => {
            const active = isActive(item.path)
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5
                  text-xs font-medium transition-colors border-t-2
                  ${active
                    ? 'text-sahifa-600 dark:text-sahifa-400 border-sahifa-500'
                    : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'
                  }
                `}
              >
                <Icon className="w-[18px] h-[18px] leading-none" />
                <span className="text-[10px] leading-tight">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default WebLayout
