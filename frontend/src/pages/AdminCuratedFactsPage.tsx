/**
 * AdminCuratedFactsPage — admin CRUD for the curated fact bank
 * (5-savol-quality-fixes brief, Part 4).
 *   • O'zbek adabiyoti / Tarix va meros never let the AI invent the
 *     underlying fact — it only formats a fact an admin already verified
 *     here into a question with distractors. Nothing reaches a fact bank
 *     candidate unless it was added and verified on this page.
 *   • Originally a set of Telegram bot commands in the content-bot repo
 *     (mirroring its quote-bank pattern); moved here since content-bot is
 *     an unrelated product (a news/content channel bot) that only happens
 *     to share the database.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'
import apiService from '../services/apiService'
import { useAuth } from '../context/AuthContext'

interface CuratedFact {
  id: number
  fact_text: string
  category: string
  source: string
  verified: boolean
  active: boolean
  times_used: number
  last_used_at: string | null
  created_at: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  ozbek_adabiyoti: "O'zbek adabiyoti",
  tarix_meros: 'Tarix va meros',
}
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS)

export default function AdminCuratedFactsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [facts, setFacts] = useState<CuratedFact[]>([])
  const [filter, setFilter] = useState<'pending' | 'verified'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async (which: 'pending' | 'verified') => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiService.client.get('/api/admin/curated-facts', {
        params: { verified: which === 'verified' },
      })
      setFacts(res.data?.facts ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user?.role === 'admin') load(filter) }, [user, filter, load])

  if (!authLoading && (!user || user.role !== 'admin')) {
    navigate('/', { replace: true })
    return null
  }

  async function withBusy(id: number, fn: () => Promise<void>) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load(filter)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Amalni bajarib bo'lmadi")
    } finally {
      setBusyId(null)
    }
  }

  const verify = (id: number) => withBusy(id, () => apiService.client.post(`/api/admin/curated-facts/${id}/verify`))
  const remove = (id: number) => {
    if (!confirm("Bu faktni o'chirasizmi? Bu qaytarilmaydi.")) return Promise.resolve()
    return withBusy(id, () => apiService.client.delete(`/api/admin/curated-facts/${id}`))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900">
          <ArrowLeft size={16} /> Admin
        </button>
        <span className="text-sm font-bold text-sahifa-700 dark:text-sahifa-300">Kurativ faktlar bazasi</span>
        <button
          onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Fakt qo'shish
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2.5 leading-relaxed">
          O'zbek adabiyoti va Tarix va meros savollari faqat shu yerda tasdiqlangan faktlardan yaratiladi — AI
          hech qachon bu ikki kategoriya uchun faktni o'zi o'ylab topmaydi, faqat siz tasdiqlagan faktni savol
          shakliga o'tkazadi. Har bir kategoriya uchun kamida 8–10 ta tasdiqlangan fakt bo'lishi tavsiya etiladi.
        </div>

        {adding && <AddFactForm onDone={() => { setAdding(false); load(filter) }} onCancel={() => setAdding(false)} />}

        {error && (
          <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-xl ${filter === 'pending' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700'}`}
          >
            Tekshiruv kutmoqda
          </button>
          <button
            onClick={() => setFilter('verified')}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-xl ${filter === 'verified' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700'}`}
          >
            Tasdiqlangan
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
        ) : facts.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Faktlar yo'q</div>
        ) : (
          facts.map(fact => (
            <div key={fact.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400">
                  {CATEGORY_LABELS[fact.category] ?? fact.category}
                </span>
                <div className="flex items-center gap-2">
                  {fact.times_used > 0 && (
                    <span className="text-xs text-gray-400">{fact.times_used}x ishlatilgan</span>
                  )}
                  {!fact.verified && (
                    <button
                      onClick={() => verify(fact.id)} disabled={busyId === fact.id}
                      className="flex items-center gap-1 text-xs font-semibold bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 px-2.5 py-1 rounded-lg disabled:opacity-50"
                    >
                      <Check size={12} /> Tasdiqlash
                    </button>
                  )}
                  <button
                    onClick={() => remove(fact.id)} disabled={busyId === fact.id}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-900 dark:text-white">{fact.fact_text}</p>
              <p className="text-xs text-gray-400 italic">{fact.source}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AddFactForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ fact_text: '', category: CATEGORY_KEYS[0], source: '' })

  async function save() {
    if (!draft.fact_text.trim() || !draft.source.trim()) {
      alert("Fakt matni va manbani to'ldiring")
      return
    }
    setSaving(true)
    try {
      await apiService.client.post('/api/admin/curated-facts', draft)
      onDone()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Qo'shib bo'lmadi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-sahifa-200 dark:border-sahifa-800/40 rounded-xl p-3 bg-sahifa-50/30 dark:bg-sahifa-900/10 space-y-2">
      <select
        value={draft.category}
        onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
        className="w-full text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        {CATEGORY_KEYS.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
      </select>
      <textarea
        value={draft.fact_text}
        onChange={e => setDraft(d => ({ ...d, fact_text: e.target.value }))}
        placeholder="Fakt matni (aniq va tekshirilishi mumkin bo'lgan shaklda)"
        className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        rows={3}
      />
      <input
        value={draft.source}
        onChange={e => setDraft(d => ({ ...d, source: e.target.value }))}
        placeholder="Manba (kitob, muallif yoki tan olingan manba)"
        className="w-full text-sm p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />
      <div className="flex gap-2">
        <button
          onClick={save} disabled={saving}
          className="flex items-center gap-1 text-xs font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saqlanmoqda…' : "Qo'shish"}
        </button>
        <button onClick={onCancel} className="text-xs font-semibold text-gray-500 px-3 py-1.5">Bekor qilish</button>
      </div>
    </div>
  )
}
