/**
 * TeachersGalleryPage — premium grid of all active SAHIFALAB instructors.
 *
 * Route: /teachers  (no auth required)
 * Data: GET /api/profiles/teachers
 *       Returns every active teacher with aggregated course + student + rating stats.
 */
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AcademicCapIcon,
  CheckBadgeIcon,
  MagnifyingGlassIcon,
  StarIcon,
  UsersIcon,
} from '@heroicons/react/24/solid'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Teacher {
  telegram_id:      number
  first_name:       string
  username:         string | null
  photo_url:        string | null
  specialization:   string
  experience_years: number | null
  bio:              string
  course_count:     number
  total_students:   number
  avg_rating:       number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const NICHE_COLOURS: Record<string, string> = {
  default: 'bg-[#F15929]/10 text-[#F15929] border-[#F15929]/20',
  green:   'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800',
  violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
}

const NICHE_CYCLE = [NICHE_COLOURS.default, NICHE_COLOURS.green, NICHE_COLOURS.sky, NICHE_COLOURS.violet]

/** Render up to 5 star icons filled/half/empty */
function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon
          key={i}
          className={`w-3.5 h-3.5 ${i <= Math.round(value) ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
        />
      ))}
      {value > 0 && (
        <span className="ml-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {value.toFixed(1)}
        </span>
      )}
    </div>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
const SkeletonCard: React.FC = () => (
  <div className="bg-white dark:bg-[#1e1e2a] rounded-[24px] border border-slate-100 dark:border-[#2A2A36] overflow-hidden animate-pulse">
    {/* Header strip */}
    <div className="h-24 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#252532] dark:to-[#2A2A3A]" />
    {/* Avatar */}
    <div className="-mt-10 flex justify-center">
      <div className="w-20 h-20 rounded-[24px] bg-slate-200 dark:bg-slate-700 border-4 border-white dark:border-[#1e1e2a]" />
    </div>
    {/* Content */}
    <div className="px-5 pb-5 pt-3 space-y-3">
      <div className="flex justify-center flex-col items-center gap-1.5">
        <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded-full" />
        <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded-full" />
      </div>
      <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full" />
      <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800 rounded-full" />
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        ))}
      </div>
      <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
    </div>
  </div>
)

// ── Instructor card ───────────────────────────────────────────────────────────
interface InstructorCardProps { teacher: Teacher; index: number }

const InstructorCard: React.FC<InstructorCardProps> = ({ teacher, index }) => {
  const nicheColour = NICHE_CYCLE[index % NICHE_CYCLE.length]
  const initials = teacher.first_name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const HEADER_GRADIENTS = [
    'from-[#F15929] via-orange-500 to-amber-400',
    'from-emerald-600 via-teal-500 to-cyan-400',
    'from-violet-600 via-purple-500 to-indigo-400',
    'from-sky-600 via-blue-500 to-cyan-400',
    'from-rose-600 via-pink-500 to-fuchsia-400',
    'from-amber-600 via-orange-400 to-yellow-300',
  ]
  const grad = HEADER_GRADIENTS[index % HEADER_GRADIENTS.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
      className="group bg-white dark:bg-[#1e1e2a] rounded-[24px] border border-slate-100 dark:border-[#2A2A36] overflow-hidden shadow-sm hover:shadow-xl hover:shadow-[#F15929]/8 hover:-translate-y-1 transition-all duration-300"
    >
      {/* ── Gradient header strip ── */}
      <div className={`relative h-24 bg-gradient-to-br ${grad} overflow-hidden`}>
        {/* Decorative circles */}
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-black/10" />
      </div>

      {/* ── Avatar (overlapping the strip) ── */}
      <div className="-mt-10 flex justify-center relative z-10">
        {teacher.photo_url ? (
          <img
            src={teacher.photo_url}
            alt={teacher.first_name}
            className="w-20 h-20 rounded-[24px] object-cover border-4 border-white dark:border-[#1e1e2a] shadow-lg"
          />
        ) : (
          <div className={`w-20 h-20 rounded-[24px] bg-gradient-to-br ${grad} flex items-center justify-center text-white text-2xl font-extrabold border-4 border-white dark:border-[#1e1e2a] shadow-lg`}>
            {initials || <AcademicCapIcon className="w-8 h-8" />}
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="px-5 pb-5 pt-3 space-y-3.5">

        {/* Name + Verified badge */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white leading-tight">
              {teacher.first_name}
            </h3>
            <span title="Tasdiqlangan o'qituvchi" className="flex-shrink-0">
              <CheckBadgeIcon className="w-4.5 h-4.5 text-[#F15929]" style={{ width: 18, height: 18 }} />
            </span>
          </div>

          {/* Username */}
          {teacher.username && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              @{teacher.username}
            </p>
          )}
        </div>

        {/* Expert niche pill */}
        {teacher.specialization && (
          <div className="flex justify-center">
            <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${nicheColour} truncate max-w-full`}>
              {teacher.specialization}
            </span>
          </div>
        )}

        {/* Bio — 2-line clamp */}
        {teacher.bio && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 text-center">
            {teacher.bio}
          </p>
        )}

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* Total students */}
          <div className="bg-slate-50 dark:bg-[#252533] rounded-2xl p-2.5 text-center space-y-1">
            <UsersIcon className="w-4 h-4 text-[#F15929] mx-auto" />
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">
              {teacher.total_students > 999
                ? `${(teacher.total_students / 1000).toFixed(1)}K`
                : teacher.total_students}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-semibold leading-none">
              Talaba
            </p>
          </div>

          {/* Course count */}
          <div className="bg-slate-50 dark:bg-[#252533] rounded-2xl p-2.5 text-center space-y-1">
            <BookOpenIcon className="w-4 h-4 text-[#F15929] mx-auto" />
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">
              {teacher.course_count}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-semibold leading-none">
              Kurs
            </p>
          </div>

          {/* Rating */}
          <div className="bg-slate-50 dark:bg-[#252533] rounded-2xl p-2.5 text-center space-y-1">
            <StarIcon className="w-4 h-4 text-amber-400 mx-auto" />
            <p className="text-sm font-extrabold text-gray-900 dark:text-white leading-none">
              {teacher.avg_rating > 0 ? teacher.avg_rating.toFixed(1) : '—'}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-semibold leading-none">
              Reyting
            </p>
          </div>
        </div>

        {/* Star rating visual */}
        <div className="flex justify-center">
          <StarRating value={teacher.avg_rating} />
        </div>

        {/* View Profile CTA */}
        <Link
          to={`/teacher/${teacher.telegram_id}`}
          className="block w-full text-center py-2.5 rounded-[14px] bg-[#F15929] hover:bg-orange-600 text-white text-sm font-bold shadow-[0_8px_20px_rgba(241,89,41,0.25)] hover:shadow-[0_10px_28px_rgba(241,89,41,0.38)] active:scale-95 transition-all duration-200"
        >
          Profilni ko'rish →
        </Link>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TeachersGalleryPage: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [error,    setError]    = useState('')

  useEffect(() => {
    apiService.getTeachersGallery()
      .then(res => setTeachers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setError("O'qituvchilar ro'yxati yuklanmadi"))
      .finally(() => setLoading(false))
  }, [])

  const filtered = teachers.filter(t => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.first_name.toLowerCase().includes(q) ||
      t.specialization.toLowerCase().includes(q) ||
      (t.username ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <PageWrapper>
      {/* ── Page header ── */}
      <div className="space-y-1 mb-6">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white inline-flex items-center gap-2"
        >
          <span className="w-8 h-8 rounded-xl bg-[#F15929] flex items-center justify-center shadow-[0_8px_20px_rgba(241,89,41,0.25)]">
            <AcademicCapIcon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </span>
          O'qituvchilar
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-sm text-slate-500 dark:text-slate-400"
        >
          SAHIFALAB'ning tasdiqlangan mutaxassis o'qituvchilari bilan tanishing
        </motion.p>
      </div>

      {/* ── Search bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative mb-6"
      >
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ism yoki mutaxassislik bo'yicha qidiring..."
          className="w-full pl-10 pr-4 py-2.5 rounded-[14px] bg-white dark:bg-[#1e1e2a] border border-slate-200 dark:border-[#2A2A36] text-sm text-gray-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#F15929]/30 focus:border-[#F15929]/40 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-xs font-medium"
          >
            ✕
          </button>
        )}
      </motion.div>

      {/* ── Content ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>

      ) : error ? (
        <div className="text-center py-16 space-y-3">
          <AcademicCapIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>

      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <AcademicCapIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {search ? `"${search}" bo'yicha natija topilmadi` : "Hozircha o'qituvchilar yo'q"}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-[#F15929] font-semibold hover:underline"
            >
              Filtrni tozalash
            </button>
          )}
        </div>

      ) : (
        <>
          {/* Count badge */}
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            {filtered.length} ta o'qituvchi{search ? ` — "${search}" uchun` : ''}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((teacher, i) => (
              <InstructorCard key={teacher.telegram_id} teacher={teacher} index={i} />
            ))}
          </div>

          {/* Bottom CTA — become a teacher */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10 bg-gradient-to-br from-[#F15929]/8 to-orange-50 dark:from-[#F15929]/10 dark:to-[#1e1e2a] border border-[#F15929]/20 rounded-[24px] p-6 text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-[18px] bg-[#F15929] mx-auto flex items-center justify-center shadow-[0_10px_24px_rgba(241,89,41,0.25)]">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                Siz ham o'qituvchi bo'lishni xohlaysizmi?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                O'z bilimingizni ulashing va SAHIFALAB platformasida o'qituvchi sifatida faoliyat ko'rsating.
              </p>
            </div>
            <Link
              to="/become-teacher"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#F15929] hover:bg-orange-600 text-white text-sm font-bold rounded-[14px] shadow-[0_8px_20px_rgba(241,89,41,0.25)] hover:shadow-[0_10px_28px_rgba(241,89,41,0.38)] active:scale-95 transition-all duration-200"
            >
              <AcademicCapIcon className="w-4 h-4" />
              O'qituvchi bo'lish uchun ariza
            </Link>
          </motion.div>
        </>
      )}
    </PageWrapper>
  )
}

export default TeachersGalleryPage
