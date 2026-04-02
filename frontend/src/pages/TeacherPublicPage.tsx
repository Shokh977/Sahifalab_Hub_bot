/**
 * TeacherPublicPage — modern public teacher profile
 *
 * Route: /teacher/:id  (no auth required)
 * Shows: avatar, name, specialization, bio, experience, education,
 *        social links, and the teacher's published courses grid.
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  BriefcaseIcon,
  GlobeAltIcon,
  PlayCircleIcon,
  UserIcon,
  UsersIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeacherProfile {
  telegram_id:      number
  first_name?:      string | null
  username?:        string | null
  photo_url?:       string | null
  bio?:             string | null
  specialization?:  string | null
  experience_years?: number | null
  education?:       string | null
  website_url?:     string | null
  youtube_url?:     string | null
  telegram_channel?: string | null
  profile_complete?: boolean
}

interface Course {
  id:                     number
  title:                  string
  thumbnail_url:          string
  price:                  number
  is_paid:                boolean
  level:                  string
  total_lessons:          number
  total_duration_minutes: number
  enrolled_count:         number
  rating:                 number
  categories?:            { name: string; icon: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function levelLabel(level: string) {
  const map: Record<string, string> = {
    beginner:     "Boshlang'ich",
    intermediate: "O'rta",
    advanced:     'Yuqori',
  }
  return map[level] ?? level
}

function formatDuration(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60), m = minutes % 60
  return h ? `${h}s ${m}d` : `${m}d`
}

// ── Course mini-card ──────────────────────────────────────────────────────────
const MiniCourseCard: React.FC<{ course: Course; index: number }> = ({ course, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 + index * 0.05 }}
  >
    <Link to={`/courses/${course.id}`} className="group block">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg hover:border-sahifa-300 dark:hover:border-sahifa-600 transition-all">
        {/* Thumbnail */}
        <div className="relative h-32 bg-gradient-to-br from-sahifa-100 to-sahifa-200 dark:from-sahifa-900/30 dark:to-sahifa-900/20 overflow-hidden">
          {course.thumbnail_url ? (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpenIcon className="w-10 h-10 opacity-20 text-sahifa-500" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-2 right-2">
            {course.is_paid ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow">
                {course.price.toLocaleString()} so'm
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow">
                Bepul
              </span>
            )}
          </div>
        </div>
        {/* Info */}
        <div className="p-3 space-y-1.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">
            {course.title}
          </p>
          {course.categories && (
            <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium">
              {course.categories.icon} {course.categories.name}
            </p>
          )}
          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-0.5">
            <div className="flex items-center gap-2">
              {course.total_lessons > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <VideoCameraIcon className="w-3 h-3" /> {course.total_lessons} dars
                </span>
              )}
              {course.total_duration_minutes > 0 && (
                <span>⏱ {formatDuration(course.total_duration_minutes)}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {course.rating > 0 && <span>⭐ {course.rating.toFixed(1)}</span>}
              {course.enrolled_count > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <UsersIcon className="w-3 h-3" /> {course.enrolled_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  </motion.div>
)

// ── Main page ─────────────────────────────────────────────────────────────────
const TeacherPublicPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [teacher,         setTeacher]         = useState<TeacherProfile | null>(null)
  const [courses,         setCourses]         = useState<Course[]>([])
  const [loadingProfile,  setLoadingProfile]  = useState(true)
  const [loadingCourses,  setLoadingCourses]  = useState(true)
  const [error,           setError]           = useState('')

  const teacherId = parseInt(id ?? '0', 10)

  // ── Load teacher profile ────────────────────────────────────────────────
  useEffect(() => {
    if (!teacherId) { setError("O'qituvchi topilmadi"); setLoadingProfile(false); return }
    apiService.getPublicTeacherProfile(teacherId)
      .then(res => setTeacher(res.data))
      .catch(() => setError("O'qituvchi profili yuklanmadi"))
      .finally(() => setLoadingProfile(false))
  }, [teacherId])

  // ── Load teacher courses ────────────────────────────────────────────────
  useEffect(() => {
    if (!teacherId) { setLoadingCourses(false); return }
    apiService.getCourses({ teacher_id: teacherId, limit: 50 })
      .then(res => setCourses(Array.isArray(res.data?.courses) ? res.data.courses : []))
      .catch(() => {})
      .finally(() => setLoadingCourses(false))
  }, [teacherId])

  const displayName = teacher?.first_name
    || (teacher?.username ? `@${teacher.username}` : null)
    || "O'qituvchi"

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('')

  const totalStudents = courses.reduce((sum, c) => sum + (c.enrolled_count ?? 0), 0)

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loadingProfile) return (
    <PageWrapper topPadding="">
      <div className="animate-pulse">
        {/* Hero skeleton */}
        <div className="-mx-4 sm:-mx-5 lg:-mx-8 bg-gradient-to-br from-slate-900 to-slate-800 px-4 sm:px-5 lg:px-8 pt-4 pb-8">
          <div className="h-4 w-24 bg-white/10 rounded mb-6" />
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/10 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-white/10 rounded" />
              <div className="h-4 w-32 bg-white/10 rounded" />
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-5 space-y-3 mt-6">
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-3/4" />
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
        </div>
      </div>
    </PageWrapper>
  )

  if (error || !teacher) return (
    <PageWrapper>
      <div className="text-center py-16 space-y-3">
        <UserIcon className="h-12 w-12 mx-auto text-slate-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error || "O'qituvchi topilmadi"}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-sahifa-500 font-medium hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Orqaga
        </button>
      </div>
    </PageWrapper>
  )

  return (
    <PageWrapper topPadding="">

      {/* ── Dark hero ──────────────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 lg:-mx-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:to-slate-900 px-4 sm:px-5 lg:px-8 pt-4 pb-8 relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sahifa-500/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-sahifa-400/5 blur-2xl" />
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="relative mb-5 inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Orqaga
        </button>

        {/* Profile identity */}
        <div className="relative flex items-start gap-4 sm:gap-5">
          {/* Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="shrink-0"
          >
            {teacher.photo_url ? (
              <img
                src={teacher.photo_url}
                alt={displayName}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/20 shadow-xl"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-sahifa-500 to-sahifa-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl border-2 border-white/20">
                {initials || <UserIcon className="h-9 w-9" />}
              </div>
            )}
          </motion.div>

          {/* Name + meta */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex-1 min-w-0 pt-1"
          >
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">{displayName}</h1>
            {teacher.username && (
              <p className="text-slate-400 text-sm mt-0.5">@{teacher.username}</p>
            )}
            {teacher.specialization && (
              <span className="mt-2 inline-block px-3 py-1 rounded-full bg-sahifa-500/20 border border-sahifa-500/30 text-sahifa-300 text-xs font-semibold">
                {teacher.specialization}
              </span>
            )}
          </motion.div>
        </div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="relative mt-5 grid grid-cols-3 gap-3"
        >
          {[
            { icon: <PlayCircleIcon className="h-4 w-4" />, value: courses.length, label: 'Kurs' },
            { icon: <UsersIcon className="h-4 w-4" />,       value: totalStudents,  label: 'Talaba' },
            {
              icon: <BriefcaseIcon className="h-4 w-4" />,
              value: teacher.experience_years ? `${teacher.experience_years} yil` : '—',
              label: 'Tajriba',
            },
          ].map(stat => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <div className="flex justify-center mb-1 text-sahifa-400">{stat.icon}</div>
              <p className="text-white font-bold text-lg leading-none">{stat.value}</p>
              <p className="text-slate-400 text-[11px] mt-0.5">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="py-5 space-y-6">

        {/* Bio */}
        {teacher.bio && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-sahifa-500" /> Haqida
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
              {teacher.bio}
            </p>
          </motion.section>
        )}

        {/* Education */}
        {teacher.education && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <AcademicCapIcon className="h-4 w-4 text-sahifa-500" /> Ta'lim
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {teacher.education}
            </p>
          </motion.section>
        )}

        {/* Social links */}
        {(teacher.website_url || teacher.youtube_url || teacher.telegram_channel) && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <GlobeAltIcon className="h-4 w-4 text-sahifa-500" /> Havolalar
            </h2>
            <div className="flex flex-wrap gap-2">
              {teacher.website_url && (
                <a
                  href={teacher.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-sahifa-50 hover:text-sahifa-700 dark:hover:bg-sahifa-900/30 dark:hover:text-sahifa-300 transition-colors"
                >
                  <GlobeAltIcon className="h-3.5 w-3.5" /> Vebsayt
                </a>
              )}
              {teacher.youtube_url && (
                <a
                  href={teacher.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  ▶ YouTube
                </a>
              )}
              {teacher.telegram_channel && (
                <a
                  href={`https://t.me/${teacher.telegram_channel.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                >
                  ✈ Telegram
                </a>
              )}
            </div>
          </motion.section>
        )}

        {/* Courses */}
        <section>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <PlayCircleIcon className="h-4 w-4 text-sahifa-500" />
            Kurslar
            {courses.length > 0 && (
              <span className="text-xs font-normal text-gray-400">({courses.length})</span>
            )}
          </h2>

          {loadingCourses ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-pulse">
                  <div className="h-32 bg-slate-100 dark:bg-slate-700" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <BookOpenIcon className="h-8 w-8 mx-auto text-slate-400" />
              <p className="text-sm text-gray-400">Hali kurslar yo'q</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {courses.map((course, i) => (
                <MiniCourseCard key={course.id} course={course} index={i} />
              ))}
            </div>
          )}
        </section>

      </div>

    </PageWrapper>
  )
}

export default TeacherPublicPage
