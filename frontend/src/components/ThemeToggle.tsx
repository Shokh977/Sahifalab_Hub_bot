/**
 * ThemeToggle — animated Sun/Moon toggle for dark/light mode.
 *
 * Uses framer-motion for smooth rotation + scale.
 * On toggle, shows a brief Sam toast in Uzbek.
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '../context/themeStore'

const ThemeToggle: React.FC = () => {
  const { theme, toggle } = useThemeStore()
  const [toast, setToast] = useState(false)

  const handleToggle = () => {
    toggle()
    setToast(true)
  }

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(false), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const isDark = theme === 'dark'

  return (
    <div className="relative">
      {/* Toggle button */}
      <motion.button
        onClick={handleToggle}
        whileTap={{ scale: 0.85 }}
        className={`
          relative w-9 h-9 rounded-xl flex items-center justify-center
          transition-colors duration-300
          ${isDark
            ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700/50'
            : 'bg-sahifa-50 hover:bg-sahifa-100 border border-sahifa-200/50'
          }
        `}
        aria-label={isDark ? "Yorug' rejim" : "Qorong'i rejim"}
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.span
              key="moon"
              initial={{ rotate: -90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="text-lg"
            >
              🌙
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ rotate: 90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: -90, scale: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="text-lg"
            >
              ☀️
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Sam toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
            className={`
              absolute top-full right-0 mt-2 z-50
              px-3.5 py-2 rounded-xl whitespace-nowrap
              text-xs font-medium shadow-lg
              ${isDark
                ? 'bg-slate-800 border border-slate-700 text-sahifa-300'
                : 'bg-white border border-sahifa-200 text-sahifa-700 shadow-sahifa-100/50'
              }
            `}
          >
            Yangi ko'rinish sizga yoqdimi? 😊
            <div className="text-[10px] mt-0.5 opacity-60 italic">— Sam</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ThemeToggle
