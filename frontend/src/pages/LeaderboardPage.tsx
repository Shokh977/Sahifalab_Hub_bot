/**
 * LeaderboardPage — SAHIFALAB Hub
 *
 * Top 10 users by total_xp fetched directly from Supabase.
 * If the current user is not in the top 10, their rank is shown at the bottom.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useProgressStore, formatFocusTime } from '../context/progressStore'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeaderRow {
  telegram_id:       number
  first_name:        string
  username:          string | null
  total_xp:          number
  focus_seconds:     number
  level:             number
  quizzes_completed: number
}

// ── Medals ───────────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉']

function rankLabel(rank: number): React.ReactNode {
  if (rank <= 3) return <span className="text-xl">{MEDALS[rank - 1]}</span>
  return (
    <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
      {rank}
    </span>
  )
}

// ── Level gradient (consistent with the rest of the app) ─────────────────────
function levelGrad(level: number): string {
  if (level >= 10) return 'from-orange-400 to-red-500'
  if (level >= 7)  return 'from-yellow-400 to-amber-500'
  if (level >= 5)  return 'from-purple-400 to-purple-600'
  if (level >= 3)  return 'from-blue-400 to-blue-600'
  return 'from-gray-400 to-gray-500'
}

// ── Row component ─────────────────────────────────────────────────────────────
const LeaderRow: React.FC<{
  row:       LeaderRow
  rank:      number
  isSelf:    boolean
  animDelay: number
}> = ({ row, rank, isSelf, animDelay }) => (
  <motion.div
    initial={{ opacity: 0, x: -16 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.35, delay: animDelay }}
    className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
      isSelf
        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700/60 shadow-sm'
        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
    }`}
  >
    {/* Rank / Medal */}
    <div className="flex-shrink-0 w-7 flex items-center justify-center">
      {rankLabel(rank)}
    </div>

    {/* Avatar */}
    <div
      className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${levelGrad(row.level)} flex items-center justify-center shadow-sm`}
    >
      <span className="text-white text-sm font-black">
        {(row.first_name || '?').charAt(0).toUpperCase()}
      </span>
    </div>

    {/* Name + handle */}
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-bold truncate ${isSelf ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
        {row.first_name || 'Foydalanuvchi'}
        {isSelf && <span className="ml-1 text-[10px] font-medium opacity-70">(siz)</span>}
      </p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
        ⏱ {formatFocusTime(row.focus_seconds)}
        &nbsp;·&nbsp;
        📝 {row.quizzes_completed} test
      </p>
    </div>

    {/* XP + Level badge */}
    <div className="flex-shrink-0 text-right">
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${levelGrad(row.level)} text-white text-[10px] font-bold mb-0.5`}
      >
        ⭐ {row.level}
      </div>
      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular-nums">
        {row.total_xp.toLocaleString()} XP
      </p>
    </div>
  </motion.div>
)

// ── Page ──────────────────────────────────────────────────────────────────────
const LeaderboardPage: React.FC = () => {
  const { telegramId } = useProgressStore()

  const [top10,     setTop10]     = useState<LeaderRow[]>([])
  const [selfRank,  setSelfRank]  = useState<number | null>(null)
  const [selfRow,   setSelfRow]   = useState<LeaderRow | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState(0)

  const fetchLeaderboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('__not_configured__')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Top 10
      const { data: top, error: topErr } = await supabase
        .from('profiles')
        .select('telegram_id, first_name, username, total_xp, focus_seconds, level, quizzes_completed')
        .order('total_xp', { ascending: false })
        .limit(10)

      if (topErr) throw topErr
      setTop10(top ?? [])

      // Check if current user is in top 10
      const inTop = (top ?? []).some((r) => r.telegram_id === telegramId)

      if (!inTop && telegramId) {
        // Fetch user's own row
        const { data: me } = await supabase
          .from('profiles')
          .select('telegram_id, first_name, username, total_xp, focus_seconds, level, quizzes_completed')
          .eq('telegram_id', telegramId)
          .single()

        if (me) {
          setSelfRow(me)
          // Count users with more XP to determine rank
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gt('total_xp', me.total_xp)
          setSelfRank((count ?? 0) + 1)
        }
      } else {
        setSelfRow(null)
        setSelfRank(null)
      }

      setLastFetch(Date.now())
    } catch (err: any) {
      const msg = err?.message || err?.error_description || String(err)
      // Table doesn't exist yet → tell user to run the schema
      if (msg.includes('relation') && msg.includes('does not exist')) {
        setError('__no_table__')
      } else {
        setError(msg || "Noma'lum xato")
      }
    } finally {
      setLoading(false)
    }
  }, [telegramId])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  const timeAgo = lastFetch
    ? `${Math.round((Date.now() - lastFetch) / 1000)}s oldin yangilandi`
    : ''

  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-4">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-1"
      >
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          🏆 Liderlar Jadvali
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Eng ko'p XP to'plagan o'quvchilar
        </p>
      </motion.div>

      {/* Refresh */}
      <div className="flex justify-end items-center gap-2">
        {lastFetch > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600">{timeAgo}</span>
        )}
        <button
          onClick={fetchLeaderboard}
          disabled={loading}
          className="text-xs text-blue-500 dark:text-blue-400 font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? '⏳ Yuklanmoqda…' : '🔄 Yangilash'}
        </button>
      </div>

      {/* Error — not configured */}
      {error === '__not_configured__' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-300">⚙️ Supabase sozlanmagan</p>
          <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
            Liderlar jadvalini ko'rsatish uchun quyidagi sozlamalarni Vercel-ga qo'shing:
          </p>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 font-mono text-xs space-y-1 text-gray-700 dark:text-gray-300">
            <p>VITE_SUPABASE_URL = https://xxxx.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY = eyJ...</p>
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-500">
            Supabase → Project Settings → API → Project URL &amp; anon key
          </p>
        </div>
      )}

      {/* Error — table missing (SQL schema not run) */}
      {error === '__no_table__' && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-orange-900 dark:text-orange-300">🗄️ Jadval yaratilmagan</p>
          <p className="text-xs text-orange-800 dark:text-orange-400 leading-relaxed">
            Supabase SQL Editor-da <strong>supabase_schema.sql</strong> faylini ishga tushiring:
          </p>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 font-mono text-xs text-gray-700 dark:text-gray-300">
            Supabase → SQL Editor → New Query →<br />
            supabase_schema.sql kontentini joylashtiring → Run
          </div>
          <button
            onClick={fetchLeaderboard}
            className="text-xs text-orange-600 dark:text-orange-400 font-semibold underline"
          >
            Qayta urinib ko'rish
          </button>
        </div>
      )}

      {/* Error — generic */}
      {error && error !== '__not_configured__' && error !== '__no_table__' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-red-800 dark:text-red-300">❌ Xato yuz berdi</p>
          <p className="text-xs text-red-700 dark:text-red-400 font-mono break-all">{error}</p>
          <button
            onClick={fetchLeaderboard}
            className="text-xs text-red-600 dark:text-red-400 font-semibold underline"
          >
            Qayta urinib ko'rish
          </button>
        </div>
      )}

      {/* Top 10 list */}
      {!loading && !error && top10.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-700">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Hali hech kim ro'yxatga kirmagan.
            <br />Birinchi bo'ling!
          </p>
        </div>
      )}

      {top10.length > 0 && (
        <div className="space-y-2">
          {top10.map((row, i) => (
            <LeaderRow
              key={row.telegram_id}
              row={row}
              rank={i + 1}
              isSelf={row.telegram_id === telegramId}
              animDelay={i * 0.06}
            />
          ))}
        </div>
      )}

      {/* Current user outside top 10 */}
      {selfRow && selfRank && (
        <>
          <div className="flex items-center gap-2 my-2">
            <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">sizning o'rningiz</span>
            <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
          </div>
          <LeaderRow
            row={selfRow}
            rank={selfRank}
            isSelf
            animDelay={0}
          />
        </>
      )}

      {/* Motivational footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl p-4 text-center border border-gray-100 dark:border-gray-700"
      >
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          🧑‍💻 Sam aytmoqda:
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          "Reyting — g'ayrat uchun, bilim — hayot uchun. Ikkalasini ham qozon! 💪"
        </p>
      </motion.div>

    </div>
  )
}

export default LeaderboardPage
