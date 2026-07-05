/**
 * ExperienceModal — add/edit form for a single work-experience entry.
 * POST/PUT /api/profile/me/experiences
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Briefcase } from 'lucide-react'
import api from '../../services/apiService'

export interface ExperienceItem {
  id: number
  company: string
  title: string
  start_date: string | null
  end_date: string | null
  is_current: boolean
  description: string | null
}

interface ExperienceModalProps {
  open: boolean
  initial?: ExperienceItem | null
  onClose: () => void
  onSaved: (item: ExperienceItem) => void
}

const emptyForm = { company: '', title: '', start_date: '', end_date: '', is_current: false, description: '' }

const ExperienceModal: React.FC<ExperienceModalProps> = ({ open, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial ? {
    company: initial.company, title: initial.title,
    start_date: initial.start_date ?? '', end_date: initial.end_date ?? '',
    is_current: initial.is_current, description: initial.description ?? '',
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  React.useEffect(() => {
    setForm(initial ? {
      company: initial.company, title: initial.title,
      start_date: initial.start_date ?? '', end_date: initial.end_date ?? '',
      is_current: initial.is_current, description: initial.description ?? '',
    } : emptyForm)
    setError(null)
  }, [initial, open])

  const set = (key: keyof typeof form, val: string | boolean) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.company.trim() || !form.title.trim()) {
      setError("Kompaniya va lavozim talab qilinadi")
      return
    }
    setSaving(true)
    setError(null)
    const body = {
      company: form.company.trim(),
      title: form.title.trim(),
      start_date: form.start_date || null,
      end_date: form.is_current ? null : (form.end_date || null),
      is_current: form.is_current,
      description: form.description.trim() || null,
    }
    try {
      const res = initial
        ? await api.client.put(`/api/profile/me/experiences/${initial.id}`, body)
        : await api.client.post('/api/profile/me/experiences', body)
      onSaved(res.data)
      onClose()
    } catch {
      setError("Saqlashda xatolik yuz berdi")
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
            className="relative w-full max-w-md bg-white dark:bg-[#1C1C22] rounded-3xl shadow-2xl p-6 border border-gray-200/60 dark:border-white/[0.08] max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-sahifa-500" /> {initial ? 'Tajribani tahrirlash' : 'Ish tajribasi qo\'shish'}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Lavozim">
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Frontend dasturchi"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
              </Field>
              <Field label="Kompaniya">
                <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Sahifalab"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Boshlanish">
                  <input type="month" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
                </Field>
                <Field label="Tugash">
                  <input type="month" value={form.end_date} onChange={e => set('end_date', e.target.value)} disabled={form.is_current}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors disabled:opacity-50" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-white/60 cursor-pointer select-none">
                <input type="checkbox" checked={form.is_current} onChange={e => set('is_current', e.target.checked)}
                  className="w-4 h-4 rounded accent-sahifa-500" />
                Hozirda shu yerda ishlayman
              </label>
              <Field label="Tavsif (ixtiyoriy)">
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} maxLength={500}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
              </Field>
            </div>

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-5 py-2.5 rounded-xl bg-sahifa-500 text-white text-sm font-bold hover:bg-sahifa-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Saqlash
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 dark:text-white/50 mb-1.5">{label}</label>
    {children}
  </div>
)

export default ExperienceModal
