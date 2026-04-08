/**
 * NotificationsPage — Dedicated notification center for SAHIFALAB.
 *
 * Features:
 *   • Tabs: Barchasi / Ijtimoiy / Ta'lim / O'sish / Biznes
 *   • Unread count badges on each tab
 *   • Bento grid card layout (2 columns on md+)
 *   • Real-time via useNotifications (Supabase Realtime)
 *   • Click → mark read + navigate to linked resource
 *   • Mark all read button
 *   • Light / Dark mode with Oxygen font
 *   • Empty state per category
 *   • Smooth AnimatePresence transitions
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCheck, Loader2, BellOff, ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import {
  getNotifDef,
  getNotificationMessage,
  type NotificationItem,
  type NotifCategory,
  CATEGORY_LABELS,
  CATEGORY_BADGE,
  CATEGORY_COLORS,
  ALL_CATEGORIES,
} from '../utils/notificationDictionary'

// ── Time ago ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'hozirgina'
  if (mins < 60) return `${mins} daqiqa oldin`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} soat oldin`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} kun oldin`
  return new Date(dateStr).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })
}

// ── Tab definition ─────────────────────────────────────────────────────────────

type TabKey = 'ALL' | NotifCategory

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL',          label: 'Barchasi' },
  { key: 'SOCIAL',       label: 'Ijtimoiy' },
  { key: 'EDUCATIONAL',  label: "Ta'lim" },
  { key: 'GROWTH',       label: "O'sish" },
  { key: 'BUSINESS',     label: 'Biznes' },
]

// ── Bento notification card ───────────────────────────────────────────────────

const NotifCard: React.FC<{
  item: NotificationItem
  index: number
  onAction: (item: NotificationItem) => void
}> = ({ item, index, onAction }) => {
  const def = getNotifDef(item.type)
  const Icon = def.icon
  const message = getNotificationMessage(item)
  const badge = CATEGORY_BADGE[item.category]
  const catLabel = CATEGORY_LABELS[item.category]

  return (
    <motion.button
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.22, delay: index * 0.03, ease: 'easeOut' }}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onAction(item)}
      className={`
        group relative w-full text-left rounded-2xl overflow-hidden
        transition-shadow duration-200
        shadow-frost hover:shadow-frost-hover
        dark:shadow-card-dark dark:hover:shadow-bento
        border border-transparent
        ${item.is_read
          ? 'bg-white dark:bg-[#1C1C22]/80'
          : 'bg-gradient-to-br from-sahifa-50 to-white dark:from-sahifa-950/30 dark:to-[#1C1C22]/90 border-sahifa-200/40 dark:border-sahifa-800/30'
        }
      `}
    >
      {/* Unread accent bar */}
      {!item.is_read && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-full bg-sahifa-500" />
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Top row: icon + meta */}
        <div className="flex items-start gap-3">
          {/* Icon circle */}
          <div className={`
            flex-shrink-0 w-10 h-10 rounded-xl
            flex items-center justify-center
            ${def.bgColor}
            transition-transform duration-200 group-hover:scale-110
          `}>
            <Icon className={`w-5 h-5 ${def.color}`} />
          </div>

          {/* Label + time */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${def.color}`}>
                {def.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge}`}>
                {catLabel}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {timeAgo(item.created_at)}
            </p>
          </div>

          {/* Unread dot */}
          {!item.is_read && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-sahifa-500 shadow-glow-sm mt-1"
            />
          )}
        </div>

        {/* Message */}
        <p className={`
          text-sm leading-relaxed
          ${item.is_read
            ? 'text-gray-600 dark:text-gray-400'
            : 'text-gray-800 dark:text-gray-100 font-medium'
          }
        `}>
          {message}
        </p>

        {/* Bottom: navigation hint */}
        <div className="flex items-center justify-end">
          <span className="text-[10px] text-gray-300 dark:text-gray-600 group-hover:text-sahifa-400 dark:group-hover:text-sahifa-500 transition-colors">
            Ko'rish →
          </span>
        </div>
      </div>
    </motion.button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ tab: TabKey }> = ({ tab }) => {
  const label = tab === 'ALL' ? 'bildirishnomalar' : CATEGORY_LABELS[tab as NotifCategory].toLowerCase()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-full flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mb-4 shadow-inner">
        <BellOff className="w-7 h-7 text-gray-300 dark:text-gray-600" />
      </div>
      <p className="text-base font-semibold text-gray-500 dark:text-gray-400">
        Hozircha {label} yo'q
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
        Yangi faoliyat bo'lganda bu yerda ko'rinadi.
      </p>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const NotificationsPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = (user as any)?.id ?? (user as any)?.telegram_id ?? null

  const { notifications, unreadCount, loading, markRead, loadMore, fetchNotifications } = useNotifications(userId)

  // Fetch full notification list on page mount
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const [activeTab, setActiveTab] = useState<TabKey>('ALL')

  // ── Filter by tab ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (activeTab === 'ALL') return notifications
    return notifications.filter(n => n.category === activeTab)
  }, [notifications, activeTab])

  // ── Unread counts per tab ─────────────────────────────────────────────────
  const unreadByTab = useMemo(() => {
    const counts: Partial<Record<TabKey, number>> = { ALL: unreadCount }
    for (const cat of ALL_CATEGORIES) {
      counts[cat] = notifications.filter(n => n.category === cat && !n.is_read).length
    }
    return counts
  }, [notifications, unreadCount])

  // ── Handle card click ─────────────────────────────────────────────────────
  const handleAction = useCallback((item: NotificationItem) => {
    if (!item.is_read) markRead([item.id])
    const route = getNotifDef(item.type).route(item.meta)
    if (route) navigate(route)
  }, [markRead, navigate])

  // ── Mark all read for active tab ─────────────────────────────────────────
  const handleMarkAll = useCallback(() => {
    if (activeTab === 'ALL') {
      markRead()
    } else {
      const ids = notifications
        .filter(n => n.category === activeTab && !n.is_read)
        .map(n => n.id)
      if (ids.length) markRead(ids)
    }
  }, [activeTab, notifications, markRead])

  const tabUnread = unreadByTab[activeTab] ?? 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-pitch-900 font-sans">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-20">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200/80 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors shadow-frost"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-sahifa-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Bildirishnomalar
              </h1>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="min-w-[22px] h-[22px] flex items-center justify-center px-1.5 rounded-full bg-sahifa-500 text-white text-[10px] font-bold shadow-glow-sm"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Barcha faoliyat va yangiliklar
            </p>
          </div>

          {/* Mark all read */}
          {tabUnread > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200/80 dark:border-white/[0.06] text-xs font-medium text-sahifa-600 dark:text-sahifa-400 hover:bg-sahifa-50 dark:hover:bg-sahifa-900/20 transition-colors shadow-frost"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Barchasini o'qish
            </motion.button>
          )}
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-2xl bg-white dark:bg-[#1C1C22]/80 border border-gray-200/60 dark:border-white/[0.06] shadow-frost mb-6 overflow-x-auto scrollbar-hide">
          {TABS.map(({ key, label }) => {
            const count = unreadByTab[key] ?? 0
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`
                  relative flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold
                  transition-all duration-200 whitespace-nowrap
                  ${isActive
                    ? 'bg-sahifa-500 text-white shadow-glow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                  }
                `}
              >
                {label}
                {count > 0 && (
                  <span className={`
                    min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full text-[9px] font-bold
                    ${isActive
                      ? 'bg-white/30 text-white'
                      : 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-600 dark:text-sahifa-400'
                    }
                  `}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-sahifa-400" />
              <p className="text-xs text-gray-400 dark:text-gray-500">Yuklanmoqda...</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {/* Bento grid */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {filtered.length === 0 ? (
                <EmptyState tab={activeTab} />
              ) : (
                filtered.map((item, i) => (
                  <NotifCard
                    key={item.id}
                    item={item}
                    index={i}
                    onAction={handleAction}
                  />
                ))
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Load more ────────────────────────────────────────────────────── */}
        {notifications.length >= 30 && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200/60 dark:border-white/[0.06] text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-sahifa-600 dark:hover:text-sahifa-400 hover:border-sahifa-200 dark:hover:border-sahifa-800/40 transition-all shadow-frost hover:shadow-glow-sm"
            >
              <Loader2 className="w-3.5 h-3.5" />
              Ko'proq yuklash
            </button>
          </div>
        )}

        {/* ── Stats summary strip ───────────────────────────────────────────── */}
        {notifications.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 p-4 rounded-2xl bg-white dark:bg-[#1C1C22]/60 border border-gray-100 dark:border-white/[0.05] shadow-frost"
          >
            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Kategoriya bo'yicha
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ALL_CATEGORIES.map(cat => {
                const total = notifications.filter(n => n.category === cat).length
                const unread = notifications.filter(n => n.category === cat && !n.is_read).length
                if (total === 0) return null
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    className={`
                      flex flex-col p-3 rounded-xl text-left transition-all
                      ${activeTab === cat
                        ? 'bg-sahifa-50 dark:bg-sahifa-900/20 ring-1 ring-sahifa-200 dark:ring-sahifa-800/40'
                        : 'bg-gray-50 dark:bg-white/[0.02] hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                      }
                    `}
                  >
                    <span className={`text-xs font-bold mb-1 ${CATEGORY_COLORS[cat]}`}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="text-lg font-bold text-gray-800 dark:text-white leading-none">
                      {total}
                    </span>
                    {unread > 0 && (
                      <span className="text-[10px] text-sahifa-500 dark:text-sahifa-400 mt-0.5 font-medium">
                        {unread} o'qilmagan
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default NotificationsPage
