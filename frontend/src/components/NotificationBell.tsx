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

// ── Sender avatar helper ─────────────────────────────────────────────────────
function SenderAvatar({ item }: { item: NotificationItem }) {
  const [imgErr, setImgErr] = React.useState(false)
  const photoUrl = !imgErr ? (item.meta.actor_photo ?? item.meta.actor_photo_url ?? null) : null
  const isSystem = item.sender_id === 0 || item.type === 'welcome'

  if (isSystem) {
    // SAHIFALAB platform account — use logo
    return (
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow-sm">
        <span className="text-white text-[10px] font-black tracking-tight">SL</span>
      </div>
    )
  }

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt="sender"
        onError={() => setImgErr(true)}
        className="flex-shrink-0 w-9 h-9 rounded-xl object-cover ring-1 ring-gray-200 dark:ring-white/[0.08]"
      />
    )
  }

  // Fallback: coloured icon circle
  const def = getNotifDef(item.type)
  const Icon = def.icon
  return (
    <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${def.bgColor}`}>
      <Icon className={`w-4 h-4 ${def.color}`} />
    </div>
  )
}

// ── Notification row ──────────────────────────────────────────────────────────
const NotifRow: React.FC<{
  item: NotificationItem
  onClick: (item: NotificationItem) => void
}> = ({ item, onClick }) => {
  const def = getNotifDef(item.type)

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
      {/* Sender avatar (replaces icon-only circle) */}
      <SenderAvatar item={item} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${!item.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
          {def.label}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
          {def.message(item.meta)}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          {timeAgo(item.created_at)}
        </p>
      </div>

      {/* Unread dot — sahifa orange #F15929 */}
      {!item.is_read && (
        <div
          className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
          style={{ backgroundColor: '#F15929' }}
        />
      )}
    </motion.button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const NotificationBell: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = (user as any)?.id ?? (user as any)?.telegram_id ?? null
  const {
    notifications, unreadCount, loading,
    markRead, loadMore, fetchNotifications,
  } = useNotifications(userId)

  const [open, setOpen] = useState(false)
  const [wiggle, setWiggle] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevUnread = useRef(unreadCount)

  // ── Debug: log mount lifecycle ────────────────────────────────────────────
  useEffect(() => {
    console.log('🔔 NotificationBell mounted in DOM')
    return () => console.log('🔔 NotificationBell unmounted from DOM')
  }, [])

  // ── Wiggle on new unread ──────────────────────────────────────────────────
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setWiggle(true)
      setTimeout(() => setWiggle(false), 600)
    }
    prevUnread.current = unreadCount
  }, [unreadCount])

  // ── Fetch full notification list on first dropdown open ───────────────────
  useEffect(() => {
    if (open) {
      console.log('🔔 Dropdown opened — fetching notification list')
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // ── Handle bell click ─────────────────────────────────────────────────────
  const handleBellClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    console.log('🔔 Notification bell clicked! open →', !open)
    setOpen(prev => !prev)
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
  const handleMarkAllRead = useCallback(() => markRead(), [markRead])

  if (!userId) return null

  const badgeText = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null

  return (
    <>
      {/* Wiggle keyframes */}
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

      {/* ── Bell button ─────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleBellClick}
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

        {/* Badge — pops in when count arrives */}
        <AnimatePresence>
          {badgeText && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-white text-[9px] font-bold leading-none shadow-glow-sm"
              style={{ backgroundColor: '#F15929' }}
            >
              {badgeText}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ── Portal: Backdrop + Dropdown (AnimatePresence INSIDE portal) ── */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="notif-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9998]"
            >
              {/* Backdrop — semi-transparent, click to close */}
              <div
                className="absolute inset-0 bg-black/10"
                onClick={() => setOpen(false)}
              />

              {/* Dropdown panel — glassmorphism */}
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="
                  absolute top-[60px] right-5
                  w-[calc(100vw-2rem)] sm:w-[380px]
                  bg-white/80 dark:bg-[#1C1C22]/90
                  backdrop-blur-xl
                  border border-gray-200/60 dark:border-white/[0.12]
                  rounded-2xl
                  shadow-2xl shadow-black/15 dark:shadow-black/40
                  overflow-hidden
                "
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-white/[0.06]">
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

                {/* List */}
                <div
                  className="overflow-y-auto divide-y divide-gray-100 dark:divide-white/[0.04]"
                  style={{ maxHeight: '360px' }}
                >
                  {loading && notifications.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-300 dark:text-gray-600" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mb-3">
                        <Bell className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                      </div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Hozircha bildirishnomalar yo'q
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Yangi faoliyat bo'lganda bu yerda ko'rinadi
                      </p>
                    </div>
                  ) : (
                    <>
                      {notifications.slice(0, 5).map(item => (
                        <NotifRow key={item.id} item={item} onClick={handleNotifClick} />
                      ))}
                      {notifications.length > 5 && (
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

                {/* Footer */}
                <div className="border-t border-gray-200/60 dark:border-white/[0.06]">
                  <button
                    onClick={() => { setOpen(false); navigate('/notifications') }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold text-sahifa-600 dark:text-sahifa-400 hover:bg-sahifa-50 dark:hover:bg-sahifa-900/20 transition-colors"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    Barchasini ko'rish →
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export default NotificationBell
