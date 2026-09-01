/**
 * DailyQuizRightSidebar — right sidebar for /5-savol (desktop only, xl+).
 *
 * Cards:
 *   1. "5 Savol haqida" — static rules/info card
 *   2. "Bugungi reyting" — today's leaderboard, fetched independently of
 *      DailyQuizPage (same self-contained-sidebar pattern as every other
 *      *RightSidebar in this folder — see CoursesRightSidebar/
 *      WorkspaceRightSidebar, neither of which receives props from its page).
 */
import React, { useEffect, useState } from 'react'
import { Flame, Coins, Clock, Users } from 'lucide-react'
import apiService from '../../services/apiService'
import { useAuth } from '../../context/AuthContext'
import SidebarCard from './SidebarCard'

interface LeaderboardEntry {
  rank: number
  user_id: number
  first_name: string
  photo_url: string | null
  correct_count: number
  elapsed_ms: number
}

type LbState = 'loading' | 'not_played' | 'ready' | 'error'

function fmtElapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `${rem}s`
}

const LB_LIMIT = 8

const DailyQuizRightSidebar: React.FC = () => {
  const { user } = useAuth()
  const [state, setState] = useState<LbState>('loading')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [caller, setCaller] = useState<{ rank: number; correct_count: number; percentile: number | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    apiService.getDailyQuizToday()
      .then(async ({ data }) => {
        if (cancelled) return
        if (!data.quiz || data.quiz.state !== 'submitted') { setState('not_played'); return }
        const res = await apiService.getDailyQuizResults(data.quiz.id)
        if (cancelled) return
        setLeaderboard(res.data.leaderboard.slice(0, LB_LIMIT))
        setTotalPlayers(res.data.total_players)
        setCaller(res.data.caller)
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  const myRankInList = leaderboard.some(e => e.user_id === user?.id)

  return (
    <>
      <SidebarCard title="5 Savol haqida">
        <div className="space-y-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            Har kuni yangi 5 ta savol — hammaga bir xil, ertalab yangilanadi.
          </p>
          <p className="flex items-start gap-2">
            <Coins className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            To'g'ri javoblar uchun Tanga yutib oling — mukammal natija bonus beradi.
          </p>
          <p className="flex items-start gap-2">
            <Flame className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            Har kuni o'ynab, o'z seriyangizni (streak) saqlang.
          </p>
        </div>
      </SidebarCard>

      <SidebarCard
        title="Bugungi reyting"
        action={totalPlayers > 0 ? (
          <span className="text-[11px] font-medium inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <Users className="h-3 w-3" />{totalPlayers}
          </span>
        ) : undefined}
      >
        {state === 'loading' && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
            ))}
          </div>
        )}

        {state === 'not_played' && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Reytingni ko'rish uchun avval bugungi 5 ta savolga javob bering.
          </p>
        )}

        {state === 'error' && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Reyting yuklanmadi.</p>
        )}

        {state === 'ready' && (
          <div className="space-y-0.5">
            {leaderboard.map(entry => {
              const isMe = entry.user_id === user?.id
              return (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg"
                  style={isMe ? { background: 'var(--brand-subtle)' } : undefined}
                >
                  <span className="w-4 text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {entry.rank}
                  </span>
                  {entry.photo_url ? (
                    <img src={entry.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                    >
                      {(entry.first_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span
                    className="flex-1 min-w-0 truncate text-xs"
                    style={{ color: isMe ? 'var(--brand-primary)' : 'var(--text-primary)', fontWeight: isMe ? 700 : 500 }}
                  >
                    {entry.first_name}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {entry.correct_count}/5
                  </span>
                </div>
              )
            })}

            {caller && !myRankInList && (
              <div
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg mt-1 pt-2 border-t"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <span className="w-4 text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                  {caller.rank}
                </span>
                <span className="flex-1 min-w-0 truncate text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
                  Siz
                </span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {caller.correct_count}/5
                </span>
              </div>
            )}
          </div>
        )}
      </SidebarCard>
    </>
  )
}

export default DailyQuizRightSidebar
