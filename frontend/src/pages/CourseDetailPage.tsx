/**
 * CourseDetailPage — Udemy-style layout
 *
 * Desktop (lg+):
 *   LEFT  — sticky video player + lesson info + description/reviews below
 *   RIGHT — sticky sidebar: progress + enroll CTA + lesson list
 *
 * Mobile / Telegram:
 *   Stacked: video at top → tab bar (Curriculum | Overview | Reviews)
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AcademicCapIcon, ArrowLeftIcon, ArrowPathIcon, ArrowRightIcon,
  BanknotesIcon, ChartBarIcon, CheckCircleIcon, ClockIcon,
  ExclamationCircleIcon, GlobeAltIcon, LockClosedIcon,
  PencilSquareIcon, PlayIcon, StarIcon, TagIcon,
  UsersIcon, VideoCameraIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import VideoPlayer from '../components/VideoPlayer'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import { useAuth } from '../context/AuthContext'
import { usePlatform } from '../hooks/usePlatform'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import apiService from '../services/apiService'

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

// ── Sidebar lesson row ────────────────────────────────────────────────────────
const SidebarLessonRow: React.FC<{
  lesson: Lesson; index: number; isActive: boolean
  isCompleted: boolean; isUnlocked: boolean; isOwner: boolean
  onClick: () => void
}> = ({ lesson, index, isActive, isCompleted, isUnlocked, isOwner, onClick }) => (
  <motion.div
    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}
    onClick={isUnlocked ? onClick : undefined}
    className={[
      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all',
      isUnlocked ? 'cursor-pointer' : 'opacity-50',
      isActive
        ? 'bg-sahifa-50 dark:bg-sahifa-900/30 border border-sahifa-200 dark:border-sahifa-700'
        : isUnlocked ? 'hover:bg-slate-100 dark:hover:bg-slate-700/60' : '',
    ].join(' ')}
  >
    <div className={['w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0',
      isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' :
      isActive    ? 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-600' :
      isUnlocked  ? 'bg-slate-100 dark:bg-slate-700 text-slate-500' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-400',
    ].join(' ')}>
      {isCompleted ? <CheckCircleIcon className="h-4 w-4" /> :
       !isUnlocked ? <LockClosedIcon className="h-3.5 w-3.5" /> :
                     <PlayIcon className="h-3.5 w-3.5" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className={['text-xs font-medium truncate', isActive ? 'text-sahifa-700 dark:text-sahifa-300' : 'text-gray-800 dark:text-gray-200'].join(' ')}>
        {lesson.title}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {lesson.duration_minutes > 0 && <span className="text-[10px] text-gray-400">{lesson.duration_minutes} daq</span>}
        {lesson.is_free && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold">Bepul</span>}
      </div>
    </div>
    {isOwner && (
      <Link to={`/lessons/${lesson.id}/edit`} onClick={e => e.stopPropagation()}
        className="shrink-0 p-1 text-slate-400 hover:text-sahifa-500 transition-colors">
        <PencilSquareIcon className="h-3.5 w-3.5" />
      </Link>
    )}
  </motion.div>
)

// ── Main page ─────────────────────────────────────────────────────────────────
const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isTelegram } = usePlatform()
  const { webApp } = useTelegramWebApp()

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

  const courseId   = parseInt(id ?? '0', 10)
  const isOwner    = !!(user && (user.id === course?.teacher_id || user.role === 'admin'))
  const freeLessons = lessons.filter(l => l.is_free).length
  const progressPct = lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0

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
  const handleSelectLesson = async (lesson: Lesson) => {
    const unlocked = lesson.is_free || isOwner || isEnrolled
    if (!unlocked) return
    setActiveLesson(lesson)
    try {
      const res = await apiService.getLesson(lesson.id)
      const d = res.data
      const updated = { ...lesson, video_url: d?.video_url ?? '', video_source: d?.video_source ?? lesson.video_source, description: d?.description ?? lesson.description }
      setLessons(prev => prev.map(l => l.id === lesson.id ? updated : l))
      setActiveLesson(updated)
      if (d?.video_url || lesson.video_source === 'youtube') {
        apiService.completeLesson(lesson.id)
          .then(() => setCompletedIds(prev => new Set([...prev, lesson.id])))
          .catch(() => {})
      }
    } catch { /* toast */ }
  }

  const handleSubmitRating = async (stars: number) => {
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
  }

  const handleEnroll = async () => {
    if (!course || isOwner || isEnrolled || enrollLoading) return
    setEnrollLoading(true)
    try {
      if (!course.is_paid) {
        await apiService.enrollCourse(course.id)
        setIsEnrolled(true)
        setCourse(prev => prev ? { ...prev, enrolled_count: (prev.enrolled_count ?? 0) + 1 } : prev)
        return
      }
      if (!isTelegram || !webApp) { setError("Pullik kurs to'lovi faqat Telegram ilovasida ishlaydi"); return }
      const inv = await apiService.createCourseInvoiceLink(course.id, 'telegram_stars')
      const invoiceUrl = inv.data?.invoice_url as string | undefined
      const orderId    = inv.data?.order_id    as string | undefined
      if (!invoiceUrl || !orderId) { setError('Invoice yaratilmadi'); return }
      webApp.openInvoice(invoiceUrl, async (status: string) => {
        if (status === 'paid') {
          try {
            await apiService.confirmCoursePayment(orderId)
            setIsEnrolled(true)
            setCourse(prev => prev ? { ...prev, enrolled_count: (prev.enrolled_count ?? 0) + 1 } : prev)
          } catch { /* toast */ }
        }
      })
    } finally { setEnrollLoading(false) }
  }

  const handleOpenCertificate = () => {
    if (!course || completedIds.size !== lessons.length || lessons.length === 0) return
    setCertData({
      userName: user?.first_name || user?.username || 'Talaba',
      quizTitle: `${course.title} kursi`,
      score: lessons.length, total: lessons.length, percentage: 100,
      date: new Date().toLocaleDateString('uz-UZ'),
      certificateId: `CRS-${course.id}-${user?.id ?? 'UNKNOWN'}`,
    })
    setShowCert(true)
  }

  const handleMarkLessonCompleted = (lessonId?: number) => {
    if (!lessonId || !isEnrolled) return
    apiService.completeLesson(lessonId)
      .then(() => setCompletedIds(prev => new Set([...prev, lessonId])))
      .catch(() => {})
  }

  // ── Loading / error screens ───────────────────────────────────────────────
  if (loading) return (
    <PageWrapper>
      <div className="space-y-4 animate-pulse">
        <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-6 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </PageWrapper>
  )

  if (error || !course) return (
    <PageWrapper>
      <div className="text-center py-16 space-y-3">
        <ExclamationCircleIcon className="h-12 w-12 mx-auto text-slate-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'Kurs topilmadi'}</p>
        <button onClick={() => navigate('/courses')} className="text-xs text-sahifa-500 font-medium hover:underline inline-flex items-center gap-1">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Kurslarga qaytish
        </button>
      </div>
    </PageWrapper>
  )

  // ── Sub-components (defined after guard so `course` is always defined) ─────

  const EnrollCTA = () => (
    <div className="space-y-3">
      {course.is_paid && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{course.price.toLocaleString()} so'm</span>
          <span className="text-xs text-gray-400">Telegram Stars orqali</span>
        </div>
      )}
      {!isOwner ? (
        <button onClick={handleEnroll} disabled={isEnrolled || enrollLoading}
          className={['w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[.98]',
            isEnrolled     ? 'bg-emerald-500 text-white cursor-default' :
            course.is_paid ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                             'bg-sahifa-500 hover:bg-sahifa-600 text-white',
          ].join(' ')}>
          {isEnrolled     ? '✓ Siz yozilgansiz' :
           enrollLoading  ? 'Yuklanmoqda...' :
           course.is_paid ? (isTelegram ? 'Stars bilan xarid qilish' : "Telegram'da to'lash") :
                            'Bepul yozilish'}
        </button>
      ) : (
        <Link to={`/courses/${course.id}/edit`}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-blue-500 hover:bg-blue-600 text-white transition-colors">
          <PencilSquareIcon className="h-4 w-4" /> Kursni tahrirlash
        </Link>
      )}
      {!isOwner && !isEnrolled && freeLessons > 0 && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">{freeLessons} ta darsni bepul ko'ring</p>
      )}
      {(isEnrolled || isOwner) && lessons.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="font-semibold text-gray-600 dark:text-gray-300">Progress</span>
            <span className="font-bold text-sahifa-600 dark:text-sahifa-400">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700/70 overflow-hidden border border-slate-200 dark:border-slate-700">
            <motion.div
              className={progressPct === 100 ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-sahifa-500'}
              initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.7 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">{completedIds.size}/{lessons.length} dars tugatilgan</p>
          {progressPct === 100 && (
            <button onClick={handleOpenCertificate}
              className="mt-2 w-full py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-95 transition-all inline-flex items-center justify-center gap-1">
              <AcademicCapIcon className="h-4 w-4" /> Sertifikat olish
            </button>
          )}
        </div>
      )}
    </div>
  )

  const MetaRow = () => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      {course.categories && <span className="inline-flex items-center gap-1"><TagIcon className="h-3.5 w-3.5" />{course.categories.name}</span>}
      <span>{levelLabel(course.level)}</span>
      <span className="inline-flex items-center gap-1"><GlobeAltIcon className="h-3.5 w-3.5" />{course.language.toUpperCase()}</span>
      {course.total_lessons > 0 && <span className="inline-flex items-center gap-1"><VideoCameraIcon className="h-3.5 w-3.5" />{course.total_lessons} dars</span>}
      {course.total_duration_minutes > 0 && <span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{formatDuration(course.total_duration_minutes)}</span>}
      {course.enrolled_count > 0 && <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" />{course.enrolled_count} talaba</span>}
      {course.rating > 0 && <span className="inline-flex items-center gap-1"><StarIcon className="h-3.5 w-3.5 text-amber-400" />{course.rating.toFixed(1)}</span>}
    </div>
  )

  const RatingWidget = () => user ? (
    <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
        {myRating ? `Sizning bahoyingiz: ${myRating} ★` : 'Kursni baholang:'}
      </p>
      <div className="flex gap-1 mb-3">
        {[1,2,3,4,5].map(star => (
          <button key={star}
            onMouseEnter={() => setHoverStar(star)} onMouseLeave={() => setHoverStar(0)}
            onClick={() => handleSubmitRating(star)} disabled={ratingLoading}
            className={['text-2xl transition-transform hover:scale-110', (hoverStar || myRating) >= star ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'].join(' ')}>
            ★
          </button>
        ))}
        {ratingLoading && <ArrowPathIcon className="h-4 w-4 text-gray-400 ml-2 self-center animate-spin" />}
      </div>
      <textarea value={myReview} onChange={e => setMyReview(e.target.value)}
        placeholder="Qo'shimcha fikr bildiring (ixtiyoriy)..." rows={2}
        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200 p-2 resize-none focus:outline-none focus:ring-2 focus:ring-sahifa-400" />
      {myReview.trim() && (
        <button onClick={() => handleSubmitRating(myRating || 5)} disabled={ratingLoading}
          className="mt-2 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 disabled:opacity-50">
          Saqlash
        </button>
      )}
    </div>
  ) : null

  const ReviewsList = () => (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 inline-flex items-center gap-1.5">
        <StarIcon className="h-4 w-4 text-amber-400" /> Sharhlar
        {reviews.length > 0 && <span className="text-gray-400 font-normal">({reviews.length})</span>}
      </h3>
      {reviewsLoading ? (
        <div className="text-center py-6"><ArrowPathIcon className="h-6 w-6 mx-auto text-slate-400 animate-spin" /></div>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">Hali sharh yo'q. Birinchi bo'lib fikr bildiring!</p>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="flex gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shrink-0 text-white text-xs font-bold">
                {(r.profiles?.first_name ?? 'A').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">{r.profiles?.first_name ?? r.profiles?.username ?? 'Foydalanuvchi'}</span>
                  <span className="text-xs text-amber-400">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{new Date(r.created_at).toLocaleDateString('uz-UZ')}</span>
                </div>
                {r.review && <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{r.review}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const LessonSidebarList = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Kurs tarkibi <span className="text-gray-400 font-normal text-xs">({lessons.length} dars)</span>
        </h3>
        {isOwner && (
          <Link to={`/courses/${course.id}/lessons/add`}
            className="text-xs font-semibold text-sahifa-500 hover:text-sahifa-600">
            + Dars qo'sh
          </Link>
        )}
      </div>
      {lessons.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <VideoCameraIcon className="h-8 w-8 mx-auto text-slate-400" />
          <p className="text-xs text-gray-400">{isOwner ? "Hali dars qo'shilmagan" : "Darslar tez orada qo'shiladi"}</p>
          {isOwner && (
            <Link to={`/courses/${course.id}/lessons/add`}
              className="text-xs text-sahifa-500 font-medium hover:underline inline-flex items-center gap-1">
              Birinchi darsni qo'shing <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {lessons.map((lesson, i) => (
            <SidebarLessonRow
              key={lesson.id} lesson={lesson} index={i}
              isActive={activeLesson?.id === lesson.id}
              isCompleted={completedIds.has(lesson.id)}
              isUnlocked={lesson.is_free || isOwner || isEnrolled}
              isOwner={isOwner}
              onClick={() => handleSelectLesson(lesson)}
            />
          ))}
        </div>
      )}
    </div>
  )

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <PageWrapper topPadding="">

      {/* ── Dark hero header ─────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 lg:-mx-8 bg-slate-900 dark:bg-slate-950 px-4 sm:px-5 lg:px-8 pt-4 pb-6">
        <button onClick={() => navigate('/courses')}
          className="mb-4 inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition-colors">
          <ArrowLeftIcon className="h-4 w-4" /> Kurslarga qaytish
        </button>

        <div className="flex flex-wrap gap-2 mb-3">
          {course.is_paid ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">
              <BanknotesIcon className="h-3.5 w-3.5" /> {course.price.toLocaleString()} so'm
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold">Bepul</span>
          )}
          {!course.is_published && (
            <span className="px-2.5 py-1 rounded-full bg-amber-500/80 text-white text-xs font-bold">Qoralama</span>
          )}
        </div>

        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white leading-snug mb-3">{course.title}</h1>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
          {course.categories && <span className="inline-flex items-center gap-1"><TagIcon className="h-3.5 w-3.5" />{course.categories.name}</span>}
          <span>{levelLabel(course.level)}</span>
          <span className="inline-flex items-center gap-1"><GlobeAltIcon className="h-3.5 w-3.5" />{course.language.toUpperCase()}</span>
          {course.total_lessons > 0 && <span className="inline-flex items-center gap-1"><VideoCameraIcon className="h-3.5 w-3.5" />{course.total_lessons} dars</span>}
          {course.enrolled_count > 0 && <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" />{course.enrolled_count} talaba</span>}
          {course.rating > 0 && <span className="inline-flex items-center gap-1"><StarIcon className="h-3.5 w-3.5 text-amber-400" />{course.rating.toFixed(1)}</span>}
        </div>

        {isOwner && (
          <Link to={`/courses/${course.id}/edit`}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors">
            <PencilSquareIcon className="h-3.5 w-3.5" /> Kursni tahrirlash
          </Link>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 lg:-mx-8 flex flex-col lg:flex-row bg-white dark:bg-slate-900">

        {/* LEFT COLUMN: video + info */}
        <div className="flex-1 min-w-0">

          {/* Video (not sticky) */}
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
                  ? <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover opacity-60" />
                  : <div className="w-full h-full bg-slate-800" />}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center backdrop-blur-sm">
                    <PlayIcon className="h-8 w-8 text-white ml-1" />
                  </div>
                  <p className="text-white/80 text-sm font-medium">
                    {lessons.length > 0 ? 'Darsni tanlang' : "Darslar qo'shilmagan"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Below-video info */}
          <div className="px-4 sm:px-5 lg:px-8 py-4">
            {/* Active lesson header */}
            {activeLesson ? (
              <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug">{activeLesson.title}</h2>
                  {completedIds.has(activeLesson.id) ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="h-4 w-4" /> Tugatildi
                    </span>
                  ) : isEnrolled ? (
                    <button
                      onClick={() => handleMarkLessonCompleted(activeLesson.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sahifa-50 hover:bg-sahifa-100 dark:bg-sahifa-900/30 dark:hover:bg-sahifa-900/50 text-sahifa-700 dark:text-sahifa-300 border border-sahifa-200 dark:border-sahifa-700 transition-colors"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5" /> Tugatildi deb belgilash
                    </button>
                  ) : null}
                </div>
                {(isEnrolled || isOwner) && lessons.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Kurs progress</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{progressPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <motion.div
                        className={progressPct === 100 ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-sahifa-500'}
                        initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}
                {activeLesson.duration_minutes > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 inline-flex items-center gap-1">
                    <ClockIcon className="h-3.5 w-3.5" /> {activeLesson.duration_minutes} daqiqa
                  </p>
                )}
                {activeLesson.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{activeLesson.description}</p>
                )}
              </div>
            ) : (
              <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{course.title}</h2>
                {course.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{course.description}</p>
                )}
              </div>
            )}

            {/* MOBILE: enroll CTA */}
            <div className="lg:hidden mb-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <EnrollCTA />
            </div>

            {/* MOBILE: tab bar */}
            <div className="lg:hidden flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4">
              {([
                { id: 'curriculum', label: 'Kurs tarkibi' },
                { id: 'overview',   label: 'Haqida' },
                { id: 'reviews',    label: `Sharhlar${reviews.length ? ` (${reviews.length})` : ''}` },
              ] as { id: typeof mobileTab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setMobileTab(t.id)}
                  className={['flex-1 py-2 text-xs font-semibold rounded-lg transition-all',
                    mobileTab === t.id ? 'bg-white dark:bg-slate-700 text-sahifa-600 dark:text-sahifa-400 shadow-sm' : 'text-slate-500 dark:text-slate-400',
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
                    <LessonSidebarList />
                  </motion.div>
                )}
                {mobileTab === 'overview' && (
                  <motion.div key="over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <MetaRow />
                    {course.description && activeLesson && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{course.description}</p>
                    )}
                    <RatingWidget />
                  </motion.div>
                )}
                {mobileTab === 'reviews' && (
                  <motion.div key="rev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <RatingWidget />
                    <ReviewsList />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* DESKTOP: overview + reviews */}
            <div className="hidden lg:block space-y-6 mt-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Kurs haqida</h3>
                <MetaRow />
                {course.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed">{course.description}</p>
                )}
              </div>
              <RatingWidget />
              <ReviewsList />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: sticky modules (desktop only) */}
        <div className="hidden lg:flex flex-col w-[360px] xl:w-[400px] shrink-0 border-l border-slate-200 dark:border-slate-700 lg:sticky lg:top-4 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto bg-white dark:bg-slate-900">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <EnrollCTA />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <LessonSidebarList />
          </div>
        </div>

      </div>

      {/* Certificate modal */}
      {showCert && certData && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}

    </PageWrapper>
  )
}

export default CourseDetailPage
