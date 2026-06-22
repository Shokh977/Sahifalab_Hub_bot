import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  XMarkIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import apiService from '../services/apiService'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  itemType: 'book' | 'course'
  itemId: number
  itemTitle: string
  priceUzs: number
}

interface PayCode {
  reference_code: string
  telegram_bot_url: string
  status: string
  expires_at: string
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  open, onClose,
  itemType, itemId, itemTitle, priceUzs,
}) => {
  const [payCode, setPayCode] = useState<PayCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)

  const fetchCode = useCallback(async () => {
    if (itemType !== 'course') return
    setLoading(true)
    setError('')
    try {
      const res = await apiService.requestEnrollmentCode(itemId)
      setPayCode(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || "Kod olinmadi. Qayta urinib ko'ring.")
    } finally {
      setLoading(false)
    }
  }, [itemId, itemType])

  useEffect(() => {
    if (open) {
      setPayCode(null)
      setCopied(false)
      setError('')
      fetchCode()
    }
  }, [open, fetchCode])

  function handleCopy() {
    if (!payCode) return
    navigator.clipboard.writeText(payCode.reference_code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!open) return null

  const steps = [
    {
      label: "Telegram bot bilan bog'laning:",
      extra: payCode ? (
        <a
          href={payCode.telegram_bot_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400 text-sm font-semibold hover:bg-sahifa-100 dark:hover:bg-sahifa-900/50 transition-colors"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          @sahifalab_pay_bot
        </a>
      ) : null,
    },
    {
      label: 'Botga quyidagi kodni yuboring:',
      extra: payCode ? (
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 mt-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/60 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors w-full justify-between"
        >
          <span className="font-mono text-base text-gray-900 dark:text-white tracking-wider">
            {payCode.reference_code}
          </span>
          {copied
            ? <ClipboardDocumentCheckIcon className="h-4 w-4 text-sahifa-500 shrink-0" />
            : <ClipboardDocumentIcon className="h-4 w-4 text-gray-400 shrink-0" />
          }
        </button>
      ) : null,
    },
    {
      label: "Bot to'lov ko'rsatmalarini yuboradi:",
      sub: 'Karta raqami, kurs narxi va nima yozish kerakligi',
    },
    {
      label: "To'lov qilgach, bot avtomatik ravishda kursga kirishni faollashtiradi (5–30 daqiqa ichida).",
    },
  ]

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
            initial={{ y: 80, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-3">
              <div className="flex-1 min-w-0 pr-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Kursga yozilish
                </h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                  {itemTitle}
                </p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Price */}
            <div className="mx-5 mb-4 p-3 rounded-2xl bg-gradient-to-r from-sahifa-50 to-blue-50 dark:from-sahifa-900/20 dark:to-blue-900/20 border border-sahifa-200/50 dark:border-sahifa-800/30">
              <p className="text-center">
                <span className="text-2xl font-extrabold text-sahifa-600 dark:text-sahifa-400">
                  {priceUzs.toLocaleString('uz-UZ')}
                </span>
                <span className="ml-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">so'm</span>
              </p>
            </div>

            {/* Body */}
            <div className="px-5 pb-6">
              {loading ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <ArrowPathIcon className="h-7 w-7 text-sahifa-500 animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Kod tayyorlanmoqda…</p>
                </div>
              ) : error ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 mb-4">
                  <ExclamationCircleIcon className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                    <button
                      onClick={fetchCode}
                      className="mt-1.5 text-xs text-sahifa-600 dark:text-sahifa-400 font-medium hover:underline"
                    >
                      Qayta urinish
                    </button>
                  </div>
                </div>
              ) : (
                <ol className="space-y-4">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-600 dark:text-sahifa-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800 dark:text-gray-200">{step.label}</p>
                        {'sub' in step && step.sub && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.sub}</p>
                        )}
                        {step.extra}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <button
                onClick={onClose}
                className="mt-5 w-full py-2 text-sm text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Yopish
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default PaymentModal
