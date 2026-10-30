/**
 * AdminPaymentsTab — the manual payment queue (step-12 pending_enrollments):
 * courses, Pro passes and the SAHIFALAB homiylari channel (111). Rendered as
 * a tab inside AdminPage.tsx (activeTab === 'payments').
 *
 * "Tekshirish" lists receipts waiting for review, oldest first, and refreshes
 * every 30 s. Approving or rejecting here does what the pay bot's buttons do:
 * the buyer is told (a course or Pro opens; a channel buyer gets their invite
 * link from the pay bot). Amounts are in so'm.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, X } from 'lucide-react'
import apiService from '../../services/apiService'

type Status = 'paid' | 'awaiting_payment' | 'granted' | 'cancelled' | 'expired'
type Product = 'course' | 'pro' | 'channel'

interface PendingItem {
  id: number
  user_id: number
  product: Product
  reference_code: string
  expected_amount: number
  actual_amount: number | null
  payment_method: string | null
  status: Status
  created_at: string
  expires_at: string | null
  processed_at: string | null
  admin_notes: string | null
  payment_proof_url: string | null
  item_title: string
  user: { first_name?: string; username?: string; photo_url?: string } | null
}

type Counts = Partial<Record<Status, { total: number } & Partial<Record<Product, number>>>>

const STATUSES: { key: Status; label: string }[] = [
  { key: 'paid', label: '📸 Tekshirish' },
  { key: 'awaiting_payment', label: "🟡 To'lov kutilmoqda" },
  { key: 'granted', label: '✅ Tasdiqlangan' },
  { key: 'cancelled', label: '❌ Bekor qilingan' },
  { key: 'expired', label: "⏰ Muddati o'tgan" },
]

const PRODUCTS: { key: Product | null; label: string }[] = [
  { key: null, label: 'Hammasi' },
  { key: 'course', label: '📚 Kurs' },
  { key: 'pro', label: '✨ Pro' },
  { key: 'channel', label: '🔒 Kanal' },
]

// Same reasons as the pay bot's reject buttons.
const REJECT_REASONS = ["To'lov topilmadi", "Noto'g'ri summa", 'Soxta screenshot', "Noto'g'ri foydalanuvchi"]

const PAGE_SIZE = 20

const money = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`

function ago(iso: string | null): string {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'hozirgina'
  if (min < 60) return `${min} daq oldin`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} soat oldin`
  return new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const errText = (e: any, fallback: string) => e?.response?.data?.detail ?? fallback

/** A receipt: CDN images load directly; tg://file/… ones come through the backend. */
function Proof({ item, onOpen }: { item: PendingItem; onOpen: (src: string) => void }) {
  const url = item.payment_proof_url
  const [src, setSrc] = useState<string | null>(url?.startsWith('http') ? url : null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url?.startsWith('tg://file/')) return
    let objectUrl: string | null = null
    apiService.client
      .get(`/api/admin/pending-enrollments/${item.id}/proof`, { responseType: 'blob' })
      .then(res => { objectUrl = URL.createObjectURL(res.data); setSrc(objectUrl) })
      .catch(() => setFailed(true))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item.id, url])

  const box = 'w-24 h-32 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-900 grid place-items-center text-[11px] text-gray-400 text-center p-1'
  if (!url) return <div className={box}>Screenshot yo'q</div>
  if (failed) return <div className={box}>Screenshot ochilmadi</div>
  if (!src) return <div className={box}>Yuklanmoqda…</div>
  return (
    <button onClick={() => onOpen(src)} className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
      <img src={src} alt="To'lov screenshoti" className="w-full h-full object-cover" />
    </button>
  )
}

function Buyer({ item }: { item: PendingItem }) {
  const name = item.user?.first_name
  const username = item.user?.username
  return (
    <div className="text-sm text-gray-700 dark:text-gray-200">
      👤 {name ?? <span className="text-gray-400">Ilovada profili yo'q</span>}
      {username && (
        <a href={`https://t.me/${username}`} target="_blank" rel="noreferrer" className="ml-1 text-sahifa-600 hover:underline">
          @{username}
        </a>
      )}
      <span className="ml-1 text-xs text-gray-400 font-mono">{item.user_id}</span>
    </div>
  )
}

function PaymentCard({ item, onDone, onOpenProof }: {
  item: PendingItem
  onDone: (message: string) => void
  onOpenProof: (src: string) => void
}) {
  const [amount, setAmount] = useState(String(item.expected_amount))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState(REJECT_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [busy, setBusy] = useState(false)

  const actionable = item.status === 'paid' || item.status === 'awaiting_payment'
    || (item.status === 'expired' && !!item.payment_proof_url)

  async function approve() {
    const actual = Number(amount.replace(/\s/g, ''))
    if (!Number.isFinite(actual) || actual <= 0) { alert("Summani to'g'ri kiriting"); return }
    if (actual !== item.expected_amount
      && !confirm(`Kutilgan summa ${money(item.expected_amount)}, siz ${money(actual)} kiritdingiz. Tasdiqlaysizmi?`)) return
    setBusy(true)
    try {
      const res = await apiService.client.post(`/api/admin/pending-enrollments/${item.id}/grant`, {
        actual_amount: actual,
        payment_method: 'card_transfer',
        notes: 'Approved via web admin',
        send_notification: true,
      })
      const inviteError = res.data?.invite_error
      onDone(inviteError
        ? `✅ ${item.reference_code} tasdiqlandi, lekin kanal havolasi yuborilmadi: ${inviteError}. Foydalanuvchi botga /homiy yozsa, havola qayta yuboriladi.`
        : `✅ ${item.reference_code} tasdiqlandi`)
    } catch (e: any) {
      alert(errText(e, "Tasdiqlab bo'lmadi"))
      setBusy(false)
    }
  }

  async function reject() {
    const text = reason === 'custom' ? customReason.trim() : reason
    if (!text) { alert('Sababni yozing'); return }
    setBusy(true)
    try {
      await apiService.client.post(`/api/admin/pending-enrollments/${item.id}/cancel`, { reason: text })
      onDone(`❌ ${item.reference_code} rad etildi`)
    } catch (e: any) {
      alert(errText(e, "Rad etib bo'lmadi"))
      setBusy(false)
    }
  }

  const productIcon = item.product === 'pro' ? '✨' : item.product === 'channel' ? '🔒' : '📚'
  const input = 'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm'

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 flex gap-3 ${busy ? 'opacity-60' : ''}`}>
      <Proof item={item} onOpen={onOpenProof} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-gray-900 dark:text-white truncate">{productIcon} {item.item_title}</div>
          <div className="text-xs text-gray-400 shrink-0" title={item.created_at}>{ago(item.created_at)}</div>
        </div>
        <Buyer item={item} />
        <div className="text-sm text-gray-700 dark:text-gray-200">
          💰 <b>{money(item.expected_amount)}</b>
          <span className="ml-2 font-mono text-xs text-gray-500">{item.reference_code}</span>
        </div>
        {item.status === 'granted' && (
          <div className="text-xs text-gray-500">
            Tasdiqlangan {ago(item.processed_at)} · olingan {money(item.actual_amount)}
          </div>
        )}
        {item.admin_notes && <div className="text-xs text-gray-500 break-words">📝 {item.admin_notes}</div>}

        {actionable && !rejecting && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input className={`${input} w-32`} inputMode="numeric" value={amount}
              onChange={e => setAmount(e.target.value)} aria-label="Olingan summa" />
            <button onClick={approve} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              <Check size={15} /> Tasdiqlash
            </button>
            <button onClick={() => setRejecting(true)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900 text-red-600 px-3 py-1.5 text-sm font-medium">
              <X size={15} /> Rad etish
            </button>
          </div>
        )}

        {actionable && rejecting && (
          <div className="space-y-2 pt-1">
            <select className={`${input} w-full`} value={reason} onChange={e => setReason(e.target.value)}>
              {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              <option value="custom">Boshqa sabab (yozish)</option>
            </select>
            {reason === 'custom' && (
              <input className={`${input} w-full`} placeholder="Sabab" value={customReason} maxLength={300}
                onChange={e => setCustomReason(e.target.value)} autoFocus />
            )}
            <div className="flex gap-2">
              <button onClick={reject} disabled={busy}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                Rad etish va xabar berish
              </button>
              <button onClick={() => setRejecting(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500">
                Orqaga
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminPaymentsTab() {
  const [status, setStatus] = useState<Status>('paid')
  const [product, setProduct] = useState<Product | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<PendingItem[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Counts>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const noticeTimer = useRef<number>()

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 400)
    return () => window.clearTimeout(t)
  }, [search])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [list, c] = await Promise.all([
        apiService.client.get('/api/admin/pending-enrollments', {
          params: { status, page, page_size: PAGE_SIZE, ...(product ? { product } : {}), ...(query ? { search: query } : {}) },
        }),
        apiService.client.get('/api/admin/pending-enrollments/counts'),
      ])
      setItems(list.data?.items ?? [])
      setTotal(list.data?.total ?? 0)
      setCounts(c.data ?? {})
      setError(null)
    } catch (e: any) {
      setError(errText(e, "To'lovlarni yuklab bo'lmadi"))
    } finally {
      setLoading(false)
    }
  }, [status, product, query, page])

  useEffect(() => { load() }, [load])

  // New receipts show up without a reload while the review queue is open.
  useEffect(() => {
    if (status !== 'paid') return
    const t = window.setInterval(() => { if (!document.hidden) load(true) }, 30_000)
    return () => window.clearInterval(t)
  }, [status, load])

  function done(message: string) {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 8000)
    load(true)
  }

  const statusCount = (s: Status) => counts[s]?.total ?? 0
  const productCount = (p: Product | null) => (p ? counts[status]?.[p] ?? 0 : statusCount(status))
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
      active
        ? 'bg-sahifa-600 border-sahifa-600 text-white'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
    }`

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => { setStatus(s.key); setPage(1) }} className={chip(status === s.key)}>
            {s.label}
            {statusCount(s.key) > 0 && <span className="ml-1 opacity-80">{statusCount(s.key)}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRODUCTS.map(p => (
          <button key={p.label} onClick={() => { setProduct(p.key); setPage(1) }}
            className={`px-2.5 py-1 rounded-lg text-xs ${product === p.key
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            {p.label} {productCount(p.key)}
          </button>
        ))}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kod, ism, @username, ID…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-3 py-1.5 text-sm" />
        </div>
        <button onClick={() => load()} title="Yangilash" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {notice && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm px-3 py-2">{notice}</div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="text-sm text-gray-500">Yuklanmoqda…</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
          {status === 'paid' ? "Tekshirilishi kerak bo'lgan to'lov yo'q 🎉" : "Hech narsa topilmadi"}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <PaymentCard key={item.id} item={item} onDone={done} onOpenProof={setLightbox} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1.5 rounded-lg disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          {page} / {pages}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-1.5 rounded-lg disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="To'lov screenshoti" className="max-h-full max-w-full rounded-lg" />
          <a href={lightbox} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-lg bg-white/90 text-gray-900 px-3 py-1.5 text-sm">
            <ExternalLink size={14} /> Yangi oynada
          </a>
        </div>
      )}
    </div>
  )
}
