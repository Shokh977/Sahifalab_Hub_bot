/**
 * LessonQuizPlayer — takes a course lesson of lesson_type "quiz".
 *
 * Course creators have been able to author quiz questions on a lesson (via
 * QuizBuilder in CourseCreatePage) since that feature shipped, and the
 * backend test-taking flow (POST /api/tests/{lessonId}/attempts, POST
 * .../submit) has been complete the whole time — but no screen ever called
 * it, so a student clicking a "Quiz" lesson just saw an empty video
 * placeholder. This component is that missing screen.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2, RotateCcw, AlertCircle } from 'lucide-react'
import apiService from '../services/apiService'

interface QuizOption {
  id: number
  text: string
}
interface QuizQuestion {
  id: number
  question_text: string
  question_type: 'single_choice' | 'multiple_choice'
  options: QuizOption[]
  order_index: number
}
interface AttemptStart {
  attempt_id: number
  test_id: number
  title: string
  time_limit_min: number | null
  passing_score: number
  is_final: boolean
  questions: QuizQuestion[]
}
interface AnsweredQuestion {
  id: number
  question_text: string
  user_answer: string
  correct: boolean
  correct_answer: string
  explanation: string | null
}
interface SubmitResult {
  score_pct: number
  passed: boolean
  correct_count: number
  wrong_count: number
  total_questions: number
  answered_questions: AnsweredQuestion[]
  xp_awarded: number
}

type Phase = 'loading' | 'answering' | 'submitting' | 'result' | 'error'

interface Props {
  lessonId: number
  onPassed?: () => void
}

const LessonQuizPlayer: React.FC<Props> = ({ lessonId, onPassed }) => {
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState<AttemptStart | null>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setPhase('loading')
    setError('')
    setIdx(0)
    setAnswers({})
    setResult(null)
    try {
      const res = await apiService.startLessonQuizAttempt(lessonId)
      setAttempt(res.data)
      setPhase('answering')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Testni yuklab bo\'lmadi')
      setPhase('error')
    }
  }, [lessonId])

  useEffect(() => { load() }, [load])

  const question = attempt?.questions[idx]
  const isLast = !!attempt && idx === attempt.questions.length - 1

  const handleSelect = (optionId: number) => {
    if (!question) return
    setAnswers(prev => ({ ...prev, [question.id]: optionId }))
  }

  const handleNext = async () => {
    if (!attempt) return
    if (!isLast) {
      setIdx(i => i + 1)
      return
    }
    setPhase('submitting')
    try {
      const payload = attempt.questions.map(q => ({
        question_id: q.id,
        selected_option_id: answers[q.id] ?? null,
      }))
      const res = await apiService.submitLessonQuizAttempt(attempt.test_id, attempt.attempt_id, payload)
      setResult(res.data)
      setPhase('result')
      if (res.data?.passed) onPassed?.()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Javoblarni yuborib bo\'lmadi')
      setPhase('error')
    }
  }

  if (phase === 'loading') {
    return (
      <div className="aspect-video flex items-center justify-center bg-gray-50 dark:bg-white/[0.02]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/20" />
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="aspect-video flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-white/[0.02] px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-600 dark:text-white/60">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Qayta urinish
        </button>
      </div>
    )
  }

  if (phase === 'result' && result) {
    return (
      <div className="p-5 sm:p-6 bg-gray-50 dark:bg-white/[0.02] space-y-4">
        <div className="text-center py-2">
          {result.passed ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          ) : (
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          )}
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {result.passed ? "O'tdingiz!" : "O'ta olmadingiz"}
          </p>
          <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
            {result.correct_count}/{result.total_questions} to'g'ri &middot; {result.score_pct}%
            {result.xp_awarded > 0 && <> &middot; +{result.xp_awarded} XP</>}
          </p>
        </div>

        <div className="space-y-2">
          {result.answered_questions.map(q => (
            <div
              key={q.id}
              className={`p-3 rounded-xl border text-sm ${
                q.correct
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10'
                  : 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10'
              }`}
            >
              <p className="font-medium text-gray-800 dark:text-white/90">{q.question_text}</p>
              <p className="text-xs text-gray-500 dark:text-white/50 mt-1">
                Sizning javobingiz: {q.user_answer || '—'}
              </p>
              {!q.correct && q.correct_answer && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  To'g'ri javob: {q.correct_answer}
                </p>
              )}
              {q.explanation && (
                <p className="text-xs text-gray-400 dark:text-white/40 mt-1">{q.explanation}</p>
              )}
            </div>
          ))}
        </div>

        {!result.passed && (
          <button
            onClick={load}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Qayta urinish
          </button>
        )}
      </div>
    )
  }

  if (!question) return null

  const selected = answers[question.id]

  return (
    <div className="p-5 sm:p-6 bg-gray-50 dark:bg-white/[0.02] space-y-4">
      <div className="flex justify-between text-xs text-gray-400 dark:text-white/35 mb-1">
        <span className="font-medium">{attempt?.title}</span>
        <span>{idx + 1} / {attempt?.questions.length}</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#F15929] rounded-full transition-all duration-300"
          style={{ width: `${((idx) / (attempt?.questions.length || 1)) * 100}%` }}
        />
      </div>

      <p className="text-base font-semibold text-gray-900 dark:text-white leading-relaxed">
        {question.question_text}
      </p>

      <div className="space-y-2">
        {question.options.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            className={`w-full p-3 rounded-xl text-left border-2 transition-all text-sm ${
              selected === opt.id
                ? 'border-[#F15929] bg-[#F15929]/5 text-gray-900 dark:text-white'
                : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-700 dark:text-white/70 hover:border-gray-300'
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={selected == null || phase === 'submitting'}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {phase === 'submitting' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {isLast ? 'Yakunlash' : 'Keyingisi'}
      </button>
    </div>
  )
}

export default LessonQuizPlayer
