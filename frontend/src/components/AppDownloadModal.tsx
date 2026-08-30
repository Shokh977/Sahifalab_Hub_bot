import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { XMarkIcon, BookOpenIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { usePlatform } from '../hooks/usePlatform'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sahifalab.app'

const STORAGE_KEY = 'app_download_modal_dismissed_at'
const REPROMPT_DAYS = 7
const SHOW_DELAY_MS = 1200

function shouldShow(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const dismissedAt = Number(raw)
    if (!Number.isFinite(dismissedAt)) return true
    const daysSinceDismiss = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24)
    return daysSinceDismiss >= REPROMPT_DAYS
  } catch {
    // localStorage unavailable (private mode, etc.) — default to showing once per page load
    return true
  }
}

function dismiss() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
}

/**
 * AppDownloadModal — promotes the native Android app to sahifalab.uz web
 * visitors. Telegram Mini App users are excluded (they're already inside
 * the Telegram experience; this is specifically about the standalone app).
 * Dismissal is remembered for REPROMPT_DAYS so it doesn't nag on every visit.
 */
const AppDownloadModal: React.FC = () => {
  const { isWeb } = usePlatform()
  const [open, setOpen] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)

  useEffect(() => {
    if (!isWeb || !shouldShow()) return
    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isWeb])

  function handleClose() {
    dismiss()
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center px-4 pb-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

          {/* Modal */}
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-download-modal-title"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              aria-label="Yopish"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
              {iconFailed ? (
                <div className="w-16 h-16 rounded-2xl bg-sahifa-500 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(255,106,42,0.25)] mb-4">
                  <BookOpenIcon className="w-8 h-8" />
                </div>
              ) : (
                <img
                  src="/sahifalab.jpg"
                  alt="SAHIFALAB"
                  className="w-16 h-16 rounded-2xl object-cover shadow-[0_10px_24px_rgba(255,106,42,0.25)] mb-4"
                  onError={() => setIconFailed(true)}
                />
              )}

              <h3 id="app-download-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
                SAHIFALAB ilovasini yuklab oling
              </h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Fokus vaqt, testlar, kartalar va reyting — mobil ilovada yanada qulay.
                Android uchun bepul yuklab oling.
              </p>

              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold shadow-[0_10px_24px_rgba(255,106,42,0.3)] transition-colors"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Google Play'dan yuklab olish
              </a>

              <button
                onClick={handleClose}
                className="mt-3 w-full py-2 text-sm text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Keyinroq
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AppDownloadModal
