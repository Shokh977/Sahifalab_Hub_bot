/**
 * PublicProfile — Unified profile page for ALL users (students, teachers, admins).
 *
 * Replaces both the old PublicProfile (social-only) and TeacherPublicPage.
 * Route: /profile/:userId?tab=lenta|haqida|courses
 *
 * Features:
 *  • Identical header for every role (rank-ringed avatar, stats, follow/message)
 *  • Role-based tabs:
 *      – Students:  Lenta | Haqida
 *      – Teachers:  Lenta | Haqida | Kurslar
 *  • ?tab= URL param for deep-linking (e.g. /profile/123?tab=courses)
 *  • Bento-grid cards in the "Haqida" tab with bio, education, rank, social links
 *  • CourseCard grid in the "Kurslar" tab (reuses shared CourseCard component)
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Loader2,
  Grid3X3, List, BookOpen, GraduationCap,
  Globe, ExternalLink, PenLine, PlayCircle,
  UserPlus, X as XIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import apiService from '../services/apiService'
import { getRankInfo } from '../components/social/UserIdentity'
import ProfileHeaderCard from '../components/ProfileHeaderCard'
import PostCard from '../components/social/PostCard'
import CourseCard from '../components/CourseCard'
import type { PostData } from '../components/social/PostCard'
import type { UserIdentityUser } from '../components/social/UserIdentity'
import type { CourseData } from '../components/CourseCard'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfileData extends UserIdentityUser {
  bio?: string | null
  about_me?: string | null
  followers_count: number
  following_count: number
  is_following: boolean
}

interface TeacherExtra {
  specialization?: string | null
  experience_years?: number | null
  education?: string | null
  website_url?: string | null
  youtube_url?: string | null
  telegram_channel?: string | null
  course_count?: number
  student_count?: number
}

type TabKey = 'lenta' | 'haqida' | 'courses'

// ── Tab config ────────────────────────────────────────────────────────────────
const TAB_LENTA   = { key: 'lenta'   as TabKey, label: 'Lenta',   icon: List }
const TAB_HAQIDA  = { key: 'haqida'  as TabKey, label: 'Haqida',  icon: BookOpen }
const TAB_COURSES = { key: 'courses' as TabKey, label: 'Kurslar', icon: PlayCircle }

// ── Main component ────────────────────────────────────────────────────────────
const PublicProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Core state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [followLoading, setFollowLoading] = useState(false)

  // ── Teacher-specific state ──────────────────────────────────────────────
  const [teacherInfo, setTeacherInfo] = useState<TeacherExtra | null>(null)
  const [courses, setCourses] = useState<CourseData[]>([])
  const [coursesLoading, setCoursesLoading] = useState(false)

  const myId = (user as any)?.telegram_id || (user as any)?.id

  // "me" → redirect to the real numeric ID once auth resolves
  useEffect(() => {
    if (userId !== 'me') return
    if (authLoading) return
    if (!isAuthenticated || !myId) { navigate('/login', { replace: true }); return }
    navigate(`/profile/${myId}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, { replace: true })
  }, [userId, authLoading, isAuthenticated, myId])

  const targetId = userId === 'me' ? NaN : Number(userId)
  const isOwnProfile = myId === targetId
  const isTeacher = profile?.role === 'teacher'

  // Guest-follow modal state
  const [showFollowAuthModal, setShowFollowAuthModal] = useState(false)

  // ── Determine available tabs ────────────────────────────────────────────
  const tabs = useMemo(() => {
    const base = [TAB_LENTA, TAB_HAQIDA]
    if (isTeacher) base.push(TAB_COURSES)
    return base
  }, [isTeacher])

  // ── Active tab from URL param (default: lenta, or courses if specified) ─
  const paramTab = searchParams.get('tab') as TabKey | null
  const activeTab: TabKey = paramTab && tabs.some(t => t.key === paramTab)
    ? paramTab
    : (paramTab === 'courses' && isTeacher) ? 'courses' : 'lenta'

  const setActiveTab = (tab: TabKey) => {
    setSearchParams({ tab }, { replace: true })
  }

  // ── Fetch profile + posts ───────────────────────────────────────────────
  useEffect(() => {
    if (!targetId || isNaN(targetId)) return
    const fetchProfile = async () => {
      setLoading(true)
      try {
        const [profileRes, postsRes] = await Promise.all([
          api.client.get(`/api/v1/social/users/${targetId}/profile`),
          api.client.get(`/api/v1/social/users/${targetId}/posts`, { params: { page: 1, page_size: 50 } }),
        ])
        setProfile(profileRes.data)
        setPosts(postsRes.data.posts || [])
      } catch (err) {
        console.error('Profile fetch error:', err)
      }
      setLoading(false)
    }
    fetchProfile()
  }, [targetId])

  // ── Track profile_visit event (only for other people's profiles) ────────
  useEffect(() => {
    if (!profile || isOwnProfile) return
    const teacherId = profile.role === 'teacher' ? targetId : 0
    apiService.trackAnalyticsEvents([{
      event_type: 'profile_visit',
      target_id: targetId,
      teacher_id: teacherId,
      source: 'direct',
    }]).catch(() => {})
  }, [profile?.telegram_id])

  // ── Fetch teacher extras when role is teacher ───────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'teacher') return

    // Fetch teacher-specific profile data
    apiService.getPublicTeacherProfile(targetId)
      .then(res => {
        const d = res.data
        setTeacherInfo({
          specialization: d.specialization,
          experience_years: d.experience_years,
          education: d.education,
          website_url: d.website_url,
          youtube_url: d.youtube_url,
          telegram_channel: d.telegram_channel,
          course_count: d.course_count,
          student_count: d.student_count,
        })
      })
      .catch(() => setTeacherInfo(null))

    // Fetch teacher's courses
    setCoursesLoading(true)
    apiService.getCourses({ teacher_id: targetId, limit: 50 })
      .then(res => {
        const list = Array.isArray(res.data?.courses) ? res.data.courses : []
        setCourses(list)
      })
      .catch(() => setCourses([]))
      .finally(() => setCoursesLoading(false))
  }, [profile?.role, targetId])

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleFollow = async () => {
    if (!profile) return
    // Guest: show lead-magnet modal instead of API call
    if (!isAuthenticated) {
      setShowFollowAuthModal(true)
      return
    }
    setFollowLoading(true)
    try {
      if (profile.is_following) {
        await api.client.delete(`/api/v1/social/users/${targetId}/follow`)
        setProfile(p => p ? { ...p, is_following: false, followers_count: p.followers_count - 1 } : p)
      } else {
        await api.client.post(`/api/v1/social/users/${targetId}/follow`)
        setProfile(p => p ? { ...p, is_following: true, followers_count: p.followers_count + 1 } : p)
      }
    } catch {}
    setFollowLoading(false)
  }

  const handleMessage = async () => {
    try {
      const res = await api.client.post(`/api/v1/messenger/conversations/${targetId}`)
      navigate(`/messenger/${res.data.id}`)
    } catch {}
  }

  const handleLike = async (postId: number) => { await api.client.post(`/api/v1/social/posts/${postId}/like`) }
  const handleUnlike = async (postId: number) => { await api.client.delete(`/api/v1/social/posts/${postId}/like`) }
  const handleDelete = async (postId: number) => {
    await api.client.delete(`/api/v1/social/posts/${postId}`)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }
  const handleEdit = async (postId: number, content: string) => {
    await api.client.patch(`/api/v1/social/posts/${postId}`, { content })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/30" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch flex items-center justify-center">
        <p className="text-gray-400 dark:text-white/40">Foydalanuvchi topilmadi</p>
      </div>
    )
  }

  const rank = getRankInfo(profile.level || 1)
  const totalStudents = courses.reduce((sum, c) => sum + (c.enrolled_count ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch pb-24">

      {/* ── Guest Follow Auth Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showFollowAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowFollowAuthModal(false)}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-sm bg-white dark:bg-[#1C1C22] rounded-3xl shadow-2xl p-6 border border-gray-200/60 dark:border-white/[0.08]"
            >
              {/* Close */}
              <button
                onClick={() => setShowFollowAuthModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>

              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center mx-auto mb-4 shadow-glow-sm">
                <UserPlus className="w-7 h-7 text-white" />
              </div>

              {/* Text */}
              <h2 className="text-base font-bold text-gray-900 dark:text-white text-center">
                Kuzatish uchun kiring
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2 leading-relaxed">
                Ushbu foydalanuvchini kuzatish va uning yangiliklaridan xabardor bo'lish uchun tizimga kiring.
              </p>

              {/* Buttons */}
              <div className="flex flex-col gap-2.5 mt-5">
                <button
                  onClick={() => { setShowFollowAuthModal(false); navigate('/login') }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sahifa-500 to-sahifa-600 text-white text-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  Tizimga kirish
                </button>
                <button
                  onClick={() => { setShowFollowAuthModal(false); navigate('/register') }}
                  className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/70 text-sm font-semibold border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] active:scale-95 transition-all"
                >
                  Ro'yxatdan o'tish
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky header bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-pitch/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{profile.full_name || profile.username || 'Profil'}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">

        {/* ── Profile card (shared component) ──────────────────────────── */}
        <ProfileHeaderCard
          profile={profile}
          postCount={posts.length}
          courseCount={courses.length}
          studentCount={totalStudents}
          specialization={teacherInfo?.specialization}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          followLoading={followLoading}
          onMessage={handleMessage}
          onEditProfile={() => navigate('/cabinet')}
        />

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="mt-5 flex gap-1 p-1 rounded-xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06]">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white dark:bg-white/[0.08] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.key === 'courses' && courses.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sahifa-500/10 text-sahifa-500 font-bold">
                    {courses.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="mt-5"
          >
            {activeTab === 'lenta' && (
              <LentaTab
                posts={posts}
                viewMode={viewMode}
                setViewMode={setViewMode}
                myId={myId}
                isOwnProfile={isOwnProfile}
                onLike={handleLike}
                onUnlike={handleUnlike}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            )}

            {activeTab === 'haqida' && (
              <HaqidaTab
                profile={profile}
                rank={rank}
                teacherInfo={teacherInfo}
                isTeacher={isTeacher}
              />
            )}

            {activeTab === 'courses' && isTeacher && (
              <CoursesTab courses={courses} loading={coursesLoading} isOwnProfile={isOwnProfile} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Lenta (Posts)
// ═══════════════════════════════════════════════════════════════════════════════
interface LentaTabProps {
  posts: PostData[]
  viewMode: 'list' | 'grid'
  setViewMode: (v: 'list' | 'grid') => void
  myId: number
  isOwnProfile: boolean
  onLike: (id: number) => Promise<void>
  onUnlike: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onEdit: (id: number, content: string) => Promise<void>
}

const LentaTab: React.FC<LentaTabProps> = ({ posts, viewMode, setViewMode, myId, isOwnProfile, onLike, onUnlike, onDelete, onEdit }) => (
  <>
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-white/60">Postlar</h2>
      <div className="flex gap-1">
        <button
          onClick={() => setViewMode('list')}
          className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'text-sahifa-400 bg-sahifa-500/10' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'}`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'text-sahifa-400 bg-sahifa-500/10' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'}`}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
      </div>
    </div>

    {posts.length === 0 ? (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
          <List className="w-8 h-8 text-gray-300 dark:text-white/10" />
        </div>
        <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Hali postlar yo'q</p>
        <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Bu foydalanuvchi hali hech narsa yozmagan</p>
      </div>
    ) : viewMode === 'list' ? (
      <div className="space-y-4">
        {posts.map(post => (
          <div key={post.id} id={`post-${post.id}`}>
            <PostCard
              post={post}
              currentUserId={myId}
              onLike={onLike}
              onUnlike={onUnlike}
              onDelete={isOwnProfile ? onDelete : undefined}
              onEdit={isOwnProfile ? onEdit : undefined}
            />
          </div>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
        {posts.filter(p => p.image_url).map(post => (
          <div
            key={post.id}
            className="aspect-square bg-gray-200 dark:bg-pitch-700 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => { setViewMode('list'); setTimeout(() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}
          >
            <img src={post.image_url!} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
        {posts.filter(p => !p.image_url).map(post => (
          <div
            key={post.id}
            className="aspect-square bg-gray-100 dark:bg-white/[0.03] flex items-center justify-center p-3 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/[0.06] transition-colors"
            onClick={() => { setViewMode('list'); setTimeout(() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}
          >
            <p className="text-[10px] text-gray-500 dark:text-white/40 line-clamp-4 text-center leading-snug">
              {post.content}
            </p>
          </div>
        ))}
      </div>
    )}
  </>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Haqida (About) — Bento Grid
// ═══════════════════════════════════════════════════════════════════════════════
interface HaqidaTabProps {
  profile: ProfileData
  rank: ReturnType<typeof getRankInfo>
  teacherInfo: TeacherExtra | null
  isTeacher: boolean
}

const HaqidaTab: React.FC<HaqidaTabProps> = ({ profile, rank, teacherInfo, isTeacher }) => (
  <div className="grid grid-cols-2 gap-3">

    {/* ── About Me card (full-width) ────────────────────────────────────── */}
    {(profile.about_me || profile.bio) && (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="col-span-2 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-4"
      >
        <h3 className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-sahifa-500" /> Haqida
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{profile.about_me || profile.bio}</p>
      </motion.div>
    )}

    {/* ── Rank card ──────────────────────────────────────────────────────── */}
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-4 text-center"
    >
      <div className="text-3xl mb-1">{rank.emoji}</div>
      <p className="text-sm font-bold text-gray-800 dark:text-white">{rank.title}</p>
      <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">Level {profile.level || 1}</p>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sahifa-400 to-sahifa-500 transition-all duration-500"
          style={{ width: `${Math.min(((profile.xp || 0) % 1200) / 12, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-300 dark:text-white/20 mt-1">{profile.xp || 0} XP</p>
    </motion.div>

    {/* ── Experience card (teachers only) ─────────────────────────────────── */}
    {isTeacher && teacherInfo?.experience_years && (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-4 text-center"
      >
        <div className="text-3xl mb-1">💼</div>
        <p className="text-2xl font-bold text-gray-800 dark:text-white">{teacherInfo.experience_years} <span className="text-sm font-medium text-gray-400">yil</span></p>
        <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">Tajriba</p>
      </motion.div>
    )}

    {/* ── Education card (teachers only) ──────────────────────────────────── */}
    {isTeacher && teacherInfo?.education && (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className={`rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-4 ${!teacherInfo?.experience_years ? 'col-span-1' : 'col-span-2'}`}
      >
        <h3 className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-sahifa-500" /> Ta'lim
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{teacherInfo.education}</p>
      </motion.div>
    )}

    {/* ── Social links card (teachers only) ──────────────────────────────── */}
    {isTeacher && (teacherInfo?.website_url || teacherInfo?.youtube_url || teacherInfo?.telegram_channel) && (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="col-span-2 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-4"
      >
        <h3 className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-sahifa-500" /> Havolalar
        </h3>
        <div className="flex flex-wrap gap-2">
          {teacherInfo.website_url && (
            <a
              href={teacherInfo.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-sahifa-50 dark:hover:bg-sahifa-500/10 hover:text-sahifa-600 dark:hover:text-sahifa-300 transition-colors border border-gray-200/60 dark:border-white/[0.06]"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Vebsayt
            </a>
          )}
          {teacherInfo.youtube_url && (
            <a
              href={teacherInfo.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors border border-red-200/60 dark:border-red-500/10"
            >
              ▶ YouTube
            </a>
          )}
          {teacherInfo.telegram_channel && (
            <a
              href={`https://t.me/${teacherInfo.telegram_channel.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors border border-sky-200/60 dark:border-sky-500/10"
            >
              ✈ Telegram
            </a>
          )}
        </div>
      </motion.div>
    )}

    {/* ── "No data" fallback when both bio and about_me are empty ────────── */}
    {!profile.bio && !profile.about_me && !isTeacher && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="col-span-2 text-center py-12"
      >
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
          <BookOpen className="w-7 h-7 text-gray-300 dark:text-white/10" />
        </div>
        <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Ma'lumot yo'q</p>
        <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Bu foydalanuvchi haqida hali ma'lumot kiritilmagan</p>
      </motion.div>
    )}
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Tab: Kurslar (Courses) — teachers only
// ═══════════════════════════════════════════════════════════════════════════════
interface CoursesTabProps {
  courses: CourseData[]
  loading: boolean
  isOwnProfile?: boolean
}

const CoursesTab: React.FC<CoursesTabProps> = ({ courses, loading, isOwnProfile = false }) => {
  const navigate = useNavigate()
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/90 dark:bg-[#1A1A1A] rounded-[24px] border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden animate-pulse">
            <div className="h-44 bg-slate-100 dark:bg-slate-800" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
          <PlayCircle className="w-8 h-8 text-gray-300 dark:text-white/10" />
        </div>
        <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Hali kurslar yo'q</p>
        <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Bu o'qituvchi hali kurs joylamagan</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {courses.map((course, i) => (
        <div key={course.id} className="relative group/pcourse">
          <CourseCard key={course.id} course={course} index={i} hideTeacher analyticsRef="profile" />
          {isOwnProfile && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/teacher') }}
              className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm text-white text-xs font-semibold opacity-0 group-hover/pcourse:opacity-100 transition-all duration-200 hover:bg-sahifa-500/90 border border-white/10 active:scale-95"
            >
              <PenLine className="w-3.5 h-3.5" /> Tahrirlash
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default PublicProfile
