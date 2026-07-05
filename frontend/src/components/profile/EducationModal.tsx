/**
 * EducationModal — add/edit form for a single education entry.
 * POST/PUT /api/profile/me/education
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, GraduationCap } from 'lucide-react'
import api from '../../services/apiService'

export interface EducationItem {
  id: number
  school: string
  degree: string | null
  field_of_study: string | null
  start_year: number | null
  end_year: number | null
  description: string | null
}

interface EducationModalProps {
  open: boolean
  initial?: EducationItem | null
  onClose: () => void
  onSaved: (item: EducationItem) => void
}

const emptyForm = { school: '', degree: '', field_of_study: '', start_year: '', end_year: '', description: '' }

const EducationModal: React.FC<EducationModalProps> = ({ open, initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial ? {
    school: initial.school, degree: initial.degree ?? '', field_of_study: initial.field_of_study ?? '',
    start_year: initial.start_year?.toString() ?? '', end_year: initial.end_year?.toString() ?? '',
    description: initial.description ?? '',
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  React.useEffect(() => {
    setForm(initial ? {
      school: initial.school, degree: initial.degree ?? '', field_of_study: initial.field_of_study ?? '',
      start_year: initial.start_year?.toString() ?? '', end_year: initial.end_year?.toString() ?? '',
      description: initial.description ?? '',
    } : emptyForm)
    setError(null)
  }, [initial, open])

  const set = (key: keyof typeof form, val: string) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.school.trim()) {
      setError("O'quv muassasa nomi talab qilinadi")
      return
    }
    setSaving(true)
    setError(null)
    const body = {
      school: form.school.trim(),
      degree: form.degree.trim() || null,
      field_of_study: form.field_of_study.trim() || null,
      start_year: form.start_year ? Number(form.start_year) : null,
      end_year: form.end_year ? Number(form.end_year) : null,
      description: form.description.trim() || null,
    }
    try {
      const res = initial
        ? await api.client.put(`/api/profile/me/education/${initial.id}`, body)
        : await api.client.post('/api/profile/me/education', body)
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
                <GraduationCap className="w-4 h-4 text-sahifa-500" /> {initial ? "Ta'limni tahrirlash" : "Ta'lim qo'shish"}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="O'quv muassasa">
                <input value={form.school} onChange={e => set('school', e.target.value)} placeholder="Toshkent Axborot Texnologiyalari Universiteti"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Daraja">
                  <input value={form.degree} onChange={e => set('degree', e.target.value)} placeholder="Bakalavr"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
                </Field>
                <Field label="Yo'nalish">
                  <input value={form.field_of_study} onChange={e => set('field_of_study', e.target.value)} placeholder="Kompyuter fanlari"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Boshlanish yili">
                  <input type="number" value={form.start_year} onChange={e => set('start_year', e.target.value)} placeholder="2020"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
                </Field>
                <Field label="Tugash yili">
                  <input type="number" value={form.end_year} onChange={e => set('end_year', e.target.value)} placeholder="2024"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors" />
                </Field>
              </div>
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

export default EducationModal
