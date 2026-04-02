/**
 * QuizPage — SAHIFALAB Hub
 * Stepped one-question-at-a-time UI with immediate feedback, server-side scoring
 * and a downloadable certificate for scores â‰¥ 80%.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { XMarkIcon, DocumentTextIcon, BookOpenIcon, TrophyIcon, ArrowPathIcon, InformationCircleIcon, ExclamationCircleIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import apiService from '@services/apiService'
import { fetchQuizzes, fetchQuiz } from '../lib/supabase'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import PageWrapper from '../components/PageWrapper'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import { useProgressStore } from '../context/progressStore'
import { useAuth } from '../context/AuthContext'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface QuizSummary {
  id: number
  title: string
  book_title: string
  total_questions: number
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

interface Question {
  id: number
  question: string
  options: string[]
  explanation: string | null
}

interface QuizDetail extends QuizSummary {
  description: string | null
  questions: Question[]
}

interface VerifyResult {
  quiz_id: number
  score: number
  total: number
  percentage: number
  passed: boolean
  certificate_eligible: boolean
  result_token: string
  is_first_attempt: boolean
  already_passed: boolean
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const OPTION_LABELS = ['A', 'B', 'C', 'D']

const CORRECT_MSGS = [
  "To'g'ri!", "Zo'r!", "Barakalla!",
  "Mukammal!", "Ajoyib!",
]
const WRONG_MSGS = [
  "Xato, ammo o'rgandik!", "Keyingi safar!",
  "Harakat davom etsin!", "Bilim orqali yutamiz!",
]

const rand = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

const DIFF_STYLE: Record<string, string> = {
  easy:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  hard:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const DIFF_LABEL: Record<string, string> = { easy: 'Oson', medium: "O'rtacha", hard: 'Qiyin' }

function formatDate(d: Date) {
  const months = [
    'yanvar','fevral','mart','aprel','may','iyun',
    'iyul','avgust','sentabr','oktabr','noyabr','dekabr',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// â”€â”€â”€ Quiz list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DIFF_GRADIENT: Record<string, string> = {
  easy:   'from-emerald-400 to-teal-500',
  medium: 'from-amber-400 to-orange-500',
  hard:   'from-red-400 to-rose-500',
}

const QuizList: React.FC<{
  quizzes: QuizSummary[]
  loading: boolean
  onStart: (q: QuizSummary) => void
}> = ({ quizzes, loading, onStart }) => {
  const [displayLimit, setDisplayLimit] = React.useState(10)
  const displayed = quizzes.slice(0, displayLimit)

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2"><DocumentTextIcon className="w-7 h-7" />Viktorina</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Bilimingizni sinab ko'ring va sertifikat qozoning!
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-pulse">
              <div className="h-36 bg-slate-100 dark:bg-slate-700" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-700">
          <div className="flex justify-center mb-3"><BookOpenIcon className="w-10 h-10 text-gray-400" /></div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Hali viktorina qo'shilmagan</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {displayed.map((quiz, index) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <button
                  onClick={() => onStart(quiz)}
                  className="group block w-full text-left"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md hover:border-sahifa-300 dark:hover:border-sahifa-600 transition-all">
                    {/* Thumbnail area */}
                    <div className={`relative h-36 bg-gradient-to-br ${DIFF_GRADIENT[quiz.difficulty] ?? 'from-blue-400 to-indigo-500'} flex items-center justify-center overflow-hidden`}>
                      <DocumentTextIcon className="w-14 h-14 text-white/60 group-hover:scale-110 transition-transform duration-300" />
                      {/* Difficulty badge — bottom left */}
                      <div className="absolute bottom-2 left-2">
                        <span className="px-2 py-0.5 rounded-full bg-black/40 text-white text-[10px] font-medium backdrop-blur-sm">
                          {DIFF_LABEL[quiz.difficulty] ?? quiz.difficulty}
                        </span>
                      </div>
                      {/* Question count badge — top right */}
                      <div className="absolute top-2 right-2">
                        <span className="px-2 py-0.5 rounded-full bg-white/25 text-white text-[10px] font-bold backdrop-blur-sm">
                          {quiz.total_questions} savol
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">
                        {quiz.title}
                      </p>
                      <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium truncate">
                        {quiz.book_title}
                      </p>
                    </div>
                  </div>
                </button>
              </motion.div>
            ))}
          </div>

          {displayLimit < quizzes.length && (
            <button
              onClick={() => setDisplayLimit(displayLimit + 10)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sahifa-400 dark:hover:border-sahifa-500 transition-colors"
            >
              Ko'proq ko'rish ({quizzes.length - displayLimit} qolgan)
            </button>
          )}
        </>
      )}

      {/* Certificate teaser */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3">
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <span className="inline-flex items-center gap-1"><TrophyIcon className="w-4 h-4" /><strong>80% va undan yuqori</strong></span> ball to'plab, rasmiy <strong>SAHIFALAB sertifikat</strong>ini qozonin!
          Instagram Stories uchun tayyorlangan PNG formatida yuklab oling.
        </p>
      </div>

      {/* XP + Daraja + Anti-farming info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-3">
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <span className="inline-flex items-center gap-1"><InformationCircleIcon className="w-4 h-4" /><strong>XP qoidasi:</strong></span> XP olish uchun kamida <strong>80%</strong> to'g'ri javob kerak.
          Bir xil viktorinadan XP faqat <strong>bir marta</strong> beriladi. O'ta olmaguningizcha qayta urinishingiz mumkin!
        </p>
      </div>
    </div>
  )
}


// â”€â”€â”€ Quiz question step â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Phase = 'answering' | 'revealing'

const QuizStep: React.FC<{
  quiz: QuizDetail
  onFinish: (answers: number[]) => void
  onExit: () => void
}> = ({ quiz, onFinish, onExit }) => {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = quiz.questions[idx]
  const progress = ((idx) / quiz.questions.length) * 100

  const handleSelect = useCallback((optIdx: number) => {
    if (phase !== 'answering') return
    setSelected(optIdx)
    setPhase('revealing')

    // We don't know the correct answer (stripped by backend), so show neutral feedback
    const positiveMessages = ['Yaxshi!', 'Davom eting!', 'Zo\'r!', 'Olg\'a!']
    setFeedback(rand(positiveMessages))

    timerRef.current = setTimeout(() => {
      const newAnswers = [...answers, optIdx]
      if (idx + 1 < quiz.questions.length) {
        setAnswers(newAnswers)
        setIdx(i => i + 1)
        setSelected(null)
        setPhase('answering')
        setFeedback('')
      } else {
        onFinish(newAnswers)
      }
    }, 1000)
  }, [phase, answers, idx, quiz.questions.length, onFinish])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onExit}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span className="font-medium">{quiz.title}</span>
            <span>{idx + 1} / {quiz.questions.length}</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question card */}
      <div
        className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl p-5 shadow-sm border border-blue-100 dark:border-blue-800/40"
        key={idx}
        style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
      >
        <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 mb-2 uppercase tracking-wide">
          Savol {idx + 1}
        </p>
        <p className="text-base font-semibold text-gray-900 dark:text-white leading-relaxed">
          {q.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2.5">
        {q.options.map((opt, i) => {
          let style = 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 active:scale-[0.98]'
          if (phase === 'revealing' && selected === i) {
            style = 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 scale-[0.98]'
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={phase === 'revealing'}
              className={`w-full p-3.5 rounded-xl text-left border-2 transition-all flex items-center gap-3 ${style}`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                phase === 'revealing' && selected === i
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
                {OPTION_LABELS[i]}
              </span>
              <span className="text-sm text-gray-800 dark:text-white leading-snug">{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Feedback message */}
      {phase === 'revealing' && (
        <div className="text-center py-1" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{feedback}</p>
          {q.explanation && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-4">{q.explanation}</p>
          )}
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Results view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const QuizResults: React.FC<{
  result: VerifyResult
  quiz: QuizDetail
  userName: string
  onRetry: () => void
  onExit: () => void
}> = ({ result, quiz, userName, onRetry, onExit }) => {
  const [showCert, setShowCert] = useState(false)
  const { percentage, score, total, certificate_eligible } = result

  const getMessage = () => {
    if (percentage >= 100) return { text: 'Mukammal! 100% to\'g\'ri!', color: 'text-amber-600' }
    if (percentage >= 80)  return { text: 'Zo\'r natija! Sertifikat qozondingiz!', color: 'text-blue-600' }
    if (percentage >= 60)  return { text: 'Yaxshi! Yana ozgina harakat!', color: 'text-green-600' }
    if (percentage >= 40)  return { text: 'Yana o\'qib kelingiz!', color: 'text-orange-500' }
    return { text: 'Harakat qiling — uddalaysiz!', color: 'text-gray-600' }
  }

  const msg = getMessage()
  const circumference = 2 * Math.PI * 54

  const certData: CertificateData = {
    userName,
    quizTitle: quiz.title,
    score,
    total,
    percentage,
    date: formatDate(new Date()),
    certificateId: result.result_token,
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex justify-center"><AcademicCapIcon className="w-10 h-10 text-gray-500" /></div>
          <h2 className={`text-lg font-bold ${msg.color}`}>{msg.text}</h2>
        </div>

        {/* XP status messages */}
        {result.is_first_attempt && result.percentage >= 80 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
            <p className="text-xs text-green-700 dark:text-green-300 text-center">
              <span className="font-semibold">Tabriklaymiz!</span> XP qo'lga kiritildi!
            </p>
          </div>
        )}
        {result.already_passed && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
              <span className="font-semibold">ℹ️ Qayta urinish:</span> Bu viktorinani allaqachon o'tgansiz. XP qayta berilmaydi.
            </p>
          </div>
        )}
        {!result.is_first_attempt && !result.already_passed && result.percentage < 80 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
            <p className="text-xs text-orange-700 dark:text-orange-300 text-center">
              <span className="font-semibold">XP uchun 80% kerak.</span> Qayta urinib ko'ring!
            </p>
          </div>
        )}

        {/* Score ring */}
        <div className="flex justify-center">
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8"
                className="text-gray-100 dark:text-gray-700" />
              <circle
                cx="60" cy="60" r="54" fill="none"
                stroke={percentage >= 80 ? '#F59E0B' : percentage >= 60 ? '#3B82F6' : '#9CA3AF'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (circumference * percentage) / 100}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">{percentage}%</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{score}/{total}</span>
            </div>
          </div>
        </div>

        {/* Certificate banner */}
        {certificate_eligible && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-4 text-center space-y-3">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Tabriklaymiz! Sertifikat qozondingiz
            </p>
            <button
              onClick={() => setShowCert(true)}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 shadow-md transition-all active:scale-95"
            >
              Sertifikatni ko'rish
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onRetry}
            className="py-3 rounded-xl font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <span className="inline-flex items-center gap-1 justify-center"><ArrowPathIcon className="w-4 h-4" />Qayta urinish</span>
          </button>
          <button
            onClick={onExit}
            className="py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            ← Ro'yxatga
          </button>
        </div>

        {/* Score breakdown note */}
        {!certificate_eligible && (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Sertifikat uchun kamida <strong>80%</strong> kerak. Yana {Math.ceil((80 * total / 100) - score)} ta to'g'ri javob!
          </p>
        )}
      </div>

      {/* Certificate modal */}
      {showCert && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}
    </>
  )
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type View = 'list' | 'loading' | 'quiz' | 'verifying' | 'results'

export const QuizPage: React.FC = () => {
  const { user } = useTelegramWebApp()
  const { addQuizXP, telegramId } = useProgressStore()
  const { user: authUser } = useAuth()
  const [view, setView] = useState<View>('list')
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [activeQuiz, setActiveQuiz] = useState<QuizDetail | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const userName = user?.first_name ?? authUser?.first_name ?? 'Foydalanuvchi'

  // Fetch quiz list (supabase.ts handles localStorage caching with 24h TTL)
  useEffect(() => {
    fetchQuizzes()
      .then(data => { setQuizzes(data) })
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [])

  const handleStart = useCallback(async (summary: QuizSummary) => {
    setView('loading')
    setError(null)
    try {
      const quiz = await fetchQuiz(summary.id)
      setActiveQuiz(quiz as QuizDetail)
      setVerifyResult(null)
      setView('quiz')
    } catch {
      setError("Viktorina yuklanmadi. Qayta urinib ko'ring.")
      setView('list')
    }
  }, [])

  const handleFinish = useCallback(async (answers: number[]) => {
    if (!activeQuiz) return
    setView('verifying')
    try {
      const r = await apiService.verifyQuiz(
        activeQuiz.id,
        user?.id ?? telegramId ?? authUser?.id ?? 0,
        userName,
        answers,
      )
      setVerifyResult(r.data)
      setView('results')
      // Award XP only when user passes (>=80%) for the first time
      if (r.data.is_first_attempt && r.data.percentage >= 80) {
        addQuizXP(r.data.score, r.data.total)
      }
    } catch {
      setError("Natijani tekshirib bo'lmadi. Qayta urinib ko'ring.")
      setView('quiz')
    }
  }, [activeQuiz, user, userName, addQuizXP, telegramId, authUser])

  const handleExit = useCallback(() => {
    setActiveQuiz(null)
    setVerifyResult(null)
    setView('list')
  }, [])

  const handleRetry = useCallback(() => {
    if (activeQuiz) {
      setVerifyResult(null)
      setView('quiz')
    }
  }, [activeQuiz])

  // Loading states
  if (view === 'loading' || view === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
          {view === 'loading' ? 'Viktorina yuklanmoqda…' : 'Natijalar hisoblanmoqda…'}
        </p>
      </div>
    )
  }

  return (
    <PageWrapper className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs text-red-700 dark:text-red-300 inline-flex items-center gap-1"><ExclamationCircleIcon className="w-4 h-4" />{error}</p>
        </div>
      )}

      {view === 'list' && (
        <QuizList quizzes={quizzes} loading={listLoading} onStart={handleStart} />
      )}

      {view === 'quiz' && activeQuiz && (
        <QuizStep quiz={activeQuiz} onFinish={handleFinish} onExit={handleExit} />
      )}

      {view === 'results' && verifyResult && activeQuiz && (
        <QuizResults
          result={verifyResult}
          quiz={activeQuiz}
          userName={userName}
          onRetry={handleRetry}
          onExit={handleExit}
        />
      )}
    </PageWrapper>
  )
}

export default QuizPage
