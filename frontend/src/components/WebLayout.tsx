/**
 * WebLayout — full responsive layout for standard browser access.
 *
 * Desktop (lg+):  Fixed 240px sidebar + sticky TopBar + scrollable content
 * Mobile (<lg):   Sticky TopBar + scrollable content + bottom tab bar
 *                 Sidebar accessible via hamburger drawer
 *
 * Architecture:
 *   <WebLayout>
 *     <DesktopSidebar />          hidden mobile
 *     <MobileDrawer />            hidden desktop
 *     <div flex-col flex-1>
 *       <TopBar />                always visible
 *       <GlobalProgressBar />
 *       <main>{children}</main>
 *       <MobileBottomTabs />      hidden desktop
 *     </div>
 *   </WebLayout>
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, Network, BookOpen, Briefcase, MessageCircle,
  User, Trophy, X, Menu, Plus,
  Search, ChevronRight, Settings, HelpCircle, LogOut,
  Wallet, Shield, GraduationCap, Loader2, Sun, Moon, Timer,
  BookMarked, ClipboardList,
} from 'lucide-react'
import GlobalProgressBar from './GlobalProgressBar'
import NotificationBell from './NotificationBell'
import { useAuth } from '../context/AuthContext'
import { useProgressStore } from '../context/progressStore'
import { useThemeStore } from '../context/themeStore'
import api from '../services/apiService'
import { getLevelEmoji } from '../utils/levelTitles'
import { useMessagingSafe } from '../context/MessagingContext'

// ═══════════════════════════════════════════════════════════════════════════════
// Nav items definitions
// ═══════════════════════════════════════════════════════════════════════════════

interface NavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  path: string
  badge?: number
}

const NAV_MAIN: NavItem[] = [
  { icon: Home,          label: 'Bosh sahifa',   path: '/feed' },
  { icon: Network,       label: 'Tarmoq',        path: '/network' },
  { icon: BookOpen,      label: 'Kurslar',       path: '/courses' },
  { icon: Timer,         label: "O'qish maydoni", path: '/workspace' },
  { icon: Briefcase,     label: 'Ish joyi',      path: '/jobs' },
  { icon: MessageCircle, label: 'Xabarlar',      path: '/messages' },
]

const NAV_PROFILE: NavItem[] = [
  { icon: BookMarked,    label: 'Kitoblar', path: '/kitoblar' },
  { icon: ClipboardList, label: 'Test',     path: '/quiz' },
  { icon: Trophy,        label: 'Reyting',  path: '/leaderboard' },
]

const BOTTOM_TABS = [
  { icon: Home,          label: 'Bosh sahifa', path: '/feed' },
  { icon: Network,       label: 'Tarmoq',      path: '/network' },
  { icon: null,          label: 'Post',        path: '__new_post__' }, // special
  { icon: MessageCircle, label: 'Xabar',       path: '/messages' },
  { icon: User,          label: 'Profil',      path: '/profile/me' },
]

// ═══════════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchResult {
  people:  any[]
  courses: any[]
  jobs:    any[]
  posts:   any[]
}

function useSearch() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<SearchResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [searchError, setError]   = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults(null); setError(false); return }
    if (!isAuthenticated) { setResults(null); setError(false); return }
    if (timer.current) clearTimeout(timer.current)
    setError(false)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.client.get('/api/search', { params: { q, type: 'all' } })
        const d = r.data ?? {}
        setResults({
          people:  Array.isArray(d.people)  ? d.people  : [],
          courses: Array.isArray(d.courses) ? d.courses : [],
          jobs:    Array.isArray(d.jobs)    ? d.jobs    : [],
          posts:   Array.isArray(d.posts)   ? d.posts   : [],
        })
      } catch {
        setResults(null)
        setError(true)
      }
      setLoading(false)
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, isAuthenticated])

  const clear = useCallback(() => { setQuery(''); setResults(null); setError(false) }, [])

  return { query, setQuery, results, loading, searchError, clear }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pending connections badge
// ═══════════════════════════════════════════════════════════════════════════════

function usePendingCount() {
  const [count, setCount] = useState(0)
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return
    api.client.get('/api/connections/pending')
      .then(r => setCount((r.data?.received || []).length))
      .catch(() => {})

    // Refresh every 60s
    const id = setInterval(() => {
      api.client.get('/api/connections/pending')
        .then(r => setCount((r.data?.received || []).length))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [isAuthenticated])

  return count
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sidebar nav item
// ═══════════════════════════════════════════════════════════════════════════════

const SidebarItem: React.FC<NavItem & { active: boolean; onClick?: () => void }> = ({
  icon: Icon, label, path, badge, active, onClick,
}) => (
  <Link
    to={path}
    onClick={onClick}
    className="relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 group"
    style={active
      ? { backgroundColor: 'var(--brand-subtle)', color: 'var(--brand-primary)', fontWeight: 600 }
      : { color: 'var(--text-tertiary)', fontWeight: 500 }
    }
  >
    <Icon className="w-[18px] h-[18px] flex-shrink-0 transition-colors"
      style={{ color: active ? 'var(--brand-primary)' : 'var(--text-muted)' }} />
    <span className="flex-1 truncate">{label}</span>
    {badge != null && badge > 0 && (
      <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e8792f] text-white text-[10px] font-bold flex items-center justify-center">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[#e8792f]" />}
  </Link>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Sidebar content (shared between fixed desktop + mobile drawer)
// ═══════════════════════════════════════════════════════════════════════════════

const SidebarContent: React.FC<{ onNavClick?: () => void }> = ({ onNavClick }) => {
  const location    = useLocation()
  const navigate    = useNavigate()
  const { user, logout }    = useAuth()
  const { totalXP, level: storeLevel, isInitialized } = useProgressStore()
  const pendingCount = usePendingCount()
  const messaging = useMessagingSafe()
  const totalUnread = messaging?.totalUnread ?? 0

  const isActive = (path: string) => {
    if (path === '/feed')    return ['/feed', '/social'].includes(location.pathname)
    if (path === '/network') return ['/network', '/discover'].includes(location.pathname)
    if (path === '/messages')return ['/messages', '/messenger'].includes(location.pathname) || location.pathname.startsWith('/messenger')
    if (path === '/profile/me') return location.pathname.startsWith('/profile') || location.pathname === '/cabinet'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const displayLevel = isInitialized ? storeLevel : (user?.level ?? 1)
  const displayXP    = isInitialized ? totalXP    : (user?.total_xp ?? 0)
  const isTeacher    = user?.role === 'teacher' || user?.role === 'admin'
  const myUsername   = (user as any)?.username

  // Inject pending badge into Tarmoq; unread badge into Xabarlar
  const mainNavWithBadges = NAV_MAIN.map(item => {
    if (item.path === '/network')  return { ...item, badge: pendingCount }
    if (item.path === '/messages') return { ...item, badge: totalUnread }
    return item
  })

  const { theme, toggle: toggleTheme } = useThemeStore()

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {/* ── Logo ────────────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 flex-shrink-0">
        <Link to="/feed" onClick={onNavClick} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#e8792f] flex items-center justify-center shadow-[0_8px_20px_rgba(232,121,47,0.3)] flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="block text-[17px] font-extrabold tracking-[-0.03em]" style={{ color: 'var(--text-primary)' }}>SAHIFALAB</span>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Professional learning workspace</p>
          </div>
        </Link>
      </div>

      {/* ── Teacher panel / Become teacher CTA ──────────────────────── */}
      <div className="px-3 mb-3 flex-shrink-0">
        {isTeacher ? (
          <Link
            to="/teacher"
            onClick={onNavClick}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
              location.pathname.startsWith('/teacher')
                ? 'bg-[#e8792f]/15 border-[#e8792f]/25 text-[#e8792f]'
                : 'border-[#e8792f]/20 hover:bg-[#e8792f]/10 hover:border-[#e8792f]/20 hover:text-[#e8792f]'
            }`}
            style={location.pathname.startsWith('/teacher') ? {} : { borderColor: 'var(--border-default)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <GraduationCap className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">O'qituvchi paneli</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>Dashboard · Kurslar · Hamyon</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
          </Link>
        ) : user ? (
          <Link
            to="/become-teacher"
            onClick={onNavClick}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all hover:bg-[#e8792f]/10 hover:border-[#e8792f]/20 hover:text-[#e8792f]"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <GraduationCap className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">O'qituvchi bo'lish</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>70% komissiya · Ariza topshiring</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
          </Link>
        ) : null}
      </div>

      {/* ── Main nav ─────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 min-h-0">
        {mainNavWithBadges.map(item => (
          <SidebarItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        {/* Divider */}
        <div className="my-3 border-t" style={{ borderColor: 'var(--border-default)' }} />

        {NAV_PROFILE.map(item => (
          <SidebarItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            onClick={onNavClick}
          />
        ))}

        {/* Admin section */}
        {user?.role === 'admin' && (
          <>
            <div className="my-3 border-t" style={{ borderColor: 'var(--border-default)' }} />
            <SidebarItem
              icon={Shield}
              label="Admin panel"
              path="/admin"
              active={location.pathname.startsWith('/admin')}
              onClick={onNavClick}
            />
          </>
        )}
      </nav>

      {/* ── Bottom: theme toggle + user card ────────────────────────── */}
      <div className="px-3 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-default)' }}>
        {/* Theme toggle row */}
        <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {theme === 'dark' ? 'Tungi rejim' : 'Kunduzgi rejim'}
          </span>
          <button
            onClick={toggleTheme}
            title="Mavzuni almashtirish"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#e8792f]/10"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {theme === 'dark'
              ? <Moon className="w-4 h-4" />
              : <Sun className="w-4 h-4 text-[#e8792f]" />
            }
          </button>
        </div>

        {/* User card */}
        {user ? (
          <Link
            to={myUsername ? `/profile/${myUsername}` : '/profile/me'}
            onClick={onNavClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-colors group"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' }}
          >
            {user.photo_url ? (
              <img src={user.photo_url} alt={user.first_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e8792f] to-[#8b2a10] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{user.first_name.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user.first_name}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {getLevelEmoji(displayLevel)} Lv.{displayLevel} · {displayXP.toLocaleString()} XP
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 transition-colors" style={{ color: 'var(--text-muted)' }} />
          </Link>
        ) : (
          <Link
            to="/login"
            onClick={onNavClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[#e8792f]/10 hover:bg-[#e8792f]/15 border border-[#e8792f]/20 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e8792f] to-[#8b2a10] flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#e8792f]">Tizimga kirish</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>To'liq imkoniyatlar</p>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Search Dropdown
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchDropdownProps {
  results: SearchResult
  query: string
  onClose: () => void
}

const SearchDropdown: React.FC<SearchDropdownProps> = ({ results, query, onClose }) => {
  const navigate = useNavigate()

  const go = (path: string) => { navigate(path); onClose() }

  const hasAny =
    results.people.length > 0 || results.courses.length > 0 ||
    results.jobs.length > 0   || results.posts.length > 0

  if (!hasAny) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-white/30">"{query}" bo'yicha natija topilmadi</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-white/[0.05]">
      {/* People */}
      {results.people.length > 0 && (
        <section className="py-2">
          <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white/30">Odamlar</p>
          {results.people.slice(0, 3).map((p: any) => (
            <button
              key={p.id}
              onClick={() => go(`/profile/${p.username || p.id}`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-[#24253a] flex-shrink-0">
                {p.avatar_url
                  ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                      <span className="text-white text-xs font-bold">{(p.name || '?').charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{p.name}</p>
                {p.headline && <p className="text-xs text-white/40 truncate">{p.headline}</p>}
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Courses */}
      {results.courses.length > 0 && (
        <section className="py-2">
          <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white/30">Kurslar</p>
          {results.courses.slice(0, 3).map((c: any) => (
            <button
              key={c.id}
              onClick={() => go(`/courses/${c.id}`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl overflow-hidden bg-[#24253a] flex-shrink-0">
                {c.thumbnail_url
                  ? <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  : <BookOpen className="w-4 h-4 text-white/20 m-2" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{c.title}</p>
                <p className="text-xs text-white/40">{c.teacher_name || ''}</p>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Jobs */}
      {results.jobs.length > 0 && (
        <section className="py-2">
          <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white/30">Ish o'rinlari</p>
          {results.jobs.slice(0, 2).map((j: any) => (
            <button
              key={j.id}
              onClick={() => go(`/jobs`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-[#24253a] flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-white/30" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{j.title}</p>
                <p className="text-xs text-white/40">{j.company_name}</p>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* View all */}
      <div className="px-4 py-3">
        <button
          onClick={() => go(`/discover?q=${encodeURIComponent(query)}`)}
          className="w-full py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-white/50 hover:text-white text-sm transition-colors"
        >
          Barcha natijalarni ko'rish →
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Avatar Dropdown
// ═══════════════════════════════════════════════════════════════════════════════

const AvatarDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const myUsername = (user as any)?.username
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const go = (path: string) => { navigate(path); onClose() }
  const handleLogout = () => { logout(); navigate('/login'); onClose() }

  const items = [
    { icon: User,     label: 'Profilni ko\'rish', action: () => go(myUsername ? `/profile/${myUsername}` : '/profile/me') },
    { icon: Settings, label: 'Sozlamalar',         action: () => go('/settings') },
    ...(isTeacher ? [{ icon: Wallet, label: 'Hamyon', action: () => go('/teacher/wallet') }] : []),
    { icon: HelpCircle, label: 'Yordam',           action: () => go('/about') },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#1c1d27] border border-white/[0.08] shadow-2xl overflow-hidden z-50"
    >
      {/* User info header */}
      {user && (
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-bold text-white truncate">{user.first_name}</p>
          {myUsername && <p className="text-[11px] text-white/40">@{myUsername}</p>}
        </div>
      )}

      <div className="py-1">
        {items.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
            >
              <Icon className="w-4 h-4 text-white/40 flex-shrink-0" />
              <span className="text-sm text-white/70">{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-white/[0.06] py-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 transition-colors text-left group"
        >
          <LogOut className="w-4 h-4 text-white/30 group-hover:text-red-400 flex-shrink-0 transition-colors" />
          <span className="text-sm text-white/50 group-hover:text-red-400 transition-colors">Chiqish</span>
        </button>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TopBar
// ═══════════════════════════════════════════════════════════════════════════════

interface TopBarProps {
  onHamburger: () => void
}

const TopBar: React.FC<TopBarProps> = ({ onHamburger }) => {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const { query, setQuery, results, loading, searchError, clear } = useSearch()
  const [searchFocused, setSearchFocused] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const myUsername = (user as any)?.username

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showSearchDropdown = searchFocused && query.trim().length > 0

  return (
    <header className="flex-shrink-0 z-30 flex items-center gap-3 px-4 py-3 backdrop-blur-xl" style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-default)' }}>
      {/* Hamburger — mobile only */}
      <button
        onClick={onHamburger}
        className="lg:hidden flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
        aria-label="Menyu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search bar */}
      <div ref={searchRef} className="relative flex-1 max-w-[480px] mx-auto lg:mx-0">
        <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/[0.05] border transition-colors ${
          searchFocused ? 'border-[#e8792f]/40 bg-white/[0.07]' : 'border-white/[0.06]'
        }`}>
          {loading
            ? <Loader2 className="w-4 h-4 text-white/30 animate-spin flex-shrink-0" />
            : <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Odamlar, kurslar, ishlarni qidiring..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none min-w-0"
          />
          {query && (
            <button onClick={() => { clear(); inputRef.current?.focus() }} className="flex-shrink-0 text-white/30 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search dropdown */}
        <AnimatePresence>
          {showSearchDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-[#1c1d27] border border-white/[0.08] shadow-2xl overflow-hidden max-h-[480px] overflow-y-auto z-50"
            >
              {loading && !results ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
                </div>
              ) : !isAuthenticated ? (
                <div className="py-7 text-center px-4">
                  <Search className="w-7 h-7 mx-auto mb-2 text-white/20" />
                  <p className="text-sm text-white/50 mb-3">Qidirish uchun tizimga kiring</p>
                  <Link
                    to="/login"
                    onClick={clear}
                    className="inline-block px-5 py-2 rounded-xl bg-[#e8792f] text-white text-sm font-semibold"
                  >
                    Kirish
                  </Link>
                </div>
              ) : searchError ? (
                <div className="py-7 text-center px-4">
                  <p className="text-sm text-white/40">Qidiruvda xatolik yuz berdi. Qayta urinib ko'ring.</p>
                </div>
              ) : results ? (
                <SearchDropdown results={results} query={query} onClose={clear} />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: notifications + avatar */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        {isAuthenticated && <NotificationBell />}

        {/* Avatar / Login */}
        {isAuthenticated && user ? (
          <div ref={avatarRef} className="relative">
            <button
              onClick={() => setAvatarOpen(v => !v)}
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-transparent hover:border-[#e8792f]/40 transition-colors flex-shrink-0"
            >
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.first_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                  <span className="text-white text-xs font-bold">{user.first_name.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </button>
            <AnimatePresence>
              {avatarOpen && <AvatarDropdown onClose={() => setAvatarOpen(false)} />}
            </AnimatePresence>
          </div>
        ) : (
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-semibold transition-colors"
          >
            Kirish
          </Link>
        )}
      </div>
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mobile Bottom Tab Bar
// ═══════════════════════════════════════════════════════════════════════════════

interface MobileBottomTabsProps {
  onNewPost: () => void
}

const MobileBottomTabs: React.FC<MobileBottomTabsProps> = ({ onNewPost }) => {
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/feed')       return ['/feed', '/social'].includes(location.pathname)
    if (path === '/network')    return ['/network', '/discover'].includes(location.pathname)
    if (path === '/messages')   return ['/messages', '/messenger'].includes(location.pathname) || location.pathname.startsWith('/messenger')
    if (path === '/profile/me') return location.pathname.startsWith('/profile') || location.pathname === '/cabinet'
    return location.pathname === path
  }

  return (
    <nav className="lg:hidden flex-shrink-0 flex items-stretch border-t border-white/[0.06] backdrop-blur-xl z-30" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {BOTTOM_TABS.map((tab, i) => {
        // Center ➕ button
        if (tab.path === '__new_post__') {
          return (
            <div key="new-post" className="flex-1 flex items-center justify-center py-2">
              <button
                onClick={onNewPost}
                className="w-11 h-11 rounded-full bg-[#e8792f] hover:bg-[#c44a1a] active:scale-95 flex items-center justify-center shadow-[0_4px_16px_rgba(232,121,47,0.45)] transition-all"
                aria-label="Yangi post"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          )
        }

        const Icon = tab.icon!
        const active = isActive(tab.path)

        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
              active ? 'text-[#e8792f]' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <Icon className="w-[20px] h-[20px]" />
            <span className="text-[9px] font-medium leading-tight">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quick Post Modal (triggered by ➕ button on mobile)
// ═══════════════════════════════════════════════════════════════════════════════

const QuickPostModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = content.trim()
    if (!text) return
    setPosting(true)
    try {
      await api.client.post('/api/v1/social/posts', { content: text })
      onClose()
      navigate('/feed')
    } catch {}
    setPosting(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#1c1d27] border-t border-white/[0.08] rounded-t-3xl shadow-2xl"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Yangi post</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {user && (
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-[#24253a] flex-shrink-0">
                {user.photo_url
                  ? <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                      <span className="text-white text-xs font-bold">{user.first_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <p className="text-sm font-semibold text-white">{user.first_name}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Nima haqida yozmoqchisiz?..."
              autoFocus
              rows={4}
              maxLength={2000}
              className="w-full bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none resize-none"
            />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
              <span className="text-[11px] text-white/25">{content.length}/2000</span>
              <button
                type="submit"
                disabled={posting || !content.trim()}
                className="px-5 py-2 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {posting ? 'Joylashmoqda...' : 'Post qilish'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebLayout (main export)
// ═══════════════════════════════════════════════════════════════════════════════

const WebLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [postOpen,   setPostOpen]   = useState(false)

  const handleNewPost = () => {
    setDrawerOpen(false)
    setPostOpen(true)
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* ── Desktop fixed sidebar (lg+) ─────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[240px] flex-shrink-0 overflow-hidden" style={{ borderRight: '1px solid var(--border-default)' }}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay (<lg) ─────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="bd"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="fixed left-0 top-0 bottom-0 w-[240px] z-[55] flex flex-col overflow-hidden lg:hidden"
              style={{ borderRight: '1px solid var(--border-default)' }}
            >
              {/* Close button */}
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-5 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onNavClick={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Right content column ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar — always visible */}
        <TopBar onHamburger={() => setDrawerOpen(true)} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <MobileBottomTabs onNewPost={handleNewPost} />
      </div>

      {/* Quick post modal */}
      <AnimatePresence>
        {postOpen && <QuickPostModal onClose={() => setPostOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

export default WebLayout
