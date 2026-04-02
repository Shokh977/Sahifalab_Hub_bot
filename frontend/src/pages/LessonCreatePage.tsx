/**
 * LessonCreatePage — teacher form to add or edit a lesson inside a course
 *
 * Routes:
 *   /courses/:courseId/lessons/add              → create mode
 *   /courses/:courseId/lessons/:lessonId/edit   → edit mode (pre-fill from API)
 *
 * Fields:
 *   title, description, VideoSourcePicker (YouTube OR Bunny.net),
 *   duration_minutes, order_index, is_free toggle
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeftIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import VideoSourcePicker from '../components/VideoSourcePicker'
import apiService from '../services/apiService'

// ── types ─────────────────────────────────────────────────────────────────────
type VideoSource = 'youtube' | 'bunny' | 'none'

type FormState = {
  title:            string
  description:      string
  video_url:        string
  video_source:     VideoSource
  duration_minutes: number
  order_index:      number
  is_free:          boolean
}

const EMPTY: FormState = {
  title:            '',
  description:      '',
  video_url:        '',
  video_source:     'bunny',
  duration_minutes: 0,
  order_index:      1,
  is_free:          false,
}

// ── helpers ───────────────────────────────────────────────────────────────────
const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-400 transition'

const Field: React.FC<{
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}> = ({ label, hint, required, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
  </div>
)

// ── page ──────────────────────────────────────────────────────────────────────
const LessonCreatePage: React.FC = () => {
  const { courseId, lessonId } = useParams<{
    courseId: string
    lessonId?: string
  }>()
  const navigate = useNavigate()
  const isEdit   = !!lessonId
  const cId      = parseInt(courseId ?? '0', 10)

  const [form, setForm]      = useState<FormState>(EMPTY)
  const [status, setStatus]  = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setError] = useState('')

  // ── load existing lesson for edit ─────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !lessonId) return
    setStatus('loading')
    apiService.getLesson(parseInt(lessonId, 10))
      .then(r => {
        const l = r.data
        setForm({
          title:            l.title            ?? '',
          description:      l.description      ?? '',
          video_url:        l.video_url        ?? '',
          video_source:     (l.video_source    ?? 'bunny') as VideoSource,
          duration_minutes: l.duration_minutes ?? 0,
          order_index:      l.order_index      ?? 1,
          is_free:          !!l.is_free,
        })
        setStatus('idle')
      })
      .catch(() => { setError('Dars yuklanmadi'); setStatus('error') })
  }, [isEdit, lessonId])

  // ── video picker callback ─────────────────────────────────────────────────
  const onVideoChange = (url: string, durationSec: number) => {
    setForm(prev => ({
      ...prev,
      video_url:        url,
      duration_minutes: durationSec > 0 ? Math.ceil(durationSec / 60) : prev.duration_minutes,
    }))
  }

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Sarlavha majburiy'); return }
    setStatus('saving')
    setError('')

    const payload = {
      course_id:        cId,
      title:            form.title.trim(),
      description:      form.description.trim(),
      video_url:        form.video_url,
      video_source:     form.video_source,
      duration_minutes: form.duration_minutes,
      order_index:      form.order_index,
      is_free:          form.is_free,
    }

    try {
      if (isEdit && lessonId) {
        await apiService.updateLesson(parseInt(lessonId, 10), payload)
      } else {
        await apiService.createLesson(payload)
      }
      setStatus('saved')
      setTimeout(() => navigate(`/courses/${cId}`), 700)
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Xatolik yuz berdi'
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
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
          onClick={() => navigate(`/courses/${cId}`)}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Darsni tahrirlash' : 'Yangi dars'}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isEdit ? "Dars ma'lumotlarini yangilang" : "Kursga yangi dars qo'shing"}
          </p>
        </div>
      </motion.div>

      {status === 'loading' ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          {/* Title */}
          <Field label="Dars sarlavhasi" required>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Masalan: Python ga kirish"
              className={inputCls}
              maxLength={120}
            />
          </Field>

          {/* Description */}
          <Field label="Qisqa tavsif" hint="Ushbu darsda nima o'rganiladi?">
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Darsning qisqacha mazmuni..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>

          {/* Video source picker */}
          <Field label="Video manba">
            <VideoSourcePicker
              courseId={cId || undefined}
              source={form.video_source}
              videoUrl={form.video_url}
              onSourceChange={s => setForm(prev => ({ ...prev, video_source: s, video_url: '' }))}
              onVideoChange={onVideoChange}
              disabled={status === 'saving' || status === 'saved'}
            />
          </Field>

          {/* Duration + Order */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Davomiyligi (daqiqa)" hint="YouTube uchun qo'lda kiriting">
              <input
                type="number"
                value={form.duration_minutes}
                onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 0 }))}
                min={0}
                className={inputCls}
              />
            </Field>
            <Field label="Tartib raqami" hint="Kurs ichida ko'rinish tartibi">
              <input
                type="number"
                value={form.order_index}
                onChange={e => setForm(p => ({ ...p, order_index: parseInt(e.target.value) || 1 }))}
                min={1}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Free preview toggle */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Bepul namuna</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {form.is_free
                    ? "Ro'yxatdan o'tmaganlar ham ko'rishi mumkin"
                    : "Faqat yozilgan talabalar ko'radi"}
                </p>
              </div>
              <div
                onClick={() => setForm(p => ({ ...p, is_free: !p.is_free }))}
                className={`w-11 h-6 rounded-full transition-colors ${
                  form.is_free ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'
                } relative cursor-pointer`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  form.is_free ? 'left-5' : 'left-0.5'
                }`} />
              </div>
            </label>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              <span className="inline-flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4" /> {errorMsg}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'saving' || status === 'saved'}
            className="w-full py-3 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow"
          >
            {status === 'saving' && 'Saqlanmoqda...'}
            {status === 'saved'  && <span className="inline-flex items-center gap-1 justify-center"><CheckCircleIcon className="w-4 h-4" /> Saqlandi!</span>}
            {(status === 'idle' || status === 'error') && (isEdit ? 'Saqlash' : "Dars qo'shish")}
          </button>

        </motion.form>
      )}
    </PageWrapper>
  )
}

export default LessonCreatePage
