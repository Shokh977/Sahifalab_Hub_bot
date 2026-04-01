/**
 * TeacherApplyPage — "O'qituvchi bo'lish" registration page.
 *
 * Flow:
 *  1. Student visits /become-teacher
 *  2. Reads benefits & requirements
 *  3. Clicks "Ariza yuborish" → POST /api/auth/apply-teacher
 *  4. Backend sets role='teacher', status='pending'
 *  5. Page shows success / pending confirmation
 *
 * If already pending or already a teacher, shows the appropriate state.
 */
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

// ── Benefits data ─────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: '🎓', title: 'O\'z kurslaringizni yarating', desc: 'Video darslar, testlar va materiallar bilan to\'liq kurs tuzing' },
  { icon: '💰', title: 'Daromad oling', desc: 'Har bir to\'lov uchun komisyon foizini hisobingizga oling' },
  { icon: '📊', title: 'Analitika paneli', desc: 'O\'quvchilar progressi, ko\'rishlar va daromad statistikasini kuzating' },
  { icon: '🏆', title: 'O\'qituvchi badji', desc: 'Profilingizda maxsus "Teacher" badge ko\'rinadi' },
]

const REQUIREMENTS = [
  '📚 O\'z sohangizda chuqur bilimga ega bo\'lish',
  '🎤 O\'zbek tilida tushuntirib bera olish',
  '✅ Kamida bitta to\'liq kurs tayyorlash niyati',
  '📱 Telegram akkauntingiz faol bo\'lishi',
]

// ── Page ─────────────────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'success' | 'already_pending' | 'already_teacher' | 'error'

const TeacherApplyPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  // If already teacher/pending detect on mount from AuthContext
  const initialState: State =
    user?.role === 'admin'         ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'active'  ? 'already_teacher' :
    user?.role === 'teacher' && user.status === 'pending' ? 'already_pending' :
    'idle'

  const [state, setState] = useState<State>(initialState)
  const [errorMsg, setErrorMsg] = useState('')

  const handleApply = async () => {
    if (state !== 'idle') return
    setState('loading')
    setErrorMsg('')
    try {
      const res = await apiService.applyTeacher()
      const data = res.data
      if (data.already_applied) {
        setState(data.status === 'active' ? 'already_teacher' : 'already_pending')
      } else {
        setState('success')
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Xatolik yuz berdi'
      setErrorMsg(String(detail))
      setState('error')
    }
  }

  // ── Success / already-pending state ────────────────────────────────────────
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
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
              Ariza yuborildi!
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Arizangiz admin tomonidan ko'rib chiqilmoqda.
              Tasdiqlangandan so'ng sizga xabar beriladi va
              o'qituvchi paneli ochiladi.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-700 dark:text-amber-300 text-left space-y-1">
            <p className="font-semibold">📋 Navbatdagi qadamlar:</p>
            <p>1. Admin arizangizni tasdiqlaydi</p>
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            O'qituvchi panelingizga o'ting.
          </p>
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
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 text-3xl shadow-lg mb-4">
          🎓
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          O'qituvchi bo'lish
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
          SAHIFALAB platformasida o'z kurslaringizni yarating va o'quvchilarga ilm bering.
          {user?.first_name && ` Assalomu alaykum, ${user.first_name}!`}
        </p>
      </motion.div>

      {/* Benefits */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          ✨ O'qituvchi sifatida nima olasiz?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BENEFITS.map(b => (
            <div
              key={b.title}
              className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
            >
              <span className="text-2xl shrink-0">{b.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Requirements */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 bg-sahifa-50 dark:bg-sahifa-900/20 border border-sahifa-200 dark:border-sahifa-800 rounded-2xl p-4"
      >
        <h2 className="text-sm font-semibold text-sahifa-700 dark:text-sahifa-300 mb-2">
          📋 Talablar
        </h2>
        <ul className="space-y-1.5">
          {REQUIREMENTS.map(r => (
            <li key={r} className="text-xs text-sahifa-700 dark:text-sahifa-300 leading-relaxed">{r}</li>
          ))}
        </ul>
      </motion.div>

      {/* Process steps */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          🔄 Jarayon
        </h2>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-sahifa-500 text-white flex items-center justify-center font-bold text-sm">1</div>
            <span className="text-center leading-tight">Ariza<br/>yuboring</span>
          </div>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 flex items-center justify-center font-bold text-sm">2</div>
            <span className="text-center leading-tight">Admin<br/>ko'radi</span>
          </div>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 flex items-center justify-center font-bold text-sm">3</div>
            <span className="text-center leading-tight">Panel<br/>ochiladi</span>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {state === 'error' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
        >
          ❌ {errorMsg}
        </motion.div>
      )}

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <button
          onClick={handleApply}
          disabled={state === 'loading'}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 text-white font-bold text-base shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          {state === 'loading' ? '⏳ Yuklanmoqda...' : '🎓 Ariza yuborish'}
        </button>
        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          ← Ortga
        </button>
      </motion.div>
    </PageWrapper>
  )
}

export default TeacherApplyPage
