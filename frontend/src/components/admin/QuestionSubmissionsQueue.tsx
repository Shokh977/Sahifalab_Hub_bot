/**
 * QuestionSubmissionsQueue — View A of "Siz ham savol yuboring"
 * (105_question_submissions). User-written 5 Savol questions waiting for the
 * admin, sorted by the backend where attention is needed: a cold-answer
 * disagreement first (the AI, not shown the user's answer, picked another
 * option — the user may believe something false), then 'unverifiable' /
 * 'low' confidence, then the rest. Every AI output here is advice; nothing
 * reaches a quiz without Approve + a swap in the schedule (View B).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Check, X, Pencil, CalendarPlus, RefreshCw, AlertTriangle, Save } from 'lucide-react'
import apiService from '../../services/apiService'

export interface Submission {
  id: number
  telegram_id: number
  question_text: string
  options: string[]
  correct_index: number
  explanation: string | null
  source_note: string | null
  submitter_name: string | null
  is_anonymous: boolean
  used_ai_assist: boolean
  submitter_published_count: number
  status: string
  rejection_reason: string | null
  ai_verdict: any
  ai_confidence: 'high' | 'medium' | 'low' | 'unverifiable' | null
  ai_reviewed: boolean
  category: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  concept_tag: string | null
  quiz_number: number | null
  quiz_date: string | null
  created_at: string
}

export function apiError(e: any, fallback: string): string {
  const d = e?.response?.data?.detail
  if (d && typeof d === 'object' && typeof d.message === 'string') return d.message
  if (typeof d === 'string') return d
  return fallback
}

const STATUSES: { key: string; label: string }[] = [
  { key: 'pending_review', label: 'Navbatda' },
  { key: 'approved', label: 'Tasdiqlangan' },
  { key: 'scheduled', label: 'Rejada' },
  { key: 'published', label: 'Nashr etilgan' },
  { key: 'duplicate', label: 'Takror' },
  { key: 'rejected', label: 'Rad etilgan' },
]

const CONFIDENCE: Record<string, { label: string; className: string }> = {
  high: { label: 'AI ishonchi: yuqori', className: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  medium: { label: "AI ishonchi: o'rta", className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  low: { label: 'AI ishonchi: past', className: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
  unverifiable: { label: 'AI tekshira olmaydi — sizning bilimingiz kerak', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
}

const FLAG_LABELS: Record<string, string> = {
  marked_wrong: 'AI fikricha belgilangan javob noto‘g‘ri',
  options_overlap: 'Variantlar ustma-ust tushadi',
  also_correct: 'Boshqa variant ham to‘g‘ri bo‘lishi mumkin',
  absurd_options: 'Bema’ni variant bor',
  term_question: 'Atama savoli',
  date_or_statistic: 'Javob — sana/statistika',
  myth: 'Afsona haqiqat sifatida',
  orthography: 'Imlo',
  duplicate: 'Takror',
  review_error: 'AI tekshiruvi bajarilmadi',
}

const CATEGORY_LABELS: Record<string, string> = {
  soz_tarixi: "So'z tarixi", ixtirolar: 'Ixtirolar', nega_shunday: 'Nega shunday?', tabiat: 'Tabiat',
  inson_tanasi: 'Inson tanasi', kosmos: 'Kosmos', geografiya: 'Geografiya', tarixiy_taqqoslash: 'Tarixiy taqqoslash',
  texnologiya: 'Texnologiya', oziq_ovqat: 'Oziq-ovqat', pul_iqtisod: 'Pul va iqtisod', keng_xato: 'Keng tarqalgan xato',
  kitoblar_mualliflar: 'Kitoblar', ozbek_adabiyoti: "O'zbek adabiyoti", tarix_meros: 'Tarix va meros',
  amaliy_fan: 'Amaliy fan', boshqa: 'Boshqa',
}

export default function QuestionSubmissionsQueue({ onSchedule }: { onSchedule: (s: Submission) => void }) {
  const [status, setStatus] = useState('pending_review')
  const [items, setItems] = useState<Submission[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiService.client.get('/api/admin/question-submissions', { params: { status } })
      setItems(res.data?.items ?? [])
      setCounts(res.data?.counts ?? {})
    } catch (e: any) {
      setError(apiError(e, "Yuklab bo'lmadi"))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${status === s.key
              ? 'bg-sahifa-600 text-white border-sahifa-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
          >
            {s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ''}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-gray-400 hover:text-gray-700" title="Yangilash"><RefreshCw size={14} /></button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2">{error}</div>}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Bu yerda hozircha savol yo'q.</div>
      ) : (
        items.map(s => <SubmissionCard key={s.id} s={s} onChanged={load} onSchedule={onSchedule} />)
      )}
    </div>
  )
}

function SubmissionCard({ s, onChanged, onSchedule }: { s: Submission; onChanged: () => void; onSchedule: (s: Submission) => void }) {
  const v = s.ai_verdict ?? {}
  const flags: string[] = v.flags ?? []
  const cold = v.cold_answer ?? {}
  const disagree = cold.outcome === 'disagree'
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    question_text: s.question_text,
    options: [...s.options],
    correct_index: s.correct_index,
    explanation: s.explanation ?? v.suggested_explanation ?? '',
    difficulty: s.difficulty ?? 'medium',
    category: s.category ?? 'boshqa',
  })
  const pending = s.status === 'pending_review' || s.status === 'duplicate'

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (e: any) {
      alert(apiError(e, "Amalni bajarib bo'lmadi"))
    } finally {
      setBusy(false)
    }
  }

  const approve = (edited: boolean) => act(() => apiService.client.post(
    `/api/admin/question-submissions/${s.id}/approve`,
    edited ? draft : { explanation: draft.explanation || undefined, difficulty: draft.difficulty, category: draft.category },
  ))
  const reject = () => {
    const reason = prompt('Ichki sabab (foydalanuvchiga ko‘rsatilmaydi):', '')
    if (reason === null) return
    act(() => apiService.client.post(`/api/admin/question-submissions/${s.id}/reject`, { reason }))
  }
  const saveMeta = (patch: Record<string, string>) =>
    act(() => apiService.client.patch(`/api/admin/question-submissions/${s.id}`, patch))

  return (
    <div className={`bg-white dark:bg-gray-800 border rounded-2xl p-4 space-y-2.5 shadow-sm ${disagree ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-700'}`}>
      {disagree && (
        <div className="flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            AI savolni javobsiz ko'rib, BOSHQA variantni tanladi: «{s.options[cold.model_index] ?? '?'}»
            {cold.certainty === 'sure' ? ' (ishonch bilan)' : ''}. Foydalanuvchining javobi noto'g'ri bo'lishi mumkin — tekshiring.
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="font-bold text-gray-900 dark:text-white">#{s.id}</span>
        <span className="text-gray-500">{s.is_anonymous ? 'Anonim' : s.submitter_name ?? '?'}</span>
        <span className="text-gray-400">· nashr etilgan: {s.submitter_published_count}</span>
        {s.used_ai_assist && <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300">AI variantlari</span>}
        {s.ai_confidence && (
          <span className={`px-1.5 py-0.5 rounded font-medium ${CONFIDENCE[s.ai_confidence]?.className ?? ''}`}>
            {CONFIDENCE[s.ai_confidence]?.label ?? s.ai_confidence}
          </span>
        )}
        {!s.ai_reviewed && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">AI tekshirmoqda…</span>}
        {s.quiz_date && <span className="px-1.5 py-0.5 rounded bg-sahifa-50 text-sahifa-600">#{s.quiz_number} · {s.quiz_date}</span>}
      </div>

      {v.confidence_reason && <p className="text-xs text-gray-500 dark:text-gray-400 italic">AI: {v.confidence_reason}</p>}

      {flags.filter(f => f !== 'cold_disagree').length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {flags.filter(f => f !== 'cold_disagree').map(f => (
            <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {FLAG_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      )}
      {v.exclusivity && !v.exclusivity.ok && v.exclusivity.note && <p className="text-xs text-amber-700">Variantlar: {v.exclusivity.note}</p>}
      {v.quality?.note && <p className="text-xs text-amber-700">Sifat: {v.quality.note}</p>}
      {(v.orthography ?? []).length > 0 && <p className="text-xs text-amber-700">Imlo: {(v.orthography as string[]).join('; ')}</p>}
      {v.duplicate_of && (
        <p className="text-xs text-gray-600">
          Takror: {v.duplicate_of.kind === 'quiz' ? `5 SAVOL #${v.duplicate_of.quiz_number} (${v.duplicate_of.publish_date})` : `savol #${v.duplicate_of.submission_id}`} — «{v.duplicate_of.question_text}»
        </p>
      )}
      {v.content?.issue && v.content.issue !== 'none' && <p className="text-xs text-red-600">Kontent: {v.content.issue} — {v.content.reason}</p>}
      {s.rejection_reason && <p className="text-xs text-red-600">Sabab (ichki): {s.rejection_reason}</p>}

      {editing ? (
        <div className="space-y-2">
          <textarea value={draft.question_text} rows={2} onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
            className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          {draft.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input type="radio" checked={draft.correct_index === oi} onChange={() => setDraft(d => ({ ...d, correct_index: oi }))} />
              <input value={opt} onChange={e => setDraft(d => ({ ...d, options: d.options.map((o, i) => (i === oi ? e.target.value : o)) }))}
                className="flex-1 text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-900 dark:text-white font-medium">{s.question_text}</p>
          <div className="space-y-0.5">
            {s.options.map((opt, oi) => (
              <p key={oi} className={`text-xs ${oi === s.correct_index ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                {oi === s.correct_index ? '✓ ' : '  '}{opt}
                {disagree && oi === cold.model_index ? '  ← AI tanlovi' : ''}
                {(v.distractors?.also_correct ?? []).includes(oi) ? '  ← bu ham to‘g‘ri bo‘lishi mumkin' : ''}
              </p>
            ))}
          </div>
        </>
      )}

      {s.source_note && <p className="text-xs text-gray-500">Qayerdan biladi: {s.source_note}</p>}

      {pending && (
        <>
          <textarea
            value={draft.explanation} rows={2}
            onChange={e => setDraft(d => ({ ...d, explanation: e.target.value }))}
            placeholder="Izoh (o'yindan keyin ko'rsatiladi)"
            className="w-full text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          {!s.explanation && v.suggested_explanation && (
            <p className="text-[11px] text-gray-400 -mt-1">Izoh AI taklifi bilan to'ldirildi — tekshirib, kerak bo'lsa tuzating.</p>
          )}
        </>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select value={draft.category} disabled={!pending && s.status !== 'approved'}
          onChange={e => { setDraft(d => ({ ...d, category: e.target.value })); saveMeta({ category: e.target.value }) }}
          className="text-xs p-1 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={draft.difficulty} disabled={!pending && s.status !== 'approved'}
          onChange={e => { setDraft(d => ({ ...d, difficulty: e.target.value as any })); saveMeta({ difficulty: e.target.value }) }}
          className="text-xs p-1 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          <option value="easy">Oson</option>
          <option value="medium">O'rta</option>
          <option value="hard">Qiyin</option>
        </select>
        {s.concept_tag && <span className="text-[11px] text-gray-400 font-mono">{s.concept_tag}</span>}
      </div>

      <div className="flex gap-2 flex-wrap pt-1">
        {pending && (
          <>
            <button onClick={() => approve(editing)} disabled={busy}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 disabled:opacity-50 dark:bg-green-900/20 dark:border-green-800/40 dark:text-green-400">
              {editing ? <Save size={13} /> : <Check size={13} />} {editing ? 'Saqlash va tasdiqlash' : 'Tasdiqlash'}
            </button>
            <button onClick={() => setEditing(e => !e)} disabled={busy}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <Pencil size={13} /> {editing ? 'Tahrirni yopish' : 'Tahrirlash'}
            </button>
            <button onClick={reject} disabled={busy}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
              <X size={13} /> Rad etish
            </button>
          </>
        )}
        {(pending || s.status === 'approved') && (
          <button
            onClick={async () => {
              if (pending) {
                setBusy(true)
                try {
                  await apiService.client.post(`/api/admin/question-submissions/${s.id}/approve`, editing ? draft : { explanation: draft.explanation || undefined, difficulty: draft.difficulty, category: draft.category })
                } catch (e: any) {
                  alert(apiError(e, "Tasdiqlab bo'lmadi"))
                  setBusy(false)
                  return
                }
                setBusy(false)
              }
              onSchedule({ ...s, status: 'approved', difficulty: draft.difficulty as any })
            }}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-sahifa-600 hover:bg-sahifa-700 text-white disabled:opacity-50"
          >
            <CalendarPlus size={13} /> {pending ? 'Tasdiqlab rejaga qo‘yish' : 'Rejaga qo‘yish'}
          </button>
        )}
        {s.status === 'approved' && (
          <button onClick={reject} disabled={busy} className="text-xs font-semibold px-3 py-1.5 text-red-500">Rad etish</button>
        )}
      </div>
    </div>
  )
}
