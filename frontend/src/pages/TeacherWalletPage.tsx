/**
 * TeacherWalletPage — Teacher earnings dashboard with:
 *   • Three balance cards (Available / Pending / Withdrawn)
 *   • Withdrawal request form with validation
 *   • Transaction history table with status badges
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Wallet, ArrowDownToLine, Clock, CheckCircle2, XCircle,
  CreditCard, Send, AlertTriangle, RefreshCw, History,
  ChevronDown, ChevronUp, Banknote,
} from 'lucide-react'
import apiService from '../services/apiService'

// ── Constants ────────────────────────────────────────────────────────────────
const MIN_WITHDRAWAL = 50_000
const MAX_WITHDRAWAL = 10_000_000

// ── Types ────────────────────────────────────────────────────────────────────
interface WalletData {
  teacher_id: number
  available_balance: number
  pending_withdrawal: number
  withdrawn_total: number
}

interface PayoutRecord {
  id: number
  teacher_id: number
  amount: number
  card_number: string
  status: 'pending' | 'paid' | 'rejected'
  admin_note?: string
  created_at: string
  processed_at?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n))
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

function maskCard(card: string): string {
  if (!card || card.length < 8) return card || ''
  return '•••• ' + card.slice(-4)
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TeacherWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [history, setHistory] = useState<PayoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Withdrawal form
  const [amount, setAmount] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)

  // ── Data Fetching ──────────────────────────────────────────────────────
  const loadWallet = useCallback(async () => {
    try {
      const res = await apiService.getTeacherWallet()
      setWallet(res.data)
    } catch {
      /* silent */
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await apiService.getPayoutHistory(100)
      setHistory(res.data?.history || [])
    } catch {
      /* silent */
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadWallet(), loadHistory()]).finally(() => setLoading(false))
  }, [loadWallet, loadHistory])

  // ── Withdrawal Submit ──────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const amt = parseFloat(amount.replace(/\s/g, ''))
    const card = cardNumber.replace(/\s/g, '')

    if (isNaN(amt) || amt <= 0) {
      setError("Summani to'g'ri kiriting")
      return
    }
    if (amt < MIN_WITHDRAWAL) {
      setError(`Minimal summa: ${fmtMoney(MIN_WITHDRAWAL)} UZS`)
      return
    }
    if (amt > MAX_WITHDRAWAL) {
      setError(`Maksimal summa: ${fmtMoney(MAX_WITHDRAWAL)} UZS`)
      return
    }
    if (wallet && amt > wallet.available_balance) {
      setError(`Yetarli mablag' yo'q. Mavjud: ${fmtMoney(wallet.available_balance)} UZS`)
      return
    }
    if (card.length < 8) {
      setError("Karta raqamini to'liq kiriting")
      return
    }

    setSubmitting(true)
    try {
      await apiService.requestWithdrawal(amt, card)
      setSuccess("So'rov muvaffaqiyatli yuborildi! Admin tez orada ko'rib chiqadi.")
      setAmount('')
      setCardNumber('')
      setShowForm(false)
      // Refresh
      await Promise.all([loadWallet(), loadHistory()])
    } catch (err: any) {
      console.error('[Wallet] Withdrawal error:', err?.response?.data?.detail || err?.message)
      setError('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Card number formatting ─────────────────────────────────────────────
  const handleCardInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16)
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
    setCardNumber(formatted)
  }

  // ── Amount formatting ──────────────────────────────────────────────────
  const handleAmountInput = (val: string) => {
    const digits = val.replace(/\D/g, '')
    setAmount(digits ? fmtMoney(parseInt(digits)) : '')
  }

  // ── Status Badge ───────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Muvaffaqiyatli
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3.5 h-3.5" />
            Rad etilgan
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3.5 h-3.5" />
            Kutilmoqda
          </span>
        )
    }
  }

  // ── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sahifa-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const available = wallet?.available_balance ?? 0
  const pending = wallet?.pending_withdrawal ?? 0
  const withdrawn = wallet?.withdrawn_total ?? 0
  const canWithdraw = available >= MIN_WITHDRAWAL

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4 space-y-5 pb-24">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sahifa-500/10 dark:bg-sahifa-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-sahifa-600 dark:text-sahifa-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Hamyon</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Daromad va to'lovlar</p>
            </div>
          </div>
          <button
            onClick={() => { loadWallet(); loadHistory() }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* ── Balance Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Available */}
          <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-100 dark:border-green-800/40 p-4 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-green-100 dark:bg-green-800/40 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">
              {fmtMoney(available)}
            </p>
            <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
              Yechish mumkin
            </p>
          </div>

          {/* Pending */}
          <div className="rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-100 dark:border-yellow-800/40 p-4 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-yellow-100 dark:bg-yellow-800/40 flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
              {fmtMoney(pending)}
            </p>
            <p className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">
              Kutilmoqda
            </p>
          </div>

          {/* Withdrawn */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/40 p-4 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-blue-100 dark:bg-blue-800/40 flex items-center justify-center">
              <ArrowDownToLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {fmtMoney(withdrawn)}
            </p>
            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Jami yechilgan
            </p>
          </div>
        </div>

        {/* ── Success/Error Banners ───────────────────────────────── */}
        {success && (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* ── Withdraw Toggle / Form ──────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sahifa-500/10 flex items-center justify-center">
                <Send className="w-4 h-4 text-sahifa-600 dark:text-sahifa-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Pul yechish</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Min: {fmtMoney(MIN_WITHDRAWAL)} UZS
                </p>
              </div>
            </div>
            {showForm ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showForm && (
            <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Summa (UZS)
                </label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={e => handleAmountInput(e.target.value)}
                    placeholder="100 000"
                    className="w-full pl-10 pr-14 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-sahifa-500 focus:border-transparent outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                    UZS
                  </span>
                </div>
              </div>

              {/* Card Number */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Karta raqami
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={e => handleCardInput(e.target.value)}
                    placeholder="8600 1234 5678 9012"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-sahifa-500 focus:border-transparent outline-none tracking-wider"
                  />
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-600 dark:text-blue-400">
                  So'rov admin tomonidan ko'rib chiqiladi va 1-3 ish kuni ichida o'tkaziladi.
                  Karta raqamingizni tekshiring — noto'g'ri raqam kiritilsa, pul qaytarilmaydi.
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !canWithdraw}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? "Yuborilmoqda..." : "So'rov yuborish"}
              </button>

              {!canWithdraw && (
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Minimal yechish summasi: {fmtMoney(MIN_WITHDRAWAL)} UZS.
                  Hozirgi mavjud: {fmtMoney(available)} UZS.
                </p>
              )}
            </form>
          )}
        </div>

        {/* ── Transaction History ──────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 p-4 border-b border-gray-100 dark:border-gray-700">
            <History className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">To'lov tarixi</h2>
            {historyLoading && (
              <div className="ml-auto w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center">
              <Wallet className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Hali so'rovlar yo'q</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {history.map(record => (
                <div key={record.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {fmtMoney(record.amount)} UZS
                      </p>
                      <StatusBadge status={record.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {maskCard(record.card_number)}
                      </span>
                      <span>{fmtDate(record.created_at)}</span>
                    </div>
                    {record.admin_note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                        💬 {record.admin_note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
