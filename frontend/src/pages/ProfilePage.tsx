/**
 * ProfilePage — LinkedIn-style profile. Handles both own profile (/profile/me)
 * and public profiles (/profile/:userId) via the same rich endpoint
 * (GET /api/profile/{username_or_id}) — it already returns viewer-relationship
 * fields (is_following, can_message, connection_status) for any caller, so
 * there's no separate "slim" fetch path anymore.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Share2, Settings, Loader2, AlertCircle, Users, Eye,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import ProfileHeaderCard from '../components/ProfileHeaderCard'
import type { ProfileHeaderData } from '../components/ProfileHeaderCard'
import AboutSection from '../components/profile/AboutSection'
import GamificationCard from '../components/profile/GamificationCard'
import ExperienceSection from '../components/profile/ExperienceSection'
import EducationSection from '../components/profile/EducationSection'
import SkillsSection from '../components/profile/SkillsSection'
import CertificatesSection from '../components/profile/CertificatesSection'
import RecentActivityPreview from '../components/profile/RecentActivityPreview'
import type { ExperienceItem } from '../components/profile/ExperienceModal'
import type { EducationItem } from '../components/profile/EducationModal'
import type { SkillItem } from '../components/profile/SkillsSection'
import type { CertificateItem } from '../components/profile/CertificatesSection'
import type { ActivityItem } from '../components/profile/RecentActivityPreview'
import FollowListModal from '../components/social/FollowListModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  telegram_id: number
  first_name: string
  username: string | null
  photo_url: string | null
  cover_image_url: string | null
  headline: string | null
  bio: string | null
  location_city: string | null
  website_url: string | null
  account_type: string
  is_verified: boolean

  level: number
  level_name: string | null
  total_xp: number
  next_level_xp: number
  xp_percent: number

  focus_hours: number
  streak_days: number
  longest_streak: number
  profile_views: number
  profile_views_week: number
  posts_count: number

  connections_count: number
  mutual_connections: number

  followers_count: number
  following_count: number

  is_following: boolean
  can_message: boolean
  connection_status: 'own' | 'none' | 'accepted' | 'pending_sent' | 'pending_received'
  connection_id: number | null

  skills: SkillItem[]
  experiences: ExperienceItem[]
  education: EducationItem[]
  certificates: CertificateItem[]
  recent_activity: ActivityItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeProfile(raw: any): ProfileData {
  return {
    telegram_id:       raw.telegram_id ?? 0,
    first_name:        raw.first_name ?? '',
    username:          raw.username ?? null,
    photo_url:         raw.photo_url ?? null,
    cover_image_url:   raw.cover_image_url ?? null,
    headline:          raw.headline ?? null,
    bio:               raw.bio ?? null,
    location_city:     raw.location_city ?? null,
    website_url:       raw.website_url ?? null,
    account_type:      raw.account_type ?? 'student',
    is_verified:       raw.is_verified ?? false,

    level:             raw.level ?? 1,
    level_name:        raw.level_name ?? null,
    total_xp:          raw.total_xp ?? 0,
    next_level_xp:     raw.next_level_xp ?? 0,
    xp_percent:        raw.xp_percent ?? 0,

    focus_hours:       raw.focus_hours ?? 0,
    streak_days:       raw.streak_days ?? 0,
    longest_streak:    raw.longest_streak ?? raw.streak_days ?? 0,
    profile_views:     raw.profile_views ?? 0,
    profile_views_week: raw.profile_views_week ?? 0,
    posts_count:       raw.posts_count ?? 0,

    connections_count:  raw.connections_count ?? 0,
    mutual_connections: raw.mutual_connections ?? 0,

    followers_count:   raw.followers_count ?? 0,
    following_count:   raw.following_count ?? 0,

    is_following:      raw.is_following ?? false,
    can_message:       raw.can_message ?? false,
    connection_status: raw.connection_status ?? 'none',
    connection_id:     raw.connection_id ?? null,

    skills:            Array.isArray(raw.skills) ? raw.skills : [],
    experiences:       Array.isArray(raw.experiences) ? raw.experiences : [],
    education:         Array.isArray(raw.education) ? raw.education : [],
    certificates:      Array.isArray(raw.certificates) ? raw.certificates : [],
    recent_activity:   Array.isArray(raw.recent_activity) ? raw.recent_activity : [],
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ProfilePage: React.FC = () => {
  const { userId: rawParam } = useParams<{ userId: string }>()
  const { user: authUser, isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile]     = useState<ProfileData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [followListType, setFollowListType] = useState<'followers' | 'following' | null>(null)

  const myId = (authUser as any)?.telegram_id ?? (authUser as any)?.id

  // ── Fetch profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawParam) return
    if (rawParam === 'me' && authLoading) return
    setLoading(true)
    setError(null)
    api.client.get(`/api/profile/${rawParam}`)
      .then(r => setProfile(normalizeProfile(r.data)))
      .catch(() => setError('Profil topilmadi'))
      .finally(() => setLoading(false))
  }, [rawParam, authLoading])

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

  // ── Mutual connection (request/cancel/accept/decline) ──────────────────────
  const handleConnect = useCallback(async () => {
    if (!profile || !isAuthenticated) { navigate('/login'); return }
    setConnectionLoading(true)
    try {
      const res = await api.client.post('/api/connections/request', { receiver_id: profile.telegram_id })
      setProfile(p => p ? { ...p, connection_status: 'pending_sent', connection_id: res.data.id } : p)
    } catch {}
    setConnectionLoading(false)
  }, [profile, isAuthenticated, navigate])

  const handleCancelConnect = useCallback(async () => {
    if (!profile?.connection_id) return
    setConnectionLoading(true)
    try {
      await api.client.post('/api/connections/cancel', { connection_id: profile.connection_id })
      setProfile(p => p ? { ...p, connection_status: 'none', connection_id: null } : p)
    } catch {}
    setConnectionLoading(false)
  }, [profile])

  const handleAcceptConnect = useCallback(async () => {
    if (!profile?.connection_id) return
    setConnectionLoading(true)
    try {
      await api.client.put(`/api/connections/${profile.connection_id}/accept`)
      setProfile(p => p ? {
        ...p,
        connection_status: 'accepted',
        can_message: true,
        connections_count: p.connections_count + 1,
      } : p)
    } catch {}
    setConnectionLoading(false)
  }, [profile])

  const handleDeclineConnect = useCallback(async () => {
    if (!profile?.connection_id) return
    setConnectionLoading(true)
    try {
      await api.client.put(`/api/connections/${profile.connection_id}/decline`)
      setProfile(p => p ? { ...p, connection_status: 'none', connection_id: null } : p)
    } catch {}
    setConnectionLoading(false)
  }, [profile])

  // ── Message ──────────────────────────────────────────────────────────────
  const handleMessage = useCallback(async () => {
    if (!profile) return
    try {
      const res = await api.client.post(`/api/v1/messenger/conversations/${profile.telegram_id}`)
      navigate(`/messages/${res.data.id}`)
    } catch {}
  }, [profile, navigate])

  // ── Cover photo upload (own profile only) ──────────────────────────────────
  const handleCoverUpload = useCallback(async (file: File) => {
    setCoverUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', 'cover')
      const res = await api.client.post('/api/profile/me/upload', form, {
        headers: { 'Content-Type': undefined },
      })
      setProfile(p => p ? { ...p, cover_image_url: res.data.url } : p)
    } catch {}
    setCoverUploading(false)
  }, [])

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    if (!profile) return
    const url = `${window.location.origin}/profile/${profile.username || profile.telegram_id}`
    if (navigator.share) navigator.share({ title: profile.first_name, url }).catch(() => {})
    else navigator.clipboard.writeText(url).catch(() => {})
  }, [profile])

  // ── Redirect unauthenticated /profile/me (after all hooks above have run,
  // so hook order/count stays identical across every render) ────────────────
  if (rawParam === 'me' && !authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-7 h-7 animate-spin text-gray-300 dark:text-white/20" />
    </div>
  )
  if (error || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <AlertCircle className="w-10 h-10 text-gray-300 dark:text-white/20" />
      <p className="text-gray-400 dark:text-white/40 text-sm">{error || 'Profil topilmadi'}</p>
      <button onClick={() => navigate(-1)} className="text-sahifa-500 text-sm hover:underline">Orqaga</button>
    </div>
  )

  const isOwnProfile = rawParam === 'me' || (!!myId && profile.telegram_id === myId)

  const headerProfile: ProfileHeaderData = {
    telegram_id: profile.telegram_id,
    full_name:   profile.first_name,
    username:    profile.username,
    photo_url:   profile.photo_url,
    role:        profile.account_type,
    account_type: profile.account_type,
    level:       profile.level,
    xp:          profile.total_xp,
    bio:         profile.bio,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    is_following:    profile.is_following,
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Top nav — only meaningful when viewing someone else */}
      {!isOwnProfile && (
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button onClick={handleShare}
            className="p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      )}
      {isOwnProfile && (
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleShare}
            className="p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/settings')}
            className="p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cover + avatar + identity + actions */}
      <ProfileHeaderCard
        profile={headerProfile}
        postCount={profile.posts_count}
        isOwnProfile={isOwnProfile}
        coverImageUrl={profile.cover_image_url}
        onCoverUpload={isOwnProfile ? handleCoverUpload : undefined}
        coverUploading={coverUploading}
        headline={profile.headline}
        locationCity={profile.location_city}
        websiteUrl={profile.website_url}
        onFollow={!isOwnProfile ? handleFollow : undefined}
        followLoading={followLoading}
        connectionStatus={profile.connection_status}
        onConnect={!isOwnProfile ? handleConnect : undefined}
        onCancelConnect={!isOwnProfile ? handleCancelConnect : undefined}
        onAcceptConnect={!isOwnProfile ? handleAcceptConnect : undefined}
        onDeclineConnect={!isOwnProfile ? handleDeclineConnect : undefined}
        connectionLoading={connectionLoading}
        onMessage={!isOwnProfile ? handleMessage : undefined}
        canMessage={profile.can_message}
        onEditProfile={isOwnProfile ? () => navigate('/settings') : undefined}
        onFollowersClick={() => setFollowListType('followers')}
        onFollowingClick={() => setFollowListType('following')}
      />

      <FollowListModal
        isOpen={followListType !== null}
        onClose={() => setFollowListType(null)}
        userId={profile.telegram_id}
        type={followListType ?? 'followers'}
        count={followListType === 'following' ? profile.following_count : profile.followers_count}
        currentUserId={myId}
      />

      {/* Stats strip */}
      <div className="flex items-center gap-4 px-2 text-xs text-gray-400 dark:text-white/40 flex-wrap">
        <Link to="/network" className="flex items-center gap-1.5 hover:text-sahifa-500 dark:hover:text-sahifa-400 transition-colors">
          <Users className="w-3.5 h-3.5" /> {profile.connections_count} ta aloqa
        </Link>
        {isOwnProfile && (
          <span className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> {profile.profile_views} ta ko'rish · {profile.profile_views_week} bu hafta
          </span>
        )}
        {!isOwnProfile && profile.mutual_connections > 0 && (
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {profile.mutual_connections} ta umumiy aloqa
          </span>
        )}
      </div>

      <AboutSection
        bio={profile.bio}
        isOwnProfile={isOwnProfile}
        onSaved={bio => setProfile(p => p ? { ...p, bio } : p)}
      />

      <GamificationCard
        level={profile.level}
        levelName={profile.level_name}
        totalXp={profile.total_xp}
        nextLevelXp={profile.next_level_xp}
        xpPercent={profile.xp_percent}
        focusHours={profile.focus_hours}
        streakDays={profile.streak_days}
        longestStreak={profile.longest_streak}
      />

      <ExperienceSection experiences={profile.experiences} isOwnProfile={isOwnProfile} />
      <EducationSection education={profile.education} isOwnProfile={isOwnProfile} />
      <SkillsSection skills={profile.skills} isOwnProfile={isOwnProfile} />
      <CertificatesSection certificates={profile.certificates} />
      <RecentActivityPreview activity={profile.recent_activity} />
    </div>
  )
}

export default ProfilePage
