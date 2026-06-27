import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TrophyIcon, UsersIcon, ClockIcon } from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { getProfileSkin } from '../utils/profileSkins'
import { getLevelTitle } from '../utils/levelTitles'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
type TabKey = 'global' | 'friends'
type Period  = 'week' | 'month' | 'all'

interface Entry {
  rank:         number
  telegram_id:  number
  first_name:   string
  username:     string
  photo_url:    string | null
  level:        number
  score:        number
  minutes:      number
  account_type: string
  is_me:        boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string }[] = [
  { key: 'global',  label: 'Global'   },
  { key: 'friends', label: "Do'stlar" },
]

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week',  label: 'Bu hafta' },
  { key: 'month', label: 'Bu oy'    },
  { key: 'all',   label: 'Hammasi'  },
]

const MEDALS = ['🥇', '🥈', '🥉']

// ── Helpers ───────────────────────────────────────────────────────────────────
function levelGrad(level: number): string {
  if (level >= 50) return 'from-amber-300 to-yellow-600'
  if (level >= 40) return 'from-rose-500 to-pink-700'
  if (level >= 30) return 'from-indigo-500 to-violet-700'
  if (level >= 25) return 'from-fuchsia-400 to-purple-600'
  if (level >= 20) return 'from-rose-400 to-pink-600'
  if (level >= 15) return 'from-indigo-400 to-violet-600'
  if (level >= 10) return 'from-orange-400 to-red-500'
  if (level >= 7)  return 'from-yellow-400 to-amber-500'
  if (level >= 5)  return 'from-purple-400 to-purple-600'
  if (level >= 3)  return 'from-blue-400 to-blue-600'
  return 'from-gray-400 to-gray-500'
}

function formatMinutes(min: number): string {
  if (!min || min <= 0) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}s ${m}m` : `${h}s`
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const Avatar: React.FC<{ entry: Entry; size?: 'sm' | 'md' | 'lg'; isSelf?: boolean }> = ({
  entry, size = 'md', isSelf,
}) => {
  const [err, setErr] = useState(false)
  const skin = getProfileSkin({ level: entry.level, totalXP: entry.score, quizzesCompleted: 0, focusSeconds: entry.minutes * 60 })
  const px = size === 'lg' ? 'w-14 h-14' : size === 'md' ? 'w-10 h-10' : 'w-9 h-9'
  const ring = isSelf ? 'ring-2 ring-sahifa-500' : ''
  return (
    <div className="relative flex-shrink-0">
      {entry.photo_url && !err ? (
        <img src={entry.photo_url} alt={entry.first_name} onError={() => setErr(true)}
          className={`${px} rounded-xl object-cover ${skin.borderClass} ${ring}`} />
      ) : (
        <div className={`${px} rounded-xl bg-gradient-to-br ${levelGrad(entry.level)} flex items-center justify-center ${skin.borderClass} ${ring}`}>
          <span className="text-white font-black" style={{ fontSize: size === 'lg' ? 20 : size === 'md' ? 15 : 13 }}>
            {(entry.first_name || '?').charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute -bottom-0.5 -right-0.5 text-[9px] bg-white dark:bg-[#111] rounded-full w-4 h-4 flex items-center justify-center border border-gray-100 dark:border-gray-800">
        {skin.emoji}
      </div>
    </div>
  )
}

// ── Podium (top 3) ────────────────────────────────────────────────────────────
const Podium: React.FC<{ top3: Entry[]; selfId: number | null; onPress: (id: number) => void }> = ({ top3, selfId, onPress }) => {
  if (top3.length === 0) return null
  const [first, second, third] = top3

  const PodiumItem = ({ entry, rank }: { entry: Entry; rank: 1 | 2 | 3 }) => {
    const isSelf = entry.telegram_id === selfId
    const barH = rank === 1 ? 'h-20' : rank === 2 ? 'h-14' : 'h-10'
    const barColor = rank === 1
      ? 'bg-amber-400/80 dark:bg-amber-500/40'
      : rank === 2
      ? 'bg-slate-300/80 dark:bg-slate-600/40'
      : 'bg-amber-700/60 dark:bg-amber-900/40'
    return (
      <div className={`flex flex-col items-center gap-1 ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}>
        <button onClick={() => onPress(entry.telegram_id)} className="flex flex-col items-center gap-1 active:opacity-70 transition-opacity">
          {rank === 1 && <span className="text-xl mb-0.5">👑</span>}
          <Avatar entry={entry} size={rank === 1 ? 'lg' : 'md'} isSelf={isSelf} />
          <p className={`text-[11px] font-semibold max-w-[72px] text-center truncate ${isSelf ? 'text-sahifa-500' : 'text-gray-800 dark:text-white'}`}>
            {entry.first_name}{isSelf ? ' (siz)' : ''}
          </p>
          <p className="text-[11px] font-bold text-sahifa-500 tabular-nums">{entry.score.toLocaleString()} XP</p>
          {formatMinutes(entry.minutes) && (
            <p className="text-[10px] text-gray-400">⏱ {formatMinutes(entry.minutes)}</p>
          )}
          <span className="text-xl">{MEDALS[rank - 1]}</span>
        </button>
        <div className={`w-16 ${barH} ${barColor} rounded-t-xl`} />
      </div>
    )
  }

  return (
    <div className="flex items-end justify-center gap-4 px-4 pt-4 pb-0 bg-white/60 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5">
      {second && <PodiumItem entry={second} rank={2} />}
      <PodiumItem entry={first} rank={1} />
      {third && <PodiumItem entry={third} rank={3} />}
    </div>
  )
}

// ── List Row ──────────────────────────────────────────────────────────────────
const Row: React.FC<{ entry: Entry; selfId: number | null; delay: number; onPress: (id: number) => void }> = ({ entry, selfId, delay, onPress }) => {
  const isSelf = entry.telegram_id === selfId
  const skin = getProfileSkin({ level: entry.level, totalXP: entry.score, quizzesCompleted: 0, focusSeconds: entry.minutes * 60 })
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      onClick={() => onPress(entry.telegram_id)}
      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer active:opacity-70 transition-all ${
        isSelf
          ? 'bg-sahifa-50 dark:bg-sahifa-900/20 border-sahifa-200 dark:border-sahifa-700/50'
          : 'bg-white dark:bg-[#1A1A1A] border-slate-100 dark:border-[#2A2A2A]'
      }`}
    >
      <div className="w-7 flex-shrink-0 flex items-center justify-center">
        {entry.rank <= 3
          ? <span className="text-lg">{MEDALS[entry.rank - 1]}</span>
          : <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{entry.rank}</span>
        }
      </div>

      <Avatar entry={entry} size="sm" isSelf={isSelf} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isSelf ? 'text-sahifa-600 dark:text-sahifa-400' : 'text-gray-900 dark:text-white'}`}>
          {entry.first_name}{isSelf ? ' (siz)' : ''}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
          {skin.emoji} {skin.name}
          {formatMinutes(entry.minutes) ? ` · ⏱ ${formatMinutes(entry.minutes)}` : ''}
        </p>
      </div>

      <div className="flex-shrink-0 text-right">
        <div className={`inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r ${levelGrad(entry.level)} text-white text-[10px] font-bold mb-0.5`}>
          {getLevelTitle(entry.level)}
        </div>
        <p className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums">
          {entry.score.toLocaleString()} XP
        </p>
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const LeaderboardPage: React.FC = () => {
  const { user: authUser } = useAuth()
  const navigate = useNavigate()
  const selfId: number | null = authUser?.id ?? null

  const goToProfile = useCallback((id: number) => navigate(`/profile/${id}`), [navigate])

  const [tab,     setTab]     = useState<TabKey>('global')
  const [period,  setPeriod]  = useState<Period>('week')
  const [entries, setEntries] = useState<Entry[]>([])
  const [myRank,  setMyRank]  = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(async (t: TabKey, p: Period) => {
    setLoading(true)
    setError(false)
    try {
      const res = await apiService.getLeaderboard(t, p)
      setEntries(res.data.entries ?? [])
      setMyRank(res.data.my_rank ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab, period) }, [tab, period, load])

  const top3      = entries.slice(0, 3)
  const rest      = entries.slice(3)
  const selfEntry = entries.find(e => e.is_me)

  return (
    <PageWrapper className="space-y-4">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-glow-sm">
          <TrophyIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">Reyting</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">Eng ko'p XP to'plagan o'quvchilar</p>
        </div>
      </motion.div>

      {/* Tab bar: Global | Do'stlar */}
      <div className="flex border-b border-slate-200 dark:border-[#2A2A2A]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors relative ${
              tab === t.key
                ? 'text-sahifa-600 dark:text-sahifa-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t.key === 'friends' && <UsersIcon className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
            {t.label}
            {tab === t.key && (
              <motion.div layoutId="lb-tab-line" className="absolute bottom-0 inset-x-0 h-0.5 bg-sahifa-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Period pills: Bu hafta | Bu oy | Hammasi */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              period === p.key
                ? 'bg-sahifa-500 text-white shadow'
                : 'bg-slate-100 dark:bg-[#1A1A1A] text-gray-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-[#222]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-52 rounded-2xl bg-slate-100 dark:bg-[#1A1A1A]" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-14 rounded-2xl bg-slate-100 dark:bg-[#1A1A1A]" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Xatolik yuz berdi</p>
          <button onClick={() => load(tab, period)} className="text-xs text-red-600 dark:text-red-400 underline">
            Qayta urinib ko'rish
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && entries.length === 0 && (
        <div className="py-16 text-center space-y-2">
          {tab === 'friends' ? (
            <>
              <UsersIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Hali do'stlar yo'q</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Boshqa foydalanuvchilarga obuna bo'ling</p>
            </>
          ) : (
            <>
              <TrophyIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Hali ma'lumot yo'q</p>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {!loading && !error && entries.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tab}-${period}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {/* Podium: top 3 */}
            <Podium top3={top3} selfId={selfId} onPress={goToProfile} />

            {/* Rows: 4th place and below */}
            {rest.map((e, i) => (
              <Row key={e.telegram_id} entry={e} selfId={selfId} delay={i * 0.04} onPress={goToProfile} />
            ))}

            {/* My rank if outside visible list */}
            {selfId && !selfEntry && myRank && (
              <>
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                  <span className="text-[10px] text-gray-400">sizning o'rningiz</span>
                  <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                </div>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-sahifa-50 dark:bg-sahifa-900/20 border border-sahifa-200 dark:border-sahifa-700/50">
                  <span className="text-xs font-bold text-sahifa-500 w-7 text-center">#{myRank}</span>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-sm">
                      {(authUser?.first_name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-sahifa-600 dark:text-sahifa-400">
                      {authUser?.first_name} (siz)
                    </p>
                    <p className="text-[10px] text-gray-400 inline-flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      {period === 'week' ? 'haftalik reyting' : period === 'month' ? 'oylik reyting' : 'umumiy reyting'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

    </PageWrapper>
  )
}

export default LeaderboardPage
