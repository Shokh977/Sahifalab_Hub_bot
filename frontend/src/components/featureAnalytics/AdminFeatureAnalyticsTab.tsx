/**
 * AdminFeatureAnalyticsTab — the admin "Xususiyatlar" tab: which features
 * people use, what they create with them, and who they are. Rendered inside
 * AdminPage.tsx (activeTab === 'feature_usage'), kept in its own folder like
 * AdminDonationsTab since AdminPage.tsx is already enormous.
 *
 * Data: /api/admin/feature-analytics/{overview,flashcards,daily-quiz,audience}
 * (backend admin_feature_analytics.py) and /api/admin/ai-usage. Each view is
 * fetched on first open and cached per (view, period) for the session.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import apiService from '../../services/apiService'
import { FA_STYLE } from './charts'
import { downloadAnalyticsCsv } from './csvExport'
import OverviewView from './OverviewView'
import FlashcardsView from './FlashcardsView'
import DailyQuizView from './DailyQuizView'
import AiView from './AiView'
import AudienceView from './AudienceView'
import type { AiUsageData, AudienceData, DailyQuizData, FlashcardsData, OverviewData } from './types'

type View = 'overview' | 'flashcards' | 'daily_quiz' | 'ai' | 'audience'

const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: '📊 Umumiy' },
  { id: 'flashcards', label: '🃏 Flesh kartalar' },
  { id: 'daily_quiz', label: '❓ 5 Savol' },
  { id: 'ai', label: '✨ AI' },
  { id: 'audience', label: '👥 Auditoriya' },
]

const PERIODS = [7, 30, 90, 365] as const
const PERIOD_LABELS: Record<number, string> = { 7: '7 kun', 30: '30 kun', 90: '90 kun', 365: '1 yil' }

const ENDPOINTS: Record<View, (days: number) => string> = {
  overview: d => `/api/admin/feature-analytics/overview?days=${d}`,
  flashcards: d => `/api/admin/feature-analytics/flashcards?days=${d}`,
  daily_quiz: d => `/api/admin/feature-analytics/daily-quiz?days=${d}`,
  audience: d => `/api/admin/feature-analytics/audience?days=${d}`,
  // admin_ai_usage.py caps the window at 90 days.
  ai: d => `/api/admin/ai-usage?days=${Math.min(d, 90)}`,
}

export default function AdminFeatureAnalyticsTab() {
  const [view, setView] = useState<View>('overview')
  const [days, setDays] = useState<number>(30)
  // All keyed by `${view}:${days}`, so switching tabs mid-request never
  // shows another view's spinner or error.
  const [cache, setCache] = useState<Record<string, unknown>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const started = useRef<Set<string>>(new Set())

  const key = `${view}:${days}`

  const load = useCallback(async (force = false) => {
    if (!force && started.current.has(key)) return
    started.current.add(key)
    setPending(p => ({ ...p, [key]: true }))
    setErrors(e => ({ ...e, [key]: null }))
    try {
      const res = await apiService.client.get(ENDPOINTS[view](days))
      setCache(c => ({ ...c, [key]: res.data }))
    } catch (e: any) {
      setErrors(er => ({ ...er, [key]: e?.response?.data?.detail ?? e?.message ?? "Yuklab bo'lmadi" }))
    } finally {
      setPending(p => ({ ...p, [key]: false }))
    }
  }, [key, view, days])

  useEffect(() => { load() }, [load])

  const data = cache[key]
  const loading = !!pending[key]
  const error = errors[key]

  return (
    <div className="fa-root space-y-6">
      <style>{FA_STYLE}</style>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Xususiyatlar analitikasi</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Kunlar Toshkent vaqti bo'yicha. O'zgarish — oldingi teng davrga nisbatan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => data !== undefined && downloadAnalyticsCsv(view, data, days)} disabled={data === undefined}
            title="Ochiq bo'limdagi barcha jadvallarni CSV faylga yuklab olish"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />
            CSV yuklab olish
          </button>
          <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          {PERIODS.map(p => (
            <button key={p} onClick={() => setDays(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${days === p
                ? 'bg-sahifa-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button onClick={() => load(true)} disabled={loading} title="Yangilash"
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* overflow-y-hidden: the tabs' -mb-px underline otherwise makes this
          row scroll vertically and shows a stray scrollbar */}
      <div className="flex gap-2 overflow-x-auto overflow-y-hidden border-b border-gray-200 dark:border-gray-700">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${view === v.id
              ? 'border-sahifa-600 text-sahifa-600 dark:text-sahifa-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
          <span>{String(error)}</span>
          <button onClick={() => load(true)} className="font-semibold underline">Qayta urinish</button>
        </div>
      )}

      {data === undefined ? (
        loading && <div className="py-20 text-center text-sm text-gray-400">Yuklanmoqda…</div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {view === 'overview' && <OverviewView data={data as OverviewData} />}
          {view === 'flashcards' && <FlashcardsView data={data as FlashcardsData} />}
          {view === 'daily_quiz' && <DailyQuizView data={data as DailyQuizData} />}
          {view === 'ai' && <AiView data={data as AiUsageData} requestedDays={days} />}
          {view === 'audience' && <AudienceView data={data as AudienceData} days={days} />}
        </div>
      )}
    </div>
  )
}
