/**
 * CourseDetailPage — public course detail view
 *
 * Shows:
 *  • Course header (thumbnail, title, badges, stats, teacher card)
 *  • Category / Level / Language / Duration metadata row
 *  • Description
 *  • Lesson list — click a free/unlocked lesson → inline VideoPlayer expands
 *  • Sticky enroll / "Already enrolled" CTA
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import VideoPlayer from '../components/VideoPlayer'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import { useAuth } from '../context/AuthContext'
import { usePlatform } from '../hooks/usePlatform'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Course {
  id:                      number
  teacher_id:              number
  title:                   string
  description:             string
  thumbnail_url:           string
  price:                   number
  is_paid:                 boolean
  is_published:            boolean
  level:                   string
  language:                string
  total_lessons:           number
  total_duration_minutes:  number
  enrolled_count:          number
  rating:                  number
  created_at:              string
  categories?:             { name: string; slug: string; icon: string } | null
}

interface Lesson {
  id:               number
  title:            string
  description:      string
  video_url:        string
  video_source:     'youtube' | 'bunny' | 'none'
  duration_minutes: number
  order_index:      number
  is_free:          boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} soat ${m > 0 ? m + ' daq' : ''}` : `${m} daqiqa`
}

function levelLabel(level: string) {
  const map: Record<string, string> = {
    beginner:     "🌱 Boshlang'ich",
    intermediate: '📈 O\'rta',
    advanced:     '🚀 Yuqori',
  }
  return map[level] ?? level
}

// ── Lesson row ────────────────────────────────────────────────────────────────
const LessonRow: React.FC<{
  lesson: Lesson
  index: number
  isOwner: boolean
  isEnrolled: boolean
  isExpanded: boolean
  isCompleted: boolean
  onToggle: () => void
}> = ({ lesson, index, isOwner, isEnrolled, isExpanded, isCompleted, onToggle }) => {
  const unlocked = lesson.is_free || isOwner || isEnrolled
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        onClick={unlocked ? onToggle : undefined}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
          unlocked
            ? `border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer ${
                isExpanded
                  ? 'border-sahifa-300 dark:border-sahifa-600'
                  : 'hover:border-sahifa-300 dark:hover:border-sahifa-600'
              }`
            : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50'
        }`}
      >
        {/* Order badge */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
          isCompleted
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
            : unlocked
              ? 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700 dark:text-sahifa-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
        }`}>
          {isCompleted ? '✅' : unlocked ? (isExpanded ? '⏸' : '▶') : '🔒'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            unlocked ? 'text-gray-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
          }`}>
            {lesson.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {lesson.duration_minutes > 0 && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                ⏱ {lesson.duration_minutes} daq
              </span>
            )}
            {lesson.is_free && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                Bepul
              </span>
            )}
            {lesson.video_source === 'youtube' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">
                📺 YouTube
              </span>
            )}
          </div>
        </div>

        {/* Owner edit link */}
        {isOwner && (
          <Link
            to={`/courses/${lesson.id}/lessons/${lesson.id}/edit`}
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-slate-400 hover:text-sahifa-500 shrink-0 px-1"
          >
            ✏️
          </Link>
        )}
      </motion.div>

      {/* Inline video player */}
      <AnimatePresence>
        {isExpanded && unlocked && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1 px-1">
              <VideoPlayer
                videoSource={lesson.video_source ?? 'bunny'}
                videoUrl={lesson.video_url ?? ''}
                title={lesson.title}
              />
              {lesson.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1 leading-relaxed">
                  {lesson.description}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isTelegram } = usePlatform()
  const { webApp } = useTelegramWebApp()

  const [course, setCourse]   = useState<Course | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set())
  const [showCert, setShowCert] = useState(false)
  const [certData, setCertData] = useState<CertificateData | null>(null)

  const courseId = parseInt(id ?? '0', 10)
  const isOwner  = !!(user && (user.id === course?.teacher_id || user.role === 'admin'))

  useEffect(() => {
    if (!courseId) { setError('Kurs topilmadi'); setLoading(false); return }

    Promise.all([
      apiService.getCourse(courseId),
      apiService.getLessons(courseId),
    ])
      .then(async ([courseRes, lessonsRes]) => {
        setCourse(courseRes.data)
        setLessons(lessonsRes.data ?? [])

        if (user && user.id !== courseRes.data?.teacher_id && user.role !== 'admin') {
          try {
            const enrollmentRes = await apiService.checkEnrollment(courseId)
            setIsEnrolled(!!enrollmentRes.data?.enrolled)
          } catch {
            setIsEnrolled(false)
          }
        } else {
          setIsEnrolled(false)
        }
      })
      .catch(() => setError("Kurs yuklanmadi. Iltimos, qayta urinib ko'ring."))
      .finally(() => setLoading(false))
  }, [courseId, user])

  // ── Load lesson progress when enrolled ───────────────────────────────────
  useEffect(() => {
    if (!courseId || !isEnrolled) return
    apiService.getMyLessonProgress(courseId)
      .then((res) => {
        const ids: number[] = res.data?.completed_lesson_ids ?? []
        setCompletedIds(new Set(ids))
      })
      .catch(() => {})
  }, [courseId, isEnrolled])

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

      if (!isTelegram || !webApp) {
        setError("Pullik kurs to'lovi faqat Telegram ilovasida ishlaydi")
        return
      }

      const inv = await apiService.createCourseInvoiceLink(course.id, 'telegram_stars')
      const invoiceUrl = inv.data?.invoice_url as string | undefined
      const orderId = inv.data?.order_id as string | undefined

      if (!invoiceUrl || !orderId) {
        setError("Invoice yaratilmadi")
        return
      }

      webApp.openInvoice(invoiceUrl, async (status: string) => {
        if (status === 'paid') {
          try {
            await apiService.confirmCoursePayment(orderId)
            setIsEnrolled(true)
            setCourse(prev => prev ? { ...prev, enrolled_count: (prev.enrolled_count ?? 0) + 1 } : prev)
          } catch {
            // handled by global API toast
          }
        }
      })
    } finally {
      setEnrollLoading(false)
    }
  }

  const handleToggleLesson = async (lesson: Lesson) => {
    const unlocked = lesson.is_free || isOwner || isEnrolled
    if (!unlocked) return

    const opening = expandedId !== lesson.id
    setExpandedId(prev => prev === lesson.id ? null : lesson.id)

    if (!opening) return

    try {
      const res = await apiService.getLesson(lesson.id)
      const detail = res.data
      setLessons(prev => prev.map(l => (
        l.id === lesson.id
          ? {
              ...l,
              video_url: detail?.video_url ?? '',
              video_source: detail?.video_source ?? l.video_source,
              description: detail?.description ?? l.description,
            }
          : l
      )))

      const canComplete = !!(lesson.is_free || isOwner || isEnrolled)
      const hasPlayableVideo = !!(detail?.video_url) || lesson.video_source === 'youtube'
      if (canComplete && hasPlayableVideo) {
        apiService.completeLesson(lesson.id)
          .then(() => setCompletedIds(prev => new Set([...prev, lesson.id])))
          .catch(() => {})
      }
    } catch {
      // API service already shows toast
    }
  }

  const handleOpenCertificate = () => {
    if (!course || lessons.length === 0 || completedIds.size !== lessons.length) return
    const userName = user?.first_name || user?.username || 'Talaba'
    setCertData({
      userName,
      quizTitle: `${course.title} kursi`,
      score: lessons.length,
      total: lessons.length,
      percentage: 100,
      date: new Date().toLocaleDateString('uz-UZ'),
      certificateId: `CRS-${course.id}-${user?.id ?? 'UNKNOWN'}`,
    })
    setShowCert(true)
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="space-y-4 animate-pulse">
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-6 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </PageWrapper>
    )
  }

  if (error || !course) {
    return (
      <PageWrapper>
        <div className="text-center py-16 space-y-3">
          <p className="text-5xl">😕</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'Kurs topilmadi'}</p>
          <button onClick={() => navigate('/courses')} className="text-xs text-sahifa-500 font-medium hover:underline">
            ← Kurslarga qaytish
          </button>
        </div>
      </PageWrapper>
    )
  }

  const freeLessons = lessons.filter(l => l.is_free).length
  const totalDur    = formatDuration(course.total_duration_minutes)

  return (
    <PageWrapper topPadding="">

      {/* ── Thumbnail header ─────────────────────────────────────────────── */}
      <div className="relative -mx-4 md:-mx-6 mb-5">
        <div className="h-52 md:h-64 bg-gradient-to-br from-sahifa-400 to-sahifa-700 relative overflow-hidden">
          {course.thumbnail_url ? (
            <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl opacity-20">{course.categories?.icon ?? '🎓'}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Back button */}
          <button
            onClick={() => navigate('/courses')}
            className="absolute top-4 left-4 w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            ←
          </button>

          {/* Owner edit shortcut */}
          {isOwner && (
            <Link
              to={`/courses/${course.id}/edit`}
              className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-sm text-white text-xs font-semibold hover:bg-black/60 transition-colors"
            >
              ✏️ Tahrirlash
            </Link>
          )}

          {/* Badges */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            {course.is_paid ? (
              <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow">
                💰 {course.price.toLocaleString()} so'm
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold shadow">
                🎁 Bepul
              </span>
            )}
            {!course.is_published && (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/80 text-white text-xs font-bold shadow">
                ⏳ Qoralama
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Title & stats ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug mb-2">
          {course.title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
          {course.categories && (
            <span>{course.categories.icon} {course.categories.name}</span>
          )}
          <span>{levelLabel(course.level)}</span>
          <span>🌐 {course.language.toUpperCase()}</span>
          {course.total_lessons > 0 && <span>📹 {course.total_lessons} dars</span>}
          {totalDur && <span>⏱ {totalDur}</span>}
          {course.enrolled_count > 0 && <span>👥 {course.enrolled_count} talaba</span>}
          {course.rating > 0 && <span>⭐ {course.rating.toFixed(1)}</span>}
        </div>

        {/* Description */}
        {course.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {course.description}
          </p>
        )}
      </motion.div>

      {/* ── Enroll / Owner CTA ───────────────────────────────────────────── */}
      {!isOwner && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-5"
        >
          {course.is_paid ? (
            <button
              onClick={handleEnroll}
              disabled={isEnrolled || enrollLoading}
              className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-colors shadow ${
                isEnrolled
                  ? 'bg-emerald-500 cursor-default'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {isEnrolled
                ? '✅ Siz yozilgansiz'
                : enrollLoading
                  ? '⏳ Tekshirilmoqda...'
                  : isTelegram
                    ? `⭐ ${course.price.toLocaleString()} so'mga xarid qilish`
                    : '📱 Telegram ichida to\'lash'}
            </button>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={isEnrolled || enrollLoading}
              className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-colors shadow ${
                isEnrolled
                  ? 'bg-emerald-500 cursor-default'
                  : 'bg-sahifa-500 hover:bg-sahifa-600'
              }`}
            >
              {isEnrolled
                ? '✅ Siz yozilgansiz'
                : enrollLoading
                  ? '⏳ Yozilmoqda...'
                  : '🎁 Bepul yozilish'}
            </button>
          )}
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            {freeLessons > 0 ? `${freeLessons} ta bepul dars mavjud` : 'Barcha darslar yozilgandan so\'ng ochiladi'}
          </p>
        </motion.div>
      )}

      {/* ── Lessons list ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Darslar ({lessons.length})
          </h2>
          {isOwner && (
            <Link
              to={`/courses/${course.id}/lessons/add`}
              className="text-xs font-semibold text-sahifa-500 hover:text-sahifa-600"
            >
              + Dars qo'shish
            </Link>
          )}
        </div>

        {/* Course progress bar — visible to enrolled students */}
        {isEnrolled && lessons.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">📈 Kurs bo'yicha progress</span>
              <span className="text-xs font-bold text-sahifa-600 dark:text-sahifa-400">
                {completedIds.size}/{lessons.length} ({lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${completedIds.size === lessons.length ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-sahifa-400 to-sahifa-600'}`}
                initial={{ width: 0 }}
                animate={{ width: `${lessons.length > 0 ? (completedIds.size / lessons.length) * 100 : 0}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
            {completedIds.size === lessons.length && completedIds.size > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-emerald-500 font-semibold text-center">🎉 Siz kursni tugatdingiz!</p>
                <button
                  onClick={handleOpenCertificate}
                  className="w-full py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-95 transition-all"
                >
                  🎓 Kurs sertifikatini yuklab olish
                </button>
              </div>
            )}
          </div>
        )}

        {lessons.length === 0 ? (
          <div className="text-center py-10 space-y-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            <span className="text-4xl">🎬</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isOwner ? 'Hali dars qo\'shilmagan' : 'Darslar tez orada qo\'shiladi'}
            </p>
            {isOwner && (
              <Link
                to={`/courses/${course.id}/lessons/add`}
                className="text-xs text-sahifa-500 font-medium hover:underline"
              >
                Birinchi darsni qo'shing →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, i) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                index={i}
                isOwner={isOwner}
                isEnrolled={isEnrolled}
                isCompleted={completedIds.has(lesson.id)}
                isExpanded={expandedId === lesson.id}
                onToggle={() => handleToggleLesson(lesson)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Completion certificate modal ─────────────────────────────────── */}
      {showCert && certData && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}

    </PageWrapper>
  )
}

export default CourseDetailPage
