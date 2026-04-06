/**
 * DeleteConfirmModal — Premium confirmation overlay for destructive actions.
 *
 * Frosted-glass modal with cancel/confirm buttons.
 * Used across Posts, Comments, and Messenger delete flows.
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title?: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const DeleteConfirmModal: React.FC<Props> = ({
  open,
  title = "O'chirishni tasdiqlang",
  description = "Bu amalni ortga qaytarib bo'lmaydi.",
  confirmLabel = "O'chirish",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-sm rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/95 dark:bg-pitch-800/95 backdrop-blur-xl shadow-frost-xl dark:shadow-glass-lg p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>
            </div>

            {/* Text */}
            <h3 className="text-base font-bold text-gray-900 dark:text-white text-center mb-1">
              {title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-white/50 text-center mb-6">
              {description}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-white/70 bg-gray-100 dark:bg-white/[0.06] border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors active:scale-95 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors active:scale-95 disabled:opacity-50"
              >
                {loading ? "O'chirilmoqda..." : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DeleteConfirmModal
