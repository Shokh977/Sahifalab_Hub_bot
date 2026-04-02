/**
 * PaymentModal — Reusable payment modal for courses & books
 *
 * Supports three payment methods:
 *   ⭐ Telegram Stars  (inside Telegram Mini App via openInvoice)
 *   🟢 Click.uz        (Telegram openInvoice or direct browser redirect)
 *   💙 Payme           (Telegram openInvoice or direct browser redirect)
 *
 * Usage:
 *   <PaymentModal
 *     open={showPayment}
 *     onClose={() => setShowPayment(false)}
 *     onSuccess={() => { setIsEnrolled(true); ... }}
 *     itemType="course"
 *     itemId={course.id}
 *     itemTitle={course.title}
 *     priceUzs={course.price}
 *   />
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { XMarkIcon, ArrowPathIcon, CursorArrowRaysIcon, DevicePhoneMobileIcon, ShieldCheckIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/24/solid'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { usePlatform } from '../hooks/usePlatform'
import apiService from '../services/apiService'

type PaymentProvider = 'telegram_stars' | 'click' | 'payme'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  itemType: 'book' | 'course'
  itemId: number
  itemTitle: string
  priceUzs: number
  userId?: number  // Telegram user ID — required in Telegram mode (no JWT)
}

const STARS_RATE = 250

const PaymentModal: React.FC<PaymentModalProps> = ({
  open, onClose, onSuccess,
  itemType, itemId, itemTitle, priceUzs, userId,
}) => {
  const { webApp } = useTelegramWebApp()
  const { isTelegram } = usePlatform()
  const [loading, setLoading] = useState<PaymentProvider | null>(null)
  const [error, setError] = useState('')
  const [polling, setPolling] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderIdRef = useRef<string | null>(null)

  // Clean up polling on unmount or close
  useEffect(() => {
    if (!open) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
      orderIdRef.current = null
      setLoading(null)
      setError('')
      setPolling(false)
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [open])

  const startPolling = useCallback((orderId: string) => {
    orderIdRef.current = orderId
    setPolling(true)
    let attempts = 0
    const maxAttempts = 60 // 5 minutes at 5-second intervals

    pollingRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setPolling(false)
        setError("To'lov vaqti tugadi. Qayta urinib ko'ring.")
        return
      }
      try {
        const res = await apiService.getPaymentStatus(orderId, userId)
        if (res.data?.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          setPolling(false)
          onSuccess()
          onClose()
        }
      } catch {
        // Keep polling
      }
    }, 5000)
  }, [onSuccess, onClose, userId])

  const handlePay = useCallback(async (provider: PaymentProvider) => {
    setError('')
    setLoading(provider)
    try {
      // Use the unified /pay/init endpoint
      const res = await apiService.initPayment(
        itemType, itemId, provider,
        window.location.href, // return_url
        userId,
      )

      const { order_id, invoice_url, checkout_url } = res.data || {}
      if (!order_id) {
        setError("To'lov yaratilmadi. Qayta urinib ko'ring.")
        setLoading(null)
        return
      }

      // ── Inside Telegram Mini App ──
      if (isTelegram && webApp && invoice_url) {
        webApp.openInvoice(invoice_url, async (status: string) => {
          if (status === 'paid') {
            try {
              await apiService.confirmUnifiedPayment(order_id, userId)
            } catch { /* webhook will handle */ }
            onSuccess()
            onClose()
          } else if (status === 'failed') {
            setError("To'lov amalga oshmadi")
          } else if (status === 'cancelled') {
            // User cancelled, do nothing
          }
          setLoading(null)
        })
        // Also start polling as backup
        startPolling(order_id)
        return
      }

      // ── Outside Telegram (browser) ──
      // For Click/Payme: prefer direct checkout URL
      const redirectUrl = checkout_url || invoice_url
      if (redirectUrl) {
        // Open payment page in new tab
        window.open(redirectUrl, '_blank')
        // Start polling for completion
        startPolling(order_id)
      } else {
        setError("To'lov havolasi yaratilmadi")
        setLoading(null)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || "Xatolik yuz berdi")
      setLoading(null)
    }
  }, [itemType, itemId, isTelegram, webApp, startPolling, onSuccess, onClose, userId])

  const starsPrice = Math.max(1, Math.round(priceUzs / STARS_RATE))

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-3">
              <div className="flex-1 min-w-0 pr-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  Sotib olish
                </h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                  {itemTitle}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={!!loading}
                className="shrink-0 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Price display */}
            <div className="mx-5 mb-4 p-3 rounded-2xl bg-gradient-to-r from-sahifa-50 to-blue-50 dark:from-sahifa-900/20 dark:to-blue-900/20 border border-sahifa-200/50 dark:border-sahifa-800/30">
              <p className="text-center">
                <span className="text-2xl font-extrabold text-sahifa-600 dark:text-sahifa-400">
                  {priceUzs.toLocaleString('uz-UZ')}
                </span>
                <span className="ml-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                  so'm
                </span>
              </p>
            </div>

            {/* Polling indicator */}
            {polling && (
              <div className="mx-5 mb-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                <ArrowPathIcon className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  To'lov kutilmoqda… Sahifani yopmang.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 mb-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                <ExclamationCircleIcon className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Payment buttons */}
            <div className="px-5 pb-5 space-y-2.5">
              {/* Telegram Stars — only in Telegram */}
              {isTelegram && (
                <button
                  onClick={() => handlePay('telegram_stars')}
                  disabled={!!loading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm
                    bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md shadow-amber-200/40
                    dark:shadow-amber-900/30 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                    transition-all disabled:opacity-60 disabled:pointer-events-none"
                >
                  {loading === 'telegram_stars' ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <StarIcon className="h-5 w-5 text-white" />
                  )}
                  <span className="flex-1 text-left">Telegram Stars</span>
                  <span className="text-xs opacity-90">≈ {starsPrice} Stars</span>
                </button>
              )}

              {/* Click */}
              <button
                onClick={() => handlePay('click')}
                disabled={!!loading}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm
                  bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200/40
                  dark:shadow-blue-900/30 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                  transition-all disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading === 'click' ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <CursorArrowRaysIcon className="h-5 w-5" />
                )}
                <span className="flex-1 text-left">Click</span>
                <span className="text-xs opacity-90">{priceUzs.toLocaleString('uz-UZ')} so'm</span>
              </button>

              {/* Payme */}
              <button
                onClick={() => handlePay('payme')}
                disabled={!!loading}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm
                  bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-teal-200/40
                  dark:shadow-teal-900/30 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                  transition-all disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading === 'payme' ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <DevicePhoneMobileIcon className="h-5 w-5" />
                )}
                <span className="flex-1 text-left">Payme</span>
                <span className="text-xs opacity-90">{priceUzs.toLocaleString('uz-UZ')} so'm</span>
              </button>

              {/* Info */}
              <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 pt-1 flex items-center justify-center gap-1">
                <ShieldCheckIcon className="h-3 w-3" />
                To'lov xavfsiz. Pullik kontent darhol ochiladi.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default PaymentModal
