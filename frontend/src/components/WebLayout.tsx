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
  CalendarDaysIcon,
  ClockIcon,
  CpuChipIcon,
  FireIcon,
  HomeIcon,
  LinkIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrophyIcon,
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

const NAV_MAIN: NavItem[] = [
  { icon: HomeIcon, label: 'Bosh sahifa', path: '/' },
  { icon: AcademicCapIcon, label: 'Kurslar', path: '/courses' },
  { icon: ClockIcon, label: "O'qish", path: '/study' },
  { icon: RectangleStackIcon, label: 'Test', path: '/quiz' },
  { icon: BookOpenIcon, label: 'Kitoblar', path: '/kitoblar' },
  { icon: LinkIcon, label: 'Resurslar', path: '/resources' },
  { icon: CpuChipIcon, label: 'SAHIFALAB AI', path: '/ai-companion' },
  { icon: FireIcon, label: 'Kunlik', path: '/daily' },
  { icon: CalendarDaysIcon, label: 'Rejalar', path: '/plans' },
]

const NAV_SECONDARY: NavItem[] = [
  { icon: Squares2X2Icon, label: 'Kabinet', path: '/cabinet' },
  { icon: TrophyIcon, label: 'Reyting', path: '/leaderboard' },
  { icon: SparklesIcon, label: 'Haqimizda', path: '/about' },
]

// Shown in the mobile bottom tab bar (max 5 items for readability)
const BOTTOM_NAV: NavItem[] = [
  { icon: HomeIcon, label: 'Home', path: '/' },
  { icon: BookOpenIcon, label: 'Kitoblar', path: '/kitoblar' },
  { icon: ClockIcon, label: "O'qish", path: '/study' },
  { icon: RectangleStackIcon, label: 'Test', path: '/quiz' },
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

  // Live gamification values — store is populated by ProgressProvider on both platforms
  const displayLevel = isInitialized ? storeLevel : (user?.level ?? 1)
  const displayXP    = isInitialized ? totalXP    : (user?.total_xp ?? 0)

  return (
    <>
      {/* Logo */}
      <div className="px-4 pt-6 pb-4">
        <Link to="/" onClick={onNavClick} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sahifa-500 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(255,106,42,0.2)]">
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

      <div className="mx-3 h-px bg-slate-100 dark:bg-slate-800 mb-2" />

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_MAIN.map(item => (
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

        {/* Teacher section */}
        {showTeacherSection && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] uppercase tracking-widest text-sahifa-400 dark:text-sahifa-600 font-semibold">
                O'qituvchi
              </p>
            </div>
            {user?.status === 'pending' ? (
              /* Pending teacher — show notice instead of nav link */
              <div className="mx-3 my-1 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Ko'rib chiqilmoqda</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">
                  Arizangiz admin tasdiqlashini kutmoqda
                </p>
              </div>
            ) : (
              <SidebarNavItem
                icon={AcademicCapIcon}
                label="O'qituvchi paneli"
                path="/teacher"
                active={isActive('/teacher')}
                onClick={onNavClick}
              />
            )}
          </>
        )}

        {/* Become teacher CTA — only for active students */}
        {user?.role === 'student' && user.status === 'active' && (
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
      <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-3">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#141414] border border-gray-200/70 dark:border-[#2A2A2A]">
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
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            @Sahifalab_hub_bot
          </span>
          <ThemeToggle />
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
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-r border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#121212] overflow-hidden">
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
              className="fixed left-0 top-0 bottom-0 w-[280px] z-[60] flex flex-col bg-white dark:bg-[#121212] border-r border-slate-200 dark:border-[#2A2A2A] overflow-hidden lg:hidden"
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
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#2A2A2A] bg-white/90 dark:bg-[#0F0F0F]/90 backdrop-blur-xl flex-shrink-0 z-30">
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

          <ThemeToggle />
        </header>

        {/* XP Progress bar — sticky to top of content column */}
        <GlobalProgressBar />

        {/* ── Page content ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* ── Mobile bottom tab bar (< lg) ───────────────────────────── */}
        <nav className="lg:hidden flex items-stretch border-t border-slate-200 dark:border-[#2A2A2A] bg-white/92 dark:bg-[#0F0F0F]/95 backdrop-blur-xl flex-shrink-0 z-30">
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
