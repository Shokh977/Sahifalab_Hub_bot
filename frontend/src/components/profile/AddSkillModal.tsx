/**
 * AddSkillModal — quick add for a single skill.
 * POST /api/profile/skills
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Sparkles } from 'lucide-react'
import api from '../../services/apiService'
import type { SkillItem } from './SkillsSection'

interface AddSkillModalProps {
  open: boolean
  onClose: () => void
  onAdded: (item: SkillItem) => void
}

const AddSkillModal: React.FC<AddSkillModalProps> = ({ open, onClose, onAdded }) => {
  const [name, setName]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  React.useEffect(() => { if (open) { setName(''); setError(null) } }, [open])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError("Ko'nikma nomini kiriting"); return }
    setSaving(true)
    setError(null)
    try {
      const res = await api.client.post('/api/skills', { skill_name: trimmed })
      onAdded(res.data)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Saqlashda xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white dark:bg-[#1C1C22] rounded-3xl shadow-2xl p-6 border border-gray-200/60 dark:border-white/[0.08]"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sahifa-500" /> Ko'nikma qo'shish
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="Masalan: Figma, Python, Ingliz tili"
              maxLength={100}
              autoFocus
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors"
            />

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-5 py-2.5 rounded-xl bg-sahifa-500 text-white text-sm font-bold hover:bg-sahifa-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Qo'shish
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AddSkillModal
