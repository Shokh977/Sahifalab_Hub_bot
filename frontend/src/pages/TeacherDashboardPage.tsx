/**
 * TeacherDashboardPage — skeleton for the teacher role.
 *
 * Phase 1 (this file): UI skeleton with stat cards, quick-action buttons,
 * and a "coming soon" course list. No real data yet — wired in Step 6+.
 */
import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageWrapper from '../components/PageWrapper'
import { useAuth } from '../context/AuthContext'

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub?: string
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color }) => (
  <div className={`rounded-2xl p-4 space-y-1 bg-gradient-to-br ${color}`}>
    <div className="text-2xl">{icon}</div>
    <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
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

// ── Coming-soon course card ───────────────────────────────────────────────────

const CourseCardPlaceholder: React.FC<{ title: string; students: number; status: 'draft' | 'published' | 'coming_soon' }> = ({
  title, students, status,
}) => {
  const statusLabel = { draft: '📝 Qoralama', published: '✅ Nashr', coming_soon: '🔜 Tez kunda' }[status]
  const statusColor = {
    draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    coming_soon: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  }[status]

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
        {title.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">{students} o'quvchi</p>
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TeacherDashboardPage: React.FC = () => {
  const { user } = useAuth()

  const stats: StatCardProps[] = [
    { icon: '👥', label: "Jami o'quvchilar",  value: '—',  sub: 'Tez kunda',  color: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30' },
    { icon: '📖', label: 'Kurslar',            value: '—',  sub: 'Tez kunda',  color: 'from-sahifa-50 to-sahifa-100 dark:from-sahifa-900/20 dark:to-sahifa-900/30' },
    { icon: '⭐', label: "O'rtacha baho",      value: '—',  sub: 'Tez kunda',  color: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/30' },
    { icon: '💰', label: 'Daromad (UZS)',       value: '—',  sub: 'Tez kunda',  color: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/30' },
  ]

  const placeholderCourses = [
    { title: 'Matematik tahlil', students: 0, status: 'coming_soon' as const },
    { title: "Python dasturlash", students: 0, status: 'coming_soon' as const },
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

      {/* Announcement banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6 bg-gradient-to-r from-sahifa-500 to-sahifa-600 rounded-2xl p-4 text-white shadow-lg"
      >
        <p className="font-semibold text-sm">🚀 O'qituvchi paneli ishlab chiqilmoqda</p>
        <p className="text-xs opacity-80 mt-1 leading-relaxed">
          Kurslar yaratish, o'quvchilarni boshqarish va daromad kuzatish imkoniyatlari tez kunda
          ishga tushiriladi. Sizni xabardor qilamiz!
        </p>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
      >
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Tezkor amallar
        </h2>
        <div className="space-y-2.5">
          <ActionButton
            icon="➕"
            label="Yangi kurs yaratish"
            description="Video darslar, testlar va materiallar bilan kurs tuzing"
            disabled
          />
          <ActionButton
            icon="👥"
            label="O'quvchilarni boshqarish"
            description="Ro'yxat, progress va sertifikatlarni kuzating"
            disabled
          />
          <ActionButton
            icon="📊"
            label="Analitika"
            description="Daromad, ko'rishlar va baholash statistikasi"
            disabled
          />
          <ActionButton
            icon="📚"
            label="Kitoblar saytida ko'rish"
            description="Talabalar qanday kitoblar o'qiyotganini ko'ring"
            to="/kitoblar"
          />
        </div>
      </motion.div>

      {/* Course list placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Kurslarim
          </h2>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">Tez kunda</span>
        </div>
        <div className="space-y-2">
          {placeholderCourses.map(c => (
            <CourseCardPlaceholder key={c.title} {...c} />
          ))}
        </div>
      </motion.div>

    </PageWrapper>
  )
}

export default TeacherDashboardPage
