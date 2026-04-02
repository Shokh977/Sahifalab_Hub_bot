/**
 * LessonCreatePage — premium teacher form to add / edit a lesson
 *
 * Routes:
 *   /courses/:courseId/lessons/add              → create mode
 *   /courses/:courseId/lessons/:lessonId/edit   → edit mode (pre-fill from API)
 *
 * Matches the Course Studio design language:
 *   sticky top bar, card-based fields, #F26722 accent,
 *   dark/light mode, mobile-first Telegram Mini App compatible.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  LockClosedIcon,
  LockOpenIcon,
  PlayCircleIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import VideoSourcePicker from '../components/VideoSourcePicker'
import FileUploadWidget from '../components/FileUploadWidget'
import apiService from '../services/apiService'

// ── types ─────────────────────────────────────────────────────────────────────
type VideoSource = 'youtube' | 'bunny' | 'none'
type LessonType = 'video' | 'material'

type FormState = {
  title: string
  description: string
  type: LessonType
  video_url: string
  video_source: VideoSource
  material_url: string
  material_name: string
  duration_minutes: number
  order_index: number
  is_free: boolean
}

const EMPTY: FormState = {
  title: '',
  description: '',
  type: 'video',
  video_url: '',
  video_source: 'bunny',
  material_url: '',
  material_name: '',
  duration_minutes: 0,
  order_index: 1,
  is_free: false,
}

// ── shared styles ─────────────────────────────────────────────────────────────
const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26722]/30 focus:border-[#F26722] transition'

const cardCls =
  'rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/75 shadow-[0_8px_30px_rgba(15,23,42,0.05)] dark:shadow-none'

const Field: React.FC<{
  label: string
  hint?: string
  required?: boolean
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  children: React.ReactNode
}> = ({ label, hint, required, icon: Icon, children }) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
      {Icon && <Icon className="h-4 w-4" />}
      <span>{label}</span>
      {required && <span className="text-[#F26722]">*</span>}
    </label>
    {children}
    {hint && (
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {hint}
      </p>
    )}
  </div>
)

// ── page ──────────────────────────────────────────────────────────────────────
const LessonCreatePage: React.FC = () => {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId?: string }>()
  const navigate = useNavigate()
  const isEdit = !!lessonId
  const cId = parseInt(courseId ?? '0', 10)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setError] = useState('')

  // ── load existing lesson ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !lessonId) return
    setStatus('loading')
    apiService
      .getLesson(parseInt(lessonId, 10))
      .then((r) => {
        const l = r.data
        setForm({
          title: l.title ?? '',
          description: l.description ?? '',
          type: l.material_url ? 'material' : 'video',
          video_url: l.video_url ?? '',
          video_source: (l.video_source ?? 'bunny') as VideoSource,
          material_url: l.material_url ?? '',
          material_name: l.material_name ?? '',
          duration_minutes: l.duration_minutes ?? 0,
          order_index: l.order_index ?? 1,
          is_free: !!l.is_free,
        })
        setStatus('idle')
      })
      .catch(() => {
        setError('Dars yuklanmadi')
        setStatus('error')
      })
  }, [isEdit, lessonId])

  // ── video picker callback ─────────────────────────────────────────────────
  const onVideoChange = (url: string, durationSec: number) => {
    setForm((prev) => ({
      ...prev,
      video_url: url,
      duration_minutes: durationSec > 0 ? Math.ceil(durationSec / 60) : prev.duration_minutes,
    }))
  }

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Sarlavha majburiy')
      return
    }
    setStatus('saving')
    setError('')

    const payload = {
      course_id: cId,
      title: form.title.trim(),
      description: form.description.trim(),
      video_url: form.type === 'video' ? form.video_url : '',
      video_source: form.type === 'video' ? form.video_source : ('none' as VideoSource),
      duration_minutes: form.duration_minutes,
      order_index: form.order_index,
      is_free: form.is_free,
      material_url:  form.type === 'material' ? form.material_url  : '',
      material_name: form.type === 'material' ? form.material_name : '',
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

  const isBusy = status === 'saving' || status === 'saved'

  return (
    <PageWrapper className="space-y-0" topPadding="py-0">
      {/* ═══════ TOP BAR ═══════ */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 lg:-mx-8 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 sm:px-5 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => navigate(`/courses/${cId}`)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                {isEdit ? 'Darsni tahrirlash' : 'Yangi dars'}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Kurs #{cId} · {form.type === 'video' ? 'Video dars' : 'Material'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17] disabled:opacity-60"
            >
              {status === 'saving' ? (
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
              ) : status === 'saved' ? (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              ) : (
                <SparklesIcon className="h-3.5 w-3.5" />
              )}
              {status === 'saved' ? 'Saqlandi!' : isEdit ? 'Saqlash' : "Qo'shish"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ STATUS MESSAGE ═══════ */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-auto max-w-2xl overflow-hidden pt-3"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  if (status === 'error') setStatus('idle')
                }}
                className="flex-shrink-0"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ MAIN FORM ═══════ */}
      <div className="mx-auto max-w-2xl space-y-5 pt-5 pb-10">
        {status === 'loading' ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
            ))}
          </div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* ── Lesson type switcher ── */}
            <div className={`${cardCls} overflow-hidden`}>
              <div className="bg-gradient-to-r from-[#F26722]/5 to-transparent px-5 py-3.5 dark:from-[#F26722]/10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F26722]">
                  Dars turi
                </p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                  {([
                    { type: 'video' as LessonType, icon: PlayCircleIcon, label: 'Video dars' },
                    { type: 'material' as LessonType, icon: DocumentTextIcon, label: 'Material' },
                  ]).map((item) => {
                    const active = form.type === item.type
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, type: item.type }))}
                        className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
                          active
                            ? 'bg-white text-[#F26722] shadow-sm dark:bg-slate-900'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Title & Description ── */}
            <div className={`${cardCls} overflow-hidden`}>
              <div className="bg-gradient-to-r from-blue-500/5 to-transparent px-5 py-3.5 dark:from-blue-500/10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                  Asosiy ma'lumot
                </p>
              </div>
              <div className="space-y-4 p-5">
                <Field label="Dars sarlavhasi" required>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Masalan: Python ga kirish"
                    className={inputCls}
                    maxLength={120}
                  />
                </Field>
                <Field label="Qisqa tavsif" hint="Ushbu darsda nimalar o'rganiladi?">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Darsning qisqacha mazmuni..."
                    rows={4}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </div>

            {/* ── Video section ── */}
            {form.type === 'video' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${cardCls} overflow-hidden`}
              >
                <div className="bg-gradient-to-r from-violet-500/5 to-transparent px-5 py-3.5 dark:from-violet-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                    Video manba
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  <Field
                    label="Video"
                    icon={CloudArrowUpIcon}
                    hint="YouTube yoki Bunny.net dan yuklang"
                  >
                    <VideoSourcePicker
                      courseId={cId || undefined}
                      source={form.video_source}
                      videoUrl={form.video_url}
                      onSourceChange={(s) =>
                        setForm((prev) => ({ ...prev, video_source: s, video_url: '' }))
                      }
                      onVideoChange={onVideoChange}
                      disabled={isBusy}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Davomiylik (daq.)"
                      icon={FilmIcon}
                      hint="YouTube uchun qo'lda kiriting"
                    >
                      <input
                        type="number"
                        value={form.duration_minutes}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            duration_minutes: parseInt(e.target.value) || 0,
                          }))
                        }
                        min={0}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Tartib raqami" hint="Kurs ichida ko'rinish tartibi">
                      <input
                        type="number"
                        value={form.order_index}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            order_index: parseInt(e.target.value) || 1,
                          }))
                        }
                        min={1}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Material section ── */}
            {form.type === 'material' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${cardCls} overflow-hidden`}
              >
                <div className="bg-gradient-to-r from-emerald-500/5 to-transparent px-5 py-3.5 dark:from-emerald-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                    Material
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  <Field
                    label="Material nomi"
                    icon={DocumentTextIcon}
                    hint="PDF workbook, cheat sheet yoki project files"
                  >
                    <input
                      value={form.material_name}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, material_name: e.target.value }))
                      }
                      className={inputCls}
                      placeholder="React Performance Workbook.pdf"
                    />
                  </Field>
                  <Field
                    label="Fayl yuklash"
                    icon={CloudArrowUpIcon}
                    hint="PDF, DOC, PPTX yoki rasm yuklang"
                  >
                    <FileUploadWidget
                      accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                      courseId={cId || undefined}
                      folder="materials"
                      onUploaded={(url, name) =>
                        setForm((p) => ({
                          ...p,
                          material_url: url,
                          material_name: name || p.material_name,
                        }))
                      }
                      existingUrl={form.material_url}
                      existingName={form.material_name}
                      variant="document"
                      maxSizeMB={50}
                    />
                  </Field>
                  {!form.material_url && (
                    <Field label="yoki URL kiriting" hint="Public CDN havolasini ulang">
                      <input
                        value={form.material_url}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, material_url: e.target.value }))
                        }
                        className={inputCls}
                        placeholder="https://.../file.pdf"
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Davomiylik (daq.)">
                      <input
                        type="number"
                        value={form.duration_minutes}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            duration_minutes: parseInt(e.target.value) || 0,
                          }))
                        }
                        min={0}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Tartib raqami">
                      <input
                        type="number"
                        value={form.order_index}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            order_index: parseInt(e.target.value) || 1,
                          }))
                        }
                        min={1}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Free preview toggle ── */}
            <div className={`${cardCls} overflow-hidden`}>
              <div className="bg-gradient-to-r from-amber-500/5 to-transparent px-5 py-3.5 dark:from-amber-500/10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
                  Ko'rinish turi
                </p>
              </div>
              <div className="p-5">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, is_free: !p.is_free }))}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm font-semibold transition ${
                    form.is_free
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {form.is_free ? (
                      <LockOpenIcon className="h-5 w-5 text-amber-500" />
                    ) : (
                      <LockClosedIcon className="h-5 w-5 text-slate-400" />
                    )}
                    <div className="text-left">
                      <p>{form.is_free ? 'Bepul namuna (Preview)' : 'Faqat enrolled talabalar'}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {form.is_free
                          ? "Ro'yxatdan o'tmaganlar ham ko'rishi mumkin"
                          : "Kursga yozilgan talabalar ko'radi"}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`h-6 w-11 rounded-full transition ${
                      form.is_free ? 'bg-[#F26722]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        form.is_free ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {/* ── Mobile submit button ── */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F26722] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17] disabled:opacity-60"
              >
                {status === 'saving' ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" /> Saqlanmoqda...
                  </>
                ) : status === 'saved' ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4" /> Saqlandi!
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />{' '}
                    {isEdit ? "O'zgarishlarni saqlash" : "Dars qo'shish"}
                  </>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </div>
    </PageWrapper>
  )
}

export default LessonCreatePage
