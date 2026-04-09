/**
 * CoursesTab — quick-access courses view for the Workspace.
 *
 * Shows a CTA to browse courses and links to the main courses page.
 * Future: list enrolled courses with progress indicators.
 */
import React from 'react'
import { motion } from 'framer-motion'
import { BookOpen, ArrowRight, GraduationCap, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

const CoursesTab: React.FC = () => {
  return (
    <div className="flex flex-col items-center py-8">
      {/* Hero illustration */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-24 h-24 rounded-3xl bg-gradient-to-br from-sahifa-400/20 to-purple-400/10 dark:from-sahifa-500/15 dark:to-purple-500/10 flex items-center justify-center mb-5"
      >
        <GraduationCap className="w-10 h-10 text-sahifa-500" />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-lg font-extrabold text-slate-800 dark:text-white mb-1"
      >
        Kurslaringiz
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs mb-6 leading-relaxed"
      >
        O'qishni davom eting yoki yangi kurslarni kashf qiling.
        Har bir tugatilgan kurs uchun <span className="text-sahifa-500 font-semibold">+200 XP</span> oling!
      </motion.p>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-sm space-y-3"
      >
        <Link
          to="/courses"
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#222230] border border-slate-200/60 dark:border-white/5 shadow-sm hover:shadow-md hover:border-sahifa-400/30 dark:hover:border-sahifa-500/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-sahifa-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-sahifa-500/20 transition-colors">
            <BookOpen className="w-5 h-5 text-sahifa-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-white">Barcha kurslar</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Ko'rish va yozilish</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-sahifa-500 group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          to="/workspace?tab=focus"
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-[#222230] border border-slate-200/60 dark:border-white/5 shadow-sm hover:shadow-md hover:border-emerald-400/30 dark:hover:border-emerald-500/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
            <Sparkles className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-white">O'qish xonasi</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Birga o'qish va ambient tovushlar</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
        </Link>
      </motion.div>

      {/* Tip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-8 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200/50 dark:border-amber-700/20 max-w-sm"
      >
        <p className="text-[11px] text-amber-700 dark:text-amber-300 text-center leading-relaxed">
          💡 <span className="font-semibold">Maslahat:</span> Reja tabidagi vazifani kursga bog'lang — 
          <strong>Play</strong> tugmasi bevosita kursga olib boradi!
        </p>
      </motion.div>
    </div>
  )
}

export default CoursesTab
