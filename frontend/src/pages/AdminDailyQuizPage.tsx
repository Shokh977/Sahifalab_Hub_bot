/**
 * AdminDailyQuizPage — approval queue for "5 Savol" (090_daily_quiz).
 *   • "Generate now" pulls the weekly batch forward instead of waiting for
 *     the Monday 05:00 UTC cron.
 *   • Per-day cards: 5 questions, each editable inline, approve/reject/
 *     regenerate the whole day (spec: admin skims/approves/edits/rejects
 *     a day at a time, not per-question — ~35 questions/week, ~10 minutes).
 *   • Nothing here publishes automatically — approving only marks a day
 *     'approved'; the daily 00:00 UTC rollover cron is what actually
 *     publishes it.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Sparkles, Check, X, Pencil, Save, RotateCcw } from 'lucide-react'
import apiService from '../services/apiService'
import { useAuth } from '../context/AuthContext'

interface PendingQuestion {
  id: number
  position: number
  question_text: string
  options: string[]
  correct_index: number
  explanation: string
  source: string
  difficulty: 'easy' | 'medium' | 'hard'
  verified: boolean
  verify_model_answer: number | null
}

interface PendingQuiz {
  id: number
  quiz_number: number
  publish_date: string
  theme: string
  status: string
  created_at: string
  question_count: number
  questions: PendingQuestion[]
}

const THEME_LABELS: Record<string, string> = {
  kitoblar: 'Kitoblar', miya_xotira: 'Miya va xotira', psixologiya: 'Psixologiya',
  shaxslar: 'Shaxslar', moliyaviy_savodxonlik: 'Moliyaviy savodxonlik',
  umumiy_bilim: 'Umumiy bilim', til: 'Til',
}

const DIFFICULTY_LABELS: Record<string, string> = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin' }

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export default function AdminDailyQuizPage() {
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [quizzes, setQuizzes] = useState<PendingQuiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiService.client.get('/api/admin/daily-quiz/pending')
      setQuizzes(res.data?.quizzes ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user?.role === 'admin') load() }, [user, load])

  if (!authLoading && (!user || user.role !== 'admin')) {
    navigate('/', { replace: true })
    return null
  }

  async function generateNow() {
    setGenerating(true)
    setError(null)
    try {
      const res = await apiService.client.post('/api/admin/daily-quiz/generate-week')
      const created = res.data?.created ?? []
      const skipped = res.data?.skipped ?? []
      if (created.length === 0 && skipped.length > 0) {
        setError(`Barcha kunlar allaqachon yaratilgan (${skipped.length} kun o'tkazib yuborildi).`)
      }
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Generatsiya qilib bo'lmadi")
    } finally {
      setGenerating(false)
    }
  }

  async function approve(quizId: number) {
    setBusyId(quizId)
    try {
      await apiService.client.post(`/api/admin/daily-quiz/${quizId}/approve`)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Tasdiqlab bo'lmadi")
    } finally {
      setBusyId(null)
    }
  }

  async function reject(quizId: number) {
    if (!confirm("Bu kunni rad etasizmi? U hech qachon nashr etilmaydi.")) return
    setBusyId(quizId)
    try {
      await apiService.client.post(`/api/admin/daily-quiz/${quizId}/reject`)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Rad etib bo'lmadi")
    } finally {
      setBusyId(null)
    }
  }

  async function regenerate(quizId: number) {
    if (!confirm("Bu kun uchun savollarni qayta yaratasizmi? Eski savollar o'chiriladi.")) return
    setBusyId(quizId)
    try {
      await apiService.client.post(`/api/admin/daily-quiz/${quizId}/regenerate`)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Qayta yaratib bo'lmadi")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900">
          <ArrowLeft size={16} /> Admin
        </button>
        <span className="text-sm font-bold text-sahifa-700 dark:text-sahifa-300">5 Savol — tasdiqlash</span>
        <button
          onClick={generateNow}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <Sparkles size={14} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Yaratilmoqda…' : 'Hozir generatsiya qilish'}
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
        ) : quizzes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400 dark:text-gray-500">
            <span className="text-4xl">🗓️</span>
            <p className="text-sm">Tasdiqlash uchun savollar yo'q</p>
            <p className="text-xs">"Hozir generatsiya qilish" tugmasini bosing.</p>
          </div>
        ) : (
          quizzes.map(qz => (
            <QuizCard
              key={qz.id} quiz={qz} busy={busyId === qz.id}
              onApprove={() => approve(qz.id)} onReject={() => reject(qz.id)}
              onRegenerate={() => regenerate(qz.id)} onQuestionSaved={load}
            />
          ))
        )}
      </div>
    </div>
  )
}

function QuizCard({
  quiz, busy, onApprove, onReject, onRegenerate, onQuestionSaved,
}: {
  quiz: PendingQuiz; busy: boolean
  onApprove: () => void; onReject: () => void; onRegenerate: () => void; onQuestionSaved: () => void
}) {
  const canApprove = quiz.question_count === 5 && quiz.questions.every(q => q.verified)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-bold text-gray-900 dark:text-white">#{quiz.quiz_number}</span>
          <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{fmtDate(quiz.publish_date)}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400 ml-2">
            {THEME_LABELS[quiz.theme] ?? quiz.theme}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          quiz.question_count === 5 ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                     : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
        }`}>
          {quiz.question_count}/5 savol
        </span>
      </div>

      <div className="space-y-2">
        {quiz.questions.map((q, i) => (
          <QuestionRow key={q.id} question={q} index={i} onSaved={onQuestionSaved} />
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onApprove} disabled={busy || !canApprove}
          title={!canApprove ? "Aynan 5 ta tasdiqlangan savol kerak" : undefined}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800/40 text-green-600 dark:text-green-400 disabled:opacity-40 transition-colors"
        >
          <Check size={13} /> Tasdiqlash
        </button>
        <button
          onClick={onReject} disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
        >
          <X size={13} /> Rad etish
        </button>
        <button
          onClick={onRegenerate} disabled={busy}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
        >
          <RotateCcw size={13} /> Qayta yaratish
        </button>
      </div>
    </div>
  )
}

function QuestionRow({ question, index, onSaved }: { question: PendingQuestion; index: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    question_text: question.question_text,
    options: [...question.options],
    correct_index: question.correct_index,
    explanation: question.explanation,
    source: question.source,
    difficulty: question.difficulty,
  })

  async function save() {
    setSaving(true)
    try {
      await apiService.client.patch(`/api/admin/daily-quiz/questions/${question.id}`, draft)
      setEditing(false)
      onSaved()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Saqlab bo'lmadi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-900/30">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">{index + 1}.</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
          </span>
          {question.verified
            ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">✓ tekshirildi</span>
            : <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500">✕ tasdiqlanmadi</span>}
        </div>
        <button onClick={() => setEditing(e => !e)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <Pencil size={13} />
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft.question_text}
            onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
            className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            rows={2}
          />
          {draft.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type="radio" checked={draft.correct_index === oi}
                onChange={() => setDraft(d => ({ ...d, correct_index: oi }))}
              />
              <input
                value={opt}
                onChange={e => setDraft(d => ({ ...d, options: d.options.map((o, i2) => i2 === oi ? e.target.value : o) }))}
                className="flex-1 text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          ))}
          <textarea
            value={draft.explanation}
            onChange={e => setDraft(d => ({ ...d, explanation: e.target.value }))}
            placeholder="Tushuntirish"
            className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            rows={2}
          />
          <input
            value={draft.source}
            onChange={e => setDraft(d => ({ ...d, source: e.target.value }))}
            placeholder="Manba"
            className="w-full text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <select
            value={draft.difficulty}
            onChange={e => setDraft(d => ({ ...d, difficulty: e.target.value as any }))}
            className="text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="easy">Oson</option>
            <option value="medium">O'rta</option>
            <option value="hard">Qiyin</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={save} disabled={saving}
              className="flex items-center gap-1 text-xs font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              <Save size={12} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs font-semibold text-gray-500 px-3 py-1.5">
              Bekor qilish
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-900 dark:text-white font-medium">{question.question_text}</p>
          <div className="mt-1 space-y-0.5">
            {question.options.map((opt, oi) => (
              <p key={oi} className={`text-xs ${oi === question.correct_index ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                {oi === question.correct_index ? '✓ ' : '  '}{opt}
              </p>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1 italic">{question.explanation} — {question.source}</p>
        </>
      )}
    </div>
  )
}
