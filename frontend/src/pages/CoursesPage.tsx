/**
 * CoursesPage — public course catalogue
 *
 * Features:
 *  • Category filter tabs (fetched from API)
 *  • Level filter pills (Barcha / Boshlang'ich / O'rta / Yuqori)
 *  • Search input (debounced 400 ms)
 *  • Infinite-style "Load more" pagination
 *  • Course cards with thumbnail, price badge, rating, enrolment count
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AcademicCapIcon, MagnifyingGlassIcon, XMarkIcon, BookOpenIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import CourseCard from '../components/CourseCard'
import type { CourseData, TeacherMini } from '../components/CourseCard'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Category {
  id:         number
  name:       string
  slug:       string
  icon:       string
  sort_order: number
}

// Re-export Course as CourseData alias for internal use
type Course = CourseData & { slug: string; description: string; language: string; created_at: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const LEVELS = [
  { value: '',             label: 'Barchasi' },
  { value: 'beginner',     label: "Boshlang'ich" },
  { value: 'intermediate', label: "O'rta" },
  { value: 'advanced',     label: 'Yuqori' },
]

const PAGE_SIZE = 12

// ── Skeleton card ─────────────────────────────────────────────────────────────
const SkeletonCard: React.FC = () => (
  <div className="bg-white/90 dark:bg-[#1A1A1A] rounded-[24px] border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden animate-pulse">
    <div className="h-44 bg-slate-100 dark:bg-slate-800" />
    <div className="p-3 space-y-2">
      <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
      <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
      <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/3" />
    </div>
  </div>
)

// ── Main page ─────────────────────────────────────────────────────────────────
const CoursesPage: React.FC = () => {
  const [categories, setCategories]   = useState<Category[]>([])
  const [courses, setCourses]         = useState<Course[]>([])
  const [total, setTotal]             = useState(0)
  const [offset, setOffset]           = useState(0)

  const [activeCategory, setActiveCategory] = useState('')  // slug or ''
  const [activeLevel, setActiveLevel]       = useState('')
  const [search, setSearch]                 = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore]   = useState(false)
  const [catsLoading, setCatsLoading]   = useState(true)
  const [teacherProfiles, setTeacherProfiles] = useState<Record<number, TeacherMini>>({})

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ── Batch-fetch teacher profiles for visible courses ──────────────────────────
  useEffect(() => {
    const ids = [...new Set(courses.map(c => c.teacher_id).filter(Boolean))]
    const missing = ids.filter(id => !(id in teacherProfiles))
    if (missing.length === 0) return
    missing.forEach(tid => {
      apiService.getPublicTeacherProfile(tid)
        .then(res => {
          setTeacherProfiles(prev => ({ ...prev, [tid]: res.data }))
        })
        .catch(() => {
          // mark as fetched with empty to avoid retrying
          setTeacherProfiles(prev => ({ ...prev, [tid]: {} }))
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses])
  // ── Load categories once ────────────────────────────────────────────────
  useEffect(() => {
    apiService.getCategories()
      .then(r => setCategories(r.data))
      .catch(() => {})
      .finally(() => setCatsLoading(false))
  }, [])

  // ── Debounce search input ───────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  // ── Fetch courses (reset on filter change) ──────────────────────────────
  const fetchCourses = useCallback(async (reset: boolean) => {
    const currentOffset = reset ? 0 : offset
    reset ? setLoading(true) : setLoadingMore(true)

    try {
      const res = await apiService.getCourses({
        category:   activeCategory || undefined,
        level:      activeLevel    || undefined,
        search:     debouncedSearch || undefined,
        limit:      PAGE_SIZE,
        offset:     currentOffset,
      })
      const { courses: newCourses, total: newTotal } = res.data
      setCourses(prev => reset ? newCourses : [...prev, ...newCourses])
      setTotal(newTotal)
      setOffset(currentOffset + newCourses.length)
    } catch {
      // silently ignore — no courses yet
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeLevel, debouncedSearch])

  // Reset + refetch when filters change
  useEffect(() => {
    setOffset(0)
    fetchCourses(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeLevel, debouncedSearch])

  const hasMore = courses.length < total

  return (
    <PageWrapper>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-xl shadow">
            <AcademicCapIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Kurslar</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {total > 0 ? `${total} ta kurs mavjud` : "Kurslarni ko'ring va o'rganing"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="mb-4"
      >
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"><MagnifyingGlassIcon className="w-4 h-4" /></span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Kurs qidiring..."
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sahifa-400 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Category tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.06 }}
        className="mb-3"
      >
        {catsLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-8 w-20 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveCategory('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeCategory === ''
                  ? 'bg-sahifa-500 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1"><GlobeAltIcon className="w-3.5 h-3.5" />Barchasi</span>
            </button>
            {categories.map(cat => (
              <button
                key={cat.slug}
                onClick={() => setActiveCategory(cat.slug)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeCategory === cat.slug
                    ? 'bg-sahifa-500 text-white shadow'
                    : 'bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Level pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="flex gap-2 mb-5"
      >
        {LEVELS.map(l => (
          <button
            key={l.value}
            onClick={() => setActiveLevel(l.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeLevel === l.value
                ? 'bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-700 dark:text-sahifa-300 border border-sahifa-300 dark:border-sahifa-700'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {l.label}
          </button>
        ))}
      </motion.div>

      {/* Course grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : courses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 space-y-3"
        >
          <div className="flex justify-center"><BookOpenIcon className="w-12 h-12 text-gray-400" /></div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Kurs topilmadi</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {search ? `"${search}" bo'yicha natija yo'q` : 'Bu bo\'limda hali kurslar mavjud emas'}
          </p>
          {(activeCategory || activeLevel || search) && (
            <button
              onClick={() => { setActiveCategory(''); setActiveLevel(''); setSearch('') }}
              className="text-xs text-sahifa-500 hover:text-sahifa-600 font-medium"
            >
              Filtrlarni tozalash →
            </button>
          )}
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {courses.map((c, i) => <CourseCard key={c.id} course={c} index={i} teacher={teacherProfiles[c.teacher_id]} analyticsRef="search" />)}
          </div>

          {hasMore && (
            <div className="mt-5 text-center">
              <button
                onClick={() => fetchCourses(false)}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-sahifa-400 dark:hover:border-sahifa-500 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Yuklanmoqda...' : `Ko'proq ko'rish (${total - courses.length} ta qoldi)`}
              </button>
            </div>
          )}
        </>
      )}

    </PageWrapper>
  )
}

export default CoursesPage
