/**
 * AdminDailyQuizPage — control panel for "5 Savol" (090_daily_quiz,
 * reworked by 094_daily_quiz_auto_publish).
 *   • Full rolling-week view (GET /week) — every day from today through
 *     +9, INCLUDING days nobody's generated yet ("missing"), so a gap in
 *     the schedule is visible instead of silently invisible.
 *   • Generation is now daily + self-topping-up: a 'draft' day (short even
 *     after retries) stays visible here for the admin to fix — add a
 *     question manually, regenerate, or approve as-is once it's back to 5.
 *   • A 'verified' day needs NO admin action at all — it auto-publishes on
 *     its scheduled day. Approve/publish-now are optional early/manual
 *     overrides, not a required gate.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Sparkles, Check, X, Pencil, Save, RotateCcw, Send, Plus, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'
import apiService from '../services/apiService'
import { useAuth } from '../context/AuthContext'

interface DayQuestion {
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
  voided: boolean
  manually_authored: boolean
}

interface DayEntry {
  exists: boolean
  id: number | null
  quiz_number: number | null
  publish_date: string
  theme: string | null
  status: string
  notes: string | null
  question_count: number
  questions: DayQuestion[]
}

// 5-savol-quality-fixes brief, Part 3 — replaced the old 7-weekday theme
// rotation with a 5-category weighted mix (category_config.py). Old keys
// kept alongside the new ones so historical days already published under
// the old rotation still render a real label instead of the raw slug.
const THEME_LABELS: Record<string, string> = {
  amaliy_fan: 'Amaliy fan', kitoblar_goyalar: "Kitoblar va g'oyalar",
  ozbek_adabiyoti: "O'zbek adabiyoti", tarix_meros: 'Tarix va meros',
  til_soz_tarixi: "Til va so'z tarixi",
  // Pre-rework themes (090_daily_quiz) — still shown for old published days.
  kitoblar: 'Kitoblar', miya_xotira: 'Miya va xotira', psixologiya: 'Psixologiya',
  shaxslar: 'Shaxslar', moliyaviy_savodxonlik: 'Moliyaviy savodxonlik',
  umumiy_bilim: 'Umumiy bilim', til: 'Til',
}

const DIFFICULTY_LABELS: Record<string, string> = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin' }

const STATUS_META: Record<string, { label: string; className: string }> = {
  missing:   { label: 'Yaratilmagan', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  draft:     { label: "E'tibor talab qiladi", className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  verified:  { label: 'Tayyor — avtomatik e\'lon qilinadi', className: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' },
  approved:  { label: 'Tasdiqlangan — avtomatik e\'lon qilinadi', className: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' },
  published: { label: 'Jonli', className: 'bg-sahifa-50 text-sahifa-600 dark:bg-sahifa-900/20 dark:text-sahifa-400' },
  closed:    { label: 'Yopilgan', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  voided:    { label: 'Rad etilgan', className: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400' },
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export default function AdminDailyQuizPage() {
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [days, setDays] = useState<DayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiService.client.get('/api/admin/daily-quiz/week', { params: { days_ahead: 10 } })
      setDays(res.data?.days ?? [])
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
      await apiService.client.post('/api/admin/daily-quiz/generate-week')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Generatsiya qilib bo'lmadi")
    } finally {
      setGenerating(false)
    }
  }

  async function withBusy(id: number, fn: () => Promise<void>) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Amalni bajarib bo'lmadi")
    } finally {
      setBusyId(null)
    }
  }

  const approve = (id: number) => withBusy(id, () => apiService.client.post(`/api/admin/daily-quiz/${id}/approve`))
  const publishNow = (id: number) => {
    if (!confirm("Bu kunni HOZIR e'lon qilasizmi? Foydalanuvchilar darhol push xabar oladi.")) return Promise.resolve()
    return withBusy(id, () => apiService.client.post(`/api/admin/daily-quiz/${id}/publish-now`))
  }
  const reject = (id: number) => {
    if (!confirm("Bu kunni rad etasizmi? U hech qachon nashr etilmaydi.")) return Promise.resolve()
    return withBusy(id, () => apiService.client.post(`/api/admin/daily-quiz/${id}/reject`))
  }
  const regenerate = (id: number) => {
    if (!confirm("Bu kun uchun savollarni qayta yaratasizmi? Eski savollar o'chiriladi.")) return Promise.resolve()
    return withBusy(id, () => apiService.client.post(`/api/admin/daily-quiz/${id}/regenerate`))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900">
          <ArrowLeft size={16} /> Admin
        </button>
        <span className="text-sm font-bold text-sahifa-700 dark:text-sahifa-300">5 Savol — haftalik jadval</span>
        <button
          onClick={generateNow}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <Sparkles size={14} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Yaratilmoqda…' : "Yetishmayotgan kunlarni to'ldirish"}
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2.5 leading-relaxed">
          Har kuni avtomatik 5 tadan savol yaratiladi va o'z sanasida avtomatik e'lon qilinadi.
          Faqat <span className="font-semibold text-amber-600 dark:text-amber-400">"e'tibor talab qiladi"</span> deb
          belgilangan kunlar sizning aralashuvingizni kutadi — qolganlariga tegmasangiz ham muammosiz e'lon bo'ladi.
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
        ) : (
          days.map(day => (
            <DayCard
              key={day.publish_date} day={day} busy={busyId === day.id}
              onApprove={() => day.id && approve(day.id)}
              onReject={() => day.id && reject(day.id)}
              onRegenerate={() => day.id && regenerate(day.id)}
              onPublishNow={() => day.id && publishNow(day.id)}
              onGenerateMissing={generateNow}
              onChanged={load}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DayCard({
  day, busy, onApprove, onReject, onRegenerate, onPublishNow, onGenerateMissing, onChanged,
}: {
  day: DayEntry; busy: boolean
  onApprove: () => void; onReject: () => void; onRegenerate: () => void
  onPublishNow: () => void; onGenerateMissing: () => void; onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(day.status === 'draft')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const meta = STATUS_META[day.status] ?? { label: day.status, className: 'bg-gray-100 text-gray-500' }
  const canApprove = day.question_count === 5 && day.questions.every(q => q.verified || q.manually_authored)
  const isLive = day.status === 'published' || day.status === 'closed'
  const isReady = day.status === 'verified' || day.status === 'approved'

  if (!day.exists) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <span className="font-bold text-gray-400 dark:text-gray-500">{fmtDate(day.publish_date)}</span>
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
        </div>
        <button
          onClick={onGenerateMissing}
          className="flex items-center gap-1.5 text-xs font-semibold bg-sahifa-50 dark:bg-sahifa-900/20 hover:bg-sahifa-100 dark:hover:bg-sahifa-900/40 text-sahifa-600 dark:text-sahifa-400 px-3 py-1.5 rounded-lg"
        >
          <Sparkles size={13} /> Yaratish
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button className="flex items-center gap-1.5 text-left" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
          <span className="font-bold text-gray-900 dark:text-white">#{day.quiz_number}</span>
          <span className="text-gray-500 dark:text-gray-400 text-sm">{fmtDate(day.publish_date)}</span>
          {day.theme && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400">
              {THEME_LABELS[day.theme] ?? day.theme}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            day.question_count === 5 ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                      : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
          }`}>
            {day.question_count}/5 savol
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
        </div>
      </div>

      {day.notes && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-2.5 py-1.5">
          {day.notes}
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          {day.questions.map((q, i) => (
            <QuestionRow key={q.id} question={q} index={i} readOnly={isLive} onSaved={onChanged} />
          ))}

          {!isLive && day.question_count < 5 && (
            addingQuestion ? (
              <AddQuestionForm quizId={day.id!} onDone={() => { setAddingQuestion(false); onChanged() }} onCancel={() => setAddingQuestion(false)} />
            ) : (
              <button
                onClick={() => setAddingQuestion(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-sahifa-400 hover:text-sahifa-600 transition-colors"
              >
                <Plus size={13} /> Savolni qo'lda qo'shish
              </button>
            )
          )}
        </div>
      )}

      {!isLive && day.status !== 'voided' && (
        isReady ? (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              O'z sanasida avtomatik e'lon qilinadi, yoki hozir qo'lda:
            </span>
            <button
              onClick={onPublishNow} disabled={busy}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl bg-sahifa-600 hover:bg-sahifa-700 text-white disabled:opacity-50 transition-colors"
            >
              <Send size={13} /> Hozir e'lon qilish
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onApprove} disabled={busy || !canApprove}
              title={!canApprove ? "Aynan 5 ta tayyor savol kerak" : undefined}
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
        )
      )}

      {day.status === 'voided' && (
        <button
          onClick={onRegenerate} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
        >
          <RotateCcw size={13} /> Qayta yaratish
        </button>
      )}
    </div>
  )
}

function AddQuestionForm({ quizId, onDone, onCancel }: { quizId: number; onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    question_text: '', options: ['', '', '', ''], correct_index: 0,
    explanation: '', source: '', difficulty: 'medium' as 'easy' | 'medium' | 'hard',
  })

  async function save() {
    if (!draft.question_text.trim() || draft.options.some(o => !o.trim()) || !draft.explanation.trim() || !draft.source.trim()) {
      alert("Barcha maydonlarni to'ldiring")
      return
    }
    setSaving(true)
    try {
      await apiService.client.post(`/api/admin/daily-quiz/${quizId}/questions`, draft)
      onDone()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Qo'shib bo'lmadi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-sahifa-200 dark:border-sahifa-800/40 rounded-xl p-3 bg-sahifa-50/30 dark:bg-sahifa-900/10 space-y-2">
      <textarea
        value={draft.question_text}
        onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
        placeholder="Savol matni"
        className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        rows={2}
      />
      {draft.options.map((opt, oi) => (
        <div key={oi} className="flex items-center gap-2">
          <input type="radio" checked={draft.correct_index === oi} onChange={() => setDraft(d => ({ ...d, correct_index: oi }))} />
          <input
            value={opt}
            onChange={e => setDraft(d => ({ ...d, options: d.options.map((o, i2) => i2 === oi ? e.target.value : o) }))}
            placeholder={`Variant ${oi + 1}`}
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
          <Save size={12} /> {saving ? 'Saqlanmoqda…' : "Qo'shish"}
        </button>
        <button onClick={onCancel} className="text-xs font-semibold text-gray-500 px-3 py-1.5">Bekor qilish</button>
      </div>
    </div>
  )
}

function QuestionRow({ question, index, readOnly, onSaved }: { question: DayQuestion; index: number; readOnly: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  async function remove() {
    if (!confirm("Bu savolni o'chirasizmi?")) return
    setDeleting(true)
    try {
      await apiService.client.delete(`/api/admin/daily-quiz/questions/${question.id}`)
      onSaved()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "O'chirib bo'lmadi")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-900/30">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400">{index + 1}.</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
          </span>
          {question.manually_authored
            ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">✍️ qo'lda kiritilgan</span>
            : question.verified
              ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">✓ tekshirildi</span>
              : <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500">✕ tasdiqlanmadi</span>}
          {question.voided && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600">bekor qilingan</span>}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(e => !e)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <Pencil size={13} />
            </button>
            <button onClick={remove} disabled={deleting} className="text-gray-400 hover:text-red-500 disabled:opacity-50">
              <Trash2 size={13} />
            </button>
          </div>
        )}
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
