/**
 * CourseDetailPage — Premium "Focus Mode" redesign
 * Udemy-inspired with Modern Bento twist
 *
 * Desktop (lg+):
 *   LEFT  — Video player (rounded-[24px]) + Tabbed content (Tavsif | Resurslar | Sharhlar)
 *   RIGHT — Sticky sidebar: progress bar + CTA + accordion curriculum
 *
 * Mobile / Telegram:
 *   Stacked: compact header → video → CTA → tab bar → content
 *
 * Theme:
 *   Light: #F8F9FA bg + frosted glass (white/70) containers
 *   Dark:  #1C1C22 bg + deep slate glass containers
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../lib/apiUrl'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import {
  GraduationCap, ArrowLeft, RefreshCw, ArrowUp,
  Banknote, BarChart2, CheckCircle2, ChevronDown, Clock,
  FileText, AlertCircle, Globe, Lock,
  PenLine, Play, HelpCircle, Star, Tag, Share2,
  Users, Video, Zap, Award, ChevronRight, Flame,
} from 'lucide-react'
import VideoPlayer from '../components/VideoPlayer'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import UnifiedComment from '../components/social/UnifiedComment'
import type { UnifiedCommentData } from '../components/social/UnifiedComment'
import UserIdentity from '../components/social/UserIdentity'
import type { UserIdentityUser } from '../components/social/UserIdentity'
import DeleteConfirmModal from '../components/social/DeleteConfirmModal'
import { useAuth } from '../context/AuthContext'
import { useGuestGuard } from '../hooks/useGuestGuard'
import { usePlatform } from '../hooks/usePlatform'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import apiService from '../services/apiService'
import PaymentModal from '../components/PaymentModal'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Course {
  id: number; teacher_id: number; title: string; description: string
  thumbnail_url: string; price: number; is_paid: boolean; is_published: boolean
  level: string; language: string; total_lessons: number
  total_duration_minutes: number; enrolled_count: number; rating: number
  created_at: string
  categories?: { name: string; slug: string; icon: string } | null
}
interface Lesson {
  id: number; title: string; description: string; video_url: string
  video_source: 'youtube' | 'bunny' | 'none'; duration_minutes: number
  order_index: number; is_free: boolean
  lesson_type?: 'video' | 'material' | 'quiz'
  section_title?: string
  material_url?: string; material_name?: string
  // Bunny Stream fields (injected by get_lesson when bunny_video_id is set)
  bunny_video_id?: string
  embed_url?: string
  hls_url?: string
  thumbnail_url?: string
  encoding_status?: string
}
interface Review {
  id: number; student_id: number; rating: number; review: string; created_at: string
  profiles?: { first_name?: string; username?: string; photo_url?: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60), m = minutes % 60
  return h ? `${h} soat${m > 0 ? ' ' + m + ' daq' : ''}` : `${m} daqiqa`
}
function formatLessonDuration(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60), m = minutes % 60
  return h ? `${h}:${m.toString().padStart(2, '0')}` : `${m}:00`
}
function levelLabel(level: string) {
  const map: Record<string, string> = { beginner: "Boshlang'ich", intermediate: "O'rta", advanced: 'Yuqori' }
  return map[level] ?? level
}

/** Map a Review → UnifiedCommentData for the shared component. */
function reviewToCommentData(r: Review): UnifiedCommentData {
  return {
    id: r.id,
    author: {
      telegram_id: r.student_id,
      first_name: r.profiles?.first_name ?? undefined,
      username: r.profiles?.username ?? undefined,
      photo_url: r.profiles?.photo_url ?? undefined,
      role: 'student',
      level: 1,
    },
    content: r.review || '',
    created_at: r.created_at,
    rating: r.rating,
  }
}

// ── RatingWidget ──────────────────────────────────────────────────────────────
interface RatingWidgetProps {
  myRating: number; myReview: string; hoverStar: number; ratingLoading: boolean
  onReviewChange: (v: string) => void
  onHoverStar:    (s: number) => void
  onLeaveStar:    () => void
  onSubmit:       (stars: number) => void
}
const RatingWidget: React.FC<RatingWidgetProps> = ({
  myRating, myReview, hoverStar, ratingLoading,
  onReviewChange, onHoverStar, onLeaveStar, onSubmit,
}) => (
  <div className="p-5 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md">
    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">
      {myRating ? `Sizning bahoyingiz: ${myRating} ★` : 'Kursni baholang'}
    </p>
    <div className="flex gap-1.5 mb-4">
      {[1,2,3,4,5].map(star => (
        <button key={star}
          onMouseEnter={() => onHoverStar(star)} onMouseLeave={onLeaveStar}
          onClick={() => onSubmit(star)} disabled={ratingLoading}
          className="text-3xl transition-all duration-150 hover:scale-125 focus:outline-none disabled:cursor-not-allowed"
          style={{ color: (hoverStar || myRating) >= star ? '#F59E0B' : '#cbd5e1' }}
        >★</button>
      ))}
      {ratingLoading && <RefreshCw className="w-4 h-4 text-gray-400 ml-2 self-center animate-spin" />}
    </div>
    <textarea
      value={myReview} onChange={e => onReviewChange(e.target.value)}
      placeholder="Qo'shimcha fikr bildiring (ixtiyoriy)..." rows={2}
      className="w-full text-xs rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-[#F8F9FA] dark:bg-white/[0.04] text-gray-800 dark:text-gray-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#F15929]/40 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-shadow"
    />
    {myReview.trim() && (
      <button onClick={() => onSubmit(myRating || 5)} disabled={ratingLoading}
        className="mt-2.5 w-full py-2.5 rounded-xl text-xs font-bold bg-[#F15929] text-white hover:bg-[#e84e22] disabled:opacity-50 transition-all active:scale-[.98]">
        Saqlash
      </button>
    )}
  </div>
)

// ══════════════════════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════════════════════
const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { withAuth } = useGuestGuard()
  const { isTelegram } = usePlatform()
  useTelegramWebApp()
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── State ───────────────────────────────────────────────────────────────
  const [course,         setCourse]         = useState<Course | null>(null)
  const [lessons,        setLessons]        = useState<Lesson[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [activeLesson,   setActiveLesson]   = useState<Lesson | null>(null)
  const [isEnrolled,     setIsEnrolled]     = useState(false)
  const [enrollLoading,  setEnrollLoading]  = useState(false)
  const [completedIds,   setCompletedIds]   = useState<Set<number>>(new Set())
  const [showCert,       setShowCert]       = useState(false)
  const [certData,       setCertData]       = useState<CertificateData | null>(null)
  const [reviews,        setReviews]        = useState<Review[]>([])
  const [myRating,       setMyRating]       = useState(0)
  const [myReview,       setMyReview]       = useState('')
  const [hoverStar,      setHoverStar]      = useState(0)
  const [ratingLoading,  setRatingLoading]  = useState(false)
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [teacherProfile, setTeacherProfile] = useState<{
    first_name?: string | null; username?: string | null; photo_url?: string | null
    specialization?: string | null; bio?: string | null
  } | null>(null)
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Content tab (Tavsif | Resurslar | Sharhlar)
  const [contentTab, setContentTab] = useState<'description' | 'resources' | 'reviews'>('description')
  // Mobile view toggle (Kurs | Darslar)
  const [mobileView, setMobileView] = useState<'content' | 'curriculum'>('content')

  // Scroll-to-top
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Share button feedback
  const [shareCopied, setShareCopied] = useState(false)

  // Review menu & delete (UnifiedComment)
  const [showReviewMenu,     setShowReviewMenu]     = useState<number | null>(null)
  const [deleteReviewTarget, setDeleteReviewTarget] = useState<number | null>(null)
  const [deletingReview,     setDeletingReview]     = useState(false)

  // ── Derived ─────────────────────────────────────────────────────────────
  const courseId    = parseInt(id ?? '0', 10)
  const isOwner     = !!(user && (user.id === course?.teacher_id || user.role === 'admin'))
  const freeLessons = lessons.filter(l => l.is_free).length
  const progressPct = lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0
  const avgRating   = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : (course?.rating ?? 0)

  // Teacher as UserIdentityUser for the unified component
  const teacherUser: UserIdentityUser | null = teacherProfile ? {
    telegram_id: course?.teacher_id ?? 0,
    first_name: teacherProfile.first_name ?? undefined,
    username: teacherProfile.username ?? undefined,
    photo_url: teacherProfile.photo_url ?? undefined,
    role: 'teacher',
    level: 10,
  } : null

  // ── Scroll listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Load course + lessons ─────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId) { setError('Kurs topilmadi'); setLoading(false); return }
    Promise.all([apiService.getCourse(courseId), apiService.getLessons(courseId)])
      .then(async ([courseRes, lessonsRes]) => {
        setCourse(courseRes.data)
        setLessons(lessonsRes.data ?? [])
        if (user && user.id !== courseRes.data?.teacher_id && user.role !== 'admin') {
          try {
            const r = await apiService.checkEnrollment(courseId)
            setIsEnrolled(!!r.data?.enrolled)
          } catch { setIsEnrolled(false) }
        }
      })
      .catch(() => setError("Kurs yuklanmadi. Iltimos, qayta urinib ko'ring."))
      .finally(() => setLoading(false))
  }, [courseId, user])

  // ── Track course_view event ─────────────────────────────────────────────
  useEffect(() => {
    if (!course) return
    const ref = searchParams.get('ref') || 'direct'
    apiService.trackAnalyticsEvents([{
      event_type: 'course_view',
      target_id: course.id,
      teacher_id: course.teacher_id,
      source: ref,
    }]).catch(() => {})
  }, [course?.id])

  // ── Lesson progress ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId || !isEnrolled) return
    apiService.getMyLessonProgress(courseId)
      .then(res => setCompletedIds(new Set(res.data?.completed_lesson_ids ?? [])))
      .catch(() => {})
  }, [courseId, isEnrolled])

  // ── Teacher profile ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!course?.teacher_id) return
    apiService.getPublicTeacherProfile(course.teacher_id)
      .then(res => setTeacherProfile(res.data))
      .catch(() => {})
  }, [course?.teacher_id])

  // ── Reviews ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId) return
    setReviewsLoading(true)
    apiService.getCourseReviews(courseId)
      .then(r => setReviews(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setReviewsLoading(false))
  }, [courseId])

  useEffect(() => {
    if (!courseId || !user) return
    apiService.getMyCourseRating(courseId)
      .then(r => { setMyRating(r.data?.rating ?? 0); setMyReview(r.data?.review ?? '') })
      .catch(() => {})
  }, [courseId, user])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectLesson = useCallback(async (lesson: Lesson) => {
    const unlocked = lesson.is_free || isOwner || isEnrolled
    if (!unlocked) return
    setActiveLesson(lesson)
    try {
      const res = await apiService.getLesson(lesson.id)
      const d = res.data
      const updated = {
        ...lesson,
        video_url:       d?.video_url    ?? '',
        video_source:    d?.video_source ?? lesson.video_source,
        description:     d?.description  ?? lesson.description,
        // Bunny Stream signed URLs (injected by backend when bunny_video_id is set)
        bunny_video_id:  d?.bunny_video_id  ?? '',
        embed_url:       d?.embed_url       ?? '',
        hls_url:         d?.hls_url         ?? '',
        thumbnail_url:   d?.thumbnail_url   ?? '',
        encoding_status: d?.encoding_status ?? '',
      }
      setLessons(prev => prev.map(l => l.id === lesson.id ? updated : l))
      setActiveLesson(updated)
      if (d?.video_url || d?.embed_url || lesson.video_source === 'youtube') {
        apiService.completeLesson(lesson.id)
          .then(() => setCompletedIds(prev => new Set([...prev, lesson.id])))
          .catch(() => {})
      }
    } catch { /* toast handled by apiService */ }
    if (window.innerWidth < 1024) setMobileView('content')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isOwner, isEnrolled])

  const handleSubmitRating = useCallback(async (stars: number) => {
    if (!stars || ratingLoading) return
    setRatingLoading(true)
    try {
      await apiService.rateCourse(courseId, stars, myReview)
      setMyRating(stars)
      const r = await apiService.getCourseReviews(courseId)
      setReviews(Array.isArray(r.data) ? r.data : [])
      setCourse(prev => {
        if (!prev) return prev
        const all = r.data as Review[]
        const avg = all.length ? all.reduce((s: number, x: Review) => s + x.rating, 0) / all.length : 0
        return { ...prev, rating: parseFloat(avg.toFixed(2)) }
      })
    } catch { /* toast */ }
    setRatingLoading(false)
  }, [ratingLoading, courseId, myReview])

  const handleEditReview = useCallback(async (reviewId: number, newContent: string) => {
    try {
      await apiService.rateCourse(courseId, myRating || 5, newContent)
      setMyReview(newContent)
      setReviews(prev =>
        prev.map(r => r.id === reviewId ? { ...r, review: newContent } : r),
      )
    } catch { /* toast */ }
  }, [courseId, myRating])

  const handleConfirmDeleteReview = useCallback(async () => {
    if (deleteReviewTarget === null) return
    setDeletingReview(true)
    try {
      await apiService.rateCourse(courseId, 0, '')
      setMyRating(0)
      setMyReview('')
      setReviews(prev => prev.filter(r => r.id !== deleteReviewTarget))
    } catch { /* toast */ }
    setDeletingReview(false)
    setDeleteReviewTarget(null)
  }, [deleteReviewTarget, courseId])

  const handleEnroll = useCallback(async () => {
    if (!course || isOwner || isEnrolled || enrollLoading) return
    if (course.is_paid) { setShowPaymentModal(true); return }
    setEnrollLoading(true)
    try {
      await apiService.enrollCourse(course.id)
      setIsEnrolled(true)
      setCourse(prev => prev ? { ...prev, enrolled_count: (prev.enrolled_count ?? 0) + 1 } : prev)
    } finally { setEnrollLoading(false) }
  }, [course, isOwner, isEnrolled, enrollLoading])

  const handlePaymentSuccess = useCallback(() => {
    setIsEnrolled(true)
    setShowPaymentModal(false)
    setCourse(prev => prev ? { ...prev, enrolled_count: (prev.enrolled_count ?? 0) + 1 } : prev)
  }, [])

  const handleOpenCertificate = useCallback(() => {
    if (!course || completedIds.size !== lessons.length || lessons.length === 0) return
    setCertData({
      type:          'course',
      userName:      user?.first_name || user?.username || 'Talaba',
      quizTitle:     course.title,
      score: lessons.length, total: lessons.length, percentage: 100,
      date:          new Date().toLocaleDateString('uz-UZ'),
      certificateId: `CRS-${course.id}-${user?.id ?? 'UNKNOWN'}`,
    })
    setShowCert(true)
  }, [course, completedIds, lessons, user])

  const handleMarkLessonCompleted = useCallback((lessonId?: number) => {
    if (!lessonId || !isEnrolled) return
    apiService.completeLesson(lessonId)
      .then(() => setCompletedIds(prev => new Set([...prev, lessonId])))
      .catch(() => {})
  }, [isEnrolled])

  const handleLeaveStar = useCallback(() => setHoverStar(0), [])
  const toggleModule    = useCallback((key: string) => setCollapsedModules(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  }), [])

  const handleShareCourse = useCallback(async () => {
    if (!course) return
    const url  = `${API_BASE}/api/og/course/${course.id}`
    const text = `${course.title} — SAHIFALAB da o'rganing!`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: course.title, text, url })
      } else {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2500)
      }
    } catch { /* user cancelled */ }
  }, [course])

  const ratingWidgetProps: RatingWidgetProps = {
    myRating, myReview, hoverStar, ratingLoading,
    onReviewChange: setMyReview,
    onHoverStar:    setHoverStar,
    onLeaveStar:    handleLeaveStar,
    onSubmit:       handleSubmitRating,
  }

  // ── Module grouping ─────────────────────────────────────────────────────
  const modules: { title: string; lessons: Lesson[] }[] = []
  for (const lesson of lessons) {
    const st   = lesson.section_title?.trim() || 'Darslar'
    const last = modules[modules.length - 1]
    if (last && last.title === st) last.lessons.push(lesson)
    else modules.push({ title: st, lessons: [lesson] })
  }
  const multiModule = modules.length > 1

  // Resources (PDF / material lessons)
  const resourceLessons = lessons.filter(l => l.material_url)

  // ════════════════════════════════════════════════════════════════════════
  // Sidebar renderer (shared between desktop + mobile)
  // ════════════════════════════════════════════════════════════════════════
  const renderSidebar = () => (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md overflow-hidden flex flex-col lg:max-h-[calc(100vh-88px)]">

      {/* ── Progress bar at very top ─────────────────────────────────── */}
      {(isEnrolled || isOwner) && lessons.length > 0 && (
        <div className="px-5 pt-4 pb-3 border-b border-gray-200/40 dark:border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-white/40">Kurs progressi</span>
            <span className={`text-[11px] font-black tabular-nums ${progressPct === 100 ? 'text-emerald-500' : 'text-[#F15929]'}`}>
              {completedIds.size}/{lessons.length} · {progressPct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${progressPct === 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-[#F15929] to-[#FF8C5A]'}`}
              initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {progressPct === 100 && (
            <button onClick={handleOpenCertificate}
              className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-105 transition-all flex items-center justify-center gap-2 active:scale-[.98]">
              <GraduationCap className="w-4 h-4" /> Sertifikat olish
            </button>
          )}
        </div>
      )}

      {/* ── CTA (desktop only) ────────────────────────────────────────── */}
      <div className="hidden lg:block px-5 py-4 border-b border-gray-200/40 dark:border-white/[0.04]">
        {course!.is_paid && !isOwner && !isEnrolled && (
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-2xl font-black text-gray-900 dark:text-white">{course!.price.toLocaleString()}</span>
            <span className="text-xs text-gray-400">so'm</span>
          </div>
        )}

        {!isOwner ? (
          <button onClick={withAuth(handleEnroll)} disabled={isEnrolled || enrollLoading}
            className={[
              'w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[.98] flex items-center justify-center gap-2',
              isEnrolled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 cursor-default'
                : 'bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-glow-sm hover:shadow-glow hover:brightness-105',
            ].join(' ')}>
            {isEnrolled    ? <><CheckCircle2 className="w-4 h-4" /> Yozilgansiz</> :
             enrollLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Yuklanmoqda...</> :
             course!.is_paid ? <><Banknote className="w-4 h-4" /> Sotib olish</> :
                              <><Zap className="w-4 h-4" /> Bepul boshlash</>}
          </button>
        ) : (
          <div className="space-y-2">
            <Link to={`/courses/${course!.id}/edit`}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-glow-sm hover:brightness-105 transition-all">
              <PenLine className="w-4 h-4" /> Kursni tahrirlash
            </Link>
            <Link to={`/courses/${course!.id}/lessons/add`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-xs bg-gray-100 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition-all">
              + Yangi dars qo'shish
            </Link>
          </div>
        )}

        {!isOwner && !isEnrolled && freeLessons > 0 && (
          <p className="text-center text-[10px] text-gray-400 dark:text-white/25 mt-2">✦ {freeLessons} ta bepul dars</p>
        )}
      </div>

      {/* ── Curriculum header ──────────────────────────────────────────── */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-200/40 dark:border-white/[0.04]">
        <h3 className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wider">Dars rejasi</h3>
        <span className="text-[10px] text-gray-400 dark:text-white/25 font-medium">
          {lessons.length} dars{course!.total_duration_minutes > 0 ? ` · ${formatDuration(course!.total_duration_minutes)}` : ''}
        </span>
      </div>

      {/* ── Accordion lesson list ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {lessons.length === 0 ? (
          <div className="text-center py-10 px-5 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mx-auto">
              <Video className="w-6 h-6 text-gray-300 dark:text-white/15" />
            </div>
            <p className="text-xs text-gray-400 dark:text-white/25">
              {isOwner ? "Hali dars qo'shilmagan" : "Darslar tez orada qo'shiladi"}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {modules.map((mod, modIdx) => {
              const isCollapsed  = collapsedModules.has(String(modIdx))
              const modCompleted = mod.lessons.filter(l => completedIds.has(l.id)).length
              const modPct       = mod.lessons.length > 0 ? Math.round((modCompleted / mod.lessons.length) * 100) : 0
              return (
                <div key={modIdx}>
                  {/* Module accordion header */}
                  {multiModule && (
                    <button type="button" onClick={() => toggleModule(String(modIdx))}
                      className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors group">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F15929]/8 text-[10px] font-black text-[#F15929] shrink-0">
                        {modIdx + 1}
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <span className="text-xs font-bold text-gray-800 dark:text-white truncate block">{mod.title}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400 dark:text-white/25">{mod.lessons.length} dars</span>
                          {modCompleted > 0 && (
                            <span className={`text-[10px] font-bold ${modPct === 100 ? 'text-emerald-500' : 'text-[#F15929]'}`}>
                              {modCompleted}/{mod.lessons.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                  )}

                  {/* Lessons within module */}
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={multiModule ? { height: 0, opacity: 0 } : false}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className={multiModule ? 'pb-1' : ''}>
                          {mod.lessons.map((lesson) => {
                            const isActive    = activeLesson?.id === lesson.id
                            const isCompleted = completedIds.has(lesson.id)
                            const isUnlocked  = lesson.is_free || isOwner || isEnrolled
                            const isQuiz      = lesson.lesson_type === 'quiz'
                            const isMat       = !!(lesson.material_url && !lesson.video_url) || lesson.lesson_type === 'material'

                            return (
                              <div
                                key={lesson.id}
                                onClick={isUnlocked ? () => handleSelectLesson(lesson) : undefined}
                                className={[
                                  'flex items-center gap-3 px-5 py-2.5 transition-all duration-200 relative',
                                  isActive
                                    ? 'bg-[#F15929]/[0.06] dark:bg-[#F15929]/[0.08] border-l-[3px] border-l-[#F15929]'
                                    : 'border-l-[3px] border-l-transparent',
                                  isUnlocked
                                    ? 'cursor-pointer hover:bg-gray-100/50 dark:hover:bg-white/[0.03]'
                                    : 'opacity-40 cursor-not-allowed',
                                ].join(' ')}
                              >
                                {/* Status icon */}
                                <div className={[
                                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                  isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                                  isActive    ? 'bg-[#F15929]/10 text-[#F15929]' :
                                  isUnlocked  ? 'bg-gray-100 dark:bg-white/[0.04] text-gray-400 dark:text-white/25' :
                                                'bg-gray-100 dark:bg-white/[0.03] text-gray-300 dark:text-white/15',
                                ].join(' ')}>
                                  {isCompleted  ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                                   !isUnlocked  ? <Lock className="w-3 h-3" /> :
                                   isQuiz       ? <HelpCircle className="w-3.5 h-3.5" /> :
                                   isMat        ? <FileText className="w-3.5 h-3.5" /> :
                                   isActive     ? <Play className="w-3.5 h-3.5 fill-current" /> :
                                                  <Play className="w-3.5 h-3.5" />}
                                </div>

                                {/* Title + meta */}
                                <div className="flex-1 min-w-0">
                                  <p className={[
                                    'text-xs font-semibold truncate leading-snug',
                                    isActive    ? 'text-[#F15929]' :
                                    isCompleted ? 'text-emerald-700 dark:text-emerald-400' :
                                                  'text-gray-700 dark:text-gray-300',
                                  ].join(' ')}>
                                    {lesson.title}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {lesson.is_free && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold">Bepul</span>
                                    )}
                                    {isQuiz && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-bold">Quiz</span>
                                    )}
                                  </div>
                                </div>

                                {/* Duration tag */}
                                {lesson.duration_minutes > 0 && (
                                  <span className="text-[10px] text-gray-400 dark:text-white/25 font-mono tabular-nums shrink-0">
                                    {formatLessonDuration(lesson.duration_minutes)}
                                  </span>
                                )}

                                {/* Owner edit button */}
                                {isOwner && (
                                  <Link to={`/courses/${courseId}/lessons/${lesson.id}/edit`} onClick={e => e.stopPropagation()}
                                    className="shrink-0 p-1 text-gray-300 dark:text-white/15 hover:text-[#F15929] transition-colors">
                                    <PenLine className="w-3 h-3" />
                                  </Link>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════
  // SKELETON
  // ════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#1C1C22]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-5">
          <div className="h-8 w-36 rounded-xl bg-gray-200/60 dark:bg-white/[0.06]" />
          <div className="h-[400px] rounded-[24px] bg-gray-200/60 dark:bg-white/[0.06]" />
          <div className="flex gap-6">
            <div className="flex-1 space-y-3">
              <div className="h-7 w-3/4 rounded-xl bg-gray-200/60 dark:bg-white/[0.06]" />
              <div className="h-4 w-1/2 rounded-xl bg-gray-200/60 dark:bg-white/[0.06]" />
            </div>
            <div className="w-[380px] hidden lg:block space-y-3">
              <div className="h-20 rounded-2xl bg-gray-200/60 dark:bg-white/[0.06]" />
              <div className="h-40 rounded-2xl bg-gray-200/60 dark:bg-white/[0.06]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (error || !course) return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#1C1C22] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{error || 'Kurs topilmadi'}</p>
        <button onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F15929] hover:text-[#e84e22] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Kurslarga qaytish
        </button>
      </div>
    </div>
  )

  // ── OG / share derivations (course is non-null past the error guard) ─────
  const ogDesc   = course.description
    ? course.description.replace(/\n+/g, ' ').slice(0, 160).trimEnd() +
      (course.description.length > 160 ? '\u2026' : '')
    : `SAHIFALAB — ${levelLabel(course.level)} daraja kursi. ${course.total_lessons} ta dars.`
  const courseUrl = `${window.location.origin}/courses/${course.id}`
  const ogImage   = course.thumbnail_url || 'https://sahifalab-hub-bot.vercel.app/sahifalab.jpg'
  const ogTitle   = `${course.title} — SAHIFALAB`

  // ════════════════════════════════════════════════════════════════════════
  // MAIN RENDER — Focus Mode
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div ref={scrollRef} className="min-h-screen bg-[#F8F9FA] dark:bg-[#1C1C22] transition-colors duration-300">

      {/* ── Dynamic OG / Twitter meta tags ──────────────────────────── */}
      <Helmet>
        <title>{ogTitle}</title>
        <meta name="description" content={ogDesc} />
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SAHIFALAB" />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDesc} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={courseUrl} />
        {/* Twitter / X card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDesc} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* ── STICKY TOP NAV ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-[#1C1C22]/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4 h-14">
          <button onClick={() => navigate('/courses')}
            className="flex items-center gap-1.5 text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 text-xs font-medium transition-all group shrink-0">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Kurslarga qaytish</span>
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{course.title}</p>
          </div>

          {/* Nav progress */}
          {(isEnrolled || isOwner) && lessons.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-24 h-1.5 rounded-full bg-gray-200/60 dark:bg-white/[0.08] overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-[#F15929]'}`}
                  initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums ${progressPct === 100 ? 'text-emerald-500' : 'text-gray-500 dark:text-white/40'}`}>{progressPct}%</span>
            </div>
          )}
          {avgRating > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {avgRating.toFixed(1)}
            </span>
          )}

          {/* Share button — glassmorphism light / orange-glow dark */}
          <button
            onClick={handleShareCourse}
            title="Kursni ulashish"
            className={[
              'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95',
              'border border-gray-200/70 bg-white/60 backdrop-blur-sm',
              'hover:bg-white/90 hover:border-gray-300/70',
              'dark:border-white/[0.08] dark:bg-white/[0.04]',
              shareCopied
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-500/25 dark:shadow-none'
                : 'text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-[#F15929] dark:hover:border-[#F15929]/25 dark:hover:shadow-[0_0_14px_rgba(241,89,41,0.18)]',
            ].join(' ')}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{shareCopied ? '\u2713 Nusxalandi' : 'Ulashish'}</span>
          </button>
        </div>
      </div>

      {/* ── MAIN 2-COLUMN LAYOUT ───────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ══ LEFT COLUMN — Video + Tabs ══════════════════════════════ */}
          <div className="flex-1 min-w-0">

            {/* Video player — rounded-[24px] */}
            <div className="rounded-[24px] overflow-hidden bg-black shadow-bento dark:shadow-glass-lg">
              {(activeLesson?.video_url || activeLesson?.embed_url) ? (
                <div className="aspect-video">
                  <VideoPlayer
                    videoSource={activeLesson.video_source ?? 'bunny'}
                    videoUrl={activeLesson.video_url}
                    embedUrl={activeLesson.embed_url}
                    hlsUrl={activeLesson.hls_url}
                    thumbnailUrl={activeLesson.thumbnail_url}
                    encodingStatus={activeLesson.encoding_status}
                    title={activeLesson.title}
                  />
                </div>
              ) : (
                <div className="aspect-video relative overflow-hidden">
                  {course.thumbnail_url
                    ? <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-[#1C1C22] to-[#14141A]" />
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <motion.div
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }}
                      className="relative cursor-pointer"
                      onClick={() => {
                        const first = lessons.find(l => l.is_free || isOwner || isEnrolled)
                        if (first) handleSelectLesson(first)
                      }}
                    >
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                        className="absolute inset-0 rounded-full bg-white/15"
                      />
                      <div className="relative w-16 h-16 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)]">
                        <Play className="w-7 h-7 text-gray-900 ml-1 fill-gray-900" />
                      </div>
                    </motion.div>
                    <div className="text-center">
                      <p className="text-white font-semibold text-sm drop-shadow">Kursni ko'rish</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {freeLessons > 0 ? `${freeLessons} ta bepul dars mavjud` : 'Darsni tanlang'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active lesson info */}
            {activeLesson && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{activeLesson.title}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    {activeLesson.duration_minutes > 0 && (
                      <span className="text-xs text-gray-400 dark:text-white/35 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {activeLesson.duration_minutes} daq
                      </span>
                    )}
                  </div>
                </div>
                {completedIds.has(activeLesson.id) ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Tugatildi
                  </span>
                ) : isEnrolled ? (
                  <button onClick={() => handleMarkLessonCompleted(activeLesson.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#F15929]/8 hover:bg-[#F15929]/15 text-[#F15929] border border-[#F15929]/20 transition-all active:scale-95">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Tugatildi
                  </button>
                ) : null}
              </motion.div>
            )}

            {/* ── MOBILE CTA ──────────────────────────────────────────── */}
            <div className="lg:hidden mt-5">
              <div className="p-4 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md">
                {!isOwner ? (
                  <button onClick={withAuth(handleEnroll)} disabled={isEnrolled || enrollLoading}
                    className={[
                      'w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[.98] flex items-center justify-center gap-2',
                      isEnrolled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 cursor-default'
                        : 'bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-glow-sm hover:shadow-glow',
                    ].join(' ')}>
                    {isEnrolled    ? <><CheckCircle2 className="w-4 h-4" /> Yozilgansiz</> :
                     enrollLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Yuklanmoqda...</> :
                     course.is_paid ? <><Banknote className="w-4 h-4" /> {course.price.toLocaleString()} so'm — Sotib olish</> :
                                      <><Zap className="w-4 h-4" /> Bepul boshlash</>}
                  </button>
                ) : (
                  <Link to={`/courses/${course.id}/edit`}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-glow-sm transition-all">
                    <PenLine className="w-4 h-4" /> Tahrirlash
                  </Link>
                )}
              </div>
            </div>

            {/* ── MOBILE VIEW TOGGLE ──────────────────────────────────── */}
            <div className="lg:hidden flex gap-1 mt-4 p-1 bg-gray-100 dark:bg-white/[0.04] rounded-xl">
              {(['content', 'curriculum'] as const).map(v => (
                <button key={v} onClick={() => setMobileView(v)}
                  className={[
                    'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
                    mobileView === v
                      ? 'bg-white dark:bg-white/[0.08] text-[#F15929] shadow-sm'
                      : 'text-gray-500 dark:text-white/40',
                  ].join(' ')}>
                  {v === 'content' ? 'Kurs' : `Darslar (${lessons.length})`}
                </button>
              ))}
            </div>

            {/* ── MOBILE CURRICULUM ───────────────────────────────────── */}
            <AnimatePresence mode="wait">
              {mobileView === 'curriculum' && (
                <motion.div key="mob-cur" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="lg:hidden mt-4">
                  {renderSidebar()}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── TABBED CONTENT ──────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              {(mobileView === 'content' || !isTelegram) && (
                <motion.div key="tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                  {/* Tab bar — orange underline */}
                  <div className="mt-6 border-b border-gray-200/60 dark:border-white/[0.06]">
                    <div className="flex gap-6">
                      {([
                        { id: 'description' as const, label: 'Tavsif' },
                        { id: 'resources' as const,   label: 'Resurslar' },
                        { id: 'reviews' as const,     label: `Sharhlar${reviews.length ? ` (${reviews.length})` : ''}` },
                      ]).map(tab => (
                        <button key={tab.id} onClick={() => setContentTab(tab.id)}
                          className={[
                            'relative pb-3 text-sm font-semibold transition-colors',
                            contentTab === tab.id
                              ? 'text-[#F15929]'
                              : 'text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white/60',
                          ].join(' ')}>
                          {tab.label}
                          {contentTab === tab.id && (
                            <motion.div
                              layoutId="tab-underline"
                              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#F15929] rounded-full"
                              transition={{ duration: 0.25, ease: 'easeOut' }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tab content */}
                  <div className="mt-6">
                    <AnimatePresence mode="wait">

                      {/* ── TAVSIF ───────────────────────────────────── */}
                      {contentTab === 'description' && (
                        <motion.div key="t-desc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-6">

                          {/* Description card */}
                          {(course.description || activeLesson?.description) && (
                            <div className="p-5 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md">
                              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {activeLesson?.description || course.description}
                              </p>
                            </div>
                          )}

                          {/* Stats grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { icon: Video,    label: 'Darslar',    value: `${course.total_lessons}`,              show: course.total_lessons > 0 },
                              { icon: Clock,    label: 'Davomiylik', value: formatDuration(course.total_duration_minutes), show: course.total_duration_minutes > 0 },
                              { icon: BarChart2, label: 'Daraja',    value: levelLabel(course.level),                show: true },
                              { icon: Users,    label: 'Talabalar',  value: course.enrolled_count.toLocaleString(), show: course.enrolled_count > 0 },
                            ].filter(s => s.show).map((stat, i) => (
                              <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                className="p-4 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md text-center">
                                <stat.icon className="w-4 h-4 text-[#F15929]/60 mx-auto mb-1.5" />
                                <p className="text-sm font-bold text-gray-800 dark:text-white">{stat.value}</p>
                                <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">{stat.label}</p>
                              </motion.div>
                            ))}
                          </div>

                          {/* Teacher block — UserIdentity */}
                          {teacherUser && (
                            <div className="p-5 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md cursor-pointer hover:border-[#F15929]/20 transition-all group"
                              onClick={() => navigate(`/profile/${course.teacher_id}?tab=courses`)}>
                              <p className="text-[10px] text-gray-400 dark:text-white/30 font-semibold uppercase tracking-widest mb-3">O'qituvchi</p>
                              <div className="flex items-center justify-between">
                                <UserIdentity user={teacherUser} size="md" showRank showBadge />
                                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/20 group-hover:text-[#F15929] group-hover:translate-x-0.5 transition-all" />
                              </div>
                              {teacherProfile?.specialization && (
                                <p className="text-xs text-gray-400 dark:text-white/30 mt-3 pl-[52px]">{teacherProfile.specialization}</p>
                              )}
                            </div>
                          )}

                          {/* Badges */}
                          <div className="flex flex-wrap gap-2">
                            {course.categories && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F15929]/8 border border-[#F15929]/15 text-[#F15929] text-[11px] font-bold">
                                <Tag className="w-3 h-3" /> {course.categories.name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-500 dark:text-white/40 text-[11px] font-medium">
                              <Globe className="w-3 h-3" /> {course.language.toUpperCase()}
                            </span>
                            {!course.is_published && (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/20 text-amber-600 dark:text-amber-400 text-[11px] font-bold">Qoralama</span>
                            )}
                            {(avgRating >= 4.5 && (reviews.length >= 3 || course.rating >= 4.5)) && (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/20 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                                <Flame className="w-3 h-3" /> Top baholangan
                              </span>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* ── RESURSLAR ─────────────────────────────────── */}
                      {contentTab === 'resources' && (
                        <motion.div key="t-res" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-3">
                          {resourceLessons.length === 0 ? (
                            <div className="text-center py-12 space-y-3">
                              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mx-auto">
                                <FileText className="w-6 h-6 text-gray-300 dark:text-white/15" />
                              </div>
                              <p className="text-xs text-gray-400 dark:text-white/25">Hozircha resurslar yo'q</p>
                            </div>
                          ) : (
                            resourceLessons.map((lesson, i) => (
                              <motion.a key={lesson.id} href={lesson.material_url!} target="_blank" rel="noopener noreferrer"
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                className="flex items-center gap-3 p-4 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md hover:border-blue-300 dark:hover:border-blue-500/20 transition-all group">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/15 flex items-center justify-center shrink-0">
                                  <FileText className="w-5 h-5 text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {lesson.material_name || lesson.title}
                                  </p>
                                  <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">PDF Material</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/15 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                              </motion.a>
                            ))
                          )}

                          {activeLesson?.material_url && (
                            <div className="p-4 rounded-2xl border-2 border-dashed border-[#F15929]/20 bg-[#F15929]/[0.03]">
                              <p className="text-[10px] text-[#F15929]/60 font-bold uppercase tracking-wider mb-2">Joriy dars materiali</p>
                              <a href={activeLesson.material_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-[#F15929] hover:text-[#e84e22] transition-colors">
                                <FileText className="w-4 h-4" /> {activeLesson.material_name || 'PDF yuklab olish'}
                              </a>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* ── SHARHLAR ──────────────────────────────────── */}
                      {contentTab === 'reviews' && (
                        <motion.div key="t-rev" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
                          {user && <RatingWidget {...ratingWidgetProps} />}

                          {/* Rating distribution */}
                          {reviews.length > 0 && (
                            <div className="flex gap-5 items-start p-5 rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md">
                              <div className="text-center shrink-0">
                                <div className="text-4xl font-black text-amber-500 leading-none">{avgRating.toFixed(1)}</div>
                                <div className="flex justify-center gap-0.5 mt-2">
                                  {[1,2,3,4,5].map(s => (
                                    <Star key={s} className={`w-3 h-3 ${s <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-white/10'}`} />
                                  ))}
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">{reviews.length} sharh</p>
                              </div>
                              <div className="flex-1 space-y-1.5">
                                {[5,4,3,2,1].map(star => {
                                  const count = reviews.filter(r => r.rating === star).length
                                  const pct   = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                                  return (
                                    <div key={star} className="flex items-center gap-2">
                                      <span className="text-[10px] text-gray-500 dark:text-white/30 w-2.5 text-right font-bold shrink-0">{star}</span>
                                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />
                                      <div className="flex-1 h-1.5 rounded-full bg-gray-200/60 dark:bg-white/[0.06] overflow-hidden">
                                        <motion.div className="h-full rounded-full bg-amber-400" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, delay: (5 - star) * 0.06 }} />
                                      </div>
                                      <span className="text-[10px] text-gray-400/50 w-4 text-right shrink-0">{count}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Reviews list */}
                          {reviewsLoading ? (
                            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-gray-300 dark:text-white/15 animate-spin" /></div>
                          ) : reviews.length === 0 ? (
                            <p className="text-xs text-gray-400 dark:text-white/25 text-center py-8">Hali sharh yo'q. Birinchi bo'lib fikr bildiring!</p>
                          ) : (
                            <div className="space-y-2.5">
                              <AnimatePresence>
                                {reviews.map(r => {
                                  const isReviewOwner = !!(user && user.id === r.student_id)
                                  return (
                                    <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                                      <UnifiedComment
                                        comment={reviewToCommentData(r)}
                                        isOwner={isReviewOwner}
                                        menuOpen={showReviewMenu === r.id}
                                        onToggleMenu={() => setShowReviewMenu(showReviewMenu === r.id ? null : r.id)}
                                        onEdit={handleEditReview}
                                        onRequestDelete={id => setDeleteReviewTarget(id)}
                                        onAuthorClick={() => navigate(`/profile/${r.student_id}`)}
                                      />
                                    </motion.div>
                                  )
                                })}
                              </AnimatePresence>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ══ RIGHT COLUMN — Sticky Sidebar (Desktop) ═══════════════ */}
          <div className="hidden lg:block w-[380px] xl:w-[400px] shrink-0">
            <div className="sticky top-[72px]">
              {renderSidebar()}
            </div>
          </div>

        </div>
      </div>

      {/* ── SCROLL TO TOP FAB ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-white/80 dark:bg-white/[0.08] backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08] shadow-frost-lg dark:shadow-glass flex items-center justify-center text-gray-500 dark:text-white/50 hover:text-[#F15929] hover:border-[#F15929]/20 transition-all active:scale-90"
          >
            <ArrowUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── MODALS ─────────────────────────────────────────────────────── */}
      {showCert && certData && <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />}
      {course && (
        <PaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
          itemType="course"
          itemId={course.id}
          itemTitle={course.title}
          priceUzs={course.price}
        />
      )}
      <DeleteConfirmModal
        open={deleteReviewTarget !== null}
        title="Sharhni o'chirish"
        description="Bu sharh butunlay o'chiriladi. Ortga qaytarib bo'lmaydi."
        loading={deletingReview}
        onConfirm={handleConfirmDeleteReview}
        onCancel={() => setDeleteReviewTarget(null)}
      />
    </div>
  )
}

export default CourseDetailPage
