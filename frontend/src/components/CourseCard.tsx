/**
 * CourseCard — reusable course card used in CoursesPage, Unified Profile (Kurslar tab), etc.
 *
 * Renders thumbnail, price badge, level pill, teacher avatar, title,
 * category, lesson/duration counts, rating, and enrollment count.
 */
import React, { useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpenIcon, VideoCameraIcon, UsersIcon } from '@heroicons/react/24/outline'
import { trackImpression } from '../utils/impressionBuffer'
import { thumb } from '../utils/bunnyOptimize'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CourseData {
  id:                      number
  teacher_id:              number
  category_id?:            number | null
  title:                   string
  slug?:                   string
  description?:            string
  thumbnail_url:           string
  price:                   number
  is_paid:                 boolean
  level:                   'beginner' | 'intermediate' | 'advanced' | string
  language?:               string
  total_lessons:           number
  total_duration_minutes:  number
  enrolled_count:          number
  rating:                  number
  created_at?:             string
  categories?:             { name: string; slug?: string; icon: string } | null
}

export interface TeacherMini {
  first_name?:     string | null
  username?:       string | null
  photo_url?:      string | null
  specialization?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEVELS: Record<string, string> = {
  beginner:     "Boshlang'ich",
  intermediate: "O'rta",
  advanced:     'Yuqori',
}

function levelLabel(level: string) {
  return LEVELS[level] ?? level
}

function formatDuration(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}s ${m}d` : `${m}d`
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CourseCardProps {
  course: CourseData
  index?: number
  teacher?: TeacherMini
  /** Hide the teacher avatar overlay (e.g. when rendered inside a teacher's own profile) */
  hideTeacher?: boolean
  /** Analytics ref source appended as ?ref= to course link */
  analyticsRef?: string
  /** Render as horizontal row card (thumbnail left, info right) */
  horizontal?: boolean
}

const CourseCard: React.FC<CourseCardProps> = ({ course, index = 0, teacher, hideTeacher = false, analyticsRef, horizontal = false }) => {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const cat = course.categories
  const teacherName = teacher?.first_name
    || (teacher?.username ? `@${teacher.username}` : null)
  const courseLink = analyticsRef ? `/courses/${course.id}?ref=${analyticsRef}` : `/courses/${course.id}`

  // Track course_impression when card enters viewport for 1 s
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        timer = setTimeout(() => {
          trackImpression('course_impression', course.id, course.teacher_id, analyticsRef || 'direct')
          io.disconnect()
        }, 1000)
      } else if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); if (timer) clearTimeout(timer) }
  }, [course.id, course.teacher_id, analyticsRef])

  if (horizontal) {
    return (
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
      >
        <Link to={courseLink} className="group block">
          <div className="flex gap-3 bg-white/90 dark:bg-[#1A1A1A] rounded-2xl border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden hover:shadow-md transition-all duration-200 p-3">
            {/* Thumbnail */}
            <div className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-slate-800 dark:to-slate-900">
              {course.thumbnail_url ? (
                <img src={thumb.course(course.thumbnail_url)} alt={course.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpenIcon className="w-8 h-8 text-sahifa-300 dark:text-sahifa-700" />
                </div>
              )}
              {/* Price badge */}
              <div className="absolute bottom-1 left-1">
                {course.is_paid ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-bold">
                    {course.price.toLocaleString()} so'm
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white text-[9px] font-bold">Bepul</span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 leading-snug">
                  {course.title}
                </p>
                {!hideTeacher && teacherName && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{teacherName}</p>
                )}
                {cat && (
                  <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 mt-0.5">{cat.icon} {cat.name}</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 mt-1 flex-wrap">
                {course.total_lessons > 0 && (
                  <span className="inline-flex items-center gap-0.5"><VideoCameraIcon className="w-3 h-3" />{course.total_lessons} dars</span>
                )}
                {course.total_duration_minutes > 0 && (
                  <span>⏱ {formatDuration(course.total_duration_minutes)}</span>
                )}
                {course.rating > 0 && <span>⭐ {course.rating.toFixed(1)}</span>}
                {course.enrolled_count > 0 && (
                  <span className="inline-flex items-center gap-0.5"><UsersIcon className="w-3 h-3" />{course.enrolled_count}</span>
                )}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link to={courseLink} className="group block">
        <div className="bg-white/90 dark:bg-[#1A1A1A] rounded-[24px] border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300">
          {/* Thumbnail */}
          <div className="relative h-44 bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
            {course.thumbnail_url ? (
              <img
                src={thumb.course(course.thumbnail_url)}
                alt={course.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpenIcon className="w-14 h-14 text-sahifa-300 dark:text-sahifa-800" />
              </div>
            )}
            {/* Gradient scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
            {/* Orange hover tint */}
            <div className="absolute inset-0 bg-sahifa-500/0 group-hover:bg-sahifa-500/20 transition-colors duration-300 pointer-events-none" />
            {/* Price badge */}
            <div className="absolute top-3 right-3">
              {course.is_paid ? (
                <span className="px-2.5 py-1 rounded-[10px] bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold border border-white/10">
                  {course.price.toLocaleString()} so'm
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-[10px] bg-emerald-500/90 text-white text-[10px] font-bold">
                  Bepul
                </span>
              )}
            </div>
            {/* Bottom row: level + teacher avatar */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-lg bg-white/15 backdrop-blur-sm text-white text-[10px] font-medium border border-white/15">
                {levelLabel(course.level)}
              </span>
              {!hideTeacher && teacher && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${course.teacher_id}?tab=courses`) }}
                  className="flex-shrink-0"
                  title={teacherName || undefined}
                >
                  {teacher.photo_url ? (
                    <img src={thumb.avatarSmall(teacher.photo_url)} alt={teacherName || ''} loading="lazy" className="w-7 h-7 rounded-full border-2 border-white/60 object-cover shadow-md" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-sahifa-500/80 border-2 border-white/60 flex items-center justify-center text-[9px] font-bold text-white">
                      {(teacherName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 leading-snug">
              {course.title}
            </p>
            {cat && (
              <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium">
                {cat.icon} {cat.name}
              </p>
            )}
            {!hideTeacher && teacherName && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{teacherName}</p>
            )}
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                {course.total_lessons > 0 && (
                  <span className="inline-flex items-center gap-1"><VideoCameraIcon className="w-3.5 h-3.5" />{course.total_lessons} dars</span>
                )}
                {course.total_duration_minutes > 0 && (
                  <span>⏱ {formatDuration(course.total_duration_minutes)}</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                {course.rating > 0 && (
                  <span>⭐ {course.rating.toFixed(1)}</span>
                )}
                {course.enrolled_count > 0 && (
                  <span className="inline-flex items-center gap-1"><UsersIcon className="w-3.5 h-3.5" />{course.enrolled_count}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export default React.memo(CourseCard)
