/**
 * ThemeToggle — animated Sun/Moon toggle for dark/light mode.
 *
 * Uses framer-motion for smooth rotation + scale.
 * On toggle, shows a brief Sam toast in Uzbek.
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '../context/themeStore'
import { Moon, SunMedium } from 'lucide-react'

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
          relative w-10 h-10 rounded-2xl flex items-center justify-center
          transition-colors duration-300
          ${isDark
            ? 'bg-[#1A1A1A] hover:bg-[#202020] border border-white/5 text-white'
            : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 shadow-sm'
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
              className="flex items-center justify-center"
            >
              <Moon className="w-[18px] h-[18px]" strokeWidth={1.9} />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ rotate: 90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: -90, scale: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <SunMedium className="w-[18px] h-[18px]" strokeWidth={1.9} />
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
                ? 'bg-[#1A1A1A] border border-white/5 text-gray-200'
                : 'bg-white border border-gray-200 text-gray-700'
              }
            `}
          >
            Rejim almashtirildi
            <div className="text-[10px] mt-0.5 opacity-60">Interfeys yangilandi</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ThemeToggle
