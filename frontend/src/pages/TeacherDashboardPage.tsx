/**
 * TeacherDashboardPage — teacher-scoped data only.
 *
 * Stats come from GET /api/teacher/analytics which scopes all data
 * to this teacher's courses and enrolled students.
 * Global platform stats (all users, all quizzes) are NOT shown here.
 */
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

// ── Constants ─────────────────────────────────────────────────────────────────
const ADMIN_IDS = [807466591]

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeacherProfile {
  bio:              string
  specialization:   string
  experience_years: number
  total_students:   number
  total_courses:    number
  total_earnings:   number
  commission_rate:  number
  profile_complete: boolean
}

interface MyCourse {
  id:           number
  title:        string
  thumbnail_url: string
  is_published: boolean
  is_paid:      boolean
  price:        number
  level:        string
  total_lessons: number
  enrolled_count: number
  rating:       number
  categories?:  { name: string; icon: string } | null
}

interface TeacherAnalytics {
  courses_count: number
  published_courses: number
  paid_courses: number
  total_students: number
  completed_orders: number
  gross_stars: number
  estimated_revenue_uzs: number
  course_performance?: Array<{
    course_id: number
    title: string
    lesson_count: number
    enrolled_students: number
    completed_lessons: number
    completion_rate: number
  }>
  top_students?: Array<{
    student_id: number
    first_name: string
    username?: string | null
    total_xp: number
    level: number
    completed_lessons: number
  }>
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon:     string
  label:    string
  value:    string | number
  sub?:     string
  color:    string
  loading?: boolean
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color, loading }) => (
  <div className={`rounded-2xl p-4 space-y-1 bg-gradient-to-br ${color}`}>
    <div className="text-2xl">{icon}</div>
    {loading ? (
      <div className="h-8 w-12 rounded-lg bg-black/10 animate-pulse" />
    ) : (
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    )}
    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
    {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
  </div>
)

// ── Quick action button ───────────────────────────────────────────────────────

interface ActionButtonProps {
  icon: string
  label: string
  description: string
  to?: string
  onClick?: () => void
  disabled?: boolean
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon, label, description, to, onClick, disabled,
}) => {
  const baseClass = 'flex items-start gap-4 p-4 rounded-2xl border transition-all'
  const enabledClass = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sahifa-400 dark:hover:border-sahifa-500 hover:shadow-md cursor-pointer'
  const disabledClass = 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
  const innerClass = [baseClass, disabled ? disabledClass : enabledClass].join(' ')

  const inner = (
    <div className={innerClass}>
      <span className="text-3xl shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white text-sm">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{description}</p>
      </div>
      {!disabled && (
        <span className="ml-auto text-sahifa-500 shrink-0 mt-1 text-sm">{'→'}</span>
      )}
    </div>
  )

  if (to && !disabled) return <Link to={to}>{inner}</Link>
  if (onClick && !disabled) return <button onClick={onClick} className="w-full text-left">{inner}</button>
  return <div>{inner}</div>
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TeacherDashboardPage: React.FC = () => {
  const { user } = useAuth()

  const isAdmin = !!(user?.id && ADMIN_IDS.includes(user.id))

  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [myCourses, setMyCourses] = useState<MyCourse[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [analytics, setAnalytics] = useState<TeacherAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  useEffect(() => {
    apiService.getTeacherProfile()
      .then(res => setTeacherProfile(res.data))
      .catch(() => { /* silently ignore — profile may not exist yet */ })
      .finally(() => setProfileLoading(false))
  }, [])

  useEffect(() => {
    apiService.getMyCourses()
      .then(res => setMyCourses(res.data))
      .catch(() => {})
      .finally(() => setCoursesLoading(false))
  }, [])

  useEffect(() => {
    apiService.getTeacherAnalytics()
      .then(res => setAnalytics(res.data))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false))
  }, [])

  // ── Stat cards — teacher-scoped from analytics ───────────────────────────
  const statCards: StatCardProps[] = [
    {
      icon: '👥', label: "Mening talabalarim",
      value: analytics?.total_students ?? 0,
      sub: analyticsLoading ? 'Yuklanmoqda...' : 'kurslarimga yozilganlar',
      color: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30',
      loading: analyticsLoading,
    },
    {
      icon: '📚', label: 'Kurslarim',
      value: `${analytics?.published_courses ?? 0} / ${analytics?.courses_count ?? 0}`,
      sub: analyticsLoading ? 'Yuklanmoqda...' : 'chop etilgan / jami',
      color: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/30',
      loading: analyticsLoading,
    },
    {
      icon: '⭐', label: "To'lovli kurslar",
      value: analytics?.paid_courses ?? 0,
      sub: analyticsLoading ? 'Yuklanmoqda...' : `${analytics?.completed_orders ?? 0} to'lov`,
      color: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/30',
      loading: analyticsLoading,
    },
    {
      icon: '💸', label: 'Taxminiy daromad',
      value: `${((analytics?.estimated_revenue_uzs ?? 0) / 1000).toFixed(0)}K`,
      sub: analyticsLoading ? 'Yuklanmoqda...' : `${analytics?.gross_stars ?? 0} Stars`,
      color: 'from-sahifa-50 to-sahifa-100 dark:from-sahifa-900/20 dark:to-sahifa-900/30',
      loading: analyticsLoading,
    },
  ]

  return (
    <PageWrapper>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-2xl shadow-lg">
            🎓
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              O'qituvchi paneli
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Xush kelibsiz, {user?.first_name}!
            </p>
          </div>
          <span className="ml-auto text-xs font-semibold px-3 py-1 rounded-full bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700 dark:text-sahifa-300 border border-sahifa-200 dark:border-sahifa-800">
            🎓 Teacher
          </span>
        </div>
      </motion.div>

      {/* Teacher own profile banner */}
      {!profileLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="mb-5"
        >
          {!teacherProfile?.profile_complete ? (
            /* Incomplete profile prompt */
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-sahifa-50 dark:bg-sahifa-900/20 border border-sahifa-200 dark:border-sahifa-800">
              <span className="text-2xl shrink-0 mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sahifa-700 dark:text-sahifa-300">
                  Profilingizni to'ldiring
                </p>
                <p className="text-xs text-sahifa-600/80 dark:text-sahifa-400/80 mt-0.5 leading-relaxed">
                  Bio va mutaxassislik qo'shsangiz o'quvchilar sizni tezroq topadi.
                </p>
              </div>
              <Link
                to="/teacher/setup"
                className="shrink-0 px-3 py-1.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                To'ldirish →
              </Link>
            </div>
          ) : (
            /* Completed profile card */
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {(user?.first_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {user?.first_name} · {teacherProfile.specialization || 'O\'qituvchi'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-relaxed">
                  {teacherProfile.bio || ''}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-xs font-bold text-sahifa-600 dark:text-sahifa-400">
                  {teacherProfile.total_students} talaba
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {Math.round(teacherProfile.commission_rate * 100)}% komisyon
                </p>
              </div>
              <Link
                to="/teacher/setup"
                className="shrink-0 ml-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 text-[11px] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                ✏️
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {/* Stats grid — teacher-scoped */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
      >
        {statCards.map(s => <StatCard key={s.label} {...s} />)}
      </motion.div>

      {/* Revenue analytics */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Daromad analitikasi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon="⭐"
            label="Jami Stars"
            value={analytics?.gross_stars?.toLocaleString() ?? 0}
            sub={analyticsLoading ? 'Yuklanmoqda...' : `To'lovlar: ${analytics?.completed_orders ?? 0}`}
            color="from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-900/30"
            loading={analyticsLoading}
          />
          <StatCard
            icon="💸"
            label="Taxminiy daromad"
            value={`${(analytics?.estimated_revenue_uzs ?? 0).toLocaleString()} so'm`}
            sub="1 Star ≈ 250 so'm"
            color="from-emerald-50 to-green-100 dark:from-emerald-900/20 dark:to-green-900/30"
            loading={analyticsLoading}
          />
          <StatCard
            icon="🎯"
            label="Pullik kurslar"
            value={`${analytics?.paid_courses ?? 0} / ${analytics?.courses_count ?? 0}`}
            sub={`Talabalar: ${analytics?.total_students ?? 0}`}
            color="from-violet-50 to-fuchsia-100 dark:from-violet-900/20 dark:to-fuchsia-900/30"
            loading={analyticsLoading}
          />
        </div>
      </motion.div>

      {/* Course performance */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.09 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Kurs bo'yicha performance
        </h2>
        {analyticsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : !(analytics?.course_performance?.length) ? (
          <div className="text-xs text-gray-400 dark:text-gray-500">
            Hali performance ma'lumotlari yo'q
          </div>
        ) : (
          <div className="space-y-2">
            {analytics.course_performance.slice(0, 6).map((row) => (
              <div
                key={row.course_id}
                className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.title}</p>
                  <span className="text-xs font-semibold text-sahifa-600 dark:text-sahifa-400">
                    {row.completion_rate.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  👥 {row.enrolled_students} · 📹 {row.lesson_count} · ✅ {row.completed_lessons}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Top students in courses */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Eng faol talabalar (kurslar)
        </h2>
        {analyticsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : !(analytics?.top_students?.length) ? (
          <div className="text-xs text-gray-400 dark:text-gray-500">Hali ma'lumot yo'q</div>
        ) : (
          <div className="space-y-2">
            {analytics.top_students.slice(0, 5).map((s) => (
              <div
                key={s.student_id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {s.first_name}
                    {s.username ? <span className="text-[11px] text-gray-400 ml-1">@{s.username}</span> : null}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Lv {s.level} · {s.total_xp.toLocaleString()} XP</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ✅ {s.completed_lessons}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Tezkor amallar
        </h2>
        <div className="space-y-2.5">
          <ActionButton
            icon="🏆"
            label="Reyting jadvaliga o'tish"
            description="Barcha o'quvchilarning XP va darajalarini ko'ring"
            to="/leaderboard"
          />
          <ActionButton
            icon="📚"
            label="Kitoblar ro'yxati"
            description="Talabalar qanday kitoblar o'qiyotganini ko'ring"
            to="/kitoblar"
          />
          {isAdmin && (
            <ActionButton
              icon="🛠"
              label="Admin paneli"
              description="Quizlar, kitoblar va tizim sozlamalarini boshqaring"
              to="/admin"
            />
          )}
          <ActionButton
            icon="➕"
            label="Yangi kurs yaratish"
            description="Video darslar, testlar va materiallar bilan kurs tuzing"
            to="/courses/create"
          />
          <ActionButton
            icon="📊"
            label="Analitika"
            description="Daromad va pullik kurs statistikasi yuqorida ko'rsatilgan"
            disabled
          />
        </div>
      </motion.div>

      {/* My courses */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Mening kurslarim</h2>
          <Link
            to="/courses/create"
            className="text-[11px] font-semibold text-sahifa-500 dark:text-sahifa-400 hover:underline"
          >
            + Yangi kurs
          </Link>
        </div>

        {coursesLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : myCourses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <span className="text-3xl">🎬</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali kurs yo'q</p>
            <Link
              to="/courses/create"
              className="text-xs font-semibold text-sahifa-500 hover:text-sahifa-600"
            >
              Birinchi kursni yarating →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {myCourses.map(course => (
              <Link
                key={course.id}
                to={`/courses/${course.id}`}
                className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-sahifa-300 dark:hover:border-sahifa-600 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-sahifa-50 dark:bg-sahifa-900/20 flex items-center justify-center">
                  {course.thumbnail_url ? (
                    <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">{course.categories?.icon ?? '📚'}</span>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{course.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {course.categories?.name} · {course.total_lessons} dars
                    {course.enrolled_count > 0 && ` · 👥 ${course.enrolled_count}`}
                  </p>
                </div>
                {/* Status */}
                <div className="shrink-0 text-right space-y-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    course.is_published
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  }`}>
                    {course.is_published ? '✅ Chop' : '⏳ Qoralama'}
                  </span>
                  {course.is_paid && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{course.price.toLocaleString()} so'm</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>

    </PageWrapper>
  )
}

export default TeacherDashboardPage
