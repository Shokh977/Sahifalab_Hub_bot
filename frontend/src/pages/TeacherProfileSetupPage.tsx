/**
 * TeacherProfileSetupPage — first-time / edit profile form for approved teachers.
 *
 * Loads existing teacher_profiles row on mount (GET /api/teacher/profile),
 * lets the teacher fill in bio, specialization, etc., then saves
 * via PATCH /api/teacher/profile.
 *
 * Accessible at /teacher/setup — linked from TeacherDashboardPage.
 */
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
  UsersIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeacherProfile {
  bio:              string
  specialization:   string
  experience_years: number
  education:        string
  website_url:      string
  youtube_url:      string
  telegram_channel: string
  profile_complete: boolean
  total_students:   number
  total_courses:    number
  total_earnings:   number
  commission_rate:  number
}

const EMPTY: TeacherProfile = {
  bio:              '',
  specialization:   '',
  experience_years: 0,
  education:        '',
  website_url:      '',
  youtube_url:      '',
  telegram_channel: '',
  profile_complete: false,
  total_students:   0,
  total_courses:    0,
  total_earnings:   0,
  commission_rate:  0.70,
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

const Field: React.FC<{
  label:    string
  hint?:    string
  required?: boolean
  children: React.ReactNode
}> = ({ label, hint, required, children }) => (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
  </div>
)

const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sahifa-400/50 focus:border-sahifa-400 transition'

// ── Page ─────────────────────────────────────────────────────────────────────

type Status = 'loading' | 'ready' | 'saving' | 'saved' | 'error'

const TeacherProfileSetupPage: React.FC = () => {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [form, setForm]     = useState<TeacherProfile>(EMPTY)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError]   = useState('')

  // ── Load existing profile ─────────────────────────────────────────────────
  useEffect(() => {
    apiService.getTeacherProfile()
      .then(res => {
        const d = res.data
        setForm({
          bio:              d.bio              ?? '',
          specialization:   d.specialization   ?? '',
          experience_years: d.experience_years ?? 0,
          education:        d.education        ?? '',
          website_url:      d.website_url      ?? '',
          youtube_url:      d.youtube_url      ?? '',
          telegram_channel: d.telegram_channel ?? '',
          profile_complete: d.profile_complete ?? false,
          total_students:   d.total_students   ?? 0,
          total_courses:    d.total_courses    ?? 0,
          total_earnings:   d.total_earnings   ?? 0,
          commission_rate:  d.commission_rate  ?? 0.70,
        })
        setStatus('ready')
      })
      .catch(err => {
        console.error('[TeacherProfile] Load error:', err?.response?.data?.detail || err?.message)
        setError('Profil yuklanmadi')
        setStatus('error')
      })
  }, [])

  // ── Field helpers ─────────────────────────────────────────────────────────
  const set = (key: keyof TeacherProfile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: key === 'experience_years' ? Number(e.target.value) : e.target.value }))

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.bio.trim()) { setError('Bio maydoni majburiy'); return }
    if (!form.specialization.trim()) { setError('Mutaxassislik majburiy'); return }

    setStatus('saving')
    setError('')
    try {
      await apiService.updateTeacherProfile({
        bio:              form.bio.trim(),
        specialization:   form.specialization.trim(),
        experience_years: form.experience_years,
        education:        form.education.trim(),
        website_url:      form.website_url.trim(),
        youtube_url:      form.youtube_url.trim(),
        telegram_channel: form.telegram_channel.trim(),
      })
      setStatus('saved')
      setTimeout(() => navigate('/teacher'), 1200)
    } catch (err: any) {
      console.error('[TeacherProfile] Save error:', err?.response?.data?.detail || err?.message)
      setError('Saqlashda xatolik yuz berdi')
      setStatus('ready')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-20">
          <PencilSquareIcon className="h-10 w-10 text-slate-400 animate-pulse" />
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow">
            <PencilSquareIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              {form.profile_complete ? 'Profilni tahrirlash' : 'Profilni to\'ldirish'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {user?.first_name} · O'qituvchi
            </p>
          </div>
        </div>

        {/* Progress indicator */}
        {!form.profile_complete && (
          <div className="mt-3 p-3 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/20 border border-sahifa-200 dark:border-sahifa-800 text-xs text-sahifa-700 dark:text-sahifa-300">
            Profilingizni to'ldirib o'qituvchi sifatida faoliyatni boshlang.
            Bio va mutaxassislik majburiy — qolganlar ixtiyoriy.
          </div>
        )}
      </motion.div>

      {/* Commission info */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-5 grid grid-cols-3 gap-3"
      >
        {[
          { label: "Talabalar",  value: form.total_students, icon: UsersIcon },
          { label: "Kurslar",    value: form.total_courses,  icon: VideoCameraIcon },
          { label: "Komisyon",   value: `${Math.round(form.commission_rate * 100)}%`, icon: BanknotesIcon },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <s.icon className="h-5 w-5 mx-auto text-sahifa-500" />
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5"
      >
        <Field label="Bio" hint="O'zingiz haqida qisqacha ma'lumot" required>
          <textarea
            value={form.bio}
            onChange={set('bio')}
            rows={3}
            placeholder="Matematika o'qituvchisiman, 5 yillik tajribam bor..."
            className={inputCls}
          />
        </Field>

        <Field label="Mutaxassislik" hint="Asosiy yo'nalishingiz" required>
          <input
            type="text"
            value={form.specialization}
            onChange={set('specialization')}
            placeholder="Masalan: Python dasturlash, Matematika, Ingliz tili..."
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tajriba (yil)">
            <input
              type="number"
              min={0}
              max={60}
              value={form.experience_years || ''}
              onChange={set('experience_years')}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Ta'lim">
            <input
              type="text"
              value={form.education}
              onChange={set('education')}
              placeholder="ToshDTU, Matematika..."
              className={inputCls}
            />
          </Field>
        </div>

        <div className="pt-1">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">
            Ijtimoiy havolalar (ixtiyoriy)
          </p>
          <div className="space-y-3">
            <Field label="Veb-sayt">
              <input
                type="url"
                value={form.website_url}
                onChange={set('website_url')}
                placeholder="https://yoursite.uz"
                className={inputCls}
              />
            </Field>
            <Field label="YouTube">
              <input
                type="url"
                value={form.youtube_url}
                onChange={set('youtube_url')}
                placeholder="https://youtube.com/@channel"
                className={inputCls}
              />
            </Field>
            <Field label="Telegram kanal" hint="@username shaklida">
              <input
                type="text"
                value={form.telegram_channel}
                onChange={set('telegram_channel')}
                placeholder="@my_channel"
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
        >
          <span className="inline-flex items-center gap-1"><ExclamationCircleIcon className="h-4 w-4" /> {error}</span>
        </motion.div>
      )}

      {/* Success */}
      {status === 'saved' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300 text-center"
        >
          <span className="inline-flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" /> Profil saqlandi! Panelga yo'naltirilmoqda...</span>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-5 flex gap-3"
      >
        <button
          onClick={handleSave}
          disabled={status === 'saving' || status === 'saved'}
          className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 text-white font-bold text-sm shadow disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98] inline-flex items-center justify-center gap-1"
        >
          {status === 'saving' ? <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Saqlanmoqda...</> : status === 'saved' ? <><CheckCircleIcon className="h-4 w-4" /> Saqlandi!</> : <><PencilSquareIcon className="h-4 w-4" /> Saqlash</>}
        </button>
        <button
          onClick={() => navigate('/teacher')}
          className="px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Orqaga
        </button>
      </motion.div>
    </PageWrapper>
  )
}

export default TeacherProfileSetupPage
