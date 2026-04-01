/**
 * CourseDetailPage — public course detail view
 *
 * Shows:
 *  • Course header (thumbnail, title, badges, stats, teacher card)
 *  • Category / Level / Language / Duration metadata row
 *  • Description
 *  • Lesson list (free lessons unlocked; paid lessons locked unless enrolled)
 *  • Sticky enroll / "Already enrolled" CTA
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
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
const LessonRow: React.FC<{ lesson: Lesson; index: number; isOwner: boolean }> = ({ lesson, index, isOwner }) => {
  const unlocked = lesson.is_free || isOwner
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
        unlocked
          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sahifa-300 dark:hover:border-sahifa-600 cursor-pointer'
          : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50'
      }`}
    >
      {/* Order badge */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
        unlocked
          ? 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700 dark:text-sahifa-300'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
      }`}>
        {unlocked ? index + 1 : '🔒'}
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
        </div>
      </div>

      {unlocked && (
        <span className="text-sahifa-500 dark:text-sahifa-400 text-sm shrink-0">▶</span>
      )}
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse]   = useState<Course | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const courseId = parseInt(id ?? '0', 10)
  const isOwner  = !!(user && (user.id === course?.teacher_id || user.role === 'admin'))

  useEffect(() => {
    if (!courseId) { setError('Kurs topilmadi'); setLoading(false); return }

    Promise.all([
      apiService.getCourse(courseId),
      apiService.getLessons(courseId),
    ])
      .then(([courseRes, lessonsRes]) => {
        setCourse(courseRes.data)
        setLessons(lessonsRes.data ?? [])
      })
      .catch(() => setError("Kurs yuklanmadi. Iltimos, qayta urinib ko'ring."))
      .finally(() => setLoading(false))
  }, [courseId])

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
              onClick={() => {/* enrollment + payment — Step 11 */}}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors shadow"
            >
              💳 {course.price.toLocaleString()} so'mga xarid qilish
            </button>
          ) : (
            <button
              onClick={() => {/* free enrollment — Step 11 */}}
              className="w-full py-3 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 text-white font-semibold text-sm transition-colors shadow"
            >
              🎁 Bepul yozilish
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
              <LessonRow key={lesson.id} lesson={lesson} index={i} isOwner={isOwner} />
            ))}
          </div>
        )}
      </motion.div>

    </PageWrapper>
  )
}

export default CourseDetailPage
