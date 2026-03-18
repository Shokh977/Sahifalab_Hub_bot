/**
 * QuizPage — SAHIFALAB Hub
 * Stepped one-question-at-a-time UI with immediate feedback, server-side scoring
 * and a downloadable certificate for scores â‰¥ 80%.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import apiService from '@services/apiService'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import { useProgressStore } from '../context/progressStore'

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
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const OPTION_LABELS = ['A', 'B', 'C', 'D']

const CORRECT_MSGS = [
  "To'g'ri! 🎉", "Zo'r! 🌟", "Barakalla! 💪",
  "Mukammal! ✨", "Ajoyib! 🔥",
]
const WRONG_MSGS = [
  "Xato, ammo o'rgandik! 💡", "Keyingi safar! 📚",
  "Harakat davom etsin! 🚀", "Bilim orqali yutamiz! 🎯",
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

const QuizList: React.FC<{
  quizzes: QuizSummary[]
  loading: boolean
  onStart: (q: QuizSummary) => void
}> = ({ quizzes, loading, onStart }) => (
  <div className="space-y-4">
    <div className="text-center space-y-1 mb-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📝 Viktorina</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Bilimingizni sinab ko'ring va sertifikat qozoning!
      </p>
    </div>

    {loading ? (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    ) : quizzes.length === 0 ? (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-4xl mb-3">📚</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Hali viktorina qo'shilmagan</p>
      </div>
    ) : (
      <div className="space-y-3">
        {quizzes.map(quiz => (
          <button
            key={quiz.id}
            onClick={() => onStart(quiz)}
            className="w-full bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-left hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all active:scale-[0.98]"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-xl shrink-0">
                📝
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{quiz.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">📕 {quiz.book_title}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    {quiz.total_questions} savol
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${DIFF_STYLE[quiz.difficulty] ?? DIFF_STYLE.medium}`}>
                    {DIFF_LABEL[quiz.difficulty] ?? quiz.difficulty}
                  </span>
                </div>
              </div>
              <span className="text-gray-400 text-lg self-center">›</span>
            </div>
          </button>
        ))}
      </div>
    )}

    {/* Certificate teaser */}
    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3">
      <p className="text-xs text-amber-800 dark:text-amber-300">
        🏆 <strong>80% va undan yuqori</strong> ball to'plab, rasmiy <strong>SAHIFALAB sertifikat</strong>ini qozonin!
        Instagram Stories uchun tayyorlangan PNG formatida yuklab oling.
      </p>
    </div>

    {/* XP + Daraja + Anti-farming info */}
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-3">
      <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
        ℹ️ <strong>XP va Daraja qoidasi:</strong> bir xil viktorinani qayta yechishda XP qayta berilmaydi.
        Daraja oshishi uchun <strong>yangi viktorinalar</strong> va <strong>fokus vaqti</strong> yig'ish kerak.
      </p>
    </div>
  </div>
)

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
    const positiveMessages = ['Yaxshi! 💪', 'Davom eting! 🚀', 'Zo\'r! ✨', 'Olg\'a! 🔥']
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
          ✕
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
    if (percentage >= 100) return { emoji: '🏆', text: 'Mukammal! 100% to\'g\'ri!', color: 'text-amber-600' }
    if (percentage >= 80)  return { emoji: '🌟', text: 'Zo\'r natija! Sertifikat qozondingiz!', color: 'text-blue-600' }
    if (percentage >= 60)  return { emoji: '👍', text: 'Yaxshi! Yana ozgina harakat!', color: 'text-green-600' }
    if (percentage >= 40)  return { emoji: '📚', text: 'Yana o\'qib kelingiz!', color: 'text-orange-500' }
    return { emoji: '💪', text: 'Harakat qiling — uddalaysiz!', color: 'text-gray-600' }
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
          <p className="text-4xl">{msg.emoji}</p>
          <h2 className={`text-lg font-bold ${msg.color}`}>{msg.text}</h2>
        </div>

        {/* Retake warning — no XP awarded */}
        {!result.is_first_attempt && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
              <span className="font-semibold">ℹ️ Qayta urinish:</span> Bu viktorinani allaqachon tugatgansiz. XP berdirilmadi.
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
              🎓 Tabriklaymiz! Sertifikat qozondingiz
            </p>
            <button
              onClick={() => setShowCert(true)}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 shadow-md transition-all active:scale-95"
            >
              🏆 Sertifikatni ko'rish
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onRetry}
            className="py-3 rounded-xl font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            🔄 Qayta urinish
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
  const { addQuizXP } = useProgressStore()
  const [view, setView] = useState<View>('list')
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [activeQuiz, setActiveQuiz] = useState<QuizDetail | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const userName = user?.first_name || 'Foydalanuvchi'

  // Fetch quiz list
  useEffect(() => {
    apiService.getQuizzes()
      .then(r => setQuizzes(r.data))
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [])

  const handleStart = useCallback(async (summary: QuizSummary) => {
    setView('loading')
    setError(null)
    try {
      const r = await apiService.getQuiz(summary.id)
      setActiveQuiz(r.data)
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
        user?.id ?? 0,
        userName,
        answers,
      )
      setVerifyResult(r.data)
      setView('results')
      // Award XP only on first attempt to prevent farming
      if (r.data.is_first_attempt) {
        addQuizXP(r.data.score, r.data.total)
      }
    } catch {
      setError("Natijani tekshirib bo'lmadi. Qayta urinib ko'ring.")
      setView('quiz')
    }
  }, [activeQuiz, user, userName, addQuizXP])

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
    <div className="max-w-md mx-auto px-4 py-4 pb-24">
      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs text-red-700 dark:text-red-300">❌ {error}</p>
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
    </div>
  )
}

export default QuizPage
