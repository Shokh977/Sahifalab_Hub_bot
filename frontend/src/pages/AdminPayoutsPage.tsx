/**
 * AdminPayoutsPage — Admin view to manage teacher withdrawal requests.
 *   • Table of pending requests with teacher info, amount, card
 *   • Approve (mark paid) / Reject buttons
 *   • History tab for all processed payouts
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Wallet, CheckCircle2, XCircle, Clock, RefreshCw,
  CreditCard, ArrowLeft, AlertTriangle, MessageSquare,
  Filter,
} from 'lucide-react'
import apiService from '../services/apiService'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ── Types ────────────────────────────────────────────────────────────────────
interface Payout {
  id: number
  teacher_id: number
  teacher_name?: string
  teacher_username?: string
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

const ADMIN_TELEGRAM_IDS = [807466591]

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminPayoutsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [processing, setProcessing] = useState<number | null>(null)
  const [noteInput, setNoteInput] = useState<Record<number, string>>({})
  const [showNoteFor, setShowNoteFor] = useState<number | null>(null)

  const telegramId = user?.telegram_id || 0
  const isAdmin = ADMIN_TELEGRAM_IDS.includes(telegramId) || user?.role === 'admin'

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ruxsat yo'q</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Faqat adminlar uchun</p>
        </div>
      </div>
    )
  }

  // ── Data Loading ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'pending') {
        const res = await apiService.getPendingPayouts(telegramId)
        setPayouts(res.data?.payouts || [])
      } else {
        const res = await apiService.getAllPayouts(telegramId, filterStatus || undefined)
        setPayouts(res.data?.payouts || [])
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [activeTab, filterStatus, telegramId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Actions ────────────────────────────────────────────────────────────
  const handleApprove = async (payoutId: number) => {
    if (!confirm("Bu so'rovni TO'LANGAN deb belgilamoqchimisiz?")) return
    setProcessing(payoutId)
    try {
      await apiService.approvePayout(payoutId, telegramId, noteInput[payoutId] || '')
      await loadData()
    } catch (err: any) {
      console.error('[AdminPayouts] Approve error:', err?.response?.data?.detail || err?.message)
      alert('Xatolik yuz berdi')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (payoutId: number) => {
    if (!confirm("Bu so'rovni RAD ETMOQCHIMISIZ? Mablag' o'qituvchiga qaytariladi.")) return
    setProcessing(payoutId)
    try {
      await apiService.rejectPayout(payoutId, telegramId, noteInput[payoutId] || '')
      await loadData()
    } catch (err: any) {
      console.error('[AdminPayouts] Reject error:', err?.response?.data?.detail || err?.message)
      alert('Xatolik yuz berdi')
    } finally {
      setProcessing(null)
    }
  }

  // ── Status Badge ───────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" /> To'langan
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" /> Rad etilgan
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" /> Kutilmoqda
          </span>
        )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 space-y-5 pb-24">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-sahifa-500" />
              To'lov so'rovlari
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              O'qituvchilar pul yechish so'rovlari
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-1" />
            Kutilmoqda
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <Filter className="w-4 h-4 inline mr-1" />
            Barchasi
          </button>
        </div>

        {/* ── Filter for "All" tab ─────────────────────────────────── */}
        {activeTab === 'all' && (
          <div className="flex gap-2">
            {['', 'pending', 'paid', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-sahifa-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {s === '' ? 'Barchasi' : s === 'pending' ? 'Kutilmoqda' : s === 'paid' ? "To'langan" : 'Rad etilgan'}
              </button>
            ))}
          </div>
        )}

        {/* ── Payouts Table ────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin w-8 h-8 border-4 border-sahifa-500 border-t-transparent rounded-full" />
          </div>
        ) : payouts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-300 dark:text-green-800 mb-3" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {activeTab === 'pending' ? "Kutilayotgan so'rovlar yo'q" : "So'rovlar topilmadi"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {activeTab === 'pending' ? "Barcha so'rovlar ko'rib chiqilgan ✓" : "Filtrni o'zgartiring"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.map(payout => (
              <div
                key={payout.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-base font-bold text-gray-900 dark:text-white">
                        {fmtMoney(payout.amount)} UZS
                      </p>
                      <StatusBadge status={payout.status} />
                    </div>
                    <div className="space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <p>
                        👤 {payout.teacher_name || `Teacher #${payout.teacher_id}`}
                        {payout.teacher_username && (
                          <span className="ml-1 text-gray-400">@{payout.teacher_username}</span>
                        )}
                      </p>
                      <p className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[11px]">
                          {payout.card_number}
                        </code>
                      </p>
                      <p>📅 {fmtDate(payout.created_at)}</p>
                      {payout.processed_at && (
                        <p>✅ Bajarilgan: {fmtDate(payout.processed_at)}</p>
                      )}
                    </div>
                    {payout.admin_note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                        💬 {payout.admin_note}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions (only for pending) */}
                {payout.status === 'pending' && (
                  <div className="space-y-2 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    {/* Note input toggle */}
                    {showNoteFor === payout.id ? (
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
                        <input
                          type="text"
                          value={noteInput[payout.id] || ''}
                          onChange={e => setNoteInput(prev => ({ ...prev, [payout.id]: e.target.value }))}
                          placeholder="Izoh (ixtiyoriy)"
                          className="flex-1 py-1.5 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-sahifa-500"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNoteFor(payout.id)}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <MessageSquare className="w-3 h-3 inline mr-1" />
                        Izoh qo'shish
                      </button>
                    )}

                    {/* Approve / Reject */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(payout.id)}
                        disabled={processing === payout.id}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {processing === payout.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        To'landi deb belgilash
                      </button>
                      <button
                        onClick={() => handleReject(payout.id)}
                        disabled={processing === payout.id}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {processing === payout.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        Rad etish
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
