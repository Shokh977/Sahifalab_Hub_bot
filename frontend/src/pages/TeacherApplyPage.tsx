/**
 * TeacherApplyPage — Multi-field teacher application form.
 *
 * Flow:
 *  1. Student visits /become-teacher
 *  2. Fills in: specialization, experience_years, bio, course_idea, motivation
 *  3. Submits → POST /api/auth/apply-teacher with form data
 *  4. Backend sets role='teacher', status='pending', stores in teacher_profiles
 *  5. Page shows success / pending confirmation
 */
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormData {
  specialization:   string
  experience_years: string
  bio:              string
  course_idea:      string
  motivation:       string
}

type State = 'form' | 'loading' | 'success' | 'already_pending' | 'already_teacher' | 'error'

// ── Benefits ──────────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: '🎓', title: "O'z kurslaringizni yarating", desc: 'Video darslar, testlar va materiallar bilan to\'liq kurs tuzing' },
  { icon: '💰', title: 'Daromad oling', desc: 'Har bir to\'lov uchun komisyon foizini hisobingizga oling' },
  { icon: '📊', title: 'Analitika paneli', desc: "O'quvchilar progressi va daromad statistikasini kuzating" },
  { icon: '🏆', title: "O'qituvchi badji", desc: 'Profilingizda maxsus "Teacher" badge ko\'rinadi' },
]

// ── Field ─────────────────────────────────────────────────────────────────────

interface FieldProps {
  label:       string
  required?:   boolean
  children:    React.ReactNode
  hint?:       string
}

const Field: React.FC<FieldProps> = ({ label, required, children, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">{hint}</p>}
  </div>
)

const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sahifa-400/50 focus:border-sahifa-400 transition-all"

// ── Page ─────────────────────────────────────────────────────────────────────

const TeacherApplyPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Pre-detect state from AuthContext
  const initialState: State =
    user?.role === 'admin'                                      ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'active'       ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'pending'      ? 'already_pending' :
    'form'

  const [state, setState]     = useState<State>(initialState)
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm]       = useState<FormData>({
    specialization:   '',
    experience_years: '',
    bio:              '',
    course_idea:      '',
    motivation:       '',
  })

  const updateField = (k: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const isFormValid = () =>
    form.specialization.trim() &&
    form.experience_years.trim() &&
    form.bio.trim().length >= 20 &&
    form.course_idea.trim().length >= 20 &&
    form.motivation.trim().length >= 20

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid()) return
    setState('loading')
    setErrorMsg('')
    try {
      const res = await apiService.applyTeacher({
        specialization:   form.specialization.trim(),
        experience_years: parseInt(form.experience_years, 10),
        bio:              form.bio.trim(),
        course_idea:      form.course_idea.trim(),
        motivation:       form.motivation.trim(),
      })
      const data = res.data
      if (data.already_applied) {
        setState(data.status === 'active' ? 'already_teacher' : 'already_pending')
      } else {
        setState('success')
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Xatolik yuz berdi'
      setErrorMsg(String(detail))
      setState('form')
    }
  }

  // ── Success / already-pending ──────────────────────────────────────────────
  if (state === 'success' || state === 'already_pending') {
    return (
      <PageWrapper>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-10 space-y-5"
        >
          <div className="text-7xl select-none">⏳</div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Ariza yuborildi!</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Arizangiz admin tomonidan ko'rib chiqilmoqda.
              Tasdiqlangandan so'ng sizga xabar beriladi va
              o'qituvchi paneli ochiladi.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-700 dark:text-amber-300 text-left space-y-1">
            <p className="font-semibold">📋 Navbatdagi qadamlar:</p>
            <p>1. Admin arizangizni ko'rib chiqadi</p>
            <p>2. Sizning rolingiz "Teacher" ga o'zgaradi</p>
            <p>3. Yangi kirish paytida o'qituvchi paneli ochiladi</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 rounded-2xl bg-sahifa-500 hover:bg-sahifa-600 text-white font-semibold text-sm transition-colors"
            >
              🏠 Bosh sahifaga
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 rounded-2xl border border-sahifa-300 dark:border-sahifa-700 text-sahifa-600 dark:text-sahifa-400 font-semibold text-sm hover:bg-sahifa-50 dark:hover:bg-sahifa-900/20 transition-colors"
            >
              🔄 Yangilash
            </button>
          </div>
        </motion.div>
      </PageWrapper>
    )
  }

  // ── Already active teacher ─────────────────────────────────────────────────
  if (state === 'already_teacher') {
    return (
      <PageWrapper>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-10 space-y-5"
        >
          <div className="text-7xl select-none">🎓</div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Siz allaqachon o'qituvchisiz!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">O'qituvchi panelingizga o'ting.</p>
          <Link
            to="/teacher"
            className="inline-block px-8 py-3 bg-sahifa-500 hover:bg-sahifa-600 text-white font-semibold rounded-2xl text-sm transition-colors"
          >
            O'qituvchi paneli →
          </Link>
        </motion.div>
      </PageWrapper>
    )
  }

  // ── Main application form ──────────────────────────────────────────────────
  return (
    <PageWrapper>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 text-3xl shadow-lg mb-4">
          🎓
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">O'qituvchi bo'lish</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
          Arizangizni to'ldiring — admin ko'rib chiqib, tasdiqlaydi.
          {user?.first_name && ` Assalomu alaykum, ${user.first_name}!`}
        </p>
      </motion.div>

      {/* Benefits */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="grid grid-cols-2 gap-2 mb-6"
      >
        {BENEFITS.map(b => (
          <div key={b.title} className="flex items-start gap-2.5 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <span className="text-xl shrink-0">{b.icon}</span>
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{b.title}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Application form */}
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        onSubmit={handleSubmit}
        className="space-y-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5"
      >
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">📋 Ariza shakli</h2>

        {/* Specialization */}
        <Field label="Mutaxassislik" required hint="Masalan: Frontend dasturlash, Matematika, Ingliz tili...">
          <input
            type="text"
            value={form.specialization}
            onChange={updateField('specialization')}
            placeholder="Siz nima o'qitasiz?"
            maxLength={120}
            required
            className={inputCls}
          />
        </Field>

        {/* Experience */}
        <Field label="Tajriba (yillar)" required hint="0 — endi boshlayman, 1–3 yil, 5+ yil...">
          <select
            value={form.experience_years}
            onChange={updateField('experience_years')}
            required
            className={inputCls}
          >
            <option value="" disabled>Tajribangizni tanlang</option>
            <option value="0">Endigina boshlayman (0 yil)</option>
            <option value="1">1 yil</option>
            <option value="2">2 yil</option>
            <option value="3">3 yil</option>
            <option value="5">5 yil</option>
            <option value="7">7+ yil</option>
            <option value="10">10+ yil</option>
          </select>
        </Field>

        {/* Bio */}
        <Field
          label="O'zingiz haqingizda"
          required
          hint="Kamida 20 ta belgi. Kim ekansiz, nima bilan shug'ullanasiz?"
        >
          <textarea
            value={form.bio}
            onChange={updateField('bio')}
            placeholder="Men ... bo'lib, ... yildan beri ... bilan shug'ullanaman..."
            rows={3}
            minLength={20}
            maxLength={500}
            required
            className={`${inputCls} resize-none`}
          />
          <p className="text-[10px] text-gray-400 text-right">{form.bio.length}/500</p>
        </Field>

        {/* Course idea */}
        <Field
          label="Qanday kurs yaratmoqchisiz?"
          required
          hint="Kursning mavzusi, kimlar uchun mo'ljallangan, qanday natija beradi?"
        >
          <textarea
            value={form.course_idea}
            onChange={updateField('course_idea')}
            placeholder="Men ... kursini yaratmoqchiman. Bu kurs ... uchun bo'lib, ..."
            rows={4}
            minLength={20}
            maxLength={1000}
            required
            className={`${inputCls} resize-none`}
          />
          <p className="text-[10px] text-gray-400 text-right">{form.course_idea.length}/1000</p>
        </Field>

        {/* Motivation */}
        <Field
          label="Nima uchun o'qituvchi bo'lmoqchisiz?"
          required
          hint="Motivatsiyangiz va maqsadingizni yozing (kamida 20 ta belgi)."
        >
          <textarea
            value={form.motivation}
            onChange={updateField('motivation')}
            placeholder="Men o'qituvchi bo'lmoqchiman, chunki..."
            rows={4}
            minLength={20}
            maxLength={1000}
            required
            className={`${inputCls} resize-none`}
          />
          <p className="text-[10px] text-gray-400 text-right">{form.motivation.length}/1000</p>
        </Field>

        {/* Error */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
            >
              ❌ {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button
          type="submit"
          disabled={state === 'loading' || !isFormValid()}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 text-white font-bold text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          {state === 'loading' ? '⏳ Yuborilmoqda...' : '🎓 Ariza yuborish'}
        </button>
      </motion.form>

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="w-full py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        ← Ortga
      </button>
    </PageWrapper>
  )
}

export default TeacherApplyPage
