/**
 * TeacherApplyPage — Multi-field teacher application form.
 *
 * Flow:
 *  1. Student visits /become-teacher
 *  2. Reads requirements & terms, checks "I agree"
 *  3. Fills in: specialization, experience_years, bio, course_idea, motivation
 *  4. Submits → POST /api/auth/apply-teacher
 *  5. Admin reviews → on acceptance user gets teacher badge (role='teacher')
 */
import React, { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  HomeIcon,
  PresentationChartLineIcon,
  ShieldCheckIcon,
  TrophyIcon,
  DocumentTextIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import { BadgeCheck } from 'lucide-react'
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

// ── Requirements ──────────────────────────────────────────────────────────────

const REQUIREMENTS = [
  "O'z sohasida bilim va tajribaga ega bo'lish",
  "Sifatli video va o'quv materiallar yarata olish",
  "O'quvchilarga hurmat bilan munosabatda bo'lish",
  "Asl, plagiatdan xoli kontent taqdim etish",
  "O'quvchilarning savollariga o'z vaqtida javob berish",
  "Platformaning ichki qoidalariga rioya qilish",
]

const TERMS = [
  "Yaratgan kurslarim to'liq mening asl ishim bo'ladi",
  "Zararli, yolg'on yoki chalg'ituvchi kontent joylashtirilmaydi",
  "O'quvchilarga sifatli ta'lim va qo'llab-quvvatlash beriladi",
  "Qoidabuzarlik holida akkauntim to'xtatilishi mumkinligini tushunaman",
  "Platforma komissiya shartlari qabul qilinganidan so'ng alohida bildiriladi",
  "Sahifalab platformasining foydalanish shartlari to'liq qabul qilinadi",
]

// ── Benefits ──────────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: AcademicCapIcon, title: "O'z kurslaringizni yarating", desc: "Video darslar, testlar va materiallar bilan to'liq kurs tuzing" },
  { icon: BadgeCheck as any, title: "O'qituvchi badji", desc: 'Profilingizda va barcha joylarda ko\'rinadigan "Teacher" badge olasiz', blue: true },
  { icon: PresentationChartLineIcon, title: 'Analitika paneli', desc: "O'quvchilar progressi va daromad statistikasini kuzating" },
  { icon: TrophyIcon, title: 'Daromad oling', desc: "Qabul qilinganingizdan so'ng komissiya shartlari bilan tanishasiz" },
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

  const initialState: State =
    user?.role === 'admin'                                      ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'active'       ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'pending'      ? 'already_pending' :
    'form'

  const [state, setState]     = useState<State>(initialState)
  const [errorMsg, setErrorMsg] = useState('')
  const [agreed, setAgreed]   = useState(false)
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
    agreed &&
    form.specialization.trim() &&
    form.experience_years.trim() &&
    form.bio.trim().length >= 20 &&
    form.course_idea.trim().length >= 20 &&
    form.motivation.trim().length >= 20

  const formRef = useRef<HTMLFormElement>(null)
  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
      console.error('[TeacherApply] Error:', err?.response?.data?.detail || err?.message)
      setErrorMsg('Xatolik yuz berdi')
      setState('form')
    }
  }

  // ── Success / already-pending ──────────────────────────────────────────────
  if (state === 'success' || state === 'already_pending') {
    return (
      <div className="pb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-10 space-y-5"
        >
          <ArrowPathIcon className="h-16 w-16 mx-auto text-amber-500" />
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Ariza yuborildi!</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Arizangiz admin tomonidan ko'rib chiqilmoqda.
              Tasdiqlangandan so'ng sizga xabar beriladi va
              o'qituvchi paneli ochiladi.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-700 dark:text-amber-300 text-left space-y-1">
            <p className="font-semibold">Navbatdagi qadamlar:</p>
            <p>1. Admin arizangizni ko'rib chiqadi</p>
            <p>2. Sizning rolingiz "Teacher" ga o'zgaradi</p>
            <p>3. Profilingizda o'qituvchi badji paydo bo'ladi</p>
            <p>4. Yangi kirish paytida o'qituvchi paneli ochiladi</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 rounded-2xl bg-sahifa-500 hover:bg-sahifa-600 text-white font-semibold text-sm transition-colors inline-flex items-center justify-center gap-1"
            >
              <HomeIcon className="h-4 w-4" /> Bosh sahifaga
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 rounded-2xl border border-sahifa-300 dark:border-sahifa-700 text-sahifa-600 dark:text-sahifa-400 font-semibold text-sm hover:bg-sahifa-50 dark:hover:bg-sahifa-900/20 transition-colors inline-flex items-center justify-center gap-1"
            >
              <ArrowPathIcon className="h-4 w-4" /> Yangilash
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Already active teacher ─────────────────────────────────────────────────
  if (state === 'already_teacher') {
    return (
      <div className="pb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-10 space-y-5"
        >
          <AcademicCapIcon className="h-16 w-16 mx-auto text-sahifa-500" />
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Siz allaqachon o'qituvchisiz!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">O'qituvchi panelingizga o'ting.</p>
          <Link
            to="/teacher"
            className="inline-flex items-center gap-1 px-8 py-3 bg-sahifa-500 hover:bg-sahifa-600 text-white font-semibold rounded-2xl text-sm transition-colors"
          >
            O'qituvchi paneli <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── Main application form ──────────────────────────────────────────────────
  return (
    <div className="pb-10 space-y-6">

      {/* ── SECTION 1: Hero ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-8 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(232,121,47,0.18) 0%, rgba(196,74,26,0.10) 50%, rgba(139,42,16,0.06) 100%)',
          border: '1px solid rgba(232,121,47,0.20)',
        }}
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
             style={{ background: '#e8792f', filter: 'blur(32px)' }} />
        <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full opacity-8"
             style={{ background: '#e8792f', filter: 'blur(24px)' }} />

        <div className="relative z-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, #e8792f, #c44a1a)' }}>
            <AcademicCapIcon className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
            Sahifalab'da o'qituvchi bo'ling
          </h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            Bilimingizni ulashing, daromad oling,<br />
            ming lab o'quvchilarga ta'sir qiling.
            {user?.first_name && (
              <span className="block mt-1 font-medium text-gray-700 dark:text-gray-300">
                Assalomu alaykum, {user.first_name}!
              </span>
            )}
          </p>
          <button
            onClick={scrollToForm}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #e8792f, #c44a1a)' }}
          >
            Boshlash <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {/* ── SECTION 2: How it works ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5"
      >
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Qanday ishlaydi?</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { num: '1️⃣', title: 'Ariza topshir', desc: "Formani to'ldiring va admin tasdiqlashini kuting" },
            { num: '2️⃣', title: 'Badj oling', desc: "Admin tasdiqlashi bilan o'qituvchi badji beriladi" },
            { num: '3️⃣', title: 'Kurs yarating', desc: 'Video va materiallar yuklang, daromad olishni boshlang' },
          ].map(step => (
            <div key={step.num} className="flex flex-col items-center text-center gap-2 p-3 rounded-xl"
                 style={{ backgroundColor: 'rgba(232,121,47,0.05)', border: '1px solid rgba(232,121,47,0.10)' }}>
              <span className="text-xl">{step.num}</span>
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight">{step.title}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── SECTION 3: Benefits ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 gap-2"
      >
        {BENEFITS.map(b => (
          <div key={b.title} className="flex items-start gap-2.5 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <b.icon className={`h-5 w-5 shrink-0 ${b.blue ? 'text-blue-400' : 'text-sahifa-500'}`} />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{b.title}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{b.desc}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── SECTION 4: Requirements ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.10 }}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <StarIcon className="h-5 w-5 text-sahifa-500" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">O'qituvchilarga qo'yiladigan talablar</h2>
        </div>
        <div className="space-y-2">
          {REQUIREMENTS.map(req => (
            <div key={req} className="flex items-start gap-2">
              <CheckCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-500" />
              <p className="text-xs text-gray-700 dark:text-gray-300">{req}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── SECTION 5: Terms of use ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <DocumentTextIcon className="h-5 w-5 text-sahifa-500" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Foydalanish shartlari</h2>
        </div>
        <div className="space-y-2 mb-5">
          {TERMS.map(term => (
            <div key={term} className="flex items-start gap-2">
              <ShieldCheckIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-400" />
              <p className="text-xs text-gray-700 dark:text-gray-300">{term}</p>
            </div>
          ))}
        </div>

        {/* I agree checkbox */}
        <button
          type="button"
          onClick={() => setAgreed(v => !v)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
            agreed
              ? 'border-sahifa-400 bg-sahifa-50 dark:bg-sahifa-900/20'
              : 'border-slate-200 dark:border-slate-600 hover:border-sahifa-300'
          }`}
        >
          <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
            agreed
              ? 'border-sahifa-500 bg-sahifa-500'
              : 'border-slate-300 dark:border-slate-500'
          }`}>
            {agreed && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
          </div>
          <span className="text-sm font-medium text-left text-gray-800 dark:text-gray-200">
            Yuqoridagi talablar va foydalanish shartlarini o'qidim, qabul qilaman
          </span>
        </button>
      </motion.div>

      {/* ── SECTION 6: Application form ──────────────────────────────── */}
      <motion.form
        ref={formRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        onSubmit={handleSubmit}
        className="space-y-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5"
      >
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Ariza topshirish</h2>

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

        <Field label="O'zingiz haqingizda" required hint="Kamida 20 ta belgi. Kim ekansiz, nima bilan shug'ullanasiz?">
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

        <Field label="Qanday kurs yaratmoqchisiz?" required hint="Kursning mavzusi, kimlar uchun mo'ljallangan, qanday natija beradi?">
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

        <Field label="Nima uchun o'qituvchi bo'lmoqchisiz?" required hint="Motivatsiyangiz va maqsadingizni yozing (kamida 20 ta belgi).">
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

        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
            >
              <span className="inline-flex items-center gap-1">
                <ExclamationCircleIcon className="h-4 w-4" /> {errorMsg}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {!agreed && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center">
            Yuborish uchun yuqoridagi shartlarni qabul qiling
          </p>
        )}

        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          Arizalar 1–3 kun ichida ko'rib chiqiladi.
        </p>

        <button
          type="submit"
          disabled={state === 'loading' || !isFormValid()}
          className="w-full py-4 rounded-2xl font-bold text-base text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #e8792f, #c44a1a)' }}
        >
          {state === 'loading'
            ? <><ArrowPathIcon className="h-5 w-5 animate-spin" /> Yuborilmoqda...</>
            : <><AcademicCapIcon className="h-5 w-5" /> Ariza yuborish</>
          }
        </button>
      </motion.form>

      <button
        onClick={() => navigate(-1)}
        className="w-full py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Ortga
      </button>
    </div>
  )
}

export default TeacherApplyPage
