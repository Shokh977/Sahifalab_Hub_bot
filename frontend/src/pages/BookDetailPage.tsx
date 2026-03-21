/**
 * BookDetailPage — /kitoblar/:id
 * Shows full book info.
 * Free books → direct download.
 * Paid books → Telegram Stars / Click / Payme payment flow with purchase check.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiService from '@services/apiService'
import { fetchBook, fetchMyRating } from '../lib/supabase'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

// ── Types ──────────────────────────────────────────────────────────────────

interface Book {
  id: number
  title: string
  author: string
  description: string
  price: number
  is_paid: boolean
  file_url: string | null
  thumbnail_url: string | null
  category: string
  downloads: number
  rating: number
}

// ── Visual helpers ──────────────────────────────────────────────────────────

const COVER_GRADIENTS: Record<string, string> = {
  programming: 'from-indigo-500 to-purple-600',
  math:        'from-blue-500 to-cyan-600',
  science:     'from-green-500 to-teal-600',
  language:    'from-orange-500 to-amber-600',
  history:     'from-red-500 to-rose-600',
  business:    'from-yellow-500 to-orange-600',
  design:      'from-pink-500 to-fuchsia-600',
  default:     'from-sahifa-500 to-teal-600',
}
const coverGradient = (cat: string) =>
  COVER_GRADIENTS[cat?.toLowerCase()] ?? COVER_GRADIENTS.default

const CATEGORY_LABELS: Record<string, string> = {
  programming: '💻 Dasturlash',
  math:        '🔢 Matematika',
  science:     '🔬 Fan',
  language:    '🗣️ Til',
  history:     '📜 Tarix',
  business:    '💼 Biznes',
  design:      '🎨 Dizayn',
}

// ── Main Component ─────────────────────────────────────────────────────────

const BookDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useTelegramWebApp()

  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Download (free books)
  const [downloading, setDownloading] = useState(false)
  const [dlMsg, setDlMsg] = useState('')

  // Purchase state (paid books)
  const [purchased, setPurchased] = useState(false)
  const [purchaseChecking, setPurchaseChecking] = useState(false)

  // Rating state
  const [myRating, setMyRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [ratingLoading, setRatingLoading] = useState(false)
  const [ratingMsg, setRatingMsg] = useState('')

  // Load book
  useEffect(() => {
    if (!id) return
    fetchBook(Number(id))
      .then(data => setBook(data as Book))
      .catch(() => setError('Kitob topilmadi'))
      .finally(() => setLoading(false))
  }, [id])

  // Check purchase status for paid books
  useEffect(() => {
    if (!book?.is_paid || !user?.id) return
    setPurchaseChecking(true)
    apiService.checkPurchase(book.id, user.id)
      .then(r => setPurchased(r.data?.purchased === true))
      .catch(() => {})
      .finally(() => setPurchaseChecking(false))
  }, [book, user])

  // Load user's existing rating
  useEffect(() => {
    if (!book?.id || !user?.id) return
    fetchMyRating(book.id, user.id)
      .then(rating => setMyRating(rating))
      .catch(() => {})
  }, [book, user])

  const handleRate = async (stars: number) => {
    if (!book || !user?.id) return
    setRatingLoading(true)
    setRatingMsg('')
    try {
      const res = await apiService.rateBook(book.id, user.id, stars)
      setMyRating(stars)
      setBook(prev => prev ? { ...prev, rating: res.data.average } : prev)
      setRatingMsg('✅ Baholandi!')
      setTimeout(() => setRatingMsg(''), 2000)
    } catch {
      setRatingMsg('❌ Xato yuz berdi')
    } finally {
      setRatingLoading(false)
    }
  }

  const handleDownload = useCallback(async () => {
    if (!book) return
    setDownloading(true)
    setDlMsg('')
    try {
      const res = await apiService.downloadBook(book.id)
      const url: string = res.data?.download_url
      if (!url) { setDlMsg('❌ Fayl manzili topilmadi'); return }
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(url)
      } else {
        window.location.href = url
      }
      setDlMsg('✅ Yuklab olish boshlandi!')
    } catch {
      setDlMsg('❌ Yuklab bo\'lmadi. Keyinroq urinib ko\'ring.')
    } finally {
      setDownloading(false)
    }
  }, [book])

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-md mx-auto py-4 px-4 animate-pulse space-y-4">
        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="bg-white dark:bg-gray-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700" />
          <div className="p-5 space-y-3">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mt-4" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !book) {
    return (
      <div className="max-w-md mx-auto py-4 px-4">
        <button onClick={() => navigate(-1)} className="text-sahifa-600 dark:text-sahifa-400 text-sm mb-4 flex items-center gap-1">
          ← Orqaga
        </button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-2">📭</div>
          <p>{error || 'Kitob topilmadi'}</p>
        </div>
      </div>
    )
  }

  const categoryLabel = CATEGORY_LABELS[book.category?.toLowerCase()] ?? book.category

  return (
    <div className="max-w-md mx-auto py-4 px-4 pb-24">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-sahifa-600 dark:text-sahifa-400 font-medium mb-4"
      >
        ← Kitoblar
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-3xl overflow-hidden shadow-md">
        {/* Cover */}
        <div className="relative">
          {book.thumbnail_url ? (
            <img
              src={book.thumbnail_url}
              alt={book.title}
              className="w-full max-h-72 object-cover"
              onError={e => {
                const el = e.target as HTMLImageElement
                el.style.display = 'none'
                el.parentElement!.classList.add(
                  'bg-gradient-to-br',
                  ...coverGradient(book.category).split(' '),
                  'min-h-[220px]', 'flex', 'items-center', 'justify-center',
                )
                const span = document.createElement('span')
                span.className = 'text-7xl'
                span.textContent = '📕'
                el.parentElement!.appendChild(span)
              }}
            />
          ) : (
            <div className={`w-full bg-gradient-to-br ${coverGradient(book.category)} flex items-center justify-center py-14`}>
              <span className="text-8xl">📕</span>
            </div>
          )}
          {/* Price chip */}
          <div className={`absolute top-3 right-3 text-sm font-bold px-3 py-1 rounded-full shadow-lg ${
            book.is_paid ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'
          }`}>
            {book.is_paid ? `${book.price.toLocaleString()} UZS` : '🆓 Bepul'}
          </div>
        </div>

        {/* Info */}
        <div className="p-5 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {book.title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{book.author}</p>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-700 dark:text-sahifa-300 px-2.5 py-1 rounded-full font-medium">
              {categoryLabel}
            </span>
            <span className="text-sm text-yellow-500 font-medium">★ {book.rating.toFixed(1)}</span>
            <span className="text-xs text-gray-400">↓ {book.downloads} marta yuklangan</span>
          </div>

          {/* Star Rating */}
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Baholang:</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => handleRate(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  disabled={ratingLoading}
                  className="text-2xl transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
                >
                  {star <= (hoverRating || myRating) ? '★' : '☆'}
                </button>
              ))}
              {myRating > 0 && (
                <span className="text-xs text-gray-400 ml-2">Sizning bahoyingiz: {myRating}/5</span>
              )}
            </div>
            {ratingMsg && (
              <p className={`text-xs font-medium ${ratingMsg.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {ratingMsg}
              </p>
            )}
          </div>

          {/* Description */}
          {book.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {book.description}
            </p>
          )}

          {/* Download message */}
          {dlMsg && (
            <div className={`text-sm px-4 py-2.5 rounded-xl font-medium ${
              dlMsg.startsWith('✅')
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {dlMsg}
            </div>
          )}

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          {book.is_paid ? (
            purchaseChecking ? (
              <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
            ) : purchased ? (
              /* Already purchased → show download */
              <div className="space-y-2">
                <div className="text-center text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 rounded-xl py-2">
                  ✅ Siz bu kitobni sotib olgansiz
                </div>
                <button
                  onClick={handleDownload}
                  disabled={downloading || !book.file_url}
                  className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 active:scale-95 text-white font-semibold py-3.5 rounded-2xl shadow transition-all disabled:opacity-50"
                >
                  {downloading ? <Spinner /> : <>📥 Yuklab olish</>}
                </button>
              </div>
            ) : (
              /* Not purchased → payment options */
              <PaymentSection book={book} telegramId={user?.id ?? 0} onPurchased={() => setPurchased(true)} />
            )
          ) : (
            /* Free book → download */
            <div>
              <button
                onClick={handleDownload}
                disabled={downloading || !book.file_url}
                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 active:scale-95 text-white font-semibold py-3.5 rounded-2xl shadow transition-all disabled:opacity-50"
              >
                {downloading ? <Spinner /> : <>📥 Yuklab olish</>}
              </button>
              {!book.file_url && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">
                  Fayl hali qo'shilmagan
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Spinner ─────────────────────────────────────────────────────────────────
const Spinner: React.FC = () => (
  <>
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
    Yuklanmoqda…
  </>
)

// ── Payment Section ─────────────────────────────────────────────────────────
interface PaymentSectionProps {
  book: Book
  telegramId: number
  onPurchased: () => void
}

const PaymentSection: React.FC<PaymentSectionProps> = ({ book, telegramId, onPurchased }) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState('')       // which provider is loading
  const [msg, setMsg] = useState('')
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  // Safety-net: poll order status
  useEffect(() => {
    if (!pendingOrderId || !polling) return
    const interval = setInterval(async () => {
      try {
        const res = await apiService.getOrderStatus(pendingOrderId)
        if (res.data?.status === 'completed') {
          clearInterval(interval)
          setPolling(false)
          setPendingOrderId(null)
          setMsg('✅ To\'lov muvaffaqiyatli amalga oshirildi!')
          onPurchased()
        }
      } catch { /* continue polling */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [pendingOrderId, polling, onPurchased])

  // ── Pay handler — uses WebApp.openInvoice for native in-app payment ─────
  const handlePay = async (provider: 'telegram_stars' | 'click' | 'payme') => {
    if (!telegramId) { setMsg('❌ Telegram ID topilmadi'); return }
    setLoading(provider)
    setMsg('')
    try {
      // 1. Create order + get invoice link from backend
      setMsg('⏳ Buyurtma yaratilmoqda...')
      const res = await apiService.createInvoiceLink(book.id, telegramId, provider)
      if (res.data.already_purchased) { onPurchased(); return }

      const orderId = res.data.order_id as string
      const invoiceUrl = res.data.invoice_url as string

      if (!invoiceUrl) {
        setMsg('❌ Invoice URL olinmadi. Backend konfiguratsiyasini tekshiring.')
        return
      }

      setPendingOrderId(orderId)

      // 2. Open native Telegram payment form inside mini app
      if (window.Telegram?.WebApp?.openInvoice) {
        setMsg('')
        window.Telegram.WebApp.openInvoice(invoiceUrl, async (status) => {
          console.log('[Payment] openInvoice callback:', status)
          if (status === 'paid') {
            // Frontend confirms payment directly to backend
            try {
              await apiService.confirmPayment(orderId)
            } catch { /* bot will also confirm as backup */ }
            setPolling(false)
            setPendingOrderId(null)
            setMsg('✅ To\'lov muvaffaqiyatli amalga oshirildi!')
            onPurchased()
          } else if (status === 'failed') {
            setMsg('❌ To\'lov amalga oshmadi')
            setPolling(false)
          } else if (status === 'cancelled') {
            setMsg('')
            setPolling(false)
            setPendingOrderId(null)
          } else {
            // status === 'pending' → start polling as backup
            setPolling(true)
          }
        })
      } else {
        // Fallback: open invoice URL directly (works outside mini apps too)
        setMsg('⏳ To\'lov sahifasi ochilmoqda...')
        setPolling(true)
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(invoiceUrl)
        } else {
          window.open(invoiceUrl, '_blank')
        }
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Noma\'lum xato'
      console.error('[Payment] Error:', detail, err)
      setMsg(`❌ ${detail}`)
    } finally {
      setLoading('')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold py-3.5 rounded-2xl shadow transition-all"
      >
        💳 Sotib olish — {book.price.toLocaleString()} UZS
      </button>
    )
  }

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
        To'lov usulini tanlang
      </p>

      {/* Feedback */}
      {msg && (
        <div className={`text-xs px-3 py-2.5 rounded-xl font-medium text-center ${
          msg.startsWith('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          : msg.startsWith('⏳') ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
          : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
        }`}>
          {msg}
        </div>
      )}

      {/* Polling indicator */}
      {polling && (
        <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          To'lov kutilmoqda…
        </div>
      )}

      {/* ⭐ Telegram Stars */}
      <button
        onClick={() => handlePay('telegram_stars')}
        disabled={loading === 'telegram_stars'}
        className="flex items-center gap-3 w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.97] text-white px-4 py-3.5 rounded-2xl text-sm font-semibold shadow-md transition-all disabled:opacity-60"
      >
        <span className="text-xl">⭐</span>
        <span className="flex-1 text-left">Telegram Stars</span>
        <span className="text-xs opacity-80">{Math.max(1, Math.round(book.price / 250))} ⭐</span>
      </button>

      {/* 💳 Click */}
      <button
        onClick={() => handlePay('click')}
        disabled={loading === 'click'}
        className="flex items-center gap-3 w-full bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-[0.97] border border-gray-200 dark:border-gray-600 px-4 py-3.5 rounded-2xl text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
      >
        <span className="text-xl">🟢</span>
        <span className="flex-1 text-left text-gray-800 dark:text-white">Click</span>
        <span className="text-xs text-gray-400">{book.price.toLocaleString()} UZS</span>
      </button>

      {/* 💙 Payme */}
      <button
        onClick={() => handlePay('payme')}
        disabled={loading === 'payme'}
        className="flex items-center gap-3 w-full bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-[0.97] border border-gray-200 dark:border-gray-600 px-4 py-3.5 rounded-2xl text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
      >
        <span className="text-xl">💙</span>
        <span className="flex-1 text-left text-gray-800 dark:text-white">Payme</span>
        <span className="text-xs text-gray-400">{book.price.toLocaleString()} UZS</span>
      </button>

      {/* Cancel */}
      <button
        onClick={() => { setOpen(false); setMsg(''); setPolling(false) }}
        className="w-full text-xs text-gray-400 dark:text-gray-500 py-1.5"
      >
        Bekor qilish
      </button>
    </div>
  )
}

export default BookDetailPage
