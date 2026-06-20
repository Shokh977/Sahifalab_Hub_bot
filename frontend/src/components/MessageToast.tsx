/**
 * MessageToast — slide-in notification for new DMs arriving outside the chat.
 *
 * Reads `toast` from MessagingContext.
 * Auto-dismisses after 5 seconds. Clicking navigates to the conversation.
 */

import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, X } from 'lucide-react'
import { useMessagingSafe } from '../context/MessagingContext'

const MessageToast: React.FC = () => {
  const ctx = useMessagingSafe()
  const navigate = useNavigate()

  const toast = ctx?.toast ?? null
  const clearToast = ctx?.clearToast

  // Auto-dismiss after 5 s
  useEffect(() => {
    if (!toast || !clearToast) return
    const id = setTimeout(clearToast, 5000)
    return () => clearTimeout(id)
  }, [toast, clearToast])

  const handleClick = () => {
    if (!toast || !clearToast) return
    navigate(`/messages/${toast.convId}`)
    clearToast()
  }

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.convId + '-' + toast.preview.slice(0, 8)}
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-6 right-5 z-[9999] max-w-[320px] w-full"
        >
          <div
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleClick()}
            className="flex items-center gap-3 p-3 rounded-2xl shadow-xl cursor-pointer
              bg-[#1c1d27] border border-white/[0.08]
              hover:border-[#e8792f]/30 transition-colors"
          >
            {/* Avatar */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-[#2a2b3d] flex items-center justify-center">
              {toast.senderAvatar ? (
                <img src={toast.senderAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                  <span className="text-white text-sm font-bold">
                    {(toast.senderName || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <MessageCircle className="w-3 h-3 text-[#e8792f] flex-shrink-0" />
                <span className="text-[11px] font-semibold text-[#e8792f] uppercase tracking-wide">
                  Yangi xabar
                </span>
              </div>
              <p className="text-sm font-semibold text-white truncate">{toast.senderName}</p>
              <p className="text-xs text-white/50 truncate mt-0.5">{toast.preview}</p>
            </div>

            {/* Dismiss */}
            <button
              onClick={e => { e.stopPropagation(); clearToast?.() }}
              className="flex-shrink-0 p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              aria-label="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default MessageToast
