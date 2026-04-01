/**
 * CourseCreatePage — teacher form to create or edit a course
 *
 * Route:
 *   /courses/create           → new course
 *   /courses/:id/edit         → edit existing course
 *
 * Fields: title, category, level, language, description,
 *         thumbnail_url, price / is_paid, is_published
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Category {
  id:   number
  name: string
  slug: string
  icon: string
}

type FormState = {
  title:         string
  description:   string
  category_id:   string
  level:         string
  language:      string
  thumbnail_url: string
  is_paid:       boolean
  price:         string
  is_published:  boolean
}

const LEVELS = [
  { value: 'beginner',     label: "Boshlang'ich" },
  { value: 'intermediate', label: "O'rta"         },
  { value: 'advanced',     label: 'Yuqori'        },
]

const LANGUAGES = [
  { value: 'uz',  label: "O'zbek" },
  { value: 'ru',  label: 'Ruscha' },
  { value: 'en',  label: 'English' },
]

const EMPTY_FORM: FormState = {
  title:         '',
  description:   '',
  category_id:   '',
  level:         'beginner',
  language:      'uz',
  thumbnail_url: '',
  is_paid:       false,
  price:         '0',
  is_published:  false,
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
const Field: React.FC<{
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}> = ({ label, hint, required, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
  </div>
)

const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-400 transition'

// ── Main page ─────────────────────────────────────────────────────────────────
const CourseCreatePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit   = !!id

  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [categories, setCategories] = useState<Category[]>([])
  const [status, setStatus]     = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Load categories ────────────────────────────────────────────────────
  useEffect(() => {
    apiService.getCategories()
      .then(r => setCategories(r.data))
      .catch(() => {})
  }, [])

  // ── Load existing course for edit ──────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return
    setStatus('loading')
    apiService.getCourse(parseInt(id, 10))
      .then(r => {
        const c = r.data
        setForm({
          title:         c.title         ?? '',
          description:   c.description   ?? '',
          category_id:   String(c.category_id ?? ''),
          level:         c.level         ?? 'beginner',
          language:      c.language      ?? 'uz',
          thumbnail_url: c.thumbnail_url ?? '',
          is_paid:       !!c.is_paid,
          price:         String(c.price ?? '0'),
          is_published:  !!c.is_published,
        })
        setStatus('idle')
      })
      .catch(() => { setErrorMsg("Kurs yuklanmadi"); setStatus('error') })
  }, [id, isEdit])

  // ── Field helpers ──────────────────────────────────────────────────────
  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setErrorMsg("Sarlavha majburiy"); return }
    setStatus('saving')
    setErrorMsg('')

    const payload = {
      title:         form.title.trim(),
      description:   form.description.trim(),
      category_id:   form.category_id ? parseInt(form.category_id, 10) : undefined,
      level:         form.level,
      language:      form.language,
      thumbnail_url: form.thumbnail_url.trim(),
      is_paid:       form.is_paid,
      price:         form.is_paid ? parseFloat(form.price) || 0 : 0,
      is_published:  form.is_published,
    }

    try {
      if (isEdit && id) {
        await apiService.updateCourse(parseInt(id, 10), payload)
      } else {
        const res = await apiService.createCourse(payload)
        const newId = res.data?.id
        if (newId) {
          setStatus('saved')
          setTimeout(() => navigate(`/courses/${newId}`), 800)
          return
        }
      }
      setStatus('saved')
      setTimeout(() => navigate(isEdit ? `/courses/${id}` : '/teacher'), 800)
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Xatolik yuz berdi"
      setErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail))
      setStatus('error')
    }
  }

  return (
    <PageWrapper>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Kursni tahrirlash' : 'Yangi kurs'}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isEdit ? 'Kurs ma\'lumotlarini yangilang' : "Darslaringizni talabalar bilan ulashing"}
          </p>
        </div>
      </motion.div>

      {status === 'loading' ? (
        <div className="space-y-4 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          {/* Title */}
          <Field label="Kurs sarlavhasi" required>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Masalan: Python dasturlash kursi"
              className={inputCls}
              maxLength={120}
            />
          </Field>

          {/* Description */}
          <Field label="Tavsif" hint="Kurs nima haqida? Qanday bilim beradi?">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Kursning qisqacha ta'rifi..."
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </Field>

          {/* Category + Level */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategoriya">
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
                <option value="">— Tanlang —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Daraja">
              <select value={form.level} onChange={e => set('level', e.target.value)} className={inputCls}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Language */}
          <Field label="Til">
            <select value={form.language} onChange={e => set('language', e.target.value)} className={inputCls}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>

          {/* Thumbnail URL */}
          <Field label="Muqova rasmi (URL)" hint="Bunny.net yoki boshqa CDN URL manzilini kiriting">
            <input
              type="url"
              value={form.thumbnail_url}
              onChange={e => set('thumbnail_url', e.target.value)}
              placeholder="https://cdn.bunny.net/..."
              className={inputCls}
            />
            {form.thumbnail_url && (
              <img
                src={form.thumbnail_url}
                alt="preview"
                className="mt-2 h-28 w-full object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                onError={e => (e.currentTarget.style.display = 'none')}
              />
            )}
          </Field>

          {/* Paid toggle + price */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Pullik kurs</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Talabalar to'lov qilib kiradi</p>
              </div>
              <div
                onClick={() => set('is_paid', !form.is_paid)}
                className={`w-11 h-6 rounded-full transition-colors ${
                  form.is_paid ? 'bg-sahifa-500' : 'bg-slate-200 dark:bg-slate-700'
                } relative cursor-pointer`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  form.is_paid ? 'left-5' : 'left-0.5'
                }`} />
              </div>
            </label>

            {form.is_paid && (
              <Field label="Narxi (so'm)">
                <input
                  type="number"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                  min="0"
                  step="1000"
                  placeholder="50000"
                  className={inputCls}
                />
              </Field>
            )}
          </div>

          {/* Publish toggle */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Chop etish</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {form.is_published ? 'Kurs hammaga ko\'rinadi' : 'Hozircha qoralama (faqat siz ko\'rasiz)'}
                </p>
              </div>
              <div
                onClick={() => set('is_published', !form.is_published)}
                className={`w-11 h-6 rounded-full transition-colors ${
                  form.is_published ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                } relative cursor-pointer`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  form.is_published ? 'left-5' : 'left-0.5'
                }`} />
              </div>
            </label>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'saving' || status === 'saved'}
            className="w-full py-3 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow"
          >
            {status === 'saving' && '⏳ Saqlanmoqda...'}
            {status === 'saved'  && '✅ Saqlandi!'}
            {(status === 'idle' || status === 'error') && (isEdit ? '💾 Saqlash' : '🚀 Kurs yaratish')}
          </button>

        </motion.form>
      )}
    </PageWrapper>
  )
}

export default CourseCreatePage
