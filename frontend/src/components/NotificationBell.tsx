/**
 * NotificationBell — bell icon with unread badge + glassmorphism dropdown.
 *
 * Features:
 *   • Animated bell wiggle on new notification
 *   • Unread count badge (99+ cap)
 *   • Glassmorphism dropdown panel with keyset-paginated feed
 *   • Click on notification → marks as read + navigates to route
 *   • "Mark all read" button
 *   • Category color chips (SOCIAL/EDUCATIONAL/GROWTH/BUSINESS)
 *   • Responsive: full-width on mobile, 380px on desktop
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, Loader2, ChevronDown, LayoutList } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { getNotifDef, type NotificationItem, type NotifCategory, CATEGORY_COLORS } from '../utils/notificationDictionary'

// ── Time ago helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'hozirgina'
  if (mins < 60) return `${mins} daq oldin`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} soat oldin`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} kun oldin`
  return new Date(dateStr).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })
}

// ── Notification row ──────────────────────────────────────────────────────────
const NotifRow: React.FC<{
  item: NotificationItem
  onClick: (item: NotificationItem) => void
}> = ({ item, onClick }) => {
  const def = getNotifDef(item.type)
  const Icon = def.icon

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onClick(item)}
      className={`
        w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
        hover:bg-gray-50 dark:hover:bg-white/[0.04]
        ${!item.is_read ? 'bg-sahifa-50/50 dark:bg-sahifa-500/[0.04]' : ''}
      `}
    >
      {/* Icon circle */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${def.bgColor}`}>
        <Icon className={`w-4 h-4 ${def.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${!item.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
          {def.label}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
          {def.message(item.meta)}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          {timeAgo(item.created_at)}
        </p>
      </div>

      {/* Unread dot */}
      {!item.is_read && (
        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sahifa-500 mt-1.5" />
      )}
    </motion.button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const NotificationBell: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = (user as any)?.id ?? (user as any)?.telegram_id ?? null
  const { notifications, unreadCount, loading, markRead, loadMore } = useNotifications(userId)

  const [open, setOpen] = useState(false)
  const [wiggle, setWiggle] = useState(false)
  // Position of the fixed dropdown, calculated from the button's bounding rect
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const buttonRef  = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevUnread = useRef(unreadCount)

  // ── Wiggle on new unread ──────────────────────────────────────────────────
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setWiggle(true)
      setTimeout(() => setWiggle(false), 600)
    }
    prevUnread.current = unreadCount
    console.log('🔔 Unread count:', unreadCount)
  }, [unreadCount])

  // ── Calculate dropdown position when opening ──────────────────────────────
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [open])

  // ── Click outside to close ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const inButton   = buttonRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inButton && !inDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Handle notification click ─────────────────────────────────────────────
  const handleNotifClick = useCallback((item: NotificationItem) => {
    if (!item.is_read) markRead([item.id])
    const def = getNotifDef(item.type)
    const route = def.route(item.meta)
    setOpen(false)
    if (route) navigate(route)
  }, [markRead, navigate])

  // ── Handle mark all read ──────────────────────────────────────────────────
  const handleMarkAllRead = useCallback(() => {
    markRead()
  }, [markRead])

  if (!userId) return null

  const badgeText = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null

  // ── Dropdown panel (portaled to document.body, position: fixed) ──────────
  const dropdownPanel = (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      style={{ position: 'fixed', top: pos.top, right: pos.right }}
      className="
        z-[9999]
        w-[calc(100vw-2rem)] sm:w-[380px]
        flex flex-col
        max-h-[min(70vh,520px)]
        bg-white/90 dark:bg-[#1C1C22]/95
        backdrop-blur-xl
        border border-gray-200/60 dark:border-white/[0.08]
        rounded-2xl
        shadow-xl shadow-black/10 dark:shadow-black/30
        overflow-hidden
      "
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-white/[0.06]">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Bildirishnomalar
        </h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-sahifa-600 dark:text-sahifa-400 hover:text-sahifa-700 dark:hover:text-sahifa-300 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Barchasini o'qish
          </button>
        )}
      </div>

      {/* List — fills remaining space, scrolls independently */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-white/[0.04] min-h-0">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300 dark:text-gray-600" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mb-3">
              <Bell className="w-5 h-5 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Hozircha bildirishnomalar yo'q
            </p>
          </div>
        ) : (
          <>
            {notifications.map(item => (
              <NotifRow key={item.id} item={item} onClick={handleNotifClick} />
            ))}
            {notifications.length >= 30 && (
              <button
                onClick={loadMore}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-sahifa-500 dark:hover:text-sahifa-400 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Ko'proq yuklash
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer — always visible */}
      <div className="flex-shrink-0 border-t border-gray-200/60 dark:border-white/[0.06]">
        <button
          onClick={() => { setOpen(false); navigate('/notifications') }}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold text-sahifa-600 dark:text-sahifa-400 hover:bg-sahifa-50 dark:hover:bg-sahifa-900/20 transition-colors"
        >
          <LayoutList className="w-3.5 h-3.5" />
          Bildirishnomalar markaziga o'tish
        </button>
      </div>
    </motion.div>
  )

  return (
    <>
      {/* Wiggle keyframes (injected once via global style) */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-10deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
        }
        .animate-wiggle { animation: wiggle 0.6s ease-in-out; }
      `}</style>

      {/* ── Bell button ──────────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          console.log('🔔 Notification bell clicked! Modal/Dropdown triggered.')
          setOpen(prev => !prev)
        }}
        className={`
          relative w-10 h-10 flex items-center justify-center rounded-2xl
          cursor-pointer
          text-slate-500 dark:text-slate-400
          hover:bg-slate-100 dark:hover:bg-[#1A1A1A]
          hover:text-slate-700 dark:hover:text-slate-200
          transition-colors
          ${wiggle ? 'animate-wiggle' : ''}
        `}
        aria-label={`Bildirishnomalar${unreadCount > 0 ? ` (${unreadCount} o'qilmagan)` : ''}`}
      >
        <Bell className="w-[18px] h-[18px]" />

        {/* Badge */}
        {badgeText && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-sahifa-500 text-white text-[9px] font-bold leading-none shadow-glow-sm"
          >
            {badgeText}
          </motion.span>
        )}
      </button>

      {/* ── Dropdown portaled to document.body ───────────────────────────── */}
      <AnimatePresence>
        {open && createPortal(dropdownPanel, document.body)}
      </AnimatePresence>
    </>
  )
}

export default NotificationBell
