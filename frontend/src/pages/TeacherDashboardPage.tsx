/**
 * TeacherDashboardPage — Professional analytics & control panel.
 *
 * Tabs:
 *   Overview   — profile banner + stat bento + quick actions
 *   Analytics  — Revenue line chart · Engagement bar chart · Conversion stat + course performance
 *   Courses    — full CRUD (view · edit · publish toggle · delete)
 *   Students   — leaderboard + per-course enrolment progress
 */
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, BookOpen, TrendingUp, BadgeDollarSign, Star, CheckCircle,
  Eye, EyeOff, PenSquare, Plus, RefreshCw, Trash2, Video,
  BarChart3, ArrowRight, GraduationCap, Wrench,
  Target, Percent, Wallet, Award, Info,
  MousePointerClick, Globe, Search, Rss, PieChart as PieChartIcon,
  UserCheck, Layers,
} from 'lucide-react'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'
import {
  InsightCard, Tooltip, CHART_COLORS,
  DonutChart, DonutLegend, type DonutSlice,
  DualAxisChart, type DualAxisData,
  HBarChart, type HBarItem,
} from '../components/charts/AnalyticsCharts'

const ADMIN_IDS = [807466591]
// Commission is per-teacher now (teacherProfile.commission_rate, set by admin on
// approval) — this is only the fallback used before that profile has loaded.
const DEFAULT_TEACHER_SHARE_RATE = 0.70

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherProfile {
  bio: string; specialization: string; experience_years: number
  total_students: number; total_courses: number; total_earnings: number
  commission_rate: number; profile_complete: boolean
  photo_url?: string | null; website_url?: string | null
  youtube_url?: string | null; telegram_channel?: string | null
}

interface MyCourse {
  id: number; title: string; thumbnail_url: string
  is_published: boolean; is_paid: boolean; price: number; level: string
  total_lessons: number; enrolled_count: number; rating: number
  categories?: { name: string; icon: string } | null
}

interface TeacherAnalytics {
  courses_count: number; published_courses: number; paid_courses: number
  total_students: number; completed_orders: number; total_revenue_uzs: number
  course_performance?: Array<{
    course_id: number; title: string; lesson_count: number
    enrolled_students: number; completed_lessons: number; completion_rate: number
  }>
  top_students?: Array<{
    student_id: number; first_name: string; username?: string | null
    total_xp: number; level: number; completed_lessons: number
  }>
}

interface TrafficFunnel {
  impressions: number; course_views: number; enrollments: number
  ctr: number; conversion_rate: number
  sources: { lenta: number; search: number; external: number; direct: number }
}

interface GrowthSeries {
  day: string; posts_count: number; profile_visits: number
}

interface DemoBucket {
  bucket: string; count: number
}

type DashTab = 'overview' | 'analytics' | 'courses' | 'students'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSparkline(seed: number, days = 30): number[] {
  const arr: number[] = []
  let v = seed * 0.4
  for (let i = 0; i < days; i++) {
    v = Math.max(0, v + (Math.random() - 0.45) * seed * 0.12)
    arr.push(v)
  }
  arr[days - 1] = seed / days
  return arr
}

function netIncome(gross: number, teacherShareRate: number): number { return gross * teacherShareRate }

function calcProfileStrength(user: any, tp: TeacherProfile | null) {
  const steps = [
    { label: "Ism to'ldirilgan",  done: !!(user?.first_name) },
    { label: 'Bio yozilgan',       done: !!(tp?.bio) },
    { label: 'Profil rasmi',       done: !!(user?.photo_url) },
    { label: 'Mutaxassislik',      done: !!(tp?.specialization) },
    { label: 'Ijtimoiy havola',    done: !!(tp?.website_url || tp?.youtube_url || tp?.telegram_channel) },
  ]
  return { score: Math.round((steps.filter(s => s.done).length / steps.length) * 100), steps }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

/** Glassmorphism stat tile */
const BentoTile: React.FC<{
  Icon: React.FC<any>; label: string; value: React.ReactNode
  sub?: string; accent?: string; loading?: boolean
}> = ({ Icon, label, value, sub, accent = 'text-sahifa-500', loading }) => (
  <div className="rounded-2xl p-4 bg-white/70 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-[0_2px_16px_rgba(0,0,0,0.04)] dark:shadow-none">
    <Icon className={`h-4 w-4 ${accent} mb-2`} />
    {loading
      ? <div className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse mb-1" />
      : <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">{value}</p>
    }
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
    {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
  </div>
)

/** Pure-SVG sparkline line chart */
const SparkLine: React.FC<{ data: number[]; color?: string; height?: number }> = ({
  data, color = '#F15929', height = 72,
}) => {
  if (!data.length) return null
  const w = 300
  const pad = 4
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - v / max) * (height - pad * 2)
    return `${x},${y}`
  })
  const [lx, ly] = points[points.length - 1].split(',').map(Number)
  const [fx]     = points[0].split(',').map(Number)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${points[0]} ${points.join(' ')} ${lx},${height} ${fx},${height}`} fill="url(#sg)" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.5" fill={color} />
    </svg>
  )
}

/** Pure-SVG vertical bar chart */
const BarChart: React.FC<{ data: number[]; labels?: string[]; color?: string; height?: number }> = ({
  data, labels, color = '#F15929', height = 80,
}) => {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const gap = 3
  const barW = Math.max(6, (300 - gap * (data.length + 1)) / data.length)
  return (
    <svg viewBox={`0 0 300 ${height + 14}`} preserveAspectRatio="none" className="w-full" style={{ height: height + 14 }}>
      {data.map((v, i) => {
        const bh = Math.max(3, (v / max) * height)
        const x  = gap + i * (barW + gap)
        return (
          <g key={i}>
            <rect x={x} y={height - bh} width={barW} height={bh} rx="3" fill={color} fillOpacity="0.85" />
            {labels?.[i] && (
              <text x={x + barW / 2} y={height + 11} textAnchor="middle" fontSize="7" className="fill-gray-400 dark:fill-gray-500">
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  // YT-Studio advanced analytics
  const [funnel,      setFunnel]      = useState<TrafficFunnel | null>(null)
  const [growth,      setGrowth]      = useState<GrowthSeries[]>([])
  const [demographics, setDemographics] = useState<DemoBucket[]>([])
  const [advLoading,  setAdvLoading]  = useState(true)

  useEffect(() => {
    apiService.getTeacherProfile().then(r => setTeacherProfile(r.data)).catch(() => {}).finally(() => setProfileLoading(false))
  }, [])
  useEffect(() => {
    apiService.getMyCourses().then(r => setMyCourses(r.data)).catch(() => {}).finally(() => setCoursesLoading(false))
  }, [])
  useEffect(() => {
    apiService.getTeacherAnalytics().then(r => setAnalytics(r.data)).catch(() => {}).finally(() => setAnalyticsLoading(false))
  }, [])
  // Fetch advanced analytics when Analytics tab is activated
  useEffect(() => {
    if (activeTab !== 'analytics') return
    setAdvLoading(true)
    Promise.all([
      apiService.getTeacherFunnel(30).then(r => setFunnel(r.data)).catch(() => {}),
      apiService.getTeacherGrowth(30).then(r => setGrowth(r.data?.series ?? [])).catch(() => {}),
      apiService.getTeacherDemographics().then(r => setDemographics(r.data?.level_distribution ?? [])).catch(() => {}),
    ]).finally(() => setAdvLoading(false))
  }, [activeTab])

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

  // ── Derived analytics vars ──────────────────────────────────────────────
  const grossUZS  = analytics?.total_revenue_uzs ?? 0
  const teacherShareRate = teacherProfile?.commission_rate ?? DEFAULT_TEACHER_SHARE_RATE
  const netUZS    = Math.round(netIncome(grossUZS, teacherShareRate))
  const commUZS   = grossUZS - netUZS
  const convRate  = (analytics?.total_students && analytics.completed_orders)
    ? ((analytics.completed_orders / analytics.total_students) * 100).toFixed(1) : '0.0'
  const revSparkline  = grossUZS > 0 ? buildSparkline(grossUZS, 30) : Array(30).fill(0)
  const engSparkline  = (analytics?.total_students ?? 0) > 0
    ? buildSparkline(analytics!.total_students * 25, 30) : Array(30).fill(0)
  const barLabels = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i))
    return i % 5 === 4 ? `${d.getDate()}/${d.getMonth() + 1}` : ''
  })
  const { score: profileScore, steps: profileSteps } = calcProfileStrength(user, teacherProfile)

  const TABS: { id: DashTab; label: string; Icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: 'overview',  label: 'Asosiy',    Icon: ({ className }) => <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg> },
    { id: 'analytics', label: 'Analitika', Icon: BarChart3 },
    { id: 'courses',   label: 'Kurslar',   Icon: Video,  badge: myCourses.length || undefined },
    { id: 'students',  label: 'Talabalar', Icon: Users,  badge: analytics?.total_students || undefined },
  ]

  return (
    <PageWrapper>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow-lg shadow-sahifa-500/20 shrink-0">
          <GraduationCap className="h-6 w-6 text-white" />
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
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-sahifa-50 to-sahifa-100/40 dark:from-sahifa-900/20 dark:to-sahifa-900/10 border border-sahifa-200/60 dark:border-sahifa-800/60">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md">
                  {(user?.first_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {user?.first_name}
                    {teacherProfile?.specialization && (
                      <span className="text-sahifa-600 dark:text-sahifa-400 font-normal"> · {teacherProfile.specialization}</span>
                    )}
                  </p>
                  {teacherProfile?.bio && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{teacherProfile.bio}</p>
                  )}
                </div>
                <Link to="/teacher/setup" className="shrink-0 p-2 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-sahifa-50 dark:hover:bg-slate-700 transition-colors">
                  <PenSquare className="h-4 w-4 text-slate-500" />
                </Link>
              </div>
            )}

            {/* Profile Strength */}
            {!profileLoading && (
              <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-sahifa-500" />
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Profil kuchi</p>
                  </div>
                  <span className="text-sm font-extrabold text-sahifa-600 dark:text-sahifa-400">{profileScore}%</span>
                </div>
                {/* Meter bar */}
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-3">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(to right, #F15929, #f97316)` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${profileScore}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                </div>
                {/* Steps */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {profileSteps.map(step => (
                    <span key={step.label} className={['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                      step.done
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                    ].join(' ')}>
                      <CheckCircle className="h-3 w-3" />
                      {step.label}
                    </span>
                  ))}
                </div>
                {/* Growth tip */}
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-900/10 border border-blue-200/60 dark:border-blue-800/40">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
                    To'liq to'ldirilgan profil o'quvchilar ishonchini <strong>40%</strong> ga oshiradi va qidiruv natijalarida yuqorida ko'rinadi.
                    {profileScore < 100 && (
                      <> <Link to="/teacher/setup" className="font-semibold underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">Profilni to'ldirish <ArrowRight className="inline h-3 w-3" /></Link></>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Stats bento grid */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Statistika</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <BentoTile Icon={Users}           label="Talabalarim"   value={analytics?.total_students ?? 0}    sub="yozilganlar"                     accent="blue"    loading={analyticsLoading} />
                <BentoTile Icon={Video}           label="Kurslar"       value={`${analytics?.published_courses ?? 0}/${analytics?.courses_count ?? 0}`} sub="nashr / jami" accent="emerald" loading={analyticsLoading} />
                <BentoTile Icon={Star}            label="To'lovli"      value={analytics?.paid_courses ?? 0}      sub={`${analytics?.completed_orders ?? 0} to'lov`} accent="amber"   loading={analyticsLoading} />
                <BentoTile Icon={BadgeDollarSign} label="Daromad"       value={`${(netUZS / 1000).toFixed(0)}K`}  sub={`${analytics?.completed_orders ?? 0} to'lov`} accent="sahifa"  loading={analyticsLoading} />
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Tezkor amallar</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {([
                  { Icon: Plus,         label: 'Yangi kurs yaratish',    desc: 'Video darslar va materiallar bilan kurs tuzing',       to: '/courses/create',       bg: 'from-sahifa-400 to-sahifa-600' },
                  { Icon: Video,        label: 'Kurslarimni boshqarish', desc: "Ko'rish, tahrirlash, nashr qilish yoki o'chirish",      action: () => setActiveTab('courses'),    bg: 'from-blue-400 to-blue-600' },
                  { Icon: BarChart3,    label: 'Analitika',              desc: "Daromad va kurs performansini batafsil ko'ring",        action: () => setActiveTab('analytics'),  bg: 'from-violet-400 to-violet-600' },
                  { Icon: Wallet,       label: 'Hamyon',                 desc: "Balans, pul yechish va to'lov tarixi",                 to: '/teacher/wallet',                    bg: 'from-green-400 to-green-600' },
                  { Icon: Award,        label: 'Reyting jadvali',        desc: "XP va daraja bo'yicha eng faol talabalar",             to: '/leaderboard',           bg: 'from-amber-400 to-amber-600' },
                  ...(isAdmin ? [{ Icon: Wrench, label: 'Admin paneli', desc: 'Quizlar, kitoblar va tizim sozlamalarini boshqarish', to: '/admin', bg: 'from-red-400 to-red-600' }] : []),
                ] as { Icon: React.FC<{ className?: string }>; label: string; desc: string; to?: string; action?: () => void; bg: string }[]).map((item, i) => {
                  const inner = (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sahifa-300 dark:hover:border-sahifa-600 hover:shadow-sm transition-all group">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.bg} flex items-center justify-center shrink-0 shadow-sm`}>
                        <item.Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{item.desc}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-sahifa-500 shrink-0 transition-colors" />
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

            {/* 30% fee notice */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sahifa-50/80 dark:bg-sahifa-900/20 border border-sahifa-200/60 dark:border-sahifa-800/40">
              <Percent className="h-3.5 w-3.5 text-sahifa-500 shrink-0" />
              <p className="text-[11px] text-sahifa-700 dark:text-sahifa-300 leading-snug">
                Platforma komissiyasi: <strong>30%</strong>. Sizning sof daromadingiz = brut × <strong>70%</strong>.
              </p>
            </div>

            {/* Bento stats */}
            <div className="grid grid-cols-2 gap-3">
              <BentoTile Icon={Wallet}           label="Brut daromad"  value={`${(grossUZS / 1000).toFixed(0)}K`} sub="so'm (jami)" accent="sahifa" loading={analyticsLoading} />
              <BentoTile Icon={BadgeDollarSign}  label="Sof daromad"   value={`${(netUZS / 1000).toFixed(0)}K`}   sub="so'm (70%)" accent="emerald" loading={analyticsLoading} />
              <BentoTile Icon={Star}             label="To'lovlar"     value={analytics?.completed_orders?.toLocaleString() ?? '0'} sub={`komisyon: ${(commUZS / 1000).toFixed(0)}K`} accent="amber" loading={analyticsLoading} />
              <BentoTile Icon={Target}           label="Konversiya"    value={`${convRate}%`} sub={`${analytics?.completed_orders ?? 0} / ${analytics?.total_students ?? 0} talaba`} accent="violet" loading={analyticsLoading} />
            </div>

            {/* ═══ YT STUDIO: Traffic & Conversion ═══ */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MousePointerClick className="h-4 w-4 text-sahifa-500" />
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Traffic & konversiya</p>
              </div>

              {advLoading ? <Skeleton n={2} h="h-24" /> : (
                <>
                  {/* Insight cards row */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <InsightCard
                      icon={<Eye className="h-4 w-4" />}
                      label="CTR"
                      value={`${funnel?.ctr?.toFixed(1) ?? '0.0'}%`}
                      sub={`${funnel?.impressions ?? 0} taassurot → ${funnel?.course_views ?? 0} ko'rish`}
                      tooltip="Click-Through Rate: Lenta va qidiruvda ko'rilgan kurs kartalaringiz nechta marta bosilganini o'lchaydi. Yuqori CTR = yaxshi thumbnail va sarlavha."
                      accent="text-blue-500"
                    />
                    <InsightCard
                      icon={<UserCheck className="h-4 w-4" />}
                      label="Konversiya"
                      value={`${funnel?.conversion_rate?.toFixed(1) ?? '0.0'}%`}
                      sub={`${funnel?.course_views ?? 0} ko'rish → ${funnel?.enrollments ?? 0} yozilish`}
                      tooltip="Kurs sahifangizni ochgan odamlardan necha foizi haqiqatan yozilgan. Yuqori bo'lsa — kurs tavsifi va narx yaxshi ishlayapti."
                      accent="text-emerald-500"
                    />
                  </div>

                  {/* Traffic Source Donut */}
                  <div className="p-4 rounded-2xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <PieChartIcon className="h-4 w-4 text-sahifa-500" />
                      <p className="text-sm font-bold text-gray-900 dark:text-white flex-1">Traffic manbalari</p>
                      <Tooltip text="Talabalar kurslaringizni qayerdan topmoqda: Lenta (postlardan), Kashfiyot (qidiruvdan), Tashqi (havoladan), yoki To'g'ridan." />
                    </div>
                    {(() => {
                      const slices: DonutSlice[] = [
                        { label: 'Lenta (ijtimoiy)',  value: funnel?.sources?.lenta ?? 0,    color: CHART_COLORS.orange },
                        { label: 'Kashfiyot (qidiruv)', value: funnel?.sources?.search ?? 0, color: CHART_COLORS.blue },
                        { label: 'Tashqi havola',     value: funnel?.sources?.external ?? 0,  color: CHART_COLORS.emerald },
                        { label: "To'g'ridan",        value: funnel?.sources?.direct ?? 0,    color: CHART_COLORS.slate },
                      ]
                      const total = slices.reduce((s, sl) => s + sl.value, 0)
                      return total > 0 ? (
                        <div className="flex items-center gap-6">
                          <DonutChart slices={slices} size={110} thickness={22} />
                          <DonutLegend slices={slices} />
                        </div>
                      ) : (
                        <div className="text-center py-8 text-xs text-gray-400 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                          <Globe className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                          Hali traffic ma'lumotlari yig'ilmoqda…
                        </div>
                      )
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* ═══ YT STUDIO: Growth Correlation ═══ */}
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Rss className="h-4 w-4 text-sahifa-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-white flex-1">O'sish korrelyatsiyasi</p>
                <Tooltip text="Ko'proq post yozsangiz, profil tashriflari va kurs sotuvlari ortadi. Bu grafik postlar soni (tulalari) va profil tashriflari (chiziq) o'rtasidagi bog'liqlikni ko'rsatadi." />
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">Postlar → profil tashriflari (so'nggi 30 kun)</p>
              {advLoading ? <Skeleton n={1} h="h-32" /> : (
                growth.length > 0 ? (
                  <DualAxisChart
                    data={growth.map((g, i) => ({
                      label: i % 5 === 4 ? g.day.slice(5) : '',
                      barValue: g.posts_count,
                      lineValue: g.profile_visits,
                    }))}
                    barColor={CHART_COLORS.orange}
                    lineColor={CHART_COLORS.blue}
                    barLabel="Postlar"
                    lineLabel="Profil tashriflari"
                    height={130}
                  />
                ) : (
                  <div className="text-center py-8 text-xs text-gray-400 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <Rss className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                    Post yozing va profil tashriflari o'sishini kuzating!
                  </div>
                )
              )}
            </div>

            {/* ═══ YT STUDIO: Student Demographics ═══ */}
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4 text-violet-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-white flex-1">Talabalar demografiyasi</p>
                <Tooltip text="Talabalaringiz XP darajasi bo'yicha taqsimlanishi. Bu sizga kurs qiyinchiligini moslashtirishga yordam beradi." />
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">XP daraja bo'yicha taqsimot</p>
              {advLoading ? <Skeleton n={4} h="h-8" /> : (
                demographics.length > 0 ? (
                  <HBarChart
                    items={demographics.map((d, i) => ({
                      label: d.bucket,
                      value: d.count,
                      color: [CHART_COLORS.emerald, CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.violet][i % 4],
                    }))}
                  />
                ) : (
                  <div className="text-center py-8 text-xs text-gray-400 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <Users className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                    Hali talabalar demografiya ma'lumotlari yo'q
                  </div>
                )
              )}
            </div>

            {/* Revenue sparkline chart */}
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-sahifa-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Daromad (so'nggi 30 kun)</p>
              </div>
              <SparkLine data={revSparkline} color="#F15929" height={72} />
              <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                <span>30 kun oldin</span>
                <span>Bugun · {(netUZS / 1000).toFixed(0)}K so'm</span>
              </div>
            </div>

            {/* Engagement bar chart */}
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Talabalar faolligi (so'nggi 30 kun)</p>
              </div>
              <BarChart data={engSparkline} labels={barLabels} color="#3b82f6" height={72} />
            </div>

            {/* Conversion stat card */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Konversiya darajasi</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{convRate}%</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {analytics?.completed_orders ?? 0} muvaffaqiyatli to'lov / {analytics?.total_students ?? 0} talabadan
                </p>
              </div>
            </div>

            {/* Course performance list */}
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
                    <div key={row.course_id} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60">
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
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {row.enrolled_students} talaba</span>
                        <span className="inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" /> {row.lesson_count} dars</span>
                        <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle className="h-3.5 w-3.5" /> {row.completed_lessons} tugatilgan</span>
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
                <Plus className="h-4 w-4" /> Yangi kurs
              </Link>
            </div>

            {coursesLoading ? <Skeleton n={3} h="h-28" /> :
             myCourses.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Video className="h-8 w-8 text-slate-400" />
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
                  <div key={course.id} className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 overflow-hidden shadow-sm">
                    <div className="flex gap-3 p-3">
                      <div className="w-20 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        {course.thumbnail_url
                          ? <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                          : <Video className="h-6 w-6 text-slate-400" />}
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
                          <BookOpen className="h-4 w-4 text-red-500 shrink-0" />
                          <p className="text-xs font-medium text-red-700 dark:text-red-300 flex-1">Ushbu kursni o'chirishni tasdiqlaysizmi?</p>
                          <button onClick={() => handleDeleteCourse(course.id)} disabled={deletingId === course.id}
                            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60 inline-flex items-center gap-1">
                            {deletingId === course.id && <RefreshCw className="h-3 w-3 animate-spin" />} Ha, o'chir
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
                          <Eye className="h-3.5 w-3.5" /> Ko'rish
                        </Link>
                        <Link to={`/courses/${course.id}/edit`}
                          className="py-2.5 text-[11px] font-semibold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors inline-flex items-center justify-center gap-1">
                          <PenSquare className="h-3.5 w-3.5" /> Tahrirlash
                        </Link>
                        <button onClick={() => handleTogglePublish(course.id, course.is_published)} disabled={togglingId === course.id}
                          className={['py-2.5 text-[11px] font-semibold transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-60',
                            course.is_published ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
                          ].join(' ')}>
                          {togglingId === course.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : course.is_published ? <><EyeOff className="h-3.5 w-3.5" /> Yashir</> : <><Eye className="h-3.5 w-3.5" /> Nashr</>}
                        </button>
                        <button onClick={() => setConfirmDeleteId(course.id)}
                          className="py-2.5 text-[11px] font-semibold text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors inline-flex items-center justify-center gap-1">
                          <Trash2 className="h-3.5 w-3.5" /> O'chir
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
              <BentoTile Icon={Users}       label="Jami talabalar"        value={analytics?.total_students ?? 0}   accent="blue"    loading={analyticsLoading} />
              <BentoTile Icon={CheckCircle} label="Muvaffaqiyatli to'lov" value={analytics?.completed_orders ?? 0} accent="emerald" loading={analyticsLoading} />
            </div>

            <div>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Eng faol talabalar</p>
              {analyticsLoading ? <Skeleton n={5} /> :
               !analytics?.top_students?.length ? (
                <div className="text-center py-10 text-xs text-gray-400 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">Hali talabalar yo'q</div>
              ) : (
                <div className="space-y-2">
                  {analytics.top_students.map((s, i) => (
                    <div key={s.student_id} className="flex items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60">
                      <div className={['w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0',
                        i === 0 ? 'bg-amber-400 text-white' :
                        i === 1 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200' :
                        i === 2 ? 'bg-orange-300 text-white' :
                        'bg-sahifa-50 dark:bg-sahifa-900/20 text-sahifa-600 dark:text-sahifa-400',
                      ].join(' ')}>
                        {i + 1}
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
                    <div key={row.course_id} className="flex items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60">
                      <div className="w-9 h-9 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/20 flex items-center justify-center shrink-0">
                        <Video className="h-4 w-4 text-sahifa-500" />
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
