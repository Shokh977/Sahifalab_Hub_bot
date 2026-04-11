/**
 * NotificationToast — buffered toast queue for real-time notifications.
 *
 * Buffering strategy:
 *   • 1-second grouping window: if ≥5 notifications arrive within 1s,
 *     they collapse into a single "5 yangi bildirishnoma" summary.
 *   • Individual toasts auto-dismiss after 4s (level_up: 6s).
 *   • Max 3 visible toasts at once (FIFO).
 *   • Click navigates to the notification's route.
 *   • Special styles: level_up (gold), xp_reward (orange shimmer), achievement (purple),
 *     streak / daily_streak (fire), message (teal).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Sparkles, X } from 'lucide-react'
import { onNewNotifications } from '../hooks/useNotifications'
import { getNotifDef, type NotificationItem } from '../utils/notificationDictionary'

// ── Toast type → visual tier ──────────────────────────────────────────────────
type ToastTier = 'level_up' | 'achievement' | 'xp' | 'streak' | 'social' | 'default'

function getToastTier(type: string): ToastTier {
  if (type === 'level_up')                 return 'level_up'
  if (type === 'achievement')              return 'achievement'
  if (type === 'xp_reward')               return 'xp'
  if (type === 'streak' || type === 'daily_streak') return 'streak'
  if (['follow', 'like', 'comment', 'repost', 'mention'].includes(type)) return 'social'
  return 'default'
}

const TIER_STYLES: Record<ToastTier, {
  bg: string; border: string; iconBg: string; iconColor: string; textColor: string
  glow?: string; badge?: string
}> = {
  level_up: {
    bg: 'linear-gradient(135deg, rgba(255,200,50,0.15) 0%, rgba(241,89,41,0.12) 100%)',
    border: 'rgba(255,190,50,0.4)',
    iconBg: 'linear-gradient(135deg, #FFD700, #F15929)',
    iconColor: 'text-white',
    textColor: 'text-amber-800 dark:text-amber-100',
    glow: '0 0 20px rgba(255,190,50,0.35)',
    badge: 'YANGI DARAJA 🏆',
  },
  achievement: {
    bg: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(109,40,217,0.08) 100%)',
    border: 'rgba(139,92,246,0.35)',
    iconBg: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    iconColor: 'text-white',
    textColor: 'text-violet-800 dark:text-violet-100',
    glow: '0 0 20px rgba(139,92,246,0.3)',
    badge: 'YUTUQ 🏅',
  },
  xp: {
    bg: 'linear-gradient(135deg, rgba(241,89,41,0.12) 0%, rgba(180,44,8,0.08) 100%)',
    border: 'rgba(241,89,41,0.35)',
    iconBg: 'linear-gradient(135deg, #F15929, #B82C06)',
    iconColor: 'text-white',
    textColor: 'text-orange-800 dark:text-orange-100',
    glow: '0 0 16px rgba(241,89,41,0.28)',
  },
  streak: {
    bg: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(234,88,12,0.08) 100%)',
    border: 'rgba(249,115,22,0.38)',
    iconBg: 'linear-gradient(135deg, #F97316, #EA580C)',
    iconColor: 'text-white',
    textColor: 'text-orange-800 dark:text-orange-100',
  },
  social: {
    bg: 'rgba(255,255,255,0.82)',
    border: 'rgba(203,213,225,0.7)',
    iconBg: '',
    iconColor: '',
    textColor: 'text-slate-800 dark:text-white',
  },
  default: {
    bg: 'rgba(255,255,255,0.82)',
    border: 'rgba(203,213,225,0.7)',
    iconBg: '',
    iconColor: '',
    textColor: 'text-slate-800 dark:text-white',
  },
}

const BUFFER_WINDOW_MS = 1000  // 1-second grouping window
const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 4500
const LEVEL_UP_DISMISS_MS = 6500
const GROUP_THRESHOLD = 5     // ≥5 in window → collapse to summary

interface ToastItem {
  id: string
  items: NotificationItem[]
  isSummary: boolean
  createdAt: number
}

const NotificationToast: React.FC = () => {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const bufferRef = useRef<NotificationItem[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Flush buffer into visible toasts ────────────────────────────────────
  const flushBuffer = useCallback(() => {
    const buffered = bufferRef.current.splice(0)
    if (buffered.length === 0) return

    const isSummary = buffered.length >= GROUP_THRESHOLD
    const toast: ToastItem = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: buffered,
      isSummary,
      createdAt: Date.now(),
    }

    setToasts(prev => [toast, ...prev].slice(0, MAX_VISIBLE))
  }, [])

  // ── Register for real-time notifications ────────────────────────────────
  useEffect(() => {
    onNewNotifications((items) => {
      bufferRef.current.push(...items)

      // Reset the flush timer (1s window)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flushBuffer, BUFFER_WINDOW_MS)
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [flushBuffer])

  // ── Auto-dismiss (level_up toasts stay longer) ─────────────────────────
  useEffect(() => {
    if (toasts.length === 0) return
    const oldest = toasts[toasts.length - 1]
    const isLevelUp = !oldest.isSummary && oldest.items[0]?.type === 'level_up'
    const delay = isLevelUp ? LEVEL_UP_DISMISS_MS : AUTO_DISMISS_MS
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(0, -1))
    }, delay)
    return () => clearTimeout(timer)
  }, [toasts])

  // ── Dismiss handler ─────────────────────────────────────────────────────
  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // ── Click handler ───────────────────────────────────────────────────────
  const handleClick = (toast: ToastItem) => {
    if (toast.isSummary) {
      // Navigate to notifications dropdown (bell click equivalent)
      dismiss(toast.id)
      return
    }
    const item = toast.items[0]
    if (!item) return
    const def = getNotifDef(item.type)
    const route = def.route(item.meta)
    dismiss(toast.id)
    if (route) navigate(route)
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const item = toast.items[0]
          const def = item ? getNotifDef(item.type) : null
          const Icon = def?.icon ?? Bell
          const tier = item ? getToastTier(item.type) : 'default'
          const ts = TIER_STYLES[tier]
          const isSpecial = tier === 'level_up' || tier === 'achievement'

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 64, scale: 0.94, y: -8 }}
              animate={{ opacity: 1, x: 0, scale: 1, y: 0 }}
              exit={{ opacity: 0, x: 64, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.85 }}
              onClick={() => handleClick(toast)}
              className="pointer-events-auto cursor-pointer rounded-[18px] overflow-hidden"
              style={{
                background: ts.bg,
                backdropFilter: 'blur(20px)',
                border: `1px solid ${ts.border}`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)${ts.glow ? `, ${ts.glow}` : ''}`,
              }}
            >
              {/* Level-up / achievement: full-width accent top bar */}
              {isSpecial && (
                <div className="h-0.5 w-full"
                  style={{
                    background: tier === 'level_up'
                      ? 'linear-gradient(90deg, #FFD700, #F15929, #FFD700)'
                      : 'linear-gradient(90deg, #8B5CF6, #A78BFA, #8B5CF6)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer-badge 2s linear infinite',
                  }} />
              )}

              <div className="p-3.5">
                {/* Badge label for special tiers */}
                {ts.badge && !toast.isSummary && (
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] mb-2"
                    style={{ color: tier === 'level_up' ? '#D97706' : '#7C3AED' }}>
                    {ts.badge}
                  </p>
                )}

                <div className="flex items-start gap-3">
                  {/* Icon circle */}
                  {ts.iconBg ? (
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-[12px] flex items-center justify-center shadow-sm"
                      style={{ background: ts.iconBg }}
                    >
                      {isSpecial
                        ? <Sparkles className="w-5 h-5 text-white" />
                        : <Icon className="w-5 h-5 text-white" />
                      }
                    </div>
                  ) : (
                    <div className={`flex-shrink-0 w-10 h-10 rounded-[12px] flex items-center justify-center ${def?.bgColor ?? 'bg-gray-100 dark:bg-gray-800'}`}>
                      <Icon className={`w-5 h-5 ${def?.color ?? 'text-gray-500'}`} />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {toast.isSummary ? (
                      <>
                        <p className={`text-[13px] font-bold leading-tight ${ts.textColor}`}>
                          {toast.items.length} yangi bildirishnoma
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Barchasini ko'rish uchun bosing
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={`text-[13px] font-bold leading-tight ${ts.textColor}`}>
                          {def?.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                          {def?.message(item!.meta)}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Close */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(toast.id) }}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors mt-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export default NotificationToast
