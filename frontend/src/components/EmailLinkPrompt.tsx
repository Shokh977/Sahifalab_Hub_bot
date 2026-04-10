/**
 * EmailLinkPrompt — overlay modal that asks Telegram-only users to link
 * an email so their account works across web & Telegram Mini App.
 *
 * Shown once after login when `user.email` is null/empty.
 * The user can dismiss ("Keyinroq") and the prompt won't reappear for 7 days.
 */
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  EnvelopeIcon,
  LinkIcon,
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

const DISMISS_KEY = 'email_link_dismissed_at'
const DISMISS_DAYS = 7

const EmailLinkPrompt: React.FC = () => {
  const { user, isAuthenticated, updateUserEmail } = useAuth()
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<string | null>(null)
  const [merged, setMerged] = useState(false)

  // ── Decide visibility ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user) return
    // Already has email → nothing to do
    if (user.email) return
    // Telegram-only user with positive id (real Telegram) — these need linking.
    // Negative ids are email/google synthetic accounts — they already have email.
    if (user.id < 0) return

    // Check if user dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime()
      const now = Date.now()
      if (now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    }

    // Show after a short delay so the dashboard loads first
    const timer = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(timer)
  }, [isAuthenticated, user])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setVisible(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await apiService.linkEmail(email.trim())
      const data = res.data
      updateUserEmail(data.email)
      setMerged(data.merged)
      setSuccess(data.message)
      // Auto-close after showing success
      setTimeout(() => setVisible(false), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="email-link-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
              title="Keyinroq"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>

            {/* Header gradient */}
            <div className="bg-gradient-to-br from-sahifa-500 to-sahifa-600 px-6 pt-7 pb-5 text-center text-white">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <LinkIcon className="w-7 h-7" />
                </div>
              </div>
              <h2 className="text-lg font-bold">Emailingizni ulang</h2>
              <p className="text-sm text-white/80 mt-1">
                Web versiyada ham hisobingizga kiring
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {success ? (
                /* ── Success state ─────────────────────────────────────────── */
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center space-y-3"
                >
                  <div className="flex justify-center">
                    <CheckCircleIcon className="w-14 h-14 text-green-500" />
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {merged ? 'Akkauntlar birlashtirildi!' : 'Email ulandi!'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{success}</p>
                  {merged && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-sahifa-600 dark:text-sahifa-400">
                      <SparklesIcon className="w-4 h-4" />
                      Barcha xaridlaringiz va XP lar birlashtirildi
                    </div>
                  )}
                </motion.div>
              ) : (
                /* ── Form state ────────────────────────────────────────────── */
                <>
                  {/* Benefits list */}
                  <div className="space-y-2">
                    {[
                      'Xaridlaringiz (kitob, kurslar) barcha qurilmalarda sinxronlanadi',
                      'Web versiyada email + parol orqali kiring',
                      'Akkauntingiz xavfsiz bo\'ladi',
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                        <CheckCircleIcon className="w-4 h-4 text-sahifa-500 shrink-0 mt-0.5" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="relative">
                      <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email manzilingiz"
                        required
                        autoFocus
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sahifa-400/50 focus:border-sahifa-400 transition-all"
                      />
                    </div>

                    {error && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="w-full py-3 rounded-xl bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold text-sm shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Tekshirilmoqda…
                        </span>
                      ) : (
                        <>
                          <LinkIcon className="w-4 h-4" />
                          Emailni ulash
                        </>
                      )}
                    </button>
                  </form>

                  <button
                    onClick={handleDismiss}
                    className="w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
                  >
                    Keyinroq
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default EmailLinkPrompt
