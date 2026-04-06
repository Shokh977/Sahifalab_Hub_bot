/**
 * TeacherDashboardPage — tabbed teacher control panel.
 *
 * Tabs:
 *   Overview   — profile card + stat summary + quick actions
 *   Analytics  — revenue breakdown + per-course completion bars
 *   Courses    — full CRUD (view · edit · publish toggle · delete)
 *   Students   — top students leaderboard + per-course enrolment
 */
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AcademicCapIcon, ArrowPathIcon, ArrowRightIcon, BanknotesIcon,
  ChartBarIcon, CheckCircleIcon, ExclamationTriangleIcon,
  EyeIcon, EyeSlashIcon, PencilSquareIcon, PlusIcon, SparklesIcon,
  StarIcon, TrashIcon, TrophyIcon, UsersIcon, VideoCameraIcon, WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

const ADMIN_IDS = [807466591]

interface TeacherProfile {
  bio: string; specialization: string; experience_years: number
  total_students: number; total_courses: number; total_earnings: number
  commission_rate: number; profile_complete: boolean
}

interface MyCourse {
  id: number; title: string; thumbnail_url: string
  is_published: boolean; is_paid: boolean; price: number; level: string
  total_lessons: number; enrolled_count: number; rating: number
  categories?: { name: string; icon: string } | null
}

interface TeacherAnalytics {
  courses_count: number; published_courses: number; paid_courses: number
  total_students: number; completed_orders: number; gross_stars: number
  estimated_revenue_uzs: number
  course_performance?: Array<{
    course_id: number; title: string; lesson_count: number
    enrolled_students: number; completed_lessons: number; completion_rate: number
  }>
  top_students?: Array<{
    student_id: number; first_name: string; username?: string | null
    total_xp: number; level: number; completed_lessons: number
  }>
}

type DashTab = 'overview' | 'analytics' | 'courses' | 'students'

const TabPane: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
    className="space-y-6"
  >{children}</motion.div>
)

const Skeleton: React.FC<{ n?: number; h?: string }> = ({ n = 3, h = 'h-16' }) => (
  <div className="space-y-2">
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className={`${h} rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse`} />
    ))}
  </div>
)

const StatTile: React.FC<{
  Icon: React.FC<any>; label: string; value: React.ReactNode
  sub?: string; gradient: string; loading?: boolean
}> = ({ Icon, label, value, sub, gradient, loading }) => (
  <div className={`rounded-2xl p-4 bg-gradient-to-br ${gradient}`}>
    <Icon className="h-5 w-5 text-sahifa-600 dark:text-sahifa-300 mb-2" />
    {loading
      ? <div className="h-7 w-14 rounded-lg bg-black/10 animate-pulse mb-1" />
      : <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">{value}</p>
    }
    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</p>
    {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
  </div>
)

const TeacherDashboardPage: React.FC = () => {
  const { user } = useAuth()
  const isAdmin = !!(user?.id && ADMIN_IDS.includes(user.id))
  const [activeTab, setActiveTab] = useState<DashTab>('overview')

  const [teacherProfile,   setTeacherProfile]   = useState<TeacherProfile | null>(null)
  const [profileLoading,   setProfileLoading]   = useState(true)
  const [myCourses,        setMyCourses]        = useState<MyCourse[]>([])
  const [coursesLoading,   setCoursesLoading]   = useState(true)
  const [analytics,        setAnalytics]        = useState<TeacherAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [togglingId,       setTogglingId]       = useState<number | null>(null)
  const [deletingId,       setDeletingId]       = useState<number | null>(null)
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<number | null>(null)

  useEffect(() => {
    apiService.getTeacherProfile().then(r => setTeacherProfile(r.data)).catch(() => {}).finally(() => setProfileLoading(false))
  }, [])
  useEffect(() => {
    apiService.getMyCourses().then(r => setMyCourses(r.data)).catch(() => {}).finally(() => setCoursesLoading(false))
  }, [])
  useEffect(() => {
    apiService.getTeacherAnalytics().then(r => setAnalytics(r.data)).catch(() => {}).finally(() => setAnalyticsLoading(false))
  }, [])

  const handleTogglePublish = async (courseId: number, current: boolean) => {
    setTogglingId(courseId)
    try {
      await apiService.updateCourse(courseId, { is_published: !current })
      setMyCourses(prev => prev.map(c => c.id === courseId ? { ...c, is_published: !current } : c))
    } catch { /* interceptor shows toast */ }
    setTogglingId(null)
  }

  const handleDeleteCourse = async (courseId: number) => {
    setDeletingId(courseId)
    try {
      await apiService.deleteCourse(courseId)
      setMyCourses(prev => prev.filter(c => c.id !== courseId))
      setConfirmDeleteId(null)
    } catch { /* interceptor shows toast */ }
    setDeletingId(null)
  }

  const TABS: { id: DashTab; label: string; Icon: React.FC<any>; badge?: number }[] = [
    { id: 'overview',  label: 'Asosiy',    Icon: ({ className }: any) => <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg> },
    { id: 'analytics', label: 'Analitika', Icon: ChartBarIcon },
    { id: 'courses',   label: 'Kurslar',   Icon: VideoCameraIcon, badge: myCourses.length || undefined },
    { id: 'students',  label: 'Talabalar', Icon: UsersIcon,       badge: analytics?.total_students || undefined },
  ]

  return (
    <PageWrapper>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow-lg shadow-sahifa-500/20 shrink-0">
          <AcademicCapIcon className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">O'qituvchi paneli</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Xush kelibsiz, {user?.first_name}!</p>
        </div>
        <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700 dark:text-sahifa-300 border border-sahifa-200 dark:border-sahifa-800">
          {isAdmin ? 'Admin' : 'Teacher'}
        </span>
      </motion.div>

      {/* Tab bar */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={['relative flex items-center justify-center gap-1.5 flex-1 px-2 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
              activeTab === t.id
                ? 'bg-white dark:bg-slate-700 text-sahifa-600 dark:text-sahifa-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-gray-200',
            ].join(' ')}>
            <t.Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge > 0 && (
              <span className={['inline-flex items-center justify-center min-w-[16px] h-4 rounded-full px-1 text-[9px] font-bold',
                activeTab === t.id ? 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700' : 'bg-slate-200 dark:bg-slate-600 text-slate-500',
              ].join(' ')}>
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">

        {/* ─── OVERVIEW ───────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <TabPane key="overview">
            {/* Profile banner */}
            {!profileLoading && (
              teacherProfile?.profile_complete ? (
                <>
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-sahifa-50 to-sahifa-100/40 dark:from-sahifa-900/20 dark:to-sahifa-900/10 border border-sahifa-200/60 dark:border-sahifa-800/60">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md">
                    {(user?.first_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {user?.first_name}
                      {teacherProfile.specialization && <span className="text-sahifa-600 dark:text-sahifa-400 font-normal"> · {teacherProfile.specialization}</span>}
                    </p>
                    {teacherProfile.bio && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{teacherProfile.bio}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-sahifa-600 dark:text-sahifa-400">{teacherProfile.total_students} talaba</p>
                    <p className="text-[10px] text-gray-400">{Math.round(teacherProfile.commission_rate * 100)}% komisyon</p>
                  </div>
                  <Link to="/teacher/setup" className="shrink-0 p-2 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-sahifa-50 dark:hover:bg-slate-700 transition-colors">
                    <PencilSquareIcon className="h-4 w-4 text-slate-500" />
                  </Link>
                </div>
                {/* Kabinet redirect note */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-900/10 border border-blue-200/60 dark:border-blue-800/40 mt-2">
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug flex-1">
                    Umumiy bio va "Haqida" ma'lumotlarini <Link to="/cabinet" className="font-semibold underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">Kabinet</Link> sahifasida tahrirlang.
                  </p>
                </div>
                </>
              ) : (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/60">
                  <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Profilingizni to'ldiring</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">Bio va mutaxassislik qo'shsangiz, talabalar sizni tezroq topadi.</p>
                  </div>
                  <Link to="/teacher/setup" className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1">
                    To'ldirish <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                </div>
              )
            )}

            {/* Stats */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Statistika</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile Icon={UsersIcon}        label="Talabalarim"   value={analytics?.total_students ?? 0}    sub="yozilganlar"                     gradient="from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"     loading={analyticsLoading} />
                <StatTile Icon={VideoCameraIcon}  label="Kurslar"       value={`${analytics?.published_courses ?? 0}/${analytics?.courses_count ?? 0}`} sub="chop / jami" gradient="from-emerald-50 to-green-100 dark:from-emerald-900/20 dark:to-green-800/20" loading={analyticsLoading} />
                <StatTile Icon={StarIcon}         label="To'lovli"      value={analytics?.paid_courses ?? 0}      sub={`${analytics?.completed_orders ?? 0} to'lov`} gradient="from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-800/20" loading={analyticsLoading} />
                <StatTile Icon={BanknotesIcon}    label="Daromad"       value={`${((analytics?.estimated_revenue_uzs ?? 0)/1000).toFixed(0)}K`} sub={`${analytics?.gross_stars ?? 0} Stars`} gradient="from-sahifa-50 to-sahifa-100 dark:from-sahifa-900/20 dark:to-sahifa-800/20" loading={analyticsLoading} />
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Tezkor amallar</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {([
                  { Icon: PlusIcon,            label: 'Yangi kurs yaratish',         desc: 'Video darslar va materiallar bilan kurs tuzing',                to: '/courses/create', bg: 'from-sahifa-400 to-sahifa-600' },
                  { Icon: VideoCameraIcon,      label: 'Kurslarimni boshqarish',      desc: "Ko'rish, tahrirlash, nashr qilish yoki o'chirish",               action: () => setActiveTab('courses'), bg: 'from-blue-400 to-blue-600' },
                  { Icon: ChartBarIcon,         label: 'Analitika',                   desc: 'Daromad va kurs performansini batafsil ko\'ring',                action: () => setActiveTab('analytics'), bg: 'from-violet-400 to-violet-600' },
                  { Icon: TrophyIcon,           label: 'Reyting jadvali',             desc: "XP va daraja bo'yicha eng faol talabalar",                     to: '/leaderboard', bg: 'from-amber-400 to-amber-600' },
                  ...(isAdmin ? [{ Icon: WrenchScrewdriverIcon, label: 'Admin paneli', desc: 'Quizlar, kitoblar va tizim sozlamalarini boshqarish', to: '/admin', bg: 'from-red-400 to-red-600' }] : []),
                ] as any[]).map((item, i) => {
                  const inner = (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sahifa-300 dark:hover:border-sahifa-600 hover:shadow-sm transition-all group">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.bg} flex items-center justify-center shrink-0 shadow-sm`}>
                        <item.Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{item.desc}</p>
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-sahifa-500 shrink-0 transition-colors" />
                    </div>
                  )
                  return item.to
                    ? <Link key={i} to={item.to}>{inner}</Link>
                    : <button key={i} onClick={item.action} className="w-full text-left">{inner}</button>
                })}
              </div>
            </div>
          </TabPane>
        )}

        {/* ─── ANALYTICS ──────────────────────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <TabPane key="analytics">
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Daromad</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatTile Icon={StarIcon}         label="Jami Stars"       value={analytics?.gross_stars?.toLocaleString() ?? '0'} sub={`${analytics?.completed_orders ?? 0} muvaffaqiyatli to'lov`} gradient="from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-800/20" loading={analyticsLoading} />
                <StatTile Icon={BanknotesIcon}    label="Taxminiy daromad" value={`${(analytics?.estimated_revenue_uzs ?? 0).toLocaleString()} so'm`} sub="1 Star ≈ 250 so'm" gradient="from-emerald-50 to-green-100 dark:from-emerald-900/20 dark:to-green-800/20" loading={analyticsLoading} />
                <StatTile Icon={SparklesIcon}     label="Pullik / Jami"    value={`${analytics?.paid_courses ?? 0}/${analytics?.courses_count ?? 0}`} sub={`${analytics?.total_students ?? 0} jami talaba`} gradient="from-violet-50 to-fuchsia-100 dark:from-violet-900/20 dark:to-fuchsia-800/20" loading={analyticsLoading} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Kurs performansi</p>
              {analyticsLoading ? <Skeleton n={3} h="h-24" /> :
               !analytics?.course_performance?.length ? (
                <div className="text-center py-10 text-xs text-gray-400 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                  Hali kurs performance ma'lumotlari yo'q
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.course_performance.map(row => (
                    <div key={row.course_id} className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{row.title}</p>
                        <span className={['shrink-0 text-xs font-bold px-2 py-0.5 rounded-full',
                          row.completion_rate >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                          row.completion_rate >= 35 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                        ].join(' ')}>{row.completion_rate.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 mb-3 overflow-hidden">
                        <motion.div
                          className={row.completion_rate >= 70 ? 'h-full rounded-full bg-emerald-500' : row.completion_rate >= 35 ? 'h-full rounded-full bg-amber-500' : 'h-full rounded-full bg-sahifa-500'}
                          initial={{ width: 0 }} animate={{ width: `${Math.min(row.completion_rate, 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" /> {row.enrolled_students} talaba</span>
                        <span className="inline-flex items-center gap-1"><VideoCameraIcon className="h-3.5 w-3.5" /> {row.lesson_count} dars</span>
                        <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircleIcon className="h-3.5 w-3.5" /> {row.completed_lessons} tugatilgan</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabPane>
        )}

        {/* ─── COURSES ────────────────────────────────────────────────────── */}
        {activeTab === 'courses' && (
          <TabPane key="courses">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Kurslarim</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {myCourses.length} ta kurs · {myCourses.filter(c => c.is_published).length} ta nashr qilingan
                </p>
              </div>
              <Link to="/courses/create" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 active:scale-95 text-white text-xs font-bold transition-all shadow shadow-sahifa-500/20">
                <PlusIcon className="h-4 w-4" /> Yangi kurs
              </Link>
            </div>

            {coursesLoading ? <Skeleton n={3} h="h-28" /> :
             myCourses.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <VideoCameraIcon className="h-8 w-8 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Hali kurs yo'q</p>
                  <p className="text-xs text-gray-400 mt-1">Birinchi kursni yaratib talabalaringizga yetkazing</p>
                </div>
                <Link to="/courses/create" className="px-6 py-2.5 rounded-xl bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-bold transition-colors">Kurs yaratish</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myCourses.map(course => (
                  <div key={course.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="w-20 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        {course.thumbnail_url
                          ? <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                          : <VideoCameraIcon className="h-6 w-6 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug flex-1">{course.title}</p>
                          <span className={['shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
                            course.is_published ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                          ].join(' ')}>
                            {course.is_published ? '● Nashr' : '○ Qoralama'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-2">
                          {course.categories?.name && <span>{course.categories.name}</span>}
                          <span>{course.total_lessons} dars</span>
                          {course.enrolled_count > 0 && <span>{course.enrolled_count} talaba</span>}
                          {course.rating > 0 && <span>★ {course.rating.toFixed(1)}</span>}
                        </p>
                        {course.is_paid && <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">{course.price.toLocaleString()} so'm</p>}
                      </div>
                    </div>

                    {confirmDeleteId === course.id ? (
                      <div className="px-3 pb-3">
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <ExclamationTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                          <p className="text-xs font-medium text-red-700 dark:text-red-300 flex-1">Ushbu kursni o'chirishni tasdiqlaysizmi?</p>
                          <button onClick={() => handleDeleteCourse(course.id)} disabled={deletingId === course.id}
                            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60 inline-flex items-center gap-1">
                            {deletingId === course.id && <ArrowPathIcon className="h-3 w-3 animate-spin" />} Ha, o'chir
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            Bekor
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-700 border-t border-slate-100 dark:border-slate-700">
                        <Link to={`/courses/${course.id}`}
                          className="py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors inline-flex items-center justify-center gap-1">
                          <EyeIcon className="h-3.5 w-3.5" /> Ko'rish
                        </Link>
                        <Link to={`/courses/${course.id}/edit`}
                          className="py-2.5 text-[11px] font-semibold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors inline-flex items-center justify-center gap-1">
                          <PencilSquareIcon className="h-3.5 w-3.5" /> Tahrirlash
                        </Link>
                        <button onClick={() => handleTogglePublish(course.id, course.is_published)} disabled={togglingId === course.id}
                          className={['py-2.5 text-[11px] font-semibold transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-60',
                            course.is_published ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
                          ].join(' ')}>
                          {togglingId === course.id ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                            : course.is_published ? <><EyeSlashIcon className="h-3.5 w-3.5" /> Yashir</> : <><EyeIcon className="h-3.5 w-3.5" /> Nashr</>}
                        </button>
                        <button onClick={() => setConfirmDeleteId(course.id)}
                          className="py-2.5 text-[11px] font-semibold text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors inline-flex items-center justify-center gap-1">
                          <TrashIcon className="h-3.5 w-3.5" /> O'chir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabPane>
        )}

        {/* ─── STUDENTS ───────────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <TabPane key="students">
            <div className="grid grid-cols-2 gap-3">
              <StatTile Icon={UsersIcon}       label="Jami talabalar"        value={analytics?.total_students ?? 0}  gradient="from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"     loading={analyticsLoading} />
              <StatTile Icon={CheckCircleIcon} label="Muvaffaqiyatli to'lov" value={analytics?.completed_orders ?? 0} gradient="from-emerald-50 to-green-100 dark:from-emerald-900/20 dark:to-green-800/20" loading={analyticsLoading} />
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Eng faol talabalar</p>
              {analyticsLoading ? <Skeleton n={5} /> :
               !analytics?.top_students?.length ? (
                <div className="text-center py-10 text-xs text-gray-400 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">Hali talabalar yo'q</div>
              ) : (
                <div className="space-y-2">
                  {analytics.top_students.map((s, i) => (
                    <div key={s.student_id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className={['w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0',
                        i === 0 ? 'bg-amber-100 dark:bg-amber-900/30' : i === 1 ? 'bg-slate-100 dark:bg-slate-700' : i === 2 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-sahifa-50 dark:bg-sahifa-900/20 text-xs font-bold text-sahifa-600',
                      ].join(' ')}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {s.first_name}
                          {s.username && <span className="text-[11px] text-gray-400 ml-1.5">@{s.username}</span>}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Lv {s.level} · {s.total_xp.toLocaleString()} XP</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{s.completed_lessons}</p>
                        <p className="text-[10px] text-gray-400">dars</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analytics?.course_performance && analytics.course_performance.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Kurs bo'yicha yozilishlar</p>
                <div className="space-y-2">
                  {analytics.course_performance.map(row => (
                    <div key={row.course_id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="w-9 h-9 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/20 flex items-center justify-center shrink-0">
                        <VideoCameraIcon className="h-4 w-4 text-sahifa-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{row.title}</p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <motion.div className="h-full rounded-full bg-sahifa-500" initial={{ width: 0 }} animate={{ width: `${Math.min(row.completion_rate, 100)}%` }} transition={{ duration: 0.7 }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{row.enrolled_students}</p>
                        <p className="text-[10px] text-gray-400">{row.completion_rate.toFixed(0)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabPane>
        )}

      </AnimatePresence>
    </PageWrapper>
  )
}

export default TeacherDashboardPage
