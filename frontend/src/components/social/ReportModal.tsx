/**
 * ReportModal — reason picker for reporting a post or a user.
 * Posts an entry to /api/v1/social/reports for moderator review.
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flag, Loader2 } from 'lucide-react'
import apiService from '../../services/apiService'

const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam yoki reklama' },
  { value: 'harassment', label: "Ta'qib yoki haqorat" },
  { value: 'inappropriate_content', label: "Nomaqbul kontent" },
  { value: 'impersonation', label: 'Soxta profil' },
  { value: 'other', label: 'Boshqa' },
]

interface Props {
  open: boolean
  targetType: 'post' | 'user'
  targetId: number
  onClose: () => void
}

const ReportModal: React.FC<Props> = ({ open, targetType, targetId, onClose }) => {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!reason) return
    setLoading(true)
    try {
      await apiService.reportContent(targetType, targetId, reason, details.trim() || undefined)
      setSent(true)
      setTimeout(() => { onClose(); setSent(false); setReason(''); setDetails('') }, 1200)
    } catch {
      // best-effort — no user-facing error state needed for a report submission
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm rounded-2xl border border-gray-200/60 dark:border-white/[0.08] bg-white/95 dark:bg-pitch-800/95 backdrop-blur-xl shadow-frost-xl dark:shadow-glass-lg p-6"
          >
            {sent ? (
              <div className="text-center py-4">
                <Flag className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Shikoyat yuborildi</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <Flag className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {targetType === 'post' ? 'Postni shikoyat qilish' : "Foydalanuvchini shikoyat qilish"}
                  </h3>
                </div>

                <div className="space-y-1.5 mb-4">
                  {REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                        reason === r.value
                          ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                          : 'text-gray-600 dark:text-white/60 border border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Qo'shimcha ma'lumot (ixtiyoriy)"
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none mb-4"
                />

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-white/70 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!reason || loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Yuborish
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ReportModal
