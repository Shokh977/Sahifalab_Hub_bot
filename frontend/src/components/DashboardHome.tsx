/**
 * DashboardHome — premium web dashboard (never shown in Telegram mode).
 *
 * Sections:
 *   1. Welcome banner   — gradient card, avatar, live XP/level/focus stats
 *   2. Featured Courses — 3-column glassmorphism grid fetched from API
 *   3. Quick Actions    — 4 compact tiles (Study, Test, AI, Library)
 *   4. Daily Quote      — HeroSection repositioned at the bottom
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
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import { useProgressStore, levelBounds, levelProgress, formatFocusTime } from '../context/progressStore'
import HeroSection from './HeroSection'

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

// ── Types ─────────────────────────────────────────────────────────────────────
interface FeaturedCourse {
  id:             number
  title:          string
  thumbnail_url?: string | null
  price:          number
  is_paid:        boolean
  level:          string
  rating:         number
  enrolled_count: number
  total_lessons:  number
  teacher_id:     number
  categories?:    { name: string; icon: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEVEL_LABELS: Record<string, string> = {
  beginner:     "Boshlang'ich",
  intermediate: "O'rta",
  advanced:     'Yuqori',
}
const levelLabel = (l: string) => LEVEL_LABELS[l] ?? l

// ── Featured course card ──────────────────────────────────────────────────────
const FeaturedCourseCard: React.FC<{ course: FeaturedCourse; index: number }> = ({ course, index }) => {
  const navigate = useNavigate()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + index * 0.09, type: 'spring', stiffness: 280, damping: 24 }}
      onClick={() => navigate(`/courses/${course.id}`)}
      className="group relative cursor-pointer rounded-[24px] overflow-hidden
                 bg-white dark:bg-[#1A1A1A]
                 border border-slate-200/60 dark:border-[#2A2A2A]
                 shadow-card hover:shadow-card-hover hover:-translate-y-1
                 transition-all duration-300"
    >
      {/* Thumbnail */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-slate-800 dark:to-slate-900">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <AcademicCapIcon className="w-14 h-14 text-sahifa-300 dark:text-sahifa-800" />
          </div>
        )}
        {/* Bottom gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        {/* Orange hover tint */}
        <div className="absolute inset-0 bg-sahifa-500/0 group-hover:bg-sahifa-500/18 transition-colors duration-300 pointer-events-none" />

        {/* Price badge — top right */}
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

        {/* Level badge — bottom left */}
        <div className="absolute bottom-3 left-3">
          <span className="px-2 py-0.5 rounded-lg bg-white/15 backdrop-blur-sm text-white text-[10px] font-medium border border-white/15">
            {levelLabel(course.level)}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 leading-snug">
          {course.title}
        </p>
        {course.categories && (
          <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium">
            {course.categories.icon} {course.categories.name}
          </p>
        )}
        <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-0.5">
          <span>{course.total_lessons} dars</span>
          <div className="flex items-center gap-2.5">
            {course.rating > 0 && <span>⭐ {course.rating.toFixed(1)}</span>}
            {course.enrolled_count > 0 && <span>{course.enrolled_count} talaba</span>}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Quick action tile ─────────────────────────────────────────────────────────
interface QuickAction {
  icon:  React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  sub:   string
  path:  string
  grad:  string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: ClockIcon,          label: "O'qish",   sub: 'Focus timer',   path: '/study',        grad: 'from-blue-500 to-cyan-500' },
  { icon: RectangleStackIcon, label: 'Test',     sub: 'Quiz sinovi',   path: '/quiz',         grad: 'from-violet-500 to-purple-500' },
  { icon: CpuChipIcon,        label: 'AI',       sub: 'Kitob AI',      path: '/ai-companion', grad: 'from-emerald-500 to-teal-500' },
  { icon: BookOpenIcon,       label: 'Kitoblar', sub: 'PDF kutubxona', path: '/kitoblar',     grad: 'from-amber-500 to-orange-500' },
]

// ── Main dashboard ────────────────────────────────────────────────────────────
const DashboardHome: React.FC = () => {
  const { user }           = useAuth()
  const navigate           = useNavigate()
  const { totalXP, level, focusSeconds, isInitialized } = useProgressStore()

  const [courses,        setCourses]        = useState<FeaturedCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/courses?limit=3&status=published`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setCourses((Array.isArray(data) ? data : data?.courses ?? []).slice(0, 3)))
      .catch(() => {})
      .finally(() => setCoursesLoading(false))
  }, [])

  const { start, end } = levelBounds(level)
  const progress       = levelProgress(totalXP)
  const xpInLevel      = totalXP - start
  const xpForLevel     = end - start

  return (
    <div className="max-w-6xl mx-auto px-6 pt-8 pb-14 space-y-10">

      {/* ── 1. Welcome banner ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-sahifa-500 via-sahifa-600 to-orange-700 p-6 shadow-glow"
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-64 h-64 rounded-full bg-black/5" />
        <div className="pointer-events-none absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-white/10 to-transparent rounded-bl-[80px]" />

        {/* Content row */}
        <div className="relative flex flex-wrap items-center gap-4">
          {/* Avatar */}
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              className="w-14 h-14 rounded-2xl object-cover border-2 border-white/30 shadow-lg flex-shrink-0"
              alt={user.first_name}
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30 flex-shrink-0">
              <span className="text-2xl font-bold text-white">
                {(user?.first_name || 'S').charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Greeting */}
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-medium">Assalomu alaykum 👋</p>
            <h2 className="text-xl font-bold text-white tracking-tight leading-tight mt-0.5 truncate">
              {user?.first_name || 'Foydalanuvchi'}
            </h2>
          </div>

          {/* Stats */}
          {isInitialized && (
            <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
              <div className="text-center">
                <p className="text-white font-extrabold text-xl leading-none tabular-nums">
                  {totalXP.toLocaleString()}
                </p>
                <p className="text-white/60 text-[11px] mt-1">XP</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div className="text-center">
                <p className="text-white font-extrabold text-xl leading-none">{level}</p>
                <p className="text-white/60 text-[11px] mt-1">Daraja</p>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div className="text-center">
                <p className="text-white font-extrabold text-xl leading-none font-mono">
                  {formatFocusTime(focusSeconds)}
                </p>
                <p className="text-white/60 text-[11px] mt-1">Fokus</p>
              </div>
            </div>
          )}
        </div>

        {/* XP progress bar */}
        {isInitialized && (
          <div className="relative mt-5">
            <div className="flex justify-between text-white/60 text-[11px] mb-1.5">
              <span>Daraja {level} → {level + 1}</span>
              <span>{xpInLevel.toLocaleString()} / {xpForLevel.toLocaleString()} XP</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/80 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress * 100, 100)}%` }}
                transition={{ duration: 1.1, ease: [0.34, 1.56, 0.64, 1] }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* ── 2. Featured Courses ──────────────────────────────────────────── */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="flex items-end justify-between mb-6"
        >
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">Kurslar</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Professional ta'lim dasturlari</p>
          </div>
          <Link
            to="/courses"
            className="flex items-center gap-1 text-sm font-semibold text-sahifa-600 dark:text-sahifa-400 hover:text-sahifa-700 dark:hover:text-sahifa-300 transition-colors"
          >
            Barchasi <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </motion.div>

        {coursesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[24px] bg-gray-100 dark:bg-[#1A1A1A] animate-pulse h-64" />
            ))}
          </div>
        ) : courses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((course, i) => (
              <FeaturedCourseCard key={course.id} course={course} index={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 dark:border-slate-800 py-12 text-center">
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

      {/* ── 3. Quick Actions ─────────────────────────────────────────────── */}
      <section>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-base font-bold text-gray-800 dark:text-white mb-4"
        >
          Tezkor kirish
        </motion.h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((a, i) => {
            const Icon = a.icon
            return (
              <motion.button
                key={a.path}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 + i * 0.07, type: 'spring', stiffness: 300 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(a.path)}
                className="flex flex-col items-center gap-3 p-5 rounded-[24px]
                           bg-white dark:bg-[#1A1A1A]
                           border border-slate-200/60 dark:border-[#2A2A2A]
                           hover:border-sahifa-300 dark:hover:border-sahifa-800
                           shadow-card hover:shadow-card-hover transition-all"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${a.grad} flex items-center justify-center shadow-md`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">{a.label}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{a.sub}</p>
                </div>
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* ── 4. Daily quote ───────────────────────────────────────────────── */}
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
