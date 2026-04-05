/**
 * CourseDetailPage — Premium redesign
 * MasterClass × Notion × Stripe-level polish
 *
 * Desktop (lg+):
 *   LEFT  — hero → video player → lesson info → description → rating → reviews
 *   RIGHT — sticky CTA card + curriculum list
 *
 * Mobile / Telegram:
 *   Stacked: hero → video → CTA → tab bar (Curriculum | Haqida | Sharhlar)
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, ArrowLeft, RefreshCw, ArrowRight,
  Banknote, BarChart2, CheckCircle2, ChevronDown, Clock,
  FileText, AlertCircle, Globe, Lock,
  PenLine, Play, HelpCircle, Star, Tag,
  Users, Video, Zap, Award, ChevronRight, Flame,
} from 'lucide-react'
import PageWrapper from '../components/PageWrapper'
import VideoPlayer from '../components/VideoPlayer'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import { useAuth } from '../context/AuthContext'
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
function levelLabel(level: string) {
  const map: Record<string, string> = { beginner: "Boshlang'ich", intermediate: "O'rta", advanced: 'Yuqori' }
  return map[level] ?? level
}

// ── RatingWidget (outside component for stable ref) ───────────────────────────
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
  <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.025]">
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
      className="w-full text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-gray-800 dark:text-gray-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#F15929]/40 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-shadow"
    />
    {myReview.trim() && (
      <button onClick={() => onSubmit(myRating || 5)} disabled={ratingLoading}
        className="mt-2.5 w-full py-2.5 rounded-xl text-xs font-bold bg-[#F15929] text-white hover:bg-[#e84e22] disabled:opacity-50 transition-all">
        Saqlash
      </button>
    )}
  </div>
)

// ── SidebarLessonRow ──────────────────────────────────────────────────────────
const SidebarLessonRow: React.FC<{
  lesson: Lesson; index: number; isActive: boolean; courseId: number
  isCompleted: boolean; isUnlocked: boolean; isOwner: boolean
  isExpanded: boolean
  onClick: () => void
  onToggleExpand: () => void
}> = ({ lesson, index, isActive, isCompleted, isUnlocked, isOwner, courseId, isExpanded, onClick, onToggleExpand }) => {
  const hasMeta = !!(lesson.description?.trim() || lesson.material_url)
  const isPdf   = !!(lesson.material_url && !lesson.video_url)
  const isQuiz  = lesson.lesson_type === 'quiz'
  const isMat   = isPdf || lesson.lesson_type === 'material'

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className={[
        'rounded-xl overflow-hidden transition-all duration-200 border-l-2',
        isActive
          ? isQuiz ? 'bg-violet-50 dark:bg-violet-900/10 border-l-violet-500'
          : isMat  ? 'bg-blue-50 dark:bg-blue-900/10 border-l-blue-500'
                   : 'bg-[#F15929]/[0.07] dark:bg-[#F15929]/[0.08] border-l-[#F15929]'
          : isUnlocked
            ? 'hover:bg-slate-100 dark:hover:bg-white/[0.04] border-l-transparent'
            : 'opacity-45 border-l-transparent',
      ].join(' ')}
    >
      <div
        onClick={isUnlocked ? onClick : undefined}
        className={['flex items-center gap-2.5 px-3 py-2.5', isUnlocked ? 'cursor-pointer' : ''].join(' ')}
      >
        {/* Icon */}
        <div className={[
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
          isActive && isQuiz  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' :
          isActive && isMat   ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
          isActive            ? 'bg-[#F15929]/10 text-[#F15929]' :
          isUnlocked          ? 'bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400' :
                                'bg-slate-100 dark:bg-white/5 text-slate-400',
        ].join(' ')}>
          {isCompleted  ? <CheckCircle2 className="w-4 h-4" /> :
           !isUnlocked  ? <Lock className="w-3.5 h-3.5" /> :
           isQuiz       ? <HelpCircle className="w-3.5 h-3.5" /> :
           isMat        ? <FileText className="w-3.5 h-3.5" /> :
                          <Play className="w-3.5 h-3.5" />}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={[
            'text-xs font-semibold truncate leading-snug',
            isActive    ? (isQuiz ? 'text-violet-600 dark:text-violet-400' : isMat ? 'text-blue-600 dark:text-blue-400' : 'text-[#F15929]') :
            isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-800 dark:text-gray-200',
          ].join(' ')}>
            {lesson.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {lesson.duration_minutes > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 inline-flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />{lesson.duration_minutes}daq
              </span>
            )}
            {lesson.is_free && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold">Bepul</span>}
            {isQuiz      && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-bold">Quiz</span>}
            {lesson.material_url && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold">PDF</span>}
          </div>
        </div>
        {hasMeta && isUnlocked && (
          <button type="button" onClick={e => { e.stopPropagation(); onToggleExpand() }}
            className="shrink-0 p-1 text-gray-400 hover:text-[#F15929] transition-colors">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        {isOwner && (
          <Link to={`/courses/${courseId}/lessons/${lesson.id}/edit`} onClick={e => e.stopPropagation()}
            className="shrink-0 p-1 text-gray-400 hover:text-[#F15929] transition-colors">
            <PenLine className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {/* Expandable detail */}
      {hasMeta && isExpanded && (
        <div className="px-3 pb-3 pt-1.5 space-y-2 border-t border-slate-100 dark:border-white/6">
          {lesson.description?.trim() && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{lesson.description}</p>
          )}
          {lesson.material_url && (
            <a href={lesson.material_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              {lesson.material_name || 'PDF materialini yuklab olish'}
            </a>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isTelegram } = usePlatform()
  useTelegramWebApp()

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
  const [mobileTab,      setMobileTab]      = useState<'curriculum' | 'overview' | 'reviews'>('curriculum')
  const [teacherProfile, setTeacherProfile] = useState<{
    first_name?: string | null; username?: string | null; photo_url?: string | null
    specialization?: string | null; bio?: string | null
  } | null>(null)
  const [expandedLessons,  setExpandedLessons]  = useState<Set<number>>(new Set())
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  const courseId    = parseInt(id ?? '0', 10)
  const isOwner     = !!(user && (user.id === course?.teacher_id || user.role === 'admin'))
  const freeLessons = lessons.filter(l => l.is_free).length
  const progressPct = lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0
  const avgRating   = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : (course?.rating ?? 0)

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
    setExpandedLessons(prev => new Set([...prev, lesson.id]))
    try {
      const res = await apiService.getLesson(lesson.id)
      const d = res.data
      const updated = {
        ...lesson,
        video_url:    d?.video_url    ?? '',
        video_source: d?.video_source ?? lesson.video_source,
        description:  d?.description  ?? lesson.description,
      }
      setLessons(prev => prev.map(l => l.id === lesson.id ? updated : l))
      setActiveLesson(updated)
      if (d?.video_url || lesson.video_source === 'youtube') {
        apiService.completeLesson(lesson.id)
          .then(() => setCompletedIds(prev => new Set([...prev, lesson.id])))
          .catch(() => {})
      }
    } catch { /* toast handled by apiService */ }
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
      userName:      user?.first_name || user?.username || 'Talaba',
      quizTitle:     `${course.title} kursi`,
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

  // ── Skeleton loading ─────────────────────────────────────────────────────
  if (loading) return (
    <PageWrapper>
      <div className="animate-pulse space-y-5">
        <div className="h-8 w-36 rounded-xl bg-slate-100 dark:bg-white/5" />
        <div className="h-72 rounded-2xl bg-slate-100 dark:bg-white/5" />
        <div className="h-9 w-3/4 rounded-xl bg-slate-100 dark:bg-white/5" />
        <div className="h-4 w-1/2 rounded-xl bg-slate-100 dark:bg-white/5" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-white/5" />)}
        </div>
      </div>
    </PageWrapper>
  )

  if (error || !course) return (
    <PageWrapper>
      <div className="text-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{error || 'Kurs topilmadi'}</p>
        <button onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F15929] hover:text-[#e84e22] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Kurslarga qaytish
        </button>
      </div>
    </PageWrapper>
  )

  // ── Group lessons into collapsible modules ────────────────────────────────
  const modules: { title: string; lessons: Lesson[] }[] = []
  for (const lesson of lessons) {
    const st   = lesson.section_title?.trim() || 'Darslar'
    const last = modules[modules.length - 1]
    if (last && last.title === st) last.lessons.push(lesson)
    else modules.push({ title: st, lessons: [lesson] })
  }
  const multiModule = modules.length > 1

  const ratingWidgetProps: RatingWidgetProps = {
    myRating, myReview, hoverStar, ratingLoading,
    onReviewChange: setMyReview,
    onHoverStar:    setHoverStar,
    onLeaveStar:    handleLeaveStar,
    onSubmit:       handleSubmitRating,
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shared JSX blocks
  // ──────────────────────────────────────────────────────────────────────────

  // ── CTA + Progress card ───────────────────────────────────────────────────
  const ctaCardJsx = (
    <div className="space-y-4">
      {/* Price */}
      {course.is_paid && !isOwner && !isEnrolled && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-gray-900 dark:text-white">
            {course.price.toLocaleString()}
          </span>
          <span className="text-sm text-gray-400">so'm</span>
        </div>
      )}

      {/* Primary CTA */}
      {!isOwner ? (
        <button onClick={handleEnroll} disabled={isEnrolled || enrollLoading}
          className={[
            'w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[.98] flex items-center justify-center gap-2',
            isEnrolled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 cursor-default'
              : course.is_paid
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_8px_24px_rgba(245,158,11,0.35)] hover:shadow-[0_12px_32px_rgba(245,158,11,0.5)] hover:brightness-105'
                : 'bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-[0_8px_24px_rgba(241,89,41,0.35)] hover:shadow-[0_12px_32px_rgba(241,89,41,0.5)] hover:brightness-105',
          ].join(' ')}>
          {isEnrolled    ? <><CheckCircle2 className="w-4 h-4" /> Yozilgansiz</> :
           enrollLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Yuklanmoqda...</> :
           course.is_paid ? <><Banknote className="w-4 h-4" /> Sotib olish</> :
                            <><Zap className="w-4 h-4" /> Bepul boshlash</>}
        </button>
      ) : (
        <div className="space-y-2">
          <Link to={`/courses/${course.id}/edit`}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-[#F15929] to-[#FF7043] text-white shadow-[0_8px_24px_rgba(241,89,41,0.35)] hover:brightness-105 transition-all">
            <PenLine className="w-4 h-4" /> Kursni tahrirlash
          </Link>
          <Link to={`/courses/${course.id}/lessons/add`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/8 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/[0.09] transition-all">
            + Yangi dars qo'shish
          </Link>
        </div>
      )}

      {!isOwner && !isEnrolled && freeLessons > 0 && (
        <p className="text-center text-[11px] text-gray-400">
          ✦ {freeLessons} ta darsni bepul ko'ring
        </p>
      )}

      {/* Progress section */}
      {(isEnrolled || isOwner) && lessons.length > 0 && (
        <div className="pt-4 border-t border-slate-100 dark:border-white/8 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Kurs progressi</span>
            <span className={`text-xs font-black ${progressPct === 100 ? 'text-emerald-500' : 'text-[#F15929]'}`}>
              {progressPct}%
            </span>
          </div>

          {/* Animated bar + milestone dots */}
          <div className="relative h-2">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${progressPct === 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-[#F15929] to-[#FF8C5A]'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            {[25, 50, 75].map(pct => (
              <div key={pct}
                className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-colors duration-500 ${progressPct >= pct ? 'border-[#F15929] bg-[#F15929]' : 'border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900'}`}
                style={{ left: `calc(${pct}% - 4px)` }}
              />
            ))}
          </div>

          {/* Motivational microcopy */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {progressPct === 0   && '🚀 Boshlang! Birinchi dars sizi kutmoqda'}
            {progressPct > 0  && progressPct < 50  && `🔥 ${completedIds.size}/${lessons.length} dars — davom eting!`}
            {progressPct >= 50 && progressPct < 100 && `🎯 Zo'r! Siz ${progressPct}% ga yetdingiz`}
            {progressPct === 100 && '🏆 Tabriklaymiz! Kursni tugatdingiz'}
          </p>

          {progressPct === 100 && (
            <button onClick={handleOpenCertificate}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(212,175,55,0.3)]">
              <GraduationCap className="w-4 h-4" /> Sertifikat olish
            </button>
          )}
        </div>
      )}

      {/* Mini course-stats (unenrolled visitors) */}
      {!isEnrolled && !isOwner && (course.total_lessons > 0 || course.total_duration_minutes > 0) && (
        <div className="pt-3 border-t border-slate-100 dark:border-white/8 grid grid-cols-2 gap-y-2 gap-x-3">
          {course.total_lessons > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <Video className="w-3.5 h-3.5 text-[#F15929]/60 shrink-0" /> {course.total_lessons} dars
            </div>
          )}
          {course.total_duration_minutes > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <Clock className="w-3.5 h-3.5 text-[#F15929]/60 shrink-0" /> {formatDuration(course.total_duration_minutes)}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <Globe className="w-3.5 h-3.5 text-[#F15929]/60 shrink-0" /> {course.language.toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <Award className="w-3.5 h-3.5 text-[#F15929]/60 shrink-0" /> Sertifikat
          </div>
        </div>
      )}
    </div>
  )

  // ── Curriculum list ───────────────────────────────────────────────────────
  const curriculumJsx = (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Kurs tarkibi
          <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal text-xs">
            ({lessons.length} dars)
          </span>
        </h3>
        {isOwner && (
          <Link to={`/courses/${course.id}/lessons/add`}
            className="text-xs font-semibold text-[#F15929] hover:text-[#e84e22] transition-colors">
            + Dars qo'sh
          </Link>
        )}
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto">
            <Video className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {isOwner ? "Hali dars qo'shilmagan" : "Darslar tez orada qo'shiladi"}
          </p>
          {isOwner && (
            <Link to={`/courses/${course.id}/lessons/add`}
              className="inline-flex items-center gap-1 text-xs text-[#F15929] font-semibold hover:text-[#e84e22]">
              Birinchi darsni qo'shing <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {modules.map((mod, modIdx) => {
            const isCollapsed  = collapsedModules.has(String(modIdx))
            const modStart     = modules.slice(0, modIdx).reduce((s, m) => s + m.lessons.length, 0)
            const modCompleted = mod.lessons.filter(l => completedIds.has(l.id)).length
            return (
              <div key={modIdx}>
                {multiModule && (
                  <button type="button" onClick={() => toggleModule(String(modIdx))}
                    className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors group">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#F15929]/10 text-[10px] font-black text-[#F15929] shrink-0">
                      {modIdx + 1}
                    </span>
                    <span className="flex-1 text-left text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                      {mod.title}
                    </span>
                    {modCompleted > 0 ? (
                      <span className="text-[9px] text-emerald-500 font-bold shrink-0">
                        {modCompleted}/{mod.lessons.length}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 shrink-0">{mod.lessons.length} dars</span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 group-hover:text-[#F15929] ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                )}
                {!isCollapsed && (
                  <div className={`space-y-0.5 ${multiModule ? 'mt-0.5 ml-1 pl-3 border-l border-slate-100 dark:border-white/6' : ''}`}>
                    {mod.lessons.map((lesson, lessonIdx) => (
                      <SidebarLessonRow
                        key={lesson.id} lesson={lesson} index={modStart + lessonIdx}
                        isActive={activeLesson?.id === lesson.id}
                        isCompleted={completedIds.has(lesson.id)}
                        isUnlocked={lesson.is_free || isOwner || isEnrolled}
                        isOwner={isOwner} courseId={courseId}
                        isExpanded={expandedLessons.has(lesson.id)}
                        onClick={() => handleSelectLesson(lesson)}
                        onToggleExpand={() => setExpandedLessons(prev => {
                          const next = new Set(prev)
                          if (next.has(lesson.id)) next.delete(lesson.id); else next.add(lesson.id)
                          return next
                        })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Reviews section ───────────────────────────────────────────────────────
  const reviewsJsx = (
    <div>
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
        Talabalar sharhlari
        {reviews.length > 0 && (
          <span className="text-gray-400 font-normal text-sm">({reviews.length})</span>
        )}
      </h3>

      {/* Rating distribution summary */}
      {reviews.length > 0 && (
        <div className="flex gap-5 items-start p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/60 dark:from-amber-900/10 dark:to-orange-900/5 border border-amber-100/80 dark:border-amber-800/20 mb-5">
          <div className="text-center shrink-0">
            <div className="text-5xl font-black text-amber-500 leading-none">
              {avgRating.toFixed(1)}
            </div>
            <div className="flex justify-center gap-0.5 mt-2">
              {[1,2,3,4,5].map(s => (
                <Star key={s} className={`w-3 h-3 ${s <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-amber-200 dark:text-amber-800'}`} />
              ))}
            </div>
            <p className="text-[10px] text-amber-600/60 dark:text-amber-400/50 mt-1">{reviews.length} sharh</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5,4,3,2,1].map(star => {
              const count = reviews.filter(r => r.rating === star).length
              const pct   = reviews.length > 0 ? (count / reviews.length) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 w-2.5 text-right font-bold shrink-0">{star}</span>
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />
                  <div className="flex-1 h-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-amber-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: (5 - star) * 0.06 }}
                    />
                  </div>
                  <span className="text-[10px] text-amber-500/50 w-4 text-right shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {reviewsLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">
          Hali sharh yo'q. Birinchi bo'lib fikr bildiring!
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={[
                'flex gap-3 p-4 rounded-2xl border transition-colors',
                idx === 0 && r.rating >= 4
                  ? 'bg-gradient-to-br from-amber-50 to-orange-50/40 dark:from-amber-900/10 dark:to-orange-900/5 border-amber-200/60 dark:border-amber-700/20'
                  : 'bg-white dark:bg-white/[0.025] border-slate-100 dark:border-white/6',
              ].join(' ')}
            >
              {r.profiles?.photo_url ? (
                <img src={r.profiles.photo_url} alt={r.profiles.first_name ?? 'User'}
                  className="w-9 h-9 rounded-xl object-cover shrink-0 ring-2 ring-slate-100 dark:ring-white/10" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F15929] to-[#FF7043] flex items-center justify-center shrink-0 text-white text-sm font-black">
                  {(r.profiles?.first_name ?? r.profiles?.username ?? 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    {r.profiles?.first_name ?? r.profiles?.username ?? 'Foydalanuvchi'}
                  </span>
                  {idx === 0 && r.rating >= 4 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold">
                      Top sharh
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400">
                    {new Date(r.created_at).toLocaleDateString('uz-UZ')}
                  </span>
                </div>
                <div className="flex gap-0.5 mb-1.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`w-3 h-3 ${s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} />
                  ))}
                </div>
                {r.review && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{r.review}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  return (
    <PageWrapper topPadding="">

      {/* ── PREMIUM HERO ──────────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 lg:-mx-8 relative overflow-hidden bg-gradient-to-br from-[#0D0D16] via-[#131320] to-[#0A0A14]">
        {/* Ambient glow blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#F15929]/[0.07] blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-indigo-600/[0.04] blur-[110px] pointer-events-none" />

        <div className="relative z-10 px-4 sm:px-5 lg:px-8 pt-5 pb-8">

          {/* Back button */}
          <button onClick={() => navigate('/courses')}
            className="mb-5 inline-flex items-center gap-1.5 text-white/35 hover:text-white/75 text-xs font-medium transition-all group">
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Kurslarga qaytish
          </button>

          {/* Badge row */}
          <div className="flex flex-wrap gap-2 mb-4">
            {course.categories && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F15929]/12 border border-[#F15929]/20 text-[#F15929] text-[11px] font-bold">
                <Tag className="w-3 h-3" /> {course.categories.name}
              </span>
            )}
            {course.is_paid ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/20 text-amber-400 text-[11px] font-bold">
                <Banknote className="w-3 h-3" /> {course.price.toLocaleString()} so'm
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/12 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                <Zap className="w-3 h-3" /> Bepul kurs
              </span>
            )}
            {!course.is_published && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold">
                Qoralama
              </span>
            )}
            {(avgRating >= 4.5 && (reviews.length >= 3 || course.rating >= 4.5)) && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-[11px] font-bold">
                <Flame className="w-3 h-3" /> Top baholangan
              </span>
            )}
          </div>

          {/* Course title — dominant */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight mb-3 max-w-3xl">
            {course.title}
          </h1>

          {/* Teaser description */}
          {course.description && !activeLesson && (
            <p className="text-sm text-white/45 leading-relaxed mb-4 max-w-2xl line-clamp-2">
              {course.description}
            </p>
          )}

          {/* Meta pills */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-white/55 text-[11px]">
              <Globe className="w-3 h-3" /> {course.language.toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-white/55 text-[11px]">
              <BarChart2 className="w-3 h-3" /> {levelLabel(course.level)}
            </span>
            {course.total_lessons > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-white/55 text-[11px]">
                <Video className="w-3 h-3" /> {course.total_lessons} dars
              </span>
            )}
            {course.total_duration_minutes > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-white/55 text-[11px]">
                <Clock className="w-3 h-3" /> {formatDuration(course.total_duration_minutes)}
              </span>
            )}
            {course.enrolled_count > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07] text-white/55 text-[11px]">
                <Users className="w-3 h-3" /> {course.enrolled_count.toLocaleString()} talaba
              </span>
            )}
            {avgRating > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-400/15 text-amber-400 text-[11px] font-bold">
                <Star className="w-3 h-3 fill-amber-400" /> {avgRating.toFixed(1)}
                {reviews.length > 0 && <span className="text-amber-400/50 font-normal">({reviews.length})</span>}
              </span>
            )}
          </div>

          {/* Teacher chip */}
          {teacherProfile && (
            <Link to={`/teacher/${course.teacher_id}`}
              className="inline-flex items-center gap-3 group p-2.5 rounded-2xl hover:bg-white/[0.06] transition-all -ml-2.5">
              {teacherProfile.photo_url ? (
                <img src={teacherProfile.photo_url} alt={teacherProfile.first_name ?? ''}
                  className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10 group-hover:ring-[#F15929]/35 transition-all" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F15929] to-[#e84e22] flex items-center justify-center text-white text-sm font-black shrink-0">
                  {(teacherProfile.first_name ?? teacherProfile.username ?? 'O').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-[10px] text-white/30 font-semibold uppercase tracking-widest leading-none mb-1">
                  O'qituvchi
                </p>
                <p className="text-sm font-bold text-white group-hover:text-[#F15929] transition-colors leading-none">
                  {teacherProfile.first_name || (teacherProfile.username ? `@${teacherProfile.username}` : "O'qituvchi")}
                </p>
                {teacherProfile.specialization && (
                  <p className="text-[11px] text-white/35 leading-none mt-0.5">{teacherProfile.specialization}</p>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-[#F15929]/50 transition-all group-hover:translate-x-0.5 ml-1" />
            </Link>
          )}
        </div>
      </div>

      {/* ── TWO-COLUMN BODY ───────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 lg:-mx-8 flex flex-col lg:flex-row bg-slate-50 dark:bg-[#0D0D16]">

        {/* LEFT: Video + below-fold content */}
        <div className="flex-1 min-w-0">

          {/* Video player */}
          <div className="bg-black w-full">
            {activeLesson?.video_url ? (
              <div className="aspect-video">
                <VideoPlayer
                  videoSource={activeLesson.video_source ?? 'bunny'}
                  videoUrl={activeLesson.video_url}
                  title={activeLesson.title}
                />
              </div>
            ) : (
              <div className="aspect-video relative overflow-hidden">
                {course.thumbnail_url
                  ? <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800" />
                }
                {/* Cinematic overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

                {/* Animated play button */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <motion.div
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }}
                    className="relative cursor-pointer"
                    onClick={() => {
                      const first = lessons.find(l => l.is_free || isOwner || isEnrolled)
                      if (first) handleSelectLesson(first)
                    }}
                  >
                    {/* Pulse rings */}
                    <motion.div
                      animate={{ scale: [1, 1.45, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-full bg-white/15"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.75, 1], opacity: [0.15, 0, 0.15] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                      className="absolute inset-0 rounded-full bg-white/8"
                    />
                    <div className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.25)]">
                      <Play className="w-7 h-7 text-gray-900 ml-1 fill-gray-900" />
                    </div>
                  </motion.div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm drop-shadow">Kursni ko'rish</p>
                    <p className="text-white/45 text-xs mt-0.5">
                      {freeLessons > 0
                        ? `${freeLessons} ta bepul dars mavjud`
                        : lessons.length > 0 ? 'Darsni tanlang' : "Darslar tez qo'shiladi"}
                    </p>
                  </div>
                </div>

                {/* Bottom label */}
                <div className="absolute bottom-3 left-3">
                  <span className="text-[10px] text-white/55 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    ▶ Oldindan ko'rish
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Below-video info */}
          <div className="px-4 sm:px-5 lg:px-8 py-5 bg-white dark:bg-[#0D0D16]">

            {/* Active lesson or course description */}
            {activeLesson ? (
              <div className="mb-5 pb-5 border-b border-slate-200 dark:border-white/8">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">
                    {activeLesson.title}
                  </h2>
                  {completedIds.has(activeLesson.id) ? (
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Tugatildi
                    </span>
                  ) : isEnrolled ? (
                    <button onClick={() => handleMarkLessonCompleted(activeLesson.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#F15929]/8 hover:bg-[#F15929]/15 text-[#F15929] border border-[#F15929]/20 transition-all">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Tugatildi deb belgilash
                    </button>
                  ) : null}
                </div>

                {/* Inline progress bar */}
                {(isEnrolled || isOwner) && lessons.length > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-[#F15929]'}`}
                        initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
                      {progressPct}%
                    </span>
                  </div>
                )}

                {activeLesson.duration_minutes > 0 && (
                  <p className="text-xs text-gray-400 mt-2 inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> {activeLesson.duration_minutes} daqiqa
                  </p>
                )}
                {activeLesson.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                    {activeLesson.description}
                  </p>
                )}
                {activeLesson.material_url && (
                  <a href={activeLesson.material_url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/25 transition-colors">
                    <FileText className="w-4 h-4 shrink-0" />
                    {activeLesson.material_name || 'PDF materialini yuklab olish'}
                  </a>
                )}
              </div>
            ) : (
              <div className="mb-5 pb-5 border-b border-slate-200 dark:border-white/8">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{course.title}</h2>
                {course.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    {course.description}
                  </p>
                )}
              </div>
            )}

            {/* MOBILE: CTA card */}
            <div className="lg:hidden mb-5 p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 shadow-sm">
              {ctaCardJsx}
            </div>

            {/* MOBILE: tab bar */}
            <div className="lg:hidden flex gap-1 bg-slate-100 dark:bg-white/[0.05] rounded-xl p-1 mb-4">
              {([
                { id: 'curriculum', label: 'Kurs tarkibi' },
                { id: 'overview',   label: 'Haqida' },
                { id: 'reviews',    label: `Sharhlar${reviews.length ? ` (${reviews.length})` : ''}` },
              ] as { id: typeof mobileTab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setMobileTab(t.id)}
                  className={[
                    'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
                    mobileTab === t.id
                      ? 'bg-white dark:bg-white/10 text-[#F15929] shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                  ].join(' ')}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* MOBILE: tab content */}
            <div className="lg:hidden">
              <AnimatePresence mode="wait">
                {mobileTab === 'curriculum' && (
                  <motion.div key="curr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {curriculumJsx}
                  </motion.div>
                )}
                {mobileTab === 'overview' && (
                  <motion.div key="over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    {course.description && activeLesson && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{course.description}</p>
                    )}
                    {user && <RatingWidget {...ratingWidgetProps} />}
                  </motion.div>
                )}
                {mobileTab === 'reviews' && (
                  <motion.div key="rev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    {user && <RatingWidget {...ratingWidgetProps} />}
                    {reviewsJsx}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* DESKTOP: overview + rating + reviews */}
            <div className="hidden lg:block space-y-8 mt-2">
              {course.description && (
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Kurs haqida</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{course.description}</p>
                </div>
              )}
              {user && <RatingWidget {...ratingWidgetProps} />}
              {reviewsJsx}
            </div>
          </div>
        </div>

        {/* RIGHT: sticky sidebar (desktop only) */}
        <div className="hidden lg:flex flex-col w-[360px] xl:w-[400px] shrink-0 border-l border-slate-200 dark:border-white/6 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto bg-white dark:bg-[#0D0D16]">
          {/* CTA */}
          <div className="p-5 border-b border-slate-200 dark:border-white/6">
            {ctaCardJsx}
          </div>
          {/* Curriculum */}
          <div className="flex-1 overflow-y-auto p-4">
            {curriculumJsx}
          </div>
        </div>

      </div>

      {/* Certificate modal */}
      {showCert && certData && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}

      {/* Payment modal */}
      {course && (
        <PaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
          itemType="course"
          itemId={course.id}
          itemTitle={course.title}
          priceUzs={course.price}
          userId={user?.id}
        />
      )}

    </PageWrapper>
  )
}

export default CourseDetailPage
