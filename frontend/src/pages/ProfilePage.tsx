/**
 * ProfilePage — Unified, redesigned profile page for all users.
 *
 * Route: /profile/:username  (/:userId still works — numeric IDs are usernames too)
 * /profile/me  → redirects to own profile via username
 *
 * Layout (desktop):
 *   Left nav: handled by WebLayout (280px fixed sidebar)
 *   Center:   max 760px profile content
 *   Right:    280px suggestions sidebar (hidden on mobile)
 *
 * API:
 *   GET /api/profile/:username  — full profile payload
 *   GET /api/connections/suggestions  — right sidebar
 *   GET /api/courses?limit=2&sort_by=enrolled  — popular courses sidebar
 *   POST/DELETE/PUT /api/connections/*  — connect / disconnect
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Link2, Users, Calendar, CheckCircle2, Shield,
  Star, Zap, Eye, BookOpen, Award, Clock, Share2,
  UserPlus, UserCheck, UserMinus, MessageCircle, Edit3,
  ChevronRight, ChevronDown, X, Plus, GripVertical, Copy,
  Loader2, AlertCircle, ExternalLink, ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import { getLevelTitle, getLevelEmoji, LEVEL_TITLES } from '../utils/levelTitles'
import PostCard from '../components/social/PostCard'
import type { PostData } from '../components/social/PostCard'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface Skill {
  id: number
  skill_name: string
  is_verified: boolean
  endorsement_count: number
  endorsed_by_viewer: boolean
  display_order: number
}

interface Certificate {
  id: number
  course_title: string
  score: number | null
  issued_at: string | null
  share_token: string | null
  skill_tags: string[]
}

interface ActiveCourse {
  id: number
  title: string
  thumbnail_url: string | null
  progress_percent: number
  teacher_name: string
}

interface ActivityItem {
  activity_type: string
  created_at: string
  metadata: Record<string, any>
}

type ConnectionStatus = 'own' | 'accepted' | 'pending_sent' | 'pending_received' | 'none'

interface ProfileData {
  telegram_id: number
  username: string | null
  first_name: string
  photo_url: string | null
  cover_image_url: string | null
  headline: string | null
  bio: string | null
  location_city: string | null
  website_url: string | null
  account_type: string
  is_verified: boolean
  level: number
  level_name: string
  total_xp: number
  next_level_xp: number
  xp_percent: number
  focus_hours: number
  profile_views: number
  profile_views_week: number
  connections_count: number
  followers_count: number
  following_count: number
  mutual_connections: number
  courses_enrolled: number
  courses_completed: number
  certificates_count: number
  connection_status: ConnectionStatus
  connection_id: number | null
  is_following: boolean
  is_followed_by: boolean
  can_message: boolean
  skills: Skill[]
  active_courses: ActiveCourse[]
  recent_activity: ActivityItem[]
  certificates: Certificate[]
  profile_completeness?: number
}

type TabKey = 'umumiy' | 'faollik' | 'kurslar' | 'yutuqlar' | 'postlar'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })
}

function fmtJoined(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })
}

function activityLabel(type: string, meta: Record<string, any>): string {
  switch (type) {
    case 'certificate_earned':  return `Sertifikat oldi: ${meta.course_title || ''}`
    case 'course_enrolled':     return `Kursga yozildi: ${meta.course_title || ''}`
    case 'course_completed':    return `Kursni tugatdi: ${meta.course_title || ''}`
    case 'post_created':        return 'Yangi post yozdi'
    case 'level_up':            return `Yangi daraja: ${meta.level_name || ''}`
    case 'achievement_unlocked':return `Yutuq qo'lga kiritdi: ${meta.achievement_name || ''}`
    case 'skill_added':         return `Ko'nikma qo'shdi: ${meta.skill_name || ''}`
    case 'connection_made':     return "Yangi aloqa o'rnatdi"
    case 'job_posted':          return "Yangi ish e'loni joyladi"
    default:                    return type.replace(/_/g, ' ')
  }
}

function activityIcon(type: string): string {
  const map: Record<string, string> = {
    certificate_earned: '🏅',
    course_enrolled: '📖',
    course_completed: '🎓',
    post_created: '✍️',
    level_up: '⬆️',
    achievement_unlocked: '🏆',
    skill_added: '🔧',
    connection_made: '🤝',
    job_posted: '💼',
  }
  return map[type] || '📌'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Response normalizer — handles both old nested {user,stats} and new flat shapes
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeProfile(raw: any): ProfileData {
  // Detect old nested format by presence of a "user" sub-object
  const isNested = raw && typeof raw.user === 'object' && raw.user !== null

  const u   = isNested ? raw.user  : raw
  const st  = isNested ? (raw.stats ?? {}) : raw

  // connection_status: old backend used "self"/"connected", new uses "own"/"accepted"
  const rawStatus: string = raw.connection_status ?? 'none'
  const statusMap: Record<string, ConnectionStatus> = {
    self: 'own', own: 'own',
    connected: 'accepted', accepted: 'accepted',
    pending_sent: 'pending_sent',
    pending_received: 'pending_received',
    none: 'none',
  }
  const connection_status: ConnectionStatus = statusMap[rawStatus] ?? 'none'

  return {
    telegram_id:          u.telegram_id ?? u.id ?? 0,
    username:             u.username ?? null,
    first_name:           u.first_name ?? u.name ?? '',
    photo_url:            u.photo_url ?? u.avatar_url ?? null,
    cover_image_url:      u.cover_image_url ?? null,
    headline:             u.headline ?? null,
    bio:                  u.bio ?? null,
    location_city:        u.location_city ?? null,
    website_url:          u.website_url ?? null,
    account_type:         u.account_type ?? 'student',
    is_verified:          u.is_verified ?? false,
    level:                u.level ?? 1,
    level_name:           u.level_name ?? '',
    total_xp:             u.total_xp ?? u.xp ?? 0,
    next_level_xp:        u.next_level_xp ?? 0,
    xp_percent:           u.xp_percent ?? 0,
    focus_hours:          u.focus_hours ?? 0,
    profile_views:        u.profile_views ?? 0,
    profile_views_week:   u.profile_views_week ?? 0,
    connections_count:    st.connections_count ?? raw.connections_count ?? 0,
    followers_count:      raw.followers_count ?? 0,
    following_count:      raw.following_count ?? 0,
    mutual_connections:   st.mutual_connections ?? 0,
    courses_enrolled:     st.courses_enrolled ?? 0,
    courses_completed:    st.courses_completed ?? 0,
    certificates_count:   st.certificates_count ?? 0,
    connection_status,
    connection_id:        raw.connection_id ?? null,
    is_following:         raw.is_following ?? false,
    is_followed_by:       raw.is_followed_by ?? false,
    can_message:          raw.can_message ?? false,
    skills:               Array.isArray(raw.skills) ? raw.skills.map((s: any) => ({
      id:                s.id,
      skill_name:        s.skill_name,
      is_verified:       s.is_verified ?? false,
      endorsement_count: s.endorsement_count ?? 0,
      // old key was has_viewer_endorsed, new key is endorsed_by_viewer
      endorsed_by_viewer: s.endorsed_by_viewer ?? s.has_viewer_endorsed ?? false,
      display_order:     s.display_order ?? 0,
    })) : [],
    active_courses:       Array.isArray(raw.active_courses) ? raw.active_courses.map((c: any) => ({
      id:               c.id ?? c.course_id,
      title:            c.title ?? c.name ?? '',
      thumbnail_url:    c.thumbnail_url ?? null,
      progress_percent: c.progress_percent ?? 0,
      teacher_name:     c.teacher_name ?? '',
    })) : [],
    recent_activity:      Array.isArray(raw.recent_activity) ? raw.recent_activity : [],
    certificates:         Array.isArray(raw.certificates) ? raw.certificates.map((c: any) => ({
      id:           c.id,
      course_title: c.course_title ?? c.name ?? '',
      score:        c.score ?? null,
      issued_at:    c.issued_at ?? c.date ?? null,
      share_token:  c.share_token ?? null,
      skill_tags:   Array.isArray(c.skill_tags) ? c.skill_tags : [],
    })) : [],
    profile_completeness: raw.profile_completeness ?? u.profile_completeness ?? undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const ProfilePage: React.FC = () => {
  const { userId: rawParam } = useParams<{ userId: string }>()
  const { user: authUser, isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('umumiy')
  const [connLoading, setConnLoading] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [relModal, setRelModal] = useState<'connections' | 'followers' | 'following' | null>(null)
  const [shareCert, setShareCert] = useState<Certificate | null>(null)
  const [showAllSkills, setShowAllSkills] = useState(false)
  const [endorsingId, setEndorsingId] = useState<number | null>(null)
  const [newSkill, setNewSkill] = useState('')
  const [addingSkill, setAddingSkill] = useState(false)
  const [posts, setPosts] = useState<PostData[]>([])
  const [postsLoading, setPostsLoading] = useState(false)

  const myId = (authUser as any)?.telegram_id || (authUser as any)?.id

  // /profile/me requires auth — guard before fetching
  if (rawParam === 'me' && !authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // "me" → call /api/profile/me (backend resolves via JWT); else use the param directly
  const usernameParam = rawParam || ''
  const profileApiPath = usernameParam === 'me' ? '/api/profile/me' : `/api/profile/${usernameParam}`

  // ── Fetch profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!usernameParam) return
    // Wait for auth to resolve before fetching /profile/me so the JWT is ready
    if (usernameParam === 'me' && authLoading) return
    setLoading(true)
    setError(null)
    api.client.get(profileApiPath)
      .then(r => setProfile(normalizeProfile(r.data)))
      .catch(() => setError('Profil topilmadi'))
      .finally(() => setLoading(false))
  }, [profileApiPath, authLoading])

  // ── Fetch posts when postlar tab active ───────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'postlar' || !profile) return
    if (posts.length > 0) return // already loaded
    setPostsLoading(true)
    api.client.get(`/api/v1/social/users/${profile.telegram_id}/posts`, { params: { page: 1, page_size: 50 } })
      .then(r => setPosts(r.data.posts || []))
      .catch(() => {})
      .finally(() => setPostsLoading(false))
  }, [activeTab, profile?.telegram_id])

  const handleDeletePost = useCallback(async (postId: number) => {
    await api.client.delete(`/api/v1/social/posts/${postId}`)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }, [])

  const handleEditPost = useCallback(async (postId: number, content: string) => {
    await api.client.patch(`/api/v1/social/posts/${postId}`, { content })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }, [])

  // ── Connection actions ─────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!profile || !isAuthenticated) { navigate('/login'); return }
    setConnLoading(true)
    try {
      const status = profile.connection_status
      if (status === 'none') {
        const r = await api.client.post('/api/connections/request', { receiver_id: profile.telegram_id })
        // send_request auto-follows requester→receiver
        setProfile(p => p ? {
          ...p,
          connection_status: 'pending_sent',
          connection_id: r.data.id,
          is_following: true,
          following_count: p.following_count + 1,
        } : p)
      } else if (status === 'pending_sent' && profile.connection_id) {
        await api.client.post('/api/connections/cancel', { connection_id: profile.connection_id })
        setProfile(p => p ? {
          ...p,
          connection_status: 'none',
          connection_id: null,
          is_following: false,
          following_count: Math.max(0, p.following_count - 1),
        } : p)
      } else if (status === 'pending_received' && profile.connection_id) {
        await api.client.put(`/api/connections/${profile.connection_id}/accept`)
        setProfile(p => p ? {
          ...p,
          connection_status: 'accepted',
          connections_count: p.connections_count + 1,
          is_following: true,
          can_message: true,
        } : p)
      } else if (status === 'accepted' && profile.connection_id) {
        await api.client.delete(`/api/connections/${profile.connection_id}`)
        setProfile(p => p ? {
          ...p,
          connection_status: 'none',
          connection_id: null,
          connections_count: Math.max(0, p.connections_count - 1),
          is_following: false,
          is_followed_by: false,
          can_message: false,
        } : p)
      }
    } catch {}
    setConnLoading(false)
  }, [profile, isAuthenticated, navigate])

  // ── Follow actions ─────────────────────────────────────────────────────────
  const handleFollow = useCallback(async () => {
    if (!profile || !isAuthenticated) { navigate('/login'); return }
    setFollowLoading(true)
    try {
      if (profile.is_following) {
        await api.client.delete(`/api/v1/social/users/${profile.telegram_id}/follow`)
        setProfile(p => p ? {
          ...p,
          is_following: false,
          followers_count: Math.max(0, p.followers_count - 1),
        } : p)
      } else {
        await api.client.post(`/api/v1/social/users/${profile.telegram_id}/follow`)
        setProfile(p => p ? {
          ...p,
          is_following: true,
          followers_count: p.followers_count + 1,
        } : p)
      }
    } catch {}
    setFollowLoading(false)
  }, [profile, isAuthenticated, navigate])

  const handleMessage = useCallback(async () => {
    if (!profile || !isAuthenticated) { navigate('/login'); return }
    try {
      const r = await api.client.post(`/api/v1/messenger/conversations/${profile.telegram_id}`)
      navigate(`/messenger/${r.data.id}`)
    } catch {}
  }, [profile, isAuthenticated, navigate])

  // ── Endorse skill ──────────────────────────────────────────────────────────
  const handleEndorse = useCallback(async (skillId: number) => {
    if (!isAuthenticated) { navigate('/login'); return }
    setEndorsingId(skillId)
    try {
      await api.client.post(`/api/skills/${skillId}/endorse`)
      setProfile(p => {
        if (!p) return p
        return {
          ...p,
          skills: p.skills.map(s => s.id === skillId
            ? {
                ...s,
                endorsed_by_viewer: !s.endorsed_by_viewer,
                endorsement_count: s.endorsed_by_viewer ? s.endorsement_count - 1 : s.endorsement_count + 1,
              }
            : s
          ),
        }
      })
    } catch {}
    setEndorsingId(null)
  }, [isAuthenticated, navigate])

  // ── Add skill (own profile only) ───────────────────────────────────────────
  const handleAddSkill = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newSkill.trim()
    if (!name) return
    setAddingSkill(true)
    try {
      const r = await api.client.post('/api/skills', { skill_name: name })
      setProfile(p => p ? { ...p, skills: [...p.skills, r.data] } : p)
      setNewSkill('')
    } catch {}
    setAddingSkill(false)
  }, [newSkill])

  // ── Delete skill (own profile only) ───────────────────────────────────────
  const handleDeleteSkill = useCallback(async (skillId: number) => {
    try {
      await api.client.delete(`/api/skills/${skillId}`)
      setProfile(p => p ? { ...p, skills: p.skills.filter(s => s.id !== skillId) } : p)
    } catch {}
  }, [])

  // ── Profile update callback ────────────────────────────────────────────────
  const handleProfileUpdated = useCallback((updated: Partial<ProfileData>) => {
    setProfile(p => p ? { ...p, ...updated } : p)
    setEditOpen(false)
  }, [])

  // ── Share own profile ──────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/profile/${profile?.username || profile?.telegram_id}`
    if (navigator.share) {
      navigator.share({ title: profile?.first_name || 'Profil', url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }, [profile])

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-white/20" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-10 h-10 text-white/20" />
        <p className="text-white/40 text-sm">{error || 'Profil topilmadi'}</p>
        <button onClick={() => navigate(-1)} className="text-[#e8792f] text-sm hover:underline">
          Orqaga
        </button>
      </div>
    )
  }

  // isOwn: backend returns "own" when it can verify the viewer via JWT.
  // Also check telegram_id directly as a fallback in case the auth header
  // is stripped by a proxy/CDN layer and the backend falls back to "none".
  const isOwn = profile.connection_status === 'own' || (!!myId && profile.telegram_id === myId)

  return (
    <>
      {/* ── Back button (mobile only) ────────────────────────────────────── */}
      <div className="lg:hidden sticky top-0 z-20 bg-[#13141a]/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-white truncate">{profile.first_name}</span>
      </div>

      {/* ── Profile content ──────────────────────────────────────────────── */}
        <main className="space-y-4">

          {/* 1. Cover + Avatar */}
          <CoverHeader profile={profile} />

          {/* 2. Profile info */}
          <ProfileInfo
            profile={profile}
            isOwn={isOwn}
            connLoading={connLoading}
            followLoading={followLoading}
            onConnect={handleConnect}
            onFollow={handleFollow}
            onMessage={handleMessage}
            onEdit={() => setEditOpen(true)}
            onShare={handleShare}
            onOpenModal={setRelModal}
          />

          {/* 3. Stats row */}
          <StatsRow profile={profile} />

          {/* 4. XP progress */}
          <XPBar profile={profile} />

          {/* 4b. Profile completeness prompt (own profile only, < 60%) */}
          {isOwn && (profile.profile_completeness ?? 100) < 60 && (
            <CompletenessPrompt completeness={profile.profile_completeness ?? 0} onEdit={() => setEditOpen(true)} />
          )}

          {/* 4c. Become teacher banner (own profile, student only) */}
          {isOwn && profile.account_type === 'student' && (
            <a
              href="/become-teacher"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors group"
              style={{
                background: 'linear-gradient(90deg, rgba(232,121,47,0.10), rgba(232,121,47,0.04))',
                border: '1px solid rgba(232,121,47,0.18)',
              }}
            >
              <span className="text-xl flex-shrink-0">🎓</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#e8792f] leading-tight">
                  Bilimingizni ulashmoqchimisiz?
                </p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  O'qituvchi bo'ling · 70% komissiya
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#e8792f]/60 group-hover:text-[#e8792f] transition-colors flex-shrink-0" />
            </a>
          )}

          {/* 5. Tab bar */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {(['umumiy', 'postlar', 'faollik', 'kurslar', 'yutuqlar'] as TabKey[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                  activeTab === tab
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {{ umumiy: 'Umumiy', postlar: 'Postlar', faollik: 'Faollik', kurslar: 'Kurslar', yutuqlar: 'Yutuqlar' }[tab]}
              </button>
            ))}
          </div>

          {/* 6. Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'umumiy' && (
                <UmumiyTab
                  profile={profile}
                  isOwn={isOwn}
                  showAllSkills={showAllSkills}
                  setShowAllSkills={setShowAllSkills}
                  newSkill={newSkill}
                  setNewSkill={setNewSkill}
                  addingSkill={addingSkill}
                  endorsingId={endorsingId}
                  onAddSkill={handleAddSkill}
                  onDeleteSkill={handleDeleteSkill}
                  onEndorse={handleEndorse}
                  onShareCert={setShareCert}
                />
              )}
              {activeTab === 'postlar' && (
                <PostlarTab
                  posts={posts}
                  loading={postsLoading}
                  isOwn={isOwn}
                  currentUserId={myId}
                  onDelete={handleDeletePost}
                  onEdit={handleEditPost}
                />
              )}
              {activeTab === 'faollik' && (
                <FaollikTab
                  activities={profile.recent_activity}
                  telegramId={profile.telegram_id}
                  focusSeconds={profile.focus_hours * 3600}
                />
              )}
              {activeTab === 'kurslar' && (
                <KurslarTab profile={profile} onShareCert={setShareCert} />
              )}
              {activeTab === 'yutuqlar' && (
                <YutuqlarTab profile={profile} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

      {/* ── Edit profile modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {editOpen && (
          <EditProfileModal profile={profile} onClose={() => setEditOpen(false)} onSaved={handleProfileUpdated} />
        )}
      </AnimatePresence>

      {/* ── Share certificate modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {shareCert && (
          <ShareCertModal cert={shareCert} onClose={() => setShareCert(null)} />
        )}
      </AnimatePresence>

      {/* ── Relationships modal (connections / followers / following) ─────── */}
      <AnimatePresence>
        {relModal && (
          <RelListModal
            profile={profile}
            mode={relModal}
            onClose={() => setRelModal(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Cover + Avatar Header
// ═══════════════════════════════════════════════════════════════════════════════

const CoverHeader: React.FC<{ profile: ProfileData }> = ({ profile }) => {
  // Guard against DB values that contain CSS code instead of a real URL
  const isValidUrl = (url: string | null): boolean => {
    if (!url) return false
    return url.startsWith('http') || url.startsWith('/')
  }
  const hasCover = isValidUrl(profile.cover_image_url)

  return (
    <div className="relative rounded-2xl bg-[#1c1d27] border border-white/[0.06]">
      {/* Cover — overflow:hidden ONLY here so the avatar below isn't clipped */}
      <div className="h-[120px] rounded-t-2xl overflow-hidden">
        {hasCover ? (
          <img src={profile.cover_image_url!} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #e8792f 0%, #c44a1a 40%, #8b2a10 100%)' }} />
        )}
      </div>

      {/* Avatar — sits outside the overflow:hidden cover, overlapping it */}
      <div className="absolute top-[76px] left-5 z-10">
        <div className="relative">
          <div className="w-[88px] h-[88px] rounded-full border-4 border-[#1c1d27] overflow-hidden bg-[#24253a]">
            {profile.photo_url
              ? <img src={profile.photo_url} alt={profile.first_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                  <span className="text-white text-2xl font-bold">{(profile.first_name || '?').charAt(0).toUpperCase()}</span>
                </div>
            }
          </div>
          {/* Level badge */}
          <div className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-[#e8792f] border-2 border-[#1c1d27] flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">{profile.level ?? 1}</span>
          </div>
        </div>
      </div>

      {/* Spacer for avatar overflow */}
      <div className="h-12" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Profile Info
// ═══════════════════════════════════════════════════════════════════════════════

interface ProfileInfoProps {
  profile: ProfileData
  isOwn: boolean
  connLoading: boolean
  followLoading: boolean
  onConnect: () => void
  onFollow: () => void
  onMessage: () => void
  onEdit: () => void
  onShare: () => void
  onOpenModal: (m: 'connections' | 'followers' | 'following') => void
}

const ProfileInfo: React.FC<ProfileInfoProps> = ({
  profile, isOwn, connLoading, followLoading,
  onConnect, onFollow, onMessage, onEdit, onShare, onOpenModal,
}) => {
  const [connDropOpen, setConnDropOpen] = useState(false)
  const [followDropOpen, setFollowDropOpen] = useState(false)

  const status = profile.connection_status

  // ── Connect button config ─────────────────────────────────────────────────
  const connBtn = (() => {
    switch (status) {
      case 'accepted':         return { label: "Bog'langan", icon: UserCheck, variant: 'active' }
      case 'pending_sent':     return { label: "So'rov yuborilgan", icon: Clock, variant: 'muted' }
      case 'pending_received': return { label: 'Qabul qilish', icon: UserPlus, variant: 'primary' }
      default:                 return { label: "Bog'lanish", icon: UserPlus, variant: 'primary' }
    }
  })()

  return (
    <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5 space-y-3">
      {/* Name + verified */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-white">{profile.first_name}</h1>
            {profile.is_verified && (
              <CheckCircle2 className="w-4 h-4 text-[#e8792f] flex-shrink-0" title="Tasdiqlangan" />
            )}
            {profile.account_type === 'teacher' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8792f]/10 text-[#e8792f] border border-[#e8792f]/20">
                O'qituvchi
              </span>
            )}
          </div>
          {profile.username && (
            <p className="text-sm text-white/40 mt-0.5">@{profile.username}</p>
          )}
        </div>
      </div>

      {/* Headline */}
      {profile.headline && (
        <p className="text-sm font-semibold text-[#e8792f]">{profile.headline}</p>
      )}

      {/* Bio */}
      {profile.bio && (
        <p className="text-sm text-white/65 leading-relaxed whitespace-pre-line">{profile.bio}</p>
      )}

      {/* ── Stats row: aloqa · kuzatuvchi · kuzatilgan ── */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button onClick={() => onOpenModal('connections')} className="text-white/50 hover:text-white transition-colors">
          <span className="font-bold text-white">{(profile.connections_count ?? 0).toLocaleString()}</span>
          {' '}aloqa
        </button>
        <span className="text-white/20">·</span>
        <button onClick={() => onOpenModal('followers')} className="text-white/50 hover:text-white transition-colors">
          <span className="font-bold text-white">{(profile.followers_count ?? 0).toLocaleString()}</span>
          {' '}kuzatuvchi
        </button>
        <span className="text-white/20">·</span>
        <button onClick={() => onOpenModal('following')} className="text-white/50 hover:text-white transition-colors">
          <span className="font-bold text-white">{(profile.following_count ?? 0).toLocaleString()}</span>
          {' '}kuzatilgan
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/40">
        {profile.location_city && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {profile.location_city}
          </span>
        )}
        {profile.website_url && (
          <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#e8792f] transition-colors">
            <Link2 className="w-3.5 h-3.5" /> Vebsayt
          </a>
        )}
        {!isOwn && (profile.mutual_connections ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {profile.mutual_connections} ta umumiy aloqa
          </span>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex gap-2 pt-1 flex-wrap">
        {isOwn ? (
          <>
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white text-sm font-medium border border-white/[0.08] transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Profilni tahrirlash
            </button>
            <button onClick={onShare}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white text-sm font-medium border border-white/[0.08] transition-colors">
              <Share2 className="w-3.5 h-3.5" /> Ulashish
            </button>
          </>
        ) : (
          <>
            {/* ── Connect button (with dropdown when connected or pending_sent) ── */}
            <div className="relative">
              <button
                onClick={() => {
                  if (status === 'accepted' || status === 'pending_sent') {
                    setConnDropOpen(v => !v)
                  } else {
                    onConnect()
                  }
                }}
                disabled={connLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  connBtn.variant === 'primary'
                    ? 'bg-[#e8792f] hover:bg-[#c44a1a] text-white'
                    : connBtn.variant === 'active'
                    ? 'bg-transparent border border-[#e8792f]/50 text-[#e8792f] hover:bg-[#e8792f]/10'
                    : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                }`}
              >
                {connLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <connBtn.icon className="w-3.5 h-3.5" />
                }
                {connBtn.label}
                {(status === 'accepted' || status === 'pending_sent') && (
                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                )}
              </button>
              {connDropOpen && (
                <div className="absolute top-full mt-1 left-0 z-30 bg-[#24253a] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                  {status === 'accepted' && (
                    <button
                      onClick={() => { setConnDropOpen(false); onConnect() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/[0.06] transition-colors flex items-center gap-2"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Aloqani uzish
                    </button>
                  )}
                  {status === 'pending_sent' && (
                    <button
                      onClick={() => { setConnDropOpen(false); onConnect() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.06] transition-colors flex items-center gap-2"
                    >
                      <X className="w-3.5 h-3.5" /> Bekor qilish
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Accept / Decline (pending_received) ── */}
            {status === 'pending_received' && (
              <button
                onClick={onConnect}
                disabled={connLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#e8792f] hover:bg-[#c44a1a] text-white transition-all disabled:opacity-60"
              >
                {connLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Qabul qilish
              </button>
            )}

            {/* ── Follow button (with dropdown when following) ── */}
            <div className="relative">
              <button
                onClick={() => {
                  if (profile.is_following) setFollowDropOpen(v => !v)
                  else onFollow()
                }}
                disabled={followLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  profile.is_following
                    ? 'bg-transparent border border-white/[0.15] text-white/70 hover:bg-white/[0.06]'
                    : 'bg-white/[0.06] hover:bg-white/[0.10] text-white border border-white/[0.08]'
                }`}
              >
                {followLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {profile.is_following ? 'Kuzatilmoqda' : 'Kuzatish'}
                {profile.is_following && <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />}
              </button>
              {followDropOpen && (
                <div className="absolute top-full mt-1 left-0 z-30 bg-[#24253a] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden min-w-[180px]">
                  <button
                    onClick={() => { setFollowDropOpen(false); onFollow() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.06] transition-colors"
                  >
                    Kuzatishni to'xtatish
                  </button>
                </div>
              )}
            </div>

            {/* ── Message button (only when can_message) ── */}
            {profile.can_message ? (
              <button onClick={onMessage}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-transparent border border-[#e8792f]/50 text-[#e8792f] hover:bg-[#e8792f]/10 text-sm font-semibold transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> Xabar
              </button>
            ) : (
              <button
                title="Xabar yuborish uchun avval bog'laning"
                disabled
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.03] text-white/20 border border-white/[0.05] text-sm font-semibold cursor-not-allowed"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Xabar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Stats Row
// ═══════════════════════════════════════════════════════════════════════════════

const StatsRow: React.FC<{ profile: ProfileData }> = ({ profile }) => {
  const stats = [
    { label: 'XP', value: (profile.total_xp ?? 0).toLocaleString(), icon: Zap, color: '#e8792f' },
    { label: 'Fokus', value: `${profile.focus_hours ?? 0}h`, icon: Clock, color: '#60a5fa' },
    { label: 'Testlar', value: (profile.courses_completed ?? 0).toString(), icon: Award, color: '#34d399' },
    { label: "Ko'rishlar", value: (profile.profile_views_week ?? 0).toString(), icon: Eye, color: '#a78bfa' },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map(s => {
        const Icon = s.icon
        return (
          <div key={s.label} className="rounded-xl bg-[#1c1d27] border border-white/[0.06] p-3 text-center">
            <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: s.color }} />
            <p className="text-base font-bold text-white leading-none">{s.value}</p>
            <p className="text-[10px] text-white/40 mt-1">{s.label}</p>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. XP Progress Bar
// ═══════════════════════════════════════════════════════════════════════════════

const XPBar: React.FC<{ profile: ProfileData }> = ({ profile }) => {
  const nextLevel = (profile.level ?? 1) + 1
  const nextTitle = nextLevel <= 27 ? getLevelTitle(nextLevel) : null
  const nextEmoji = nextLevel <= 27 ? getLevelEmoji(nextLevel) : null

  return (
    <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4 space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-white">
          {getLevelEmoji(profile.level ?? 1)} Daraja {profile.level ?? 1} — {profile.level_name}
        </span>
        <span className="text-white/40 text-xs">
          {(profile.total_xp ?? 0).toLocaleString()} / {(profile.next_level_xp ?? 0).toLocaleString()} XP · {profile.xp_percent ?? 0}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${profile.xp_percent ?? 0}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full bg-gradient-to-r from-[#e8792f] to-[#f59e0b]"
        />
      </div>
      {nextTitle && (
        <p className="text-[11px] text-white/30">
          Keyingi: {nextEmoji} {nextTitle} (Lv.{nextLevel})
        </p>
      )}
    </div>
  )
}

// ── Profile completeness prompt ───────────────────────────────────────────────

const CompletenessPrompt: React.FC<{ completeness: number; onEdit: () => void }> = ({ completeness, onEdit }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl bg-[#1c1d27] border border-[#e8792f]/20 p-4"
  >
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <p className="text-sm font-semibold text-white">
          Profilingiz {completeness}% to'ldirilgan
        </p>
        <p className="text-xs text-white/40 mt-0.5">
          To'liq profil ko'proq aloqa va imkoniyatlar keltiradi
        </p>
      </div>
      <button
        onClick={onEdit}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#e8792f] text-white text-xs font-medium hover:bg-[#d4692a] transition-colors"
      >
        Tahrirlash
      </button>
    </div>

    {/* Progress bar */}
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${completeness}%` }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
        className="h-full rounded-full bg-[#e8792f]"
      />
    </div>

    <p className="text-[11px] text-white/30">
      Maslahat: headline va bio qo'shish eng tez natija beradi
    </p>
  </motion.div>
)


// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Umumiy
// ═══════════════════════════════════════════════════════════════════════════════

interface UmumiyTabProps {
  profile: ProfileData
  isOwn: boolean
  showAllSkills: boolean
  setShowAllSkills: (v: boolean) => void
  newSkill: string
  setNewSkill: (v: string) => void
  addingSkill: boolean
  endorsingId: number | null
  onAddSkill: (e: React.FormEvent) => void
  onDeleteSkill: (id: number) => void
  onEndorse: (id: number) => void
  onShareCert: (cert: Certificate) => void
}

const UmumiyTab: React.FC<UmumiyTabProps> = ({
  profile, isOwn, showAllSkills, setShowAllSkills,
  newSkill, setNewSkill, addingSkill, endorsingId,
  onAddSkill, onDeleteSkill, onEndorse, onShareCert,
}) => (
  <div className="space-y-4">
    <SkillsSection
      skills={profile.skills}
      isOwn={isOwn}
      showAll={showAllSkills}
      setShowAll={setShowAllSkills}
      newSkill={newSkill}
      setNewSkill={setNewSkill}
      addingSkill={addingSkill}
      endorsingId={endorsingId}
      onAdd={onAddSkill}
      onDelete={onDeleteSkill}
      onEndorse={onEndorse}
    />
    {(profile.certificates ?? []).length > 0 && (
      <CertificatesSection certs={profile.certificates ?? []} onShare={onShareCert} />
    )}
    {(profile.active_courses ?? []).length > 0 && (
      <ActiveCoursesSection courses={profile.active_courses ?? []} />
    )}
    {(profile.recent_activity ?? []).length > 0 && (
      <RecentActivitySection activities={(profile.recent_activity ?? []).slice(0, 5)} />
    )}
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Skills Section
// ═══════════════════════════════════════════════════════════════════════════════

interface SkillsSectionProps {
  skills: Skill[]
  isOwn: boolean
  showAll: boolean
  setShowAll: (v: boolean) => void
  newSkill: string
  setNewSkill: (v: string) => void
  addingSkill: boolean
  endorsingId: number | null
  onAdd: (e: React.FormEvent) => void
  onDelete: (id: number) => void
  onEndorse: (id: number) => void
}

const SkillsSection: React.FC<SkillsSectionProps> = ({
  skills, isOwn, showAll, setShowAll,
  newSkill, setNewSkill, addingSkill, endorsingId,
  onAdd, onDelete, onEndorse,
}) => {
  const visible = showAll ? skills : skills.slice(0, 3)

  return (
    <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white">Ko'nikmalar</h2>
        {isOwn && (
          <span className="text-[10px] text-white/30">Tartibni drag bilan o'zgartiring</span>
        )}
      </div>

      {skills.length === 0 && !isOwn && (
        <p className="text-sm text-white/30 text-center py-4">Ko'nikmalar qo'shilmagan</p>
      )}

      <div className="space-y-2">
        {visible.map(skill => (
          <div key={skill.id} className="flex items-center gap-3 group">
            {isOwn && <GripVertical className="w-3.5 h-3.5 text-white/20 cursor-grab flex-shrink-0" />}
            <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm text-white font-medium">{skill.skill_name}</span>
              {skill.is_verified && (
                <Shield className="w-3.5 h-3.5 text-[#e8792f] flex-shrink-0" title="Tasdiqlangan" />
              )}
              {skill.endorsement_count > 0 && (
                <span className="text-[10px] text-white/40">{skill.endorsement_count} tasdiqlash</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isOwn && (
                <button
                  onClick={() => onEndorse(skill.id)}
                  disabled={endorsingId === skill.id}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    skill.endorsed_by_viewer
                      ? 'bg-[#e8792f]/20 text-[#e8792f] border border-[#e8792f]/20'
                      : 'bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.10] border border-white/[0.06]'
                  }`}
                >
                  {endorsingId === skill.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : skill.endorsed_by_viewer ? 'Tasdiqlandi ✓' : 'Tasdiqlash'
                  }
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => onDelete(skill.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {skills.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
          {showAll ? 'Kamroq ko\'rsatish' : `Yana ${skills.length - 3} ta ko'nikmani ko'rsatish`}
        </button>
      )}

      {/* Add skill form (own profile) */}
      {isOwn && (
        <form onSubmit={onAdd} className="flex gap-2 mt-4 pt-4 border-t border-white/[0.06]">
          <input
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            placeholder="Ko'nikma nomi..."
            maxLength={60}
            className="flex-1 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.06] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#e8792f]/40"
          />
          <button
            type="submit"
            disabled={addingSkill || !newSkill.trim()}
            className="px-3 py-2 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {addingSkill ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </form>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Certificates Section
// ═══════════════════════════════════════════════════════════════════════════════

const CertificatesSection: React.FC<{ certs: Certificate[]; onShare: (c: Certificate) => void }> = ({ certs, onShare }) => (
  <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
    <h2 className="text-sm font-bold text-white mb-4">Sertifikatlar</h2>
    <div className="space-y-3">
      {certs.map(cert => (
        <div key={cert.id} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#e8792f]/10 border border-[#e8792f]/20 flex items-center justify-center flex-shrink-0">
            <Award className="w-4 h-4 text-[#e8792f]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{cert.course_title}</p>
            <p className="text-[11px] text-white/40">
              {cert.score !== null && `${cert.score}% · `}{cert.issued_at ? fmtDate(cert.issued_at) : ''}
            </p>
          </div>
          <button
            onClick={() => onShare(cert)}
            className="p-1.5 rounded-lg text-white/30 hover:text-[#e8792f] hover:bg-[#e8792f]/10 transition-colors flex-shrink-0"
            title="Ulashish"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Active Courses Section
// ═══════════════════════════════════════════════════════════════════════════════

const ActiveCoursesSection: React.FC<{ courses: ActiveCourse[] }> = ({ courses }) => {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
      <h2 className="text-sm font-bold text-white mb-4">Faol kurslar</h2>
      <div className="space-y-3">
        {courses.map(c => (
          <div
            key={c.id}
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => navigate(`/courses/${c.id}`)}
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#24253a] flex-shrink-0">
              {c.thumbnail_url
                ? <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                : <BookOpen className="w-5 h-5 text-white/20 m-2.5" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate group-hover:text-[#e8792f] transition-colors">{c.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#e8792f]"
                    style={{ width: `${c.progress_percent}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/30 flex-shrink-0">{c.progress_percent}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recent Activity Section
// ═══════════════════════════════════════════════════════════════════════════════

const RecentActivitySection: React.FC<{ activities: ActivityItem[] }> = ({ activities }) => (
  <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
    <h2 className="text-sm font-bold text-white mb-4">So'nggi faollik</h2>
    <div className="space-y-3">
      {activities.map((a, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="text-base leading-none mt-0.5 flex-shrink-0">{activityIcon(a.activity_type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/80">{activityLabel(a.activity_type, a.metadata)}</p>
            <p className="text-[11px] text-white/30 mt-0.5">{fmtDate(a.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Faollik (heatmap + focus hours + activity list)
// ═══════════════════════════════════════════════════════════════════════════════

interface HeatmapDay { date: string; count: number }

const FaollikTab: React.FC<{ activities: ActivityItem[]; telegramId: number; focusSeconds: number }> = ({
  activities, telegramId, focusSeconds,
}) => {
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])

  useEffect(() => {
    api.client.get('/api/profiles/heatmap', { params: { telegram_id: telegramId, days: 365 } })
      .then(r => setHeatmap(r.data || []))
      .catch(() => {})
  }, [telegramId])

  // Build a full 52-week grid (364 days back from today)
  const grid = (() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const map = new Map(heatmap.map(d => [d.date, d.count]))
    const weeks: { date: string; count: number }[][] = []
    // start on the Sunday 364 days ago
    const start = new Date(today)
    start.setDate(start.getDate() - 363)
    start.setDate(start.getDate() - start.getDay()) // back to Sunday
    let cur = new Date(start)
    while (cur <= today) {
      const week: { date: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const iso = cur.toISOString().slice(0, 10)
        week.push({ date: iso, count: map.get(iso) ?? 0 })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  })()

  const maxCount = Math.max(...heatmap.map(d => d.count), 1)
  const totalDays = heatmap.length
  const focusHours = Math.round(focusSeconds / 3600)

  const cellColor = (count: number) => {
    if (count === 0) return 'bg-white/[0.04]'
    const pct = count / maxCount
    if (pct < 0.25) return 'bg-[#e8792f]/20'
    if (pct < 0.5)  return 'bg-[#e8792f]/40'
    if (pct < 0.75) return 'bg-[#e8792f]/65'
    return 'bg-[#e8792f]'
  }

  const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4 text-center">
          <p className="text-2xl font-bold text-[#e8792f]">{focusHours}</p>
          <p className="text-xs text-white/40 mt-0.5">soat diqqat</p>
        </div>
        <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalDays}</p>
          <p className="text-xs text-white/40 mt-0.5">faol kun</p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
        <h2 className="text-sm font-bold text-white mb-4">O'qish faolligi</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Month labels */}
            <div className="flex mb-1.5 pl-4">
              {grid.filter((_, wi) => wi % 4 === 0).map((week, i) => {
                const d = new Date(week[0].date)
                return (
                  <div key={i} className="flex-1 text-[9px] text-white/25">
                    {months[d.getMonth()]}
                  </div>
                )
              })}
            </div>
            {/* Day rows (Mon/Wed/Fri labels + cells) */}
            <div className="flex gap-0.5">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-0.5 mr-1 pt-0">
                {['', 'Sen', '', 'Chor', '', 'Jum', ''].map((label, di) => (
                  <div key={di} className="h-[10px] w-5 text-[8px] text-white/20 flex items-center">{label}</div>
                ))}
              </div>
              {/* Week columns */}
              {grid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      title={`${day.date}: ${day.count} quiz`}
                      className={`w-[10px] h-[10px] rounded-sm ${cellColor(day.count)}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3 justify-end">
              <span className="text-[9px] text-white/25">Kam</span>
              {[0, 0.25, 0.5, 0.75, 1].map(v => (
                <div key={v} className={`w-[10px] h-[10px] rounded-sm ${cellColor(Math.ceil(v * maxCount))}`} />
              ))}
              <span className="text-[9px] text-white/25">Ko'p</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity timeline */}
      {activities.length > 0 && (
        <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
          <h2 className="text-sm font-bold text-white mb-5">So'nggi faollik</h2>
          <div className="relative pl-5 space-y-5">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-white/[0.06]" />
            {activities.map((a, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-5 top-1 w-2 h-2 rounded-full bg-[#e8792f] border-2 border-[#1c1d27] translate-x-[-3px]" />
                <p className="text-sm text-white/80 leading-snug">{activityLabel(a.activity_type, a.metadata)}</p>
                <p className="text-[11px] text-white/30 mt-0.5">{fmtDate(a.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Kurslar
// ═══════════════════════════════════════════════════════════════════════════════

const KurslarTab: React.FC<{ profile: ProfileData; onShareCert: (c: Certificate) => void }> = ({ profile, onShareCert }) => (
  <div className="space-y-4">
    {(profile.active_courses ?? []).length > 0 && (
      <ActiveCoursesSection courses={profile.active_courses ?? []} />
    )}
    {(profile.certificates ?? []).length > 0 && (
      <CertificatesSection certs={profile.certificates ?? []} onShare={onShareCert} />
    )}
    {(profile.active_courses ?? []).length === 0 && (profile.certificates ?? []).length === 0 && (
      <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-12 text-center">
        <BookOpen className="w-8 h-8 text-white/10 mx-auto mb-3" />
        <p className="text-sm text-white/30">Hali kurslar va sertifikatlar yo'q</p>
      </div>
    )}
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Yutuqlar (placeholder)
// ═══════════════════════════════════════════════════════════════════════════════

const YutuqlarTab: React.FC<{ profile: ProfileData }> = ({ profile }) => {
  const achievements = [
    { id: 1, emoji: '🎓', name: 'Birinchi kurs', desc: 'Birinchi kursni tugatdingiz', unlocked: (profile.courses_completed ?? 0) >= 1 },
    { id: 2, emoji: '🏅', name: '3 ta kurs', desc: '3 ta kursni tugatdingiz', unlocked: (profile.courses_completed ?? 0) >= 3 },
    { id: 3, emoji: '📚', name: '5 ta ko\'nikma', desc: '5 ta ko\'nikma qo\'shdingiz', unlocked: (profile.skills ?? []).length >= 5 },
    { id: 4, emoji: '🤝', name: '10 ta aloqa', desc: '10 ta aloqa o\'rnatdingiz', unlocked: (profile.connections_count ?? 0) >= 10 },
    { id: 5, emoji: '⬆️', name: 'Daraja 5', desc: '5-darajaga yetdingiz', unlocked: (profile.level ?? 0) >= 5 },
    { id: 6, emoji: '🏆', name: 'Daraja 10', desc: '10-darajaga yetdingiz', unlocked: (profile.level ?? 0) >= 10 },
  ]

  return (
    <div className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-5">
      <h2 className="text-sm font-bold text-white mb-4">Yutuqlar</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {achievements.map(a => (
          <div
            key={a.id}
            className={`rounded-xl p-3 border text-center transition-all ${
              a.unlocked
                ? 'bg-[#e8792f]/10 border-[#e8792f]/20'
                : 'bg-white/[0.02] border-white/[0.04] opacity-50'
            }`}
          >
            <div className="text-2xl mb-1.5" style={{ filter: a.unlocked ? 'none' : 'grayscale(100%)' }}>
              {a.emoji}
            </div>
            <p className="text-xs font-semibold text-white leading-tight">{a.name}</p>
            <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{a.desc}</p>
            {a.unlocked && (
              <div className="mt-2 text-[9px] font-bold text-[#e8792f]">QOZONILDI</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edit Profile Modal
// ═══════════════════════════════════════════════════════════════════════════════

interface EditProfileModalProps {
  profile: ProfileData
  onClose: () => void
  onSaved: (updated: Partial<ProfileData>) => void
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ profile, onClose, onSaved }) => {
  const [form, setForm] = useState({
    first_name:     profile.first_name,
    headline:       profile.headline || '',
    bio:            profile.bio || '',
    location_city:  profile.location_city || '',
    website_url:    profile.website_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Image upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setErr("Rasm hajmi 5MB dan oshmasligi kerak"); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErr("Faqat JPG, PNG yoki WebP formatdagi rasmlar"); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setErr(null)
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setErr("Rasm hajmi 5MB dan oshmasligi kerak"); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErr("Faqat JPG, PNG yoki WebP formatdagi rasmlar"); return }
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
    setCoverRemoved(false)
    setErr(null)
  }

  function removeCover() {
    setCoverFile(null)
    setCoverPreview(null)
    setCoverRemoved(true)
  }

  async function uploadImage(file: File, type: 'avatar' | 'cover'): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    const r = await api.client.post('/api/profile/me/upload', formData, {
      headers: { 'Content-Type': undefined },
    })
    return r.data.url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.headline.length > 120) { setErr("Sarlavha 120 belgidan oshmasligi kerak"); return }
    if (form.bio.length > 500) { setErr("Bio 500 belgidan oshmasligi kerak"); return }
    setSaving(true)
    setErr(null)
    try {
      let newAvatarUrl = profile.photo_url
      let newCoverUrl = coverRemoved ? null : profile.cover_image_url

      if (avatarFile) newAvatarUrl = await uploadImage(avatarFile, 'avatar')
      if (coverFile)  newCoverUrl  = await uploadImage(coverFile, 'cover')

      const r = await api.client.put('/api/profile/me', {
        ...form,
        ...(avatarFile ? { photo_url: newAvatarUrl } : {}),
        cover_image_url: newCoverUrl,
      })
      onSaved({ ...r.data, photo_url: newAvatarUrl ?? r.data.photo_url, cover_image_url: newCoverUrl ?? r.data.cover_image_url })
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Xatolik yuz berdi")
    }
    setSaving(false)
  }

  const hasCover = coverPreview || (profile.cover_image_url?.startsWith('http') ? profile.cover_image_url : null)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        ref={ref}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#1c1d27] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Profilni tahrirlash</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {err && <p className="text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{err}</p>}

          {/* ── Cover image upload ──────────────────────────────────────── */}
          <div>
            <div
              onClick={() => coverInputRef.current?.click()}
              style={{
                width: '100%',
                height: '110px',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer',
                ...(hasCover
                  ? { backgroundImage: `url(${hasCover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: 'linear-gradient(135deg, #e8792f 0%, #c44a1a 40%, #8b2a10 100%)' }
                ),
              }}
              className="group"
            >
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.2s',
              }} className="opacity-60 group-hover:opacity-100">
                <span className="text-white text-sm font-semibold">📷 Banner rasmini o'zgartirish</span>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleCoverChange}
              />
            </div>
            {hasCover && (
              <button
                type="button"
                onClick={removeCover}
                className="mt-1.5 text-[13px] font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                🗑 Banner rasmini olib tashlash
              </button>
            )}
          </div>

          {/* ── Avatar upload ───────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <div
              onClick={() => avatarInputRef.current?.click()}
              style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            >
              {(avatarPreview || profile.photo_url) ? (
                <img src={avatarPreview || profile.photo_url!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #e8792f, #8b2a10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff' }}>
                  {profile.first_name?.charAt(0) || '?'}
                </div>
              )}
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                📷
              </div>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Profil rasmi</div>
              <div className="text-xs text-white/40">JPG, PNG · Maksimum 5MB</div>
            </div>
          </div>

          {/* ── Text fields ─────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Ism</label>
            <input
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Sarlavha <span className="text-white/25">({form.headline.length}/120)</span>
            </label>
            <input
              value={form.headline}
              onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder="Masalan: Full-stack dasturchi | O'qituvchi"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40"
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Bio <span className="text-white/25">({form.bio.length}/500)</span>
            </label>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="O'zingiz haqingizda..."
              rows={4}
              maxLength={500}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Shahar</label>
            <input
              value={form.location_city}
              onChange={e => setForm(f => ({ ...f, location_city: e.target.value }))}
              placeholder="Toshkent"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Vebsayt</label>
            <input
              value={form.website_url}
              onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
              placeholder="https://example.com"
              type="url"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40"
              maxLength={500}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Relationships List Modal (connections / followers / following)
// ═══════════════════════════════════════════════════════════════════════════════

interface RelUser {
  id: number
  name: string
  username: string | null
  avatar_url: string | null
  headline: string | null
}

const RelListModal: React.FC<{
  profile: ProfileData
  mode: 'connections' | 'followers' | 'following'
  onClose: () => void
}> = ({ profile, mode, onClose }) => {
  const [users, setUsers] = useState<RelUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const title = {
    connections: `Aloqalar (${profile.connections_count})`,
    followers:   `Kuzatuvchilar (${profile.followers_count})`,
    following:   `Kuzatilganlar (${profile.following_count})`,
  }[mode]

  useEffect(() => {
    setLoading(true)
    const tid = profile.telegram_id
    const url = mode === 'connections'
      ? `/api/connections?search=`
      : mode === 'followers'
      ? `/api/v1/social/users/${tid}/followers`
      : `/api/v1/social/users/${tid}/following`

    api.client.get(url)
      .then(r => {
        const raw: any[] = Array.isArray(r.data) ? r.data : []
        setUsers(raw.map((item: any) => {
          const u = item.user ?? item
          return {
            id:         u.telegram_id ?? u.id,
            name:       u.first_name ?? u.full_name ?? u.name ?? '',
            username:   u.username ?? null,
            avatar_url: u.photo_url ?? u.avatar_url ?? null,
            headline:   u.headline ?? null,
          }
        }))
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [mode, profile.telegram_id])

  const filtered = users.filter(u =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.username ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#1c1d27] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Qidirish..."
            className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.06] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/40"
          />
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-white/20" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-10">Hech kim topilmadi</p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filtered.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[#24253a] flex-shrink-0">
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                          <span className="text-white text-sm font-bold">{(u.name || '?').charAt(0).toUpperCase()}</span>
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                    {u.headline && <p className="text-xs text-white/40 truncate">{u.headline}</p>}
                    {u.username && !u.headline && <p className="text-xs text-white/30">@{u.username}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Share Certificate Modal
// ═══════════════════════════════════════════════════════════════════════════════

const ShareCertModal: React.FC<{ cert: Certificate; onClose: () => void }> = ({ cert, onClose }) => {
  const shareUrl = cert.share_token
    ? `${window.location.origin}/certificate/${cert.share_token}`
    : null

  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleTelegram = () => {
    if (!shareUrl) return
    const text = encodeURIComponent(`Men "${cert.course_title}" kursini tugatdim! 🎓\n${shareUrl}`)
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm bg-[#1c1d27] border border-white/[0.08] rounded-2xl shadow-2xl p-6"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-[#e8792f]/10 border border-[#e8792f]/20 flex items-center justify-center mx-auto mb-4">
          <Award className="w-6 h-6 text-[#e8792f]" />
        </div>

        <h2 className="text-base font-bold text-white text-center">{cert.course_title}</h2>
        {cert.score !== null && (
          <p className="text-sm text-white/40 text-center mt-1">{cert.score}% ball</p>
        )}

        {shareUrl ? (
          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="flex-1 text-xs text-white/50 truncate font-mono">{shareUrl}</p>
              <button onClick={handleCopy} className="flex-shrink-0 p-1 rounded-lg text-white/40 hover:text-white transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            {copied && <p className="text-xs text-[#e8792f] text-center">Nusxalandi!</p>}
            <button
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white text-sm font-medium border border-white/[0.06] transition-colors flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" /> Havolani nusxalash
            </button>
            <button
              onClick={handleTelegram}
              className="w-full py-2.5 rounded-xl bg-[#229ed9]/10 hover:bg-[#229ed9]/20 text-[#229ed9] text-sm font-semibold border border-[#229ed9]/20 transition-colors flex items-center justify-center gap-2"
            >
              ✈ Telegram orqali ulashish
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/30 text-center mt-4">Ulashish havolasi mavjud emas</p>
        )}
      </motion.div>
    </motion.div>
  )
}

export default ProfilePage
