/**
 * DonationPage — Qo'llab-quvvatlash, sahifalab.uz/qollab-quvvatlash.
 * The PRIMARY shipping target for the donation feature (095) — zero Play
 * Store risk, unlike the gated in-app screen. Manual bank transfer only:
 * no amount picker, no checkout, just "here's the card, copy it."
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, MessageCircle, BellRing } from 'lucide-react'
import apiService from '../services/apiService'
import PaymentCard, { type PaymentMethod } from '../components/donation/PaymentCard'
import CopyRow from '../components/donation/CopyRow'

const CACHE_KEY = 'donation_methods_cache_v1'

function track(event_type: string, meta: Record<string, unknown> = {}) {
  apiService.client.post('/api/analytics/track', {
    events: [{ event_type, target_id: 0, meta: { ...meta, surface: 'web' } }],
  }).catch(() => {})
}

export default function DonationPage() {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const trackedView = useRef(false)
  const deckRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await apiService.client.get('/api/payment-methods')
      const list: PaymentMethod[] = res.data?.methods ?? []
      setMethods(list)
      localStorage.setItem(CACHE_KEY, JSON.stringify(list))
    } catch (e) {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        try { setMethods(JSON.parse(cached)); setError(false) } catch { setError(true) }
      } else {
        setError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (methods && methods.length && !trackedView.current) {
      trackedView.current = true
      track('donation_page_view')
    }
  }, [methods])

  function handleScroll() {
    const el = deckRef.current
    if (!el || !methods?.length) return
    const cardWidth = 296 + 16
    const idx = Math.round(el.scrollLeft / cardWidth)
    if (idx !== active && idx >= 0 && idx < methods.length) {
      setActive(idx)
      track('donation_card_swiped', { index: idx, methodId: methods[idx].id })
    }
  }

  const activeMethod = methods && methods.length ? methods[Math.min(active, methods.length - 1)] : null

  return (
    <div className="min-h-screen" style={{ background: '#FBF7F2' }}>
      <div className="mx-auto max-w-2xl px-5 py-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-[27px] font-extrabold tracking-[-0.03em]" style={{ color: '#2B3B4D' }}>
            Qo'llab-quvvatlash
          </h1>
          <p className="mt-2 max-w-md text-[14px] leading-[1.6] font-medium" style={{ color: '#5A6774' }}>
            Sahifalab har kuni minglab o'quvchi uchun bepul. Xohlagan miqdorda qo'shilishingiz — ilovani tirik saqlaydi.
          </p>
        </motion.div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : !methods || methods.length === 0 ? (
          <EmptyState subscribed={subscribed} onSubscribe={() => setSubscribed(true)} />
        ) : (
          <>
            <div className="mt-10 mb-3 flex items-center gap-3">
              <span className="text-[9.5px] font-bold uppercase tracking-[.16em]" style={{ color: '#A79C8E' }}>
                TO'LOV USULI
              </span>
              <div className="h-px flex-1" style={{ background: 'rgba(43,59,77,.09)' }} />
              {methods.length > 1 && (
                <span className="font-mono text-[10px] font-bold" style={{ color: '#A79C8E' }}>
                  {active + 1} / {methods.length}
                </span>
              )}
            </div>

            {/* Deck */}
            <div
              ref={deckRef}
              onScroll={handleScroll}
              className={`flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                methods.length === 1 ? 'justify-center' : 'snap-x snap-mandatory'
              }`}
              style={{ scrollSnapType: methods.length > 1 ? 'x mandatory' : undefined }}
            >
              {methods.map((m, i) => (
                <div key={m.id} className="snap-start" style={{ scrollSnapAlign: methods.length > 1 ? 'start' : undefined }}>
                  <PaymentCard method={m} dimmed={methods.length > 1 && i !== active} />
                </div>
              ))}
            </div>

            {methods.length > 1 && (
              <div className="my-4 flex justify-center gap-1.5">
                {methods.map((_, i) => (
                  <span
                    key={i}
                    className="rounded-full transition-all"
                    style={{
                      width: i === active ? 22 : 6, height: 6,
                      background: i === active ? '#E8722D' : 'rgba(43,59,77,.18)',
                    }}
                  />
                ))}
              </div>
            )}

            {activeMethod && (
              <div className="mt-4">
                <CopyRow method={activeMethod} onCopied={() => track('donation_number_copied', { methodId: activeMethod.id, numberType: activeMethod.numberType })} />
              </div>
            )}

            <TransparencyBlock />
          </>
        )}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mt-10 animate-pulse space-y-4">
      <div className="mx-auto rounded-[26px]" style={{ width: 296, height: 187, background: '#F3EDE5' }} />
      <div className="mx-auto h-14 max-w-md rounded-[22px]" style={{ background: '#F3EDE5' }} />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <PlaceholderBox title="Ma'lumot yuklanmadi">
      <button
        onClick={onRetry}
        className="mt-4 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white"
        style={{ background: '#E8722D' }}
      >
        <RefreshCw size={15} /> Qayta urinish
      </button>
    </PlaceholderBox>
  )
}

function EmptyState({ subscribed, onSubscribe }: { subscribed: boolean; onSubscribe: () => void }) {
  return (
    <>
      <PlaceholderBox
        title="To'lov usullari hozircha yo'q"
        body="Karta rekvizitlari tez orada qo'shiladi. Xohlasangiz, xabar berishimiz mumkin."
      >
        <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={onSubscribe}
            disabled={subscribed}
            className="flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: '#E8722D' }}
          >
            <BellRing size={15} /> {subscribed ? 'Xabar berish yoqildi' : 'Tayyor bo\'lganda xabar bering'}
          </button>
          <a
            href="https://t.me/Sahifalab_hub_bot"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold"
            style={{ borderColor: 'rgba(43,59,77,.18)', color: '#2B3B4D' }}
          >
            <MessageCircle size={15} /> Telegram kanalimiz
          </a>
        </div>
      </PlaceholderBox>
      <div className="mt-6 rounded-[22px] p-4" style={{ background: '#F3EDE5' }}>
        <p className="text-[9.5px] font-bold uppercase tracking-[.16em]" style={{ color: '#A79C8E' }}>
          SHU PAYTDA HAM YORDAM BERISH MUMKIN
        </p>
        <p className="mt-2 text-[13px] leading-[1.6]" style={{ color: '#5A6774' }}>
          Ilovani do'stlaringizga ulashing yoki Play Marketda sharh qoldiring — bu ham katta yordam.
        </p>
      </div>
    </>
  )
}

function PlaceholderBox({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-[26px] border-[1.5px] border-dashed px-6 py-10 text-center"
      style={{ borderColor: 'rgba(43,59,77,.18)', background: '#F3EDE5', maxWidth: 296, margin: '40px auto 0' }}
    >
      <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-white" style={{ background: '#2B3B4D' }}>
        S
      </div>
      <p className="text-[14px] font-bold" style={{ color: '#2B3B4D' }}>{title}</p>
      {body && <p className="mt-1.5 text-[12.5px] leading-[1.5]" style={{ color: '#7A8794' }}>{body}</p>}
      {children}
    </div>
  )
}

function TransparencyBlock() {
  return (
    <div className="mt-6 rounded-[22px] p-4" style={{ background: '#F3EDE5' }}>
      <p className="text-[9.5px] font-bold uppercase tracking-[.16em]" style={{ color: '#A79C8E' }}>
        XAYRIYA NIMAGA KETADI
      </p>
      <ul className="mt-2.5 space-y-1.5 text-[13px] leading-[1.5]" style={{ color: '#5A6774' }}>
        <li>• Server va AI xarajatlari</li>
        <li>• Yangi kurs va kartalar tayyorlash</li>
        <li>• Ilova barcha uchun bepul qolishi</li>
      </ul>
      <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'rgba(43,59,77,.09)' }}>
        <p className="text-[11px]" style={{ color: '#A79C8E' }}>
          Choraklik hisobotlar ochiq e'lon qilinadi. Xayriya qilish ixtiyoriy.
        </p>
      </div>
    </div>
  )
}
