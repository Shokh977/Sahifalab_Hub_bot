/**
 * ProfilePage — Mobile-app-style gamification profile.
 * Handles both own profile (/profile/me) and public profiles (/profile/:userId).
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Share2, Settings, ChevronRight, Loader2, AlertCircle, Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import { getLevelTitle, LEVEL_TITLES } from '../utils/levelTitles'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  telegram_id: number
  first_name: string
  username: string | null
  photo_url: string | null
  account_type: string
  level: number
  total_xp: number
  next_level_xp: number
  xp_percent: number
  focus_hours: number
  streak_days: number
  followers_count: number
  following_count: number
  is_following: boolean
  bio: string | null
  headline: string | null
  mutual_connections: number
  courses_completed: number
  certificates: Array<{ id: number; course_title: string }>
  rank?: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function levelEmoji(level: number): string {
  if (level <= 2)  return '🌱'
  if (level <= 5)  return '⚔️'
  if (level <= 8)  return '🛡️'
  if (level <= 11) return '🔮'
  if (level <= 14) return '📚'
  if (level <= 17) return '⚡'
  if (level <= 20) return '🌟'
  if (level <= 24) return '🔥'
  if (level <= 27) return '👑'
  return '🏆'
}

function tierBg(level: number): string {
  if (level <= 5)  return 'bg-blue-500/20 border-blue-500/30 text-blue-300'
  if (level <= 10) return 'bg-purple-500/20 border-purple-500/30 text-purple-300'
  if (level <= 15) return 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
  if (level <= 20) return 'bg-rose-500/20 border-rose-500/30 text-rose-300'
  if (level <= 25) return 'bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300'
  return 'bg-amber-500/20 border-amber-500/30 text-amber-300'
}

function normalizeProfile(raw: any): ProfileData {
  return {
    telegram_id:      raw.telegram_id ?? raw.id ?? 0,
    first_name:       raw.first_name ?? raw.name ?? '',
    username:         raw.username ?? null,
    photo_url:        raw.photo_url ?? null,
    account_type:     raw.account_type ?? 'student',
    level:            raw.level ?? 1,
    total_xp:         raw.total_xp ?? raw.xp ?? 0,
    next_level_xp:    raw.next_level_xp ?? 0,
    xp_percent:       raw.xp_percent ?? 0,
    focus_hours:      raw.focus_hours ?? 0,
    streak_days:      raw.streak_days ?? 0,
    followers_count:  raw.followers_count ?? 0,
    following_count:  raw.following_count ?? 0,
    is_following:     raw.is_following ?? false,
    bio:              raw.bio ?? null,
    headline:         raw.headline ?? null,
    mutual_connections: raw.mutual_connections ?? 0,
    courses_completed: raw.courses_completed ?? 0,
    certificates:     Array.isArray(raw.certificates) ? raw.certificates : [],
    rank:             raw.rank ?? null,
  }
}

// ─── Avatar (simple, own profile) ─────────────────────────────────────────────

const SimpleAvatar: React.FC<{ photoUrl: string | null; name: string; size?: number }> = ({
  photoUrl, name, size = 64,
}) => (
  <div
    className="rounded-full overflow-hidden bg-[#24253a] border-2 border-white/10 flex-shrink-0"
    style={{ width: size, height: size }}
  >
    {photoUrl
      ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
          <span className="text-white font-bold" style={{ fontSize: size * 0.38 }}>
            {(name || '?').charAt(0).toUpperCase()}
          </span>
        </div>
    }
  </div>
)

// ─── XP Ring Avatar (SVG, public profile) ─────────────────────────────────────

const XPRingAvatar: React.FC<{ photoUrl: string | null; name: string; xpPercent: number; size?: number }> = ({
  photoUrl, name, xpPercent, size = 72,
}) => {
  const strokeW = 3
  const gap = 2
  const outer = size + 2 * (strokeW + gap)
  const r = outer / 2 - strokeW / 2
  const circ = 2 * Math.PI * r
  const dash = (xpPercent / 100) * circ

  return (
    <div className="relative flex-shrink-0" style={{ width: outer, height: outer }}>
      <svg width={outer} height={outer} className="absolute inset-0 -rotate-90">
        <circle cx={outer / 2} cy={outer / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} />
        <motion.circle cx={outer / 2} cy={outer / 2} r={r} fill="none"
          stroke="#e8792f" strokeWidth={strokeW} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} />
      </svg>
      <div
        className="absolute overflow-hidden bg-[#24253a]"
        style={{ inset: strokeW + gap, borderRadius: '50%' }}
      >
        {photoUrl
          ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
              <span className="text-white font-bold" style={{ fontSize: size * 0.35 }}>
                {(name || '?').charAt(0).toUpperCase()}
              </span>
            </div>
        }
      </div>
    </div>
  )
}

// ─── Level Grid (29 levels) ───────────────────────────────────────────────────

const LevelGrid: React.FC<{ userLevel: number }> = ({ userLevel }) => (
  <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4">
    <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">Yutuqlar</h2>
    <div className="grid grid-cols-5 gap-1.5">
      {LEVEL_TITLES.map(({ level, title }) => {
        const unlocked = level < userLevel
        const current  = level === userLevel
        const locked   = level > userLevel
        const colorCls = unlocked || current ? tierBg(level) : 'bg-white/[0.03] border-white/[0.06] text-white/20'
        return (
          <div
            key={level}
            className={`relative flex flex-col items-center justify-center p-1.5 rounded-xl border text-center ${colorCls} ${
              current ? 'ring-2 ring-[#e8792f] shadow-[0_0_8px_rgba(232,121,47,0.4)]' : ''
            }`}
          >
            {current && (
              <motion.div
                className="absolute inset-0 rounded-xl bg-[#e8792f]/10"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
            <span className={`text-base leading-none relative z-10 ${locked ? 'opacity-40' : ''}`}>
              {levelEmoji(level)}
            </span>
            {locked && (
              <span className="absolute top-0.5 right-0.5 text-[8px] leading-none z-10">🔒</span>
            )}
            <span className="text-[8px] mt-1 font-medium leading-tight truncate w-full text-center relative z-10">
              {title}
            </span>
            <span className="text-[7px] opacity-50 relative z-10">Lv.{level}</span>
          </div>
        )
      })}
    </div>
  </div>
)

// ─── Level Card (own profile) ─────────────────────────────────────────────────

const LevelCard: React.FC<{ profile: ProfileData }> = ({ profile }) => (
  <div className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-orange-50 to-white border border-orange-200/60 dark:from-[#e8792f]/[0.12] dark:to-[#1c1d27] dark:border-[#e8792f]/20">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl">{levelEmoji(profile.level)}</span>
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">{getLevelTitle(profile.level)}</p>
          <p className="text-[10px] text-gray-400 dark:text-white/40">Lv.{profile.level}</p>
        </div>
      </div>
      <span className="text-xs text-gray-400 dark:text-white/30">{profile.xp_percent ?? 0}%</span>
    </div>

    <div className="space-y-1">
      <div className="h-2 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${profile.xp_percent ?? 0}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full bg-gradient-to-r from-[#e8792f] to-[#f59e0b]"
        />
      </div>
      <p className="text-[10px] text-gray-400 dark:text-white/30">
        {(profile.total_xp ?? 0).toLocaleString()} / {(profile.next_level_xp ?? 0).toLocaleString()} XP
      </p>
    </div>

    <div className="h-px bg-gray-200 dark:bg-white/[0.06]" />
    <div className="grid grid-cols-4 gap-1 text-center">
      {[
        { icon: '📊', label: 'Reyting', value: profile.rank ? `#${profile.rank}` : '—' },
        { icon: '⚡', label: 'XP', value: (profile.total_xp ?? 0).toLocaleString() },
        { icon: '⏱', label: 'Fokus', value: `${profile.focus_hours ?? 0}h` },
        { icon: '🔥', label: 'Seriya', value: `${profile.streak_days ?? 0}k` },
      ].map(s => (
        <div key={s.label}>
          <p className="text-base leading-none">{s.icon}</p>
          <p className="text-[11px] font-bold text-gray-800 dark:text-white mt-1">{s.value}</p>
          <p className="text-[9px] text-gray-400 dark:text-white/30 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  </div>
)

// ─── Trophy Room (public profile) ────────────────────────────────────────────

const TrophyRoom: React.FC<{ profile: ProfileData }> = ({ profile }) => (
  <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4 space-y-3">
    <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Trofey xonasi</h2>

    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white/70 font-medium">
          {levelEmoji(profile.level)} Lv.{profile.level} · {getLevelTitle(profile.level)}
        </span>
        <span className="text-white/30">{profile.xp_percent ?? 0}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${profile.xp_percent ?? 0}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full bg-gradient-to-r from-[#e8792f] to-[#f59e0b]"
        />
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2 pt-1">
      {[
        { icon: '🔥', label: 'Seriya', value: `${profile.streak_days ?? 0} kun` },
        { icon: '⏱', label: 'Fokus', value: `${profile.focus_hours ?? 0}h` },
        { icon: '🎓', label: 'Kurslar', value: (profile.courses_completed ?? 0).toString() },
      ].map(s => (
        <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5 text-center">
          <p className="text-base leading-none">{s.icon}</p>
          <p className="text-sm font-bold text-white mt-1">{s.value}</p>
          <p className="text-[9px] text-white/30 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  </div>
)

// ─── Main Component ───────────────────────────────────────────────────────────

const ProfilePage: React.FC = () => {
  const { userId: rawParam } = useParams<{ userId: string }>()
  const { user: authUser, isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile]         = useState<ProfileData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)

  const myId = (authUser as any)?.telegram_id ?? (authUser as any)?.id

  if (rawParam === 'me' && !authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const profileApiPath = rawParam === 'me'
    ? '/api/profile/me'
    : `/api/v1/social/users/${rawParam}/profile`

  // ── Fetch profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawParam) return
    if (rawParam === 'me' && authLoading) return
    setLoading(true)
    setError(null)
    api.client.get(profileApiPath)
      .then(r => {
        const data = normalizeProfile(r.data)
        setProfile(data)
        const resolvedId = r.data.telegram_id ?? r.data.id
        const isOwn = rawParam === 'me' || (!!myId && resolvedId === myId)
        if (isOwn) {
          api.client.get('/api/leaderboard', { params: { scope: 'global', period: 'week' } })
            .then(lr => setProfile(p => p ? { ...p, rank: lr.data?.my_rank ?? null } : p))
            .catch(() => {})
        }
      })
      .catch(() => setError('Profil topilmadi'))
      .finally(() => setLoading(false))
  }, [profileApiPath, authLoading])

  // ── Follow / Unfollow ──────────────────────────────────────────────────────
  const handleFollow = useCallback(async () => {
    if (!profile || !isAuthenticated) { navigate('/login'); return }
    setFollowLoading(true)
    try {
      if (profile.is_following) {
        await api.client.delete(`/api/v1/social/users/${profile.telegram_id}/follow`)
        setProfile(p => p ? { ...p, is_following: false, followers_count: Math.max(0, p.followers_count - 1) } : p)
      } else {
        await api.client.post(`/api/v1/social/users/${profile.telegram_id}/follow`)
        setProfile(p => p ? { ...p, is_following: true, followers_count: p.followers_count + 1 } : p)
      }
    } catch {}
    setFollowLoading(false)
  }, [profile, isAuthenticated, navigate])

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    if (!profile) return
    const url = `${window.location.origin}/profile/${profile.username || profile.telegram_id}`
    if (navigator.share) navigator.share({ title: profile.first_name, url }).catch(() => {})
    else navigator.clipboard.writeText(url).catch(() => {})
  }, [profile])

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-7 h-7 animate-spin text-white/20" />
    </div>
  )
  if (error || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <AlertCircle className="w-10 h-10 text-white/20" />
      <p className="text-white/40 text-sm">{error || 'Profil topilmadi'}</p>
      <button onClick={() => navigate(-1)} className="text-[#e8792f] text-sm hover:underline">Orqaga</button>
    </div>
  )

  const isOwn = rawParam === 'me' || (!!myId && profile.telegram_id === myId)

  // ════════════════════════════════════════════════════════════════════════════
  // OWN PROFILE
  // ════════════════════════════════════════════════════════════════════════════
  if (isOwn) return (
    <div className="space-y-3 pb-8">
      {/* Header row */}
      <div className="flex items-center gap-4 pt-2">
        <SimpleAvatar photoUrl={profile.photo_url} name={profile.first_name} size={64} />

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white leading-tight truncate">{profile.first_name}</h1>
          {profile.username && (
            <p className="text-xs text-white/40 mt-0.5">@{profile.username}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-white/50">
            <span>
              <span className="font-semibold text-white">{profile.followers_count}</span> kuzatuvchi
            </span>
            <span className="text-white/20">·</span>
            <span className="font-semibold text-white">{profile.following_count}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleShare}
            className="p-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/settings')}
            className="p-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Edit profile button */}
      <button
        onClick={() => navigate('/settings/profile')}
        className="w-full py-2.5 rounded-xl border border-white/[0.12] bg-white/[0.03] text-sm font-medium text-white/70 hover:bg-white/[0.07] transition-colors"
      >
        Profilni tahrirlash
      </button>

      {/* Level card */}
      <div>
        <h2 className="text-[10px] font-bold text-gray-400 dark:text-white/30 uppercase tracking-widest mb-2">Daraja kartochkasi</h2>
        <LevelCard profile={profile} />
      </div>

      {/* Quick links */}
      <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] divide-y divide-white/[0.05] overflow-hidden">
        <button onClick={() => navigate('/saved')}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors text-left">
          <span className="text-lg w-6 text-center leading-none">❤️</span>
          <span className="flex-1 text-sm font-medium text-white">Sevimli</span>
          <span className="text-xs text-white/40 mr-1">Saqlangan</span>
          <ChevronRight className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
        </button>
      </div>

      {/* Level achievement grid */}
      <LevelGrid userLevel={profile.level} />
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC PROFILE
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3 pb-8">
      {/* Top nav */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button onClick={handleShare}
          className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Profile header */}
      <div className="flex items-start gap-4">
        <XPRingAvatar
          photoUrl={profile.photo_url}
          name={profile.first_name}
          xpPercent={profile.xp_percent ?? 0}
          size={72}
        />

        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-white leading-tight">{profile.first_name}</h1>
            {profile.account_type === 'teacher' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8792f]/10 text-[#e8792f] border border-[#e8792f]/20 flex-shrink-0">
                ★ O'qituvchi
              </span>
            )}
          </div>
          {profile.username && <p className="text-xs text-white/40 mt-0.5">@{profile.username}</p>}
          {profile.headline && <p className="text-xs text-[#e8792f] mt-1 font-medium leading-snug">{profile.headline}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/50">
            <span>
              <span className="font-semibold text-white">{profile.followers_count}</span> kuzatuvchi
            </span>
            <span className="text-white/20">·</span>
            <span className="font-semibold text-white">{profile.following_count}</span>
          </div>
          {profile.mutual_connections > 0 && (
            <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> {profile.mutual_connections} ta umumiy kuzatuvchi
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleFollow}
          disabled={followLoading}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
            profile.is_following
              ? 'bg-white/[0.06] border border-white/[0.12] text-white/70 hover:bg-white/[0.10]'
              : 'bg-[#e8792f] hover:bg-[#c44a1a] text-white'
          }`}
        >
          {followLoading
            ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            : profile.is_following ? 'Kuzatilmoqda' : 'Kuzatish'
          }
        </button>
        <button
          onClick={() => navigate('/leaderboard')}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.10] transition-colors"
        >
          Solishtirish
        </button>
      </div>

      {/* Trophy room */}
      <TrophyRoom profile={profile} />

      {/* Bio */}
      {profile.bio && (
        <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4">
          <p className="text-sm text-white/65 leading-relaxed whitespace-pre-line">{profile.bio}</p>
        </div>
      )}

      {/* Certificates */}
      {profile.certificates.length > 0 && (
        <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4">
          <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">Sertifikatlar</h2>
          <div className="space-y-2">
            {profile.certificates.slice(0, 5).map(cert => (
              <div key={cert.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#e8792f]/10 border border-[#e8792f]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🏅</span>
                </div>
                <p className="text-sm text-white/80 truncate">{cert.course_title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfilePage
