/**
 * NotificationToast — buffered toast queue for real-time notifications.
 *
 * Buffering strategy:
 *   • 1-second grouping window: if ≥5 notifications arrive within 1s,
 *     they collapse into a single "5 yangi bildirishnoma" summary.
 *   • Individual toasts auto-dismiss after 4s.
 *   • Max 3 visible toasts at once (FIFO).
 *   • Click navigates to the notification's route.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { onNewNotifications, type useNotifications } from '../hooks/useNotifications'
import { getNotifDef, type NotificationItem } from '../utils/notificationDictionary'

const BUFFER_WINDOW_MS = 1000  // 1-second grouping window
const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 4000
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

  // ── Auto-dismiss ────────────────────────────────────────────────────────
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(0, -1)) // remove oldest
    }, AUTO_DISMISS_MS)
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
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const item = toast.items[0]
          const def = item ? getNotifDef(item.type) : null
          const Icon = def?.icon ?? Bell

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={() => handleClick(toast)}
              className="pointer-events-auto cursor-pointer bg-white/80 dark:bg-[#1C1C22]/90 backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08] rounded-2xl p-3.5 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${def?.bgColor ?? 'bg-gray-100 dark:bg-gray-800'}`}>
                  <Icon className={`w-4.5 h-4.5 ${def?.color ?? 'text-gray-500'}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {toast.isSummary ? (
                    <>
                      <p className="text-xs font-bold text-gray-800 dark:text-white">
                        {toast.items.length} yangi bildirishnoma
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Barchasini ko'rish uchun bosing
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-gray-800 dark:text-white">
                        {def?.label}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                        {def?.message(item!.meta)}
                      </p>
                    </>
                  )}
                </div>

                {/* Close */}
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(toast.id) }}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export default NotificationToast
