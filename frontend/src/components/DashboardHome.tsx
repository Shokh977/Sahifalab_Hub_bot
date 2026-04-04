/**
 * DashboardHome — $100K-grade premium web dashboard.
 *
 * Sections:
 *   1. Hero banner       — glassmorphism card, avatar, XP/Level/Focus stats chips
 *   2. Continue Learning — last-active lesson widget
 *   3. Courses grid      — horizontal scroll, progress bar, teacher avatar, Premium/Free badge
 *   4. Daily Goal        — animated progress chart (focus time + quizzes)
 *   5. Daily quote       — HeroSection at the bottom
 *
 * ⚠️  Never rendered inside Telegram Mini App (App.tsx guards this).
 */
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AcademicCapIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ClockIcon,
  CpuChipIcon,
  PlayIcon,
  RectangleStackIcon,
  StarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { useAuth } from '../context/AuthContext'
import {
  formatFocusTime,
  levelBounds,
  useProgressStore,
} from '../context/progressStore'
import HeroSection from './HeroSection'

const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'
).replace(/\/$/, '')

// ── Types ─────────────────────────────────────────────────────────────────────
interface CourseItem {
  id:             number
  title:          string
  description?:   string | null
  thumbnail_url?: string | null
  price:          number
  is_paid:        boolean
  level:          string
  rating:         number
  enrolled_count: number
  total_lessons:  number
  teacher_id:     number
  teacher_name?:  string | null
  teacher_photo?: string | null
  categories?:    { name: string; icon: string } | null
  progress?:      number  // 0–100
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEVEL_LABELS: Record<string, string> = {
  beginner:     "Boshlang'ich",
  intermediate: "O'rta",
  advanced:     'Yuqori',
}
const ll = (l: string) => LEVEL_LABELS[l] ?? l

// ── 1. Stat chip (inside hero) ────────────────────────────────────────────────
const StatChip: React.FC<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  value: string
  label: string
}> = ({ icon: Icon, value, label }) => (
  <div className="stat-chip text-white">
    <Icon className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
    <span className="font-bold">{value}</span>
    <span className="text-white/60 font-normal">{label}</span>
  </div>
)

// ── 2. Course card (horizontal scroll) ───────────────────────────────────────
const CourseCard: React.FC<{ course: CourseItem; index: number }> = ({ course, index }) => {
  const navigate = useNavigate()
  const progress = course.progress ?? 0
  const hasProg  = progress > 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 + index * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
      onClick={() => navigate(`/courses/${course.id}`)}
      className="course-card group"
    >
      {/* Thumbnail */}
      <div className="relative h-44 bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-[#2A2A38] dark:to-[#1C1C2A] overflow-hidden">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <AcademicCapIcon className="w-14 h-14 text-sahifa-300/60 dark:text-sahifa-700/60" />
          </div>
        )}
        {/* Gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

        {/* Premium / Free badge — top-left */}
        <div className="absolute top-3 left-3">
          {course.is_paid ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sahifa-500/90 backdrop-blur-sm text-white text-[10px] font-bold shadow-glow-sm">
              <StarSolid className="w-2.5 h-2.5" />
              Premium
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold">
              Bepul
            </span>
          )}
        </div>

        {/* Level badge — top-right */}
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-lg bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10">
            {ll(course.level)}
          </span>
        </div>

        {/* Teacher avatar — bottom-right */}
        <div className="absolute bottom-3 right-3">
          {course.teacher_photo ? (
            <img
              src={course.teacher_photo}
              alt={course.teacher_name ?? ''}
              className="w-8 h-8 rounded-full object-cover border-2 border-white/60 shadow"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 border-2 border-white/60 flex items-center justify-center shadow">
              <span className="text-white text-xs font-bold">
                {(course.teacher_name ?? 'T').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
            <PlayIcon className="w-5 h-5 text-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        {course.categories && (
          <p className="text-[10px] font-semibold text-sahifa-500 uppercase tracking-widest">
            {course.categories.icon} {course.categories.name}
          </p>
        )}
        <p className="text-sm font-bold text-slate-800 dark:text-white line-clamp-2 leading-snug">
          {course.title}
        </p>
        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span className="font-medium truncate max-w-[120px]">
            {course.teacher_name ?? "O'qituvchi"}
          </span>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {course.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <StarSolid className="w-3 h-3 text-amber-400" />
                {course.rating.toFixed(1)}
              </span>
            )}
            {course.enrolled_count > 0 && (
              <span className="flex items-center gap-0.5">
                <UserGroupIcon className="w-3 h-3" />
                {course.enrolled_count}
              </span>
            )}
          </div>
        </div>
        {hasProg ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 dark:text-slate-500">Bajarildi</span>
              <span className="font-semibold text-sahifa-500">{progress}%</span>
            </div>
            <div className="goal-bar-track">
              <div className="goal-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{course.total_lessons} ta dars</p>
        )}
      </div>
    </motion.div>
  )
}

// ── 3. Continue Learning widget ───────────────────────────────────────────────
interface LastLesson {
  course_title:   string
  lesson_title:   string
  course_id:      number
  lesson_id:      number
  thumbnail_url?: string | null
  progress:       number
}

const ContinueLearning: React.FC = () => {
  const navigate = useNavigate()
  const [lesson, setLesson] = useState<LastLesson | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('last_lesson')
    if (!raw) return
    try { setLesson(JSON.parse(raw) as LastLesson) } catch { /* ignore */ }
  }, [])

  if (!lesson) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
    >
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="section-heading">O'qishni davom ettiring</h2>
          <p className="section-sub">Qolgan joydan boshlang</p>
        </div>
      </div>
      <button
        onClick={() => navigate(`/courses/${lesson.course_id}/lessons/${lesson.lesson_id}`)}
        className="continue-card w-full text-left group hover:border-sahifa-300 dark:hover:border-sahifa-700 transition-colors"
      >
        <div className="relative w-20 h-16 rounded-[14px] overflow-hidden bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-[#2A2A38] dark:to-[#1C1C2A] flex-shrink-0">
          {lesson.thumbnail_url ? (
            <img src={lesson.thumbnail_url} alt={lesson.course_title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <AcademicCapIcon className="w-7 h-7 text-sahifa-400" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <PlayIcon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[10px] font-semibold text-sahifa-500 uppercase tracking-widest truncate">{lesson.course_title}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white line-clamp-1">{lesson.lesson_title}</p>
          <div className="space-y-1">
            <div className="goal-bar-track">
              <div className="goal-bar-fill" style={{ width: `${lesson.progress}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{lesson.progress}% bajarildi</p>
          </div>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0 group-hover:text-sahifa-500 transition-colors" />
      </button>
    </motion.div>
  )
}

// ── 4. Daily Learning Goal ────────────────────────────────────────────────────
const DAILY_FOCUS_GOAL_MINS = 30
const DAILY_QUIZ_GOAL = 3

const DailyGoal: React.FC<{ focusSeconds: number; quizzesCompleted: number }> = ({
  focusSeconds, quizzesCompleted,
}) => {
  const navigate   = useNavigate()
  const focusMins  = Math.round(focusSeconds / 60)
  const focusPct   = Math.min(100, Math.round((focusMins / DAILY_FOCUS_GOAL_MINS) * 100))
  const quizPct    = Math.min(100, Math.round((quizzesCompleted / DAILY_QUIZ_GOAL) * 100))

  const today      = new Date()
  const dayLabels  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    return d.toLocaleDateString('uz-UZ', { weekday: 'short' }).slice(0, 2)
  })
  const storedWeek = (() => {
    try { return JSON.parse(localStorage.getItem('focus_week') ?? '[]') as number[] } catch { return [] }
  })()
  const weekMins   = [...(storedWeek.slice(-6)), focusMins]
  const maxMins    = Math.max(DAILY_FOCUS_GOAL_MINS, ...weekMins, 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="surface-card p-5 space-y-5"
    >
      <div className="flex items-end justify-between">
        <div>
          <h2 className="section-heading">Kunlik maqsad</h2>
          <p className="section-sub">Bugungi natijalar</p>
        </div>
        <span className="text-[11px] font-semibold text-sahifa-500 bg-sahifa-50 dark:bg-sahifa-500/10 px-2.5 py-1 rounded-full">
          Bugun
        </span>
      </div>

      {/* Meters */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className="p-4 rounded-[18px] bg-slate-50 dark:bg-[#1A1A28] border border-slate-100 dark:border-[#2E2E3A] space-y-3 cursor-pointer hover:border-sahifa-300 dark:hover:border-sahifa-800 transition-colors"
          onClick={() => navigate('/study')}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <ClockIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Fokus</p>
              <p className="text-xs font-bold text-slate-800 dark:text-white">{formatFocusTime(focusSeconds)}</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${focusPct}%` }} /></div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{focusPct}% / {DAILY_FOCUS_GOAL_MINS} daqiqa</p>
          </div>
        </div>
        <div
          className="p-4 rounded-[18px] bg-slate-50 dark:bg-[#1A1A28] border border-slate-100 dark:border-[#2E2E3A] space-y-3 cursor-pointer hover:border-sahifa-300 dark:hover:border-sahifa-800 transition-colors"
          onClick={() => navigate('/quiz')}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <RectangleStackIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Testlar</p>
              <p className="text-xs font-bold text-slate-800 dark:text-white">{quizzesCompleted} ta</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${quizPct}%` }} /></div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{quizPct}% / {DAILY_QUIZ_GOAL} ta maqsad</p>
          </div>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-3">Haftalik fokus (daqiqa)</p>
        <div className="flex items-end gap-1.5" style={{ height: '60px' }}>
          {weekMins.map((mins, i) => {
            const isToday   = i === 6
            const heightPct = (mins / maxMins) * 100
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end" style={{ height: '44px' }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(6, heightPct)}%` }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.7, ease: 'easeOut' }}
                    className={`w-full rounded-t-[5px] ${
                      isToday
                        ? 'bg-gradient-to-t from-sahifa-600 to-sahifa-400 shadow-glow-sm'
                        : 'bg-slate-200 dark:bg-[#2E2E3A]'
                    }`}
                    style={{ minHeight: 4 }}
                  />
                </div>
                <span className={`text-[9px] font-medium ${isToday ? 'text-sahifa-500' : 'text-slate-400 dark:text-slate-600'}`}>
                  {dayLabels[i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ── Quick action pills ────────────────────────────────────────────────────────
const QUICK_PILLS = [
  { icon: ClockIcon,          label: "O'qish",   path: '/study',        grad: 'from-blue-500 to-cyan-500' },
  { icon: RectangleStackIcon, label: 'Test',     path: '/quiz',         grad: 'from-violet-500 to-purple-600' },
  { icon: CpuChipIcon,        label: 'AI',       path: '/ai-companion', grad: 'from-emerald-500 to-teal-600' },
  { icon: BookOpenIcon,       label: 'Kitoblar', path: '/kitoblar',     grad: 'from-amber-500 to-orange-500' },
]

// ── Main dashboard ────────────────────────────────────────────────────────────
const DashboardHome: React.FC = () => {
  const { user }          = useAuth()
  const navigate          = useNavigate()
  const {
    totalXP, level, focusSeconds,
    quizzesCompleted, isInitialized,
  } = useProgressStore()

  const [courses,        setCourses]        = useState<CourseItem[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/courses?limit=8&status=published`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setCourses((Array.isArray(data) ? data : data?.courses ?? []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setCoursesLoading(false))
  }, [])

  const { start, end } = levelBounds(level)
  const xpInLevel      = totalXP - start
  const xpForLevel     = end - start
  const xpPct          = Math.min(100, Math.round((xpInLevel / Math.max(xpForLevel, 1)) * 100))

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 pb-16 space-y-10">

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          1. HERO BANNER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="hero-glass"
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-12 -right-12 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 w-72 h-72 rounded-full bg-black/10 blur-3xl" />
        <div className="pointer-events-none absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-white/10 to-transparent rounded-bl-[80px]" />
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)' }}
        />

        <div className="relative p-6 sm:p-8">
          {/* Row 1: avatar + greeting + quick pills (desktop) */}
          <div className="flex flex-wrap items-start gap-5">
            {/* Avatar */}
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                className="w-16 h-16 rounded-[20px] object-cover border-2 border-white/30 shadow-lg flex-shrink-0"
                alt={user.first_name}
              />
            ) : (
              <div className="w-16 h-16 rounded-[20px] bg-white/20 flex items-center justify-center border border-white/30 flex-shrink-0 backdrop-blur-sm">
                <span className="text-3xl font-extrabold text-white">
                  {(user?.first_name || 'S').charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Greeting + chips */}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-white/65 text-sm font-medium">Assalomu alaykum 👋</p>
                <h2 className="text-2xl font-extrabold text-white tracking-tight leading-tight mt-0.5 truncate">
                  {user?.first_name || 'Foydalanuvchi'}
                </h2>
              </div>
              {isInitialized && (
                <div className="flex flex-wrap gap-2">
                  <StatChip icon={StarIcon}       value={totalXP.toLocaleString()} label="XP" />
                  <StatChip icon={AcademicCapIcon} value={`L${level}`}             label="Daraja" />
                  <StatChip icon={ClockIcon}       value={formatFocusTime(focusSeconds)} label="Fokus" />
                </div>
              )}
            </div>

            {/* Quick pill nav — desktop only */}
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              {QUICK_PILLS.map(p => {
                const Icon = p.icon
                return (
                  <button
                    key={p.path}
                    onClick={() => navigate(p.path)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 text-white text-xs font-semibold transition-all"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* XP progress bar */}
          {isInitialized && (
            <div className="mt-5">
              <div className="flex justify-between text-white/60 text-[11px] mb-1.5 font-medium">
                <span>Daraja {level} → {level + 1}</span>
                <span>{xpInLevel.toLocaleString()} / {xpForLevel.toLocaleString()} XP</span>
              </div>
              <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6))' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPct}%` }}
                  transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Mobile quick pill row */}
      <div className="lg:hidden flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {QUICK_PILLS.map(p => {
          const Icon = p.icon
          return (
            <button
              key={p.path}
              onClick={() => navigate(p.path)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl flex-shrink-0
                         bg-white dark:bg-[#222230] border border-slate-200 dark:border-[#2E2E3A]
                         text-slate-700 dark:text-white text-xs font-semibold shadow-card
                         hover:border-sahifa-300 dark:hover:border-sahifa-800 transition-all"
            >
              <div className={`w-5 h-5 rounded-lg bg-gradient-to-br ${p.grad} flex items-center justify-center`}>
                <Icon className="w-3 h-3 text-white" />
              </div>
              {p.label}
            </button>
          )
        })}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          2. CONTINUE LEARNING
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <ContinueLearning />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          3. COURSES — horizontal scroll
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-end justify-between mb-5"
        >
          <div>
            <h2 className="section-heading">Kurslar</h2>
            <p className="section-sub">Professional ta'lim dasturlari</p>
          </div>
          <Link
            to="/courses"
            className="flex items-center gap-1 text-sm font-semibold text-sahifa-500 hover:text-sahifa-600 transition-colors"
          >
            Barchasi
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </motion.div>

        {coursesLoading ? (
          <div className="courses-scroll">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="flex-shrink-0 rounded-[24px] bg-slate-100 dark:bg-[#222230] animate-pulse"
                style={{ width: 280, height: 300 }}
              />
            ))}
          </div>
        ) : courses.length > 0 ? (
          <div className="courses-scroll">
            {courses.map((course, i) => (
              <CourseCard key={course.id} course={course} index={i} />
            ))}
            {/* See-all end-card */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={() => navigate('/courses')}
              className="course-card flex flex-col items-center justify-center gap-3 text-center p-6 cursor-pointer group"
              style={{ minHeight: 200 }}
            >
              <div className="w-12 h-12 rounded-2xl bg-sahifa-50 dark:bg-sahifa-500/10 flex items-center justify-center group-hover:bg-sahifa-500 transition-colors">
                <ChevronRightIcon className="w-5 h-5 text-sahifa-500 group-hover:text-white transition-colors" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-white">Barchasi</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Barcha kurslarni ko'rish</p>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 dark:border-[#2E2E3A] py-12 text-center">
            <AcademicCapIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Kurslar yuklanmoqda…</p>
            <button
              onClick={() => navigate('/courses')}
              className="mt-4 px-5 py-2 rounded-xl bg-sahifa-500 text-white text-xs font-semibold hover:bg-sahifa-600 transition-colors"
            >
              Kurslarni ko'rish
            </button>
          </div>
        )}
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          4. DAILY LEARNING GOAL
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isInitialized && (
        <DailyGoal focusSeconds={focusSeconds} quizzesCompleted={quizzesCompleted ?? 0} />
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          5. DAILY QUOTE
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <HeroSection />

      {/* Footer */}
      <footer className="text-center space-y-1.5 pb-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">@Sahifalab_hub_bot</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-600">Powered by SAHIFALAB · 2026</p>
      </footer>
    </div>
  )
}

export default DashboardHome
