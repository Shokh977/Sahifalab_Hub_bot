/**
 * PushNotificationManager — mounts once, manages the full push lifecycle.
 *
 * Behaviour:
 *   - Silently registers the service worker on mount (no UI)
 *   - After 30 seconds (user is engaged), shows a subtle bottom banner
 *     asking to enable push notifications
 *   - Banner is dismissed forever if user clicks "Keyinroq" (stored in localStorage)
 *   - On "Yoqish": calls subscribe() → browser asks for permission
 *   - Once subscribed: banner disappears permanently
 *   - In Telegram WebApp mode or unsupported browsers: renders nothing
 */

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { usePlatform } from '../hooks/usePlatform'

const DISMISSED_KEY = 'sahifa:push_banner_dismissed'
const PROMPT_DELAY_MS = 30_000  // show after 30s of engagement

const PushNotificationManager: React.FC = () => {
  const { user, isAuthenticated } = useAuth()
  const { isTelegram } = usePlatform()
  const userId = (user as any)?.telegram_id || (user as any)?.id || null

  const { isSupported, permission, loading, isSubscribed, subscribe, unsubscribe } =
    usePushNotifications(isAuthenticated ? userId : null)

  const [showBanner, setShowBanner] = useState(false)
  const [dismissed,  setDismissed]  = useState(() =>
    typeof window !== 'undefined' &&
    localStorage.getItem(DISMISSED_KEY) === '1'
  )

  // Show banner after delay if conditions are right
  useEffect(() => {
    if (
      !isSupported ||
      isTelegram ||
      !isAuthenticated ||
      isSubscribed ||
      permission === 'denied' ||
      dismissed
    ) return

    const timer = setTimeout(() => {
      setShowBanner(true)
    }, PROMPT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [isSupported, isTelegram, isAuthenticated, isSubscribed, permission, dismissed])

  // Hide banner once subscribed
  useEffect(() => {
    if (isSubscribed) setShowBanner(false)
  }, [isSubscribed])

  const handleEnable = useCallback(async () => {
    await subscribe()
    setShowBanner(false)
  }, [subscribe])

  const handleDismiss = useCallback(() => {
    setShowBanner(false)
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, '1')
  }, [])

  // No UI in unsupported env
  if (!isSupported || isTelegram) return null

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key="push-banner"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{    y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100]
                     w-[calc(100%-2rem)] max-w-sm"
        >
          <div
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg"
            style={{
              background:   'var(--bg-elevated)',
              border:       '1px solid var(--border-default)',
              boxShadow:    'var(--shadow-md)',
            }}
          >
            {/* Icon */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--brand-subtle)' }}
            >
              <Bell className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                Bildirishnomalarni yoqing
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Yangi xabar va yutuqlardan xabardor bo'ling
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleEnable}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity
                           disabled:opacity-50"
                style={{ background: 'var(--brand-primary)' }}
              >
                {loading ? '...' : 'Yoqish'}
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-xl transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Keyinroq"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default PushNotificationManager
