/**
 * DailyQuizPage — "5 Savol" (SAHIFALAB Hub)
 *
 * One shared 5-question quiz per day, same questions for everyone,
 * scored server-side, rewarding Tanga (never XP). Backend: /api/quiz/*
 * (090_daily_quiz) — see backend/app/services/daily_quiz_service.py.
 *
 * Unlike the mobile app's one-question-at-a-time swipe stepper, the web
 * layout shows all 5 questions on one scrollable page with a single submit
 * button — a more natural, skimmable shape for a wide viewport than a
 * full-screen mobile stepper would be.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle, Clock, Flame, Coins, Trophy, Flag,
  CheckCircle2, XCircle, ChevronRight, RefreshCw, Users,
} from 'lucide-react'
import apiService from '../services/apiService'
import { useAuth } from '../context/AuthContext'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/ErrorBoundary'

// ─── Types (mirrors mobile app's lib/api.ts `dailyQuiz` shapes) ────────────

interface TodayQuestion {
  question_id: number
  position: number
  question_text: string
  options: string[]
}

interface TodayQuiz {
  id: number
  quiz_number: number
  theme: string
  state: 'in_progress' | 'submitted'
  correct_count: number | null
  seconds_remaining: number
  questions: TodayQuestion[]
  per_question_correct?: boolean[]
  tanga_awarded?: number
  quiz_streak_days?: number
}

interface ResultQuestion {
  question_id: number
  position: number
  question_text: string
  options: string[]
  correct_index: number
  explanation: string
  source: string
  voided: boolean
}

interface LeaderboardEntry {
  rank: number
  user_id: number
  first_name: string
  username: string | null
  photo_url: string | null
  correct_count: number
  elapsed_ms: number
}

interface DailyQuizResults {
  quiz: { id: number; quiz_number: number; theme: string; publish_date: string }
  questions: ResultQuestion[]
  leaderboard: LeaderboardEntry[]
  total_players: number
  caller: { rank: number; correct_count: number; elapsed_ms: number; percentile: number | null } | null
  quiz_streak_days: number
}

type View = 'loading' | 'none' | 'playing' | 'results' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h} soat ${m} daqiqa`
  return `${m} daqiqa`
}

function fmtElapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `${rem}s`
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

// ─── Question form (unanswered) ──────────────────────────────────────────

const QuestionCard: React.FC<{
  question: TodayQuestion
  selected: number | null
  onSelect: (optionIndex: number) => void
}> = ({ question, selected, onSelect }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
    <p className="text-xs font-semibold text-sahifa-600 dark:text-sahifa-400 uppercase tracking-wide">
      Savol {question.position + 1}
    </p>
    <p className="text-base font-semibold text-gray-900 dark:text-white leading-relaxed">
      {question.question_text}
    </p>
    <div className="space-y-2">
      {question.options.map((opt, i) => {
        const isSelected = selected === i
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`w-full p-3 rounded-xl text-left border-2 transition-all flex items-center gap-3 ${
              isSelected
                ? 'border-sahifa-400 bg-sahifa-50 dark:bg-sahifa-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-sahifa-300'
            }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              isSelected ? 'bg-sahifa-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {OPTION_LABELS[i]}
            </span>
            <span className="text-sm text-gray-800 dark:text-white leading-snug">{opt}</span>
          </button>
        )
      })}
    </div>
  </div>
)

// ─── Result question review (per-question, with report) ────────────────────

const ResultQuestionCard: React.FC<{
  question: ResultQuestion
  wasCorrect: boolean | undefined
  onReport: (questionId: number, reason: string) => Promise<void>
}> = ({ question, wasCorrect, onReport }) => {
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmitReport = async () => {
    if (!reason.trim()) return
    await onReport(question.question_id, reason.trim())
    setSubmitted(true)
    setReporting(false)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-relaxed flex-1">
          {question.position + 1}. {question.question_text}
        </p>
        {wasCorrect === true && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
        {wasCorrect === false && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
      </div>

      <div className="space-y-1.5">
        {question.options.map((opt, i) => {
          const isCorrect = i === question.correct_index
          return (
            <div
              key={i}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                isCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 bg-black/5 dark:bg-white/10">
                {OPTION_LABELS[i]}
              </span>
              {opt}
              {isCorrect && <CheckCircle2 className="h-4 w-4 ml-auto shrink-0" />}
            </div>
          )
        })}
      </div>

      {!!question.explanation && (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-2">
          {question.explanation}
          {!!question.source && <span className="block mt-1 italic opacity-75">Manba: {question.source}</span>}
        </p>
      )}

      <div className="pt-1">
        {submitted ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">Xabar yuborildi, rahmat!</p>
        ) : reporting ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nima xato? Qisqacha yozing…"
              maxLength={500}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSubmitReport}
                disabled={!reason.trim()}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-sahifa-500 text-white disabled:opacity-40"
              >
                Yuborish
              </button>
              <button
                onClick={() => setReporting(false)}
                className="text-xs font-semibold px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setReporting(true)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 inline-flex items-center gap-1 transition-colors"
          >
            <Flag className="h-3 w-3" /> Savolda xato bor
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Leaderboard row ─────────────────────────────────────────────────────

const LeaderboardRow: React.FC<{ entry: LeaderboardEntry; isMe: boolean }> = ({ entry, isMe }) => (
  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isMe ? 'bg-sahifa-50 dark:bg-sahifa-900/20' : ''}`}>
    <span className="w-6 text-right text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">
      {entry.rank}
    </span>
    {entry.photo_url ? (
      <img src={entry.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
    ) : (
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">
        {(entry.first_name || '?').slice(0, 1).toUpperCase()}
      </div>
    )}
    <span className={`flex-1 min-w-0 truncate text-sm ${isMe ? 'font-bold text-sahifa-700 dark:text-sahifa-300' : 'text-gray-800 dark:text-gray-200'}`}>
      {entry.first_name}{isMe ? ' (Siz)' : ''}
    </span>
    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{entry.correct_count}/5</span>
    <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-10 text-right">{fmtElapsed(entry.elapsed_ms)}</span>
  </div>
)

// ─── Main page ───────────────────────────────────────────────────────────

const DailyQuizPage: React.FC = () => {
  const { user } = useAuth()
  const [view, setView] = useState<View>('loading')
  const [today, setToday] = useState<TodayQuiz | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<DailyQuizResults | null>(null)
  const [submitCorrectMap, setSubmitCorrectMap] = useState<boolean[] | undefined>(undefined)

  const loadResults = useCallback(async (quizId: number) => {
    try {
      const { data } = await apiService.getDailyQuizResults(quizId)
      setResults(data)
      setView('results')
    } catch {
      setView('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiService.getDailyQuizToday()
      .then(async ({ data }) => {
        if (cancelled) return
        if (!data.quiz) { setView('none'); return }
        setToday(data.quiz)
        if (data.quiz.state === 'submitted') {
          setSubmitCorrectMap(data.quiz.per_question_correct)
          await loadResults(data.quiz.id)
        } else {
          setView('playing')
        }
      })
      .catch(() => { if (!cancelled) setView('error') })
    return () => { cancelled = true }
  }, [loadResults])

  const allAnswered = today ? today.questions.every(q => answers[q.question_id] != null) : false

  const handleSelect = (questionId: number, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }))
  }

  const handleSubmit = async () => {
    if (!today || !allAnswered || submitting) return
    setSubmitting(true)
    try {
      const payload = today.questions.map(q => ({ question_id: q.question_id, selected_index: answers[q.question_id] }))
      const { data } = await apiService.submitDailyQuiz(today.id, payload)
      setSubmitCorrectMap(data.per_question_correct)
      showToast(`+${data.tanga_awarded} Tanga qo'lga kiritdingiz!`, 'success')
      await loadResults(today.id)
    } catch {
      showToast("Natijani yuborib bo'lmadi. Qayta urinib ko'ring.", 'error')
      setSubmitting(false)
    }
  }

  const handleReport = async (questionId: number, reason: string) => {
    try {
      await apiService.reportDailyQuizQuestion(questionId, reason)
    } catch { /* silent — the inline "submitted" state below still shows regardless */ }
  }

  const myRankInList = useMemo(
    () => results?.leaderboard.some(e => e.user_id === user?.id) ?? false,
    [results, user],
  )

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <PageWrapper className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-sahifa-500 animate-spin" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Yuklanmoqda…</p>
      </PageWrapper>
    )
  }

  // ── No quiz published yet today ─────────────────────────────────────────
  if (view === 'none') {
    return (
      <PageWrapper className="space-y-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-700">
          <HelpCircle className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-700 dark:text-gray-200 font-semibold">Bugungi savollar hali tayyor emas</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Birozdan so'ng qayta tekshiring.</p>
        </div>
      </PageWrapper>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (view === 'error') {
    return (
      <PageWrapper className="space-y-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-700">
          <p className="text-gray-700 dark:text-gray-200 font-semibold">Ma'lumotlarni yuklab bo'lmadi</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-semibold text-sahifa-500 hover:text-sahifa-600 inline-flex items-center gap-1"
          >
            <RefreshCw className="h-4 w-4" /> Qayta urinish
          </button>
        </div>
      </PageWrapper>
    )
  }

  // ── Playing (all 5 questions, one submit) ───────────────────────────────
  if (view === 'playing' && today) {
    return (
      <PageWrapper className="space-y-4">
        <div className="text-center space-y-1 mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <HelpCircle className="w-7 h-7 text-sahifa-500" />5 Savol
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{today.theme}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />{fmtCountdown(today.seconds_remaining)} qoldi
          </p>
        </div>

        <div className="space-y-3">
          {today.questions.map((q, index) => (
            <motion.div key={q.question_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <QuestionCard question={q} selected={answers[q.question_id] ?? null} onSelect={(i) => handleSelect(q.question_id, i)} />
            </motion.div>
          ))}
        </div>

        <div className="sticky bottom-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Yuborilmoqda…</>
            ) : allAnswered ? (
              <>Javoblarni yuborish<ChevronRight className="w-4 h-4" /></>
            ) : (
              `Barcha savollarga javob bering (${Object.keys(answers).length}/${today.questions.length})`
            )}
          </button>
        </div>
      </PageWrapper>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────────
  if (view === 'results' && results) {
    const { quiz, questions, leaderboard, total_players, caller, quiz_streak_days } = results
    const correctCount = today?.correct_count ?? caller?.correct_count ?? 0

    return (
      <PageWrapper className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold text-sahifa-500 uppercase tracking-wide">5 Savol #{quiz.quiz_number}</p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{quiz.theme}</h1>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">{correctCount}/5</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Natija</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white inline-flex items-center justify-center gap-1">
              <Flame className="w-4 h-4 text-orange-500" />{quiz_streak_days}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Kunlik seriya</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {caller?.percentile != null ? `${caller.percentile}%` : '—'}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">o'yinchidan yaxshi</p>
          </div>
        </div>

        {/* Leaderboard — mobile/tablet only; xl+ gets it in the right sidebar
           instead (DailyQuizRightSidebar), so it isn't buried at the bottom
           of a long page on desktop. */}
        <div className="xl:hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />Reyting
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />{total_players}
            </span>
          </div>
          <AnimatePresence>
            <div className="space-y-0.5">
              {leaderboard.map(entry => (
                <LeaderboardRow key={entry.user_id} entry={entry} isMe={entry.user_id === user?.id} />
              ))}
            </div>
          </AnimatePresence>
          {caller && !myRankInList && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <LeaderboardRow
                entry={{ rank: caller.rank, user_id: user?.id ?? -1, first_name: user?.first_name ?? 'Siz', username: null, photo_url: user?.photo_url ?? null, correct_count: caller.correct_count, elapsed_ms: caller.elapsed_ms }}
                isMe
              />
            </div>
          )}
        </div>

        {/* Per-question review */}
        <div className="space-y-3">
          {questions.map((q) => (
            <ResultQuestionCard
              key={q.question_id}
              question={q}
              wasCorrect={submitCorrectMap?.[q.position]}
              onReport={handleReport}
            />
          ))}
        </div>

        <div className="text-center">
          <Coins className="w-5 h-5 text-amber-500 inline-block mb-1" />
          <p className="text-xs text-gray-400 dark:text-gray-500">Ertaga yangi 5 ta savol bilan qayting!</p>
        </div>
      </PageWrapper>
    )
  }

  return null
}

export default DailyQuizPage
