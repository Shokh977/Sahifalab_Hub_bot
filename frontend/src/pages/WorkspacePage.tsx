import React from 'react'
import { motion } from 'framer-motion'
import { Timer } from 'lucide-react'
import { StudyTimer } from './StudyPage'

const WorkspacePage: React.FC = () => {
  return (
    <div className="pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow-glow-sm">
            <Timer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Fokus
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Vaqtni boshqar, XP yig'
            </p>
          </div>
        </div>
      </motion.div>

      {/* Timer */}
      <StudyTimer embedded />
    </div>
  )
}

export default WorkspacePage
