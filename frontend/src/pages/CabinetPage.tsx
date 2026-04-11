/**
 * CabinetPage — SAHIFALAB Hub (Redesigned)
 *
 * Inspired by modern app profile screens:
 *   • Compact profile header with avatar, name, XP & level
 *   • Horizontal stats row
 *   • Certificates section (re-download)
 *   • Purchased books section
 *   • Menu-style navigation items
 *   • Badges overview
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
  Download,
  RefreshCw,
  ArrowRight,
  BookOpen,
  BarChart2,
  ChevronRight,
  CheckCircle,
  Clock,
  Info,
  Lightbulb,
  Link,
  PenLine,
  PlayCircle,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import {
  useProgressStore,
  formatFocusTime,
} from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { usePlatform } from '../hooks/usePlatform'
import { useAuth } from '../context/AuthContext'
import { LEVEL_TITLES } from '../utils/levelTitles'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
import ProfileHeaderCard from '../components/ProfileHeaderCard'
import type { ProfileHeaderData } from '../components/ProfileHeaderCard'
import { showToast } from '../components/ErrorBoundary'
import PageWrapper from '../components/PageWrapper'
import apiService from '../services/apiService'
import PostCard from '../components/social/PostCard'
import type { PostData } from '../components/social/PostCard'
import CourseCard from '../components/CourseCard'
import type { CourseData } from '../components/CourseCard'
import XPProgressBar from '../components/XPProgressBar'
import {
  fetchMyCompletedQuizzes,
  fetchQuizTitles,
  fetchMyPurchasedBooks,
  fetchBooksByIds,
} from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────
interface CompletedQuiz {
  id: number
  quiz_id: number
  score: number
  total: number
  percentage: number
  completed_at: string
  quiz_title?: string
  book_title?: string
}

interface PurchasedBook {
  id: number
  book_id: number
  amount: number
  currency: string
  completed_at: string
  title?: string
  author?: string
  thumbnail_url?: string
  category?: string
  file_url?: string
}

interface EnrolledCourse {
  course_id: number
  enrolled_at: string
  title: string
  thumbnail_url: string
  total_lessons: number
  completed_lessons: number
}

interface CourseCertificate {
  course_id: number
  certificate_id: string
  issued_at: string
  total_lessons: number
  completed_lessons: number
  courses?: {
    id?: number
    title?: string
    thumbnail_url?: string
  } | null
}



// ── Menu row component ────────────────────────────────────────────────────────
const MenuRow: React.FC<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  sublabel?: string
  value?: string
  onClick?: () => void
}> = ({ icon: Icon, label, sublabel, value, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
  >
    <Icon className="h-5 w-5 text-sahifa-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{label}</p>
      {sublabel && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{sublabel}</p>
      )}
    </div>
    {value && (
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{value}</span>
    )}
    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
  </button>
)

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section: React.FC<{
  children: React.ReactNode
  delay?: number
}> = ({ children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay }}
    className="mx-4 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50"
  >
    {children}
  </motion.div>
)

// ── Stat pill ─────────────────────────────────────────────────────────────────
const StatPill: React.FC<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  value: string | number
  label: string
}> = ({ icon: Icon, value, label }) => (
  <div className="flex-1 text-center py-3">
    <p className="text-lg font-bold text-gray-900 dark:text-white inline-flex items-center gap-1"><Icon className="h-4 w-4" /> {value}</p>
    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
  </div>
)

// ── Category gradient for book thumbnails ─────────────────────────────────────
const COVER_GRADIENTS: Record<string, string> = {
  psychology: 'from-purple-500 to-indigo-600',
  fiction:    'from-emerald-500 to-teal-600',
  science:   'from-blue-500 to-cyan-600',
  business:  'from-yellow-500 to-orange-600',
  default:   'from-sahifa-400 to-sahifa-600',
}

function coverGradient(category?: string) {
  return COVER_GRADIENTS[category?.toLowerCase() ?? ''] ?? COVER_GRADIENTS.default
}

// ── XP threshold to reach a target level (100 × Level^2.5) ──────────────────
function xpNeededForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0
  return Math.round(100 * Math.pow(targetLevel, 2.5))
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════

/* ──────────────────────────────────────────────────────────────────────────────
   HeatmapDisplay — GitHub-style 52×7 grid using real quiz-completion data
   Props: data — array of {date: 'YYYY-MM-DD', count: int} from backend
────────────────────────────────────────────────────────────────────────────── */
interface HeatmapDay { date: string; count: number }

const HeatmapDisplay: React.FC<{ data: HeatmapDay[] }> = ({ data }) => {
  const today    = new Date()
  const dayMap   = new Map(data.map(d => [d.date, d.count]))
  const maxCount = Math.max(1, ...data.map(d => d.count))

  // Build 52 columns × 7 rows (364 days back + today)
  const weeks: { date: string; count: number }[][] = []
  for (let w = 0; w < 52; w++) {
    const col: { date: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const daysAgo = (51 - w) * 7 + (6 - d)
      const dt      = new Date(today)
      dt.setDate(today.getDate() - daysAgo)
      const iso   = dt.toISOString().slice(0, 10)
      const count = dayMap.get(iso) ?? 0
      col.push({ date: iso, count })
    }
    weeks.push(col)
  }

  const cellColor = (count: number): string => {
    if (count === 0) return 'bg-slate-100 dark:bg-[#2A2A3A]'
    const pct = count / maxCount
    if (pct < 0.25) return 'bg-sahifa-200 dark:bg-sahifa-900/40'
    if (pct < 0.5)  return 'bg-sahifa-300 dark:bg-sahifa-700/60'
    if (pct < 0.75) return 'bg-sahifa-400 dark:bg-sahifa-600'
    return 'bg-sahifa-500'
  }

  return (
    <div>
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-[3px]" style={{ minWidth: 52 * 14 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell.count > 0 ? `${cell.date}: ${cell.count} ta test` : cell.date}
                  className={`w-[10px] h-[10px] rounded-sm transition-colors ${cellColor(cell.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Kam</span>
        {['bg-slate-100 dark:bg-[#2A2A3A]', 'bg-sahifa-200 dark:bg-sahifa-900/40', 'bg-sahifa-300 dark:bg-sahifa-700/60', 'bg-sahifa-400 dark:bg-sahifa-600', 'bg-sahifa-500'].map((c, i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Ko'p</span>
        {data.length > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-sahifa-500">{data.reduce((s, d) => s + d.count, 0)} test</span>
        )}
      </div>
    </div>
  )
}

const CabinetPage: React.FC = () => {
  const navigate = useNavigate()
  const { user: tgUser } = useTelegramWebApp()
  const {
    telegramId, firstName, username,
    totalXP, focusSeconds, level, quizzesCompleted, dailyQuizXP, totalFocusMinutes,
    isLoading,
  } = useProgressStore()

  // ── Platform bridge: web uses auth data; Telegram uses progressStore ──────
  const { isWeb } = usePlatform()
  const { user: authUser } = useAuth()

  // ProgressProvider initializes the store from authUser.id on both platforms,
  // so progressStore values are valid for web and Telegram users alike.
  const effectiveTelegramId   = telegramId   ?? authUser?.id   ?? null
  const effectiveFirstName    = firstName    || authUser?.first_name || ''
  const effectiveUsername     = username     || authUser?.username   || ''
  const effectiveTotalXP      = totalXP      || authUser?.total_xp  || 0
  const effectiveLevel        = level        || authUser?.level     || 1
  const effectiveFocusSeconds = focusSeconds
  const effectiveIsLoading    = isLoading
  const effectiveQuizCount    = quizzesCompleted
  const isTeacher = authUser?.role === 'teacher' && authUser?.status === 'active'

  const [photoError, setPhotoError] = useState(false)
  const [photoSaving, setPhotoSaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editAboutMe, setEditAboutMe] = useState('')
  const [localFirstName, setLocalFirstName] = useState('')
  const [localUsername, setLocalUsername] = useState('')
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null)
  const rawPhotoUrl = isWeb ? authUser?.photo_url : tgUser?.photo_url
  const resolvedPhotoUrl = localPhotoUrl || rawPhotoUrl || null
  const photoUrl = (!photoError && resolvedPhotoUrl) ? resolvedPhotoUrl : null

  useEffect(() => {
    setEditFirstName(effectiveFirstName || '')
    setEditUsername(effectiveUsername || '')
    setEditBio((authUser as any)?.bio || '')
    setEditAboutMe((authUser as any)?.about_me || '')
  }, [effectiveFirstName, effectiveUsername, authUser])

  useEffect(() => {
    setLocalFirstName(effectiveFirstName || '')
    setLocalUsername(effectiveUsername || '')
    setLocalPhotoUrl(rawPhotoUrl || null)
  }, [effectiveFirstName, effectiveUsername, rawPhotoUrl])

  const handlePhotoFileUpload = useCallback(async (file: File | null) => {
    if (!file) return
    try {
      setPhotoSaving(true)
      const res = await apiService.uploadMyPhotoFile(file)
      const nextPhoto = res?.data?.photo_url as string | undefined
      if (nextPhoto) {
        setLocalPhotoUrl(nextPhoto)
        setPhotoError(false)
      }
      showToast('Profil rasmi yangilandi', 'success')
    } catch {
      showToast('Rasm yuklanmadi. Bunny sozlamalarini tekshiring.', 'error')
    } finally {
      setPhotoSaving(false)
    }
  }, [])

  const handleSaveProfile = useCallback(async () => {
    try {
      setProfileSaving(true)
      await apiService.updateMyProfile({
        first_name: editFirstName.trim(),
        username: editUsername.trim() || null,
        bio: editBio.trim().slice(0, 150) || null,
        about_me: editAboutMe.trim() || null,
      })
      setLocalFirstName(editFirstName.trim())
      setLocalUsername(editUsername.trim())
      setEditOpen(false)
      showToast('Profil ma\'lumotlari saqlandi', 'success')
    } catch {
      showToast('Profil ma\'lumotlari saqlanmadi', 'error')
    } finally {
      setProfileSaving(false)
    }
  }, [isWeb, editFirstName, editUsername, editBio, editAboutMe])

  // Certificate & books state
  const [completedQuizzes, setCompletedQuizzes] = useState<CompletedQuiz[]>([])
  const [purchasedBooks, setPurchasedBooks] = useState<PurchasedBook[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showCert, setShowCert] = useState(false)
  const [certData, setCertData] = useState<CertificateData | null>(null)
  const [expandCerts, setExpandCerts] = useState(false)
  const [expandBooks, setExpandBooks] = useState(false)
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [courseCerts, setCourseCerts] = useState<CourseCertificate[]>([])
  const [loadingCourseCerts, setLoadingCourseCerts] = useState(true)
  const [heatmap,        setHeatmap]        = useState<{ date: string; count: number }[]>([])
  const [heatmapLoading, setHeatmapLoading] = useState(false)

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'lenta' | 'kurslar' | 'haqida'>('haqida')

  // ── Lenta tab: own posts ──────────────────────────────────────────────────
  const [ownPosts,        setOwnPosts]        = useState<PostData[]>([])
  const [ownPostsLoading, setOwnPostsLoading] = useState(false)

  // ── Kurslar tab: teacher own courses ──────────────────────────────────────
  const [ownCourses,        setOwnCourses]        = useState<CourseData[]>([])
  const [ownCoursesLoading, setOwnCoursesLoading] = useState(false)

  const displayName = localFirstName || effectiveFirstName || 'Foydalanuvchi'
  const focusHours = (effectiveFocusSeconds / 3600).toFixed(1)

  // ── Load certificates & purchased books ──────────────────────────────────
  useEffect(() => {
    if (!effectiveTelegramId) { setLoadingData(false); return }
    setLoadingData(true)

    Promise.all([
      fetchMyCompletedQuizzes(effectiveTelegramId).then(async (completions) => {
        if (completions.length === 0) return []
        const quizIds = [...new Set(completions.map(c => c.quiz_id))]
        const titles = await fetchQuizTitles(quizIds)
        const titleMap = new Map(titles.map(t => [t.id, t]))
        return completions.map(c => ({
          ...c,
          quiz_title: titleMap.get(c.quiz_id)?.title ?? `Quiz #${c.quiz_id}`,
          book_title: titleMap.get(c.quiz_id)?.book_title ?? '',
        }))
      }).catch(() => [] as CompletedQuiz[]),
      fetchMyPurchasedBooks(effectiveTelegramId).then(async (purchases) => {
        if (purchases.length === 0) return []
        const bookIds = [...new Set(purchases.map(p => p.book_id))]
        const books = await fetchBooksByIds(bookIds)
        const bookMap = new Map(books.map(b => [b.id, b]))
        return purchases.map(p => ({
          ...p,
          title: bookMap.get(p.book_id)?.title ?? `Kitob #${p.book_id}`,
          author: bookMap.get(p.book_id)?.author ?? '',
          thumbnail_url: bookMap.get(p.book_id)?.thumbnail_url ?? '',
          category: bookMap.get(p.book_id)?.category ?? '',
          file_url: bookMap.get(p.book_id)?.file_url ?? '',
        }))
      }).catch(() => [] as PurchasedBook[]),
    ]).then(([quizzes, books]) => {
      setCompletedQuizzes(quizzes)
      setPurchasedBooks(books)
    }).finally(() => setLoadingData(false))
  }, [effectiveTelegramId])

  // ── Load enrolled courses with lesson progress ────────────────────────────
  useEffect(() => {
    if (!effectiveTelegramId) { setLoadingCourses(false); return }
    setLoadingCourses(true)
    apiService.getMyEnrollments()
      .then(async (res) => {
        const enrollments: any[] = Array.isArray(res.data) ? res.data : []
        const withProgress = await Promise.all(
          enrollments.map(async (e) => {
            const courseData = e.courses ?? {}
            const [lessonsRes, progressRes] = await Promise.all([
              apiService.getLessons(e.course_id).catch(() => ({ data: [] as any[] })),
              apiService.getMyLessonProgress(e.course_id).catch(() => ({ data: { completed_lesson_ids: [] as number[] } })),
            ])
            return {
              course_id: e.course_id,
              enrolled_at: e.created_at ?? '',
              title: courseData.title ?? `Kurs #${e.course_id}`,
              thumbnail_url: courseData.thumbnail_url ?? '',
              total_lessons: Array.isArray(lessonsRes.data) ? lessonsRes.data.length : 0,
              completed_lessons: progressRes.data?.completed_lesson_ids?.length ?? 0,
            } satisfies EnrolledCourse
          })
        )
        setEnrolledCourses(withProgress)
      })
      .catch(() => {})
      .finally(() => setLoadingCourses(false))
  }, [effectiveTelegramId])

  // ── Load persisted course certificates ────────────────────────────────────
  useEffect(() => {
    if (!effectiveTelegramId) { setLoadingCourseCerts(false); return }
    setLoadingCourseCerts(true)
    apiService.getMyCourseCertificates()
      .then((res) => {
        setCourseCerts(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => setCourseCerts([]))
      .finally(() => setLoadingCourseCerts(false))
  }, [effectiveTelegramId])

  // Fetch heatmap data
  useEffect(() => {
    const id = effectiveTelegramId
    if (!id) return
    setHeatmapLoading(true)
    apiService.getHeatmap(id)
      .then(r => setHeatmap(r.data))
      .catch(() => {})
      .finally(() => setHeatmapLoading(false))
  }, [effectiveTelegramId])

  // ── Fetch own posts for Lenta tab ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'lenta' || !effectiveTelegramId) return
    if (ownPosts.length > 0) return
    setOwnPostsLoading(true)
    apiService.client
      .get(`/api/v1/social/users/${effectiveTelegramId}/posts`, { params: { page: 1, page_size: 50 } })
      .then(r => setOwnPosts(r.data?.posts ?? (Array.isArray(r.data) ? r.data : [])))
      .catch(() => {})
      .finally(() => setOwnPostsLoading(false))
  }, [activeTab, effectiveTelegramId])

  // ── Fetch teacher own courses for Kurslar tab ─────────────────────────────
  useEffect(() => {
    if (activeTab !== 'kurslar' || !effectiveTelegramId || !isTeacher) return
    if (ownCourses.length > 0) return
    setOwnCoursesLoading(true)
    apiService.getCourses({ teacher_id: effectiveTelegramId })
      .then(r => setOwnCourses(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setOwnCoursesLoading(false))
  }, [activeTab, effectiveTelegramId, isTeacher])

  // ── Post handlers for Lenta tab ───────────────────────────────────────────
  const handleLikePost = useCallback(async (postId: number) => {
    await apiService.client.post(`/api/v1/social/posts/${postId}/like`)
  }, [])

  const handleUnlikePost = useCallback(async (postId: number) => {
    await apiService.client.delete(`/api/v1/social/posts/${postId}/like`)
  }, [])

  const handleDeletePost = useCallback(async (postId: number) => {
    await apiService.client.delete(`/api/v1/social/posts/${postId}`)
    setOwnPosts(prev => prev.filter(p => p.id !== postId))
  }, [])

  const handleEditPost = useCallback(async (postId: number, content: string) => {
    await apiService.client.patch(`/api/v1/social/posts/${postId}`, { content })
    setOwnPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }, [])

  // ── Open certificate modal ──────────────────────────────────────────────
  const openCertificate = useCallback((quiz: CompletedQuiz) => {
    setCertData({
      userName: displayName,
      quizTitle: quiz.quiz_title || `Quiz #${quiz.quiz_id}`,
      score: quiz.score,
      total: quiz.total,
      percentage: quiz.percentage,
      date: new Date(quiz.completed_at).toLocaleDateString('uz-UZ'),
      certificateId: `SL-${quiz.quiz_id}-${effectiveTelegramId}-${quiz.id}`,
    })
    setShowCert(true)
  }, [displayName, effectiveTelegramId])

  const openCourseCertificate = useCallback((cert: CourseCertificate) => {
    const courseTitle = cert.courses?.title || `Kurs #${cert.course_id}`
    setCertData({
      userName: displayName,
      quizTitle: `${courseTitle} kursi`,
      score: cert.completed_lessons || cert.total_lessons || 0,
      total: cert.total_lessons || cert.completed_lessons || 0,
      percentage: 100,
      date: new Date(cert.issued_at).toLocaleDateString('uz-UZ'),
      certificateId: cert.certificate_id,
    })
    setShowCert(true)
  }, [displayName])

  const visibleCerts = expandCerts ? completedQuizzes : completedQuizzes.slice(0, 3)
  const visibleBooks = expandBooks ? purchasedBooks : purchasedBooks.slice(0, 3)

  if (effectiveIsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <RefreshCw className="h-10 w-10 mx-auto text-slate-400 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Yuklanmoqda…</p>
        </div>
      </div>
    )
  }

  return (
    <PageWrapper className="space-y-3" topPadding="">

      {/* ═══ Profile Header — Live Preview Card ═══ */}
      <div className="px-4 pt-4 pb-2">
        <ProfileHeaderCard
          editMode
          profile={{
            telegram_id: effectiveTelegramId,
            full_name: localFirstName || effectiveFirstName,
            username: localUsername || effectiveUsername,
            photo_url: photoUrl,
            role: authUser?.role,
            level: effectiveLevel,
            xp: effectiveTotalXP,
            bio: authUser?.bio,
            about_me: authUser?.about_me,
          } as ProfileHeaderData}
          liveFirstName={editFirstName || undefined}
          liveBio={editBio || undefined}
          onAvatarUpload={(file) => handlePhotoFileUpload(file)}
          avatarUploading={photoSaving}
          onEditClick={() => setEditOpen(prev => !prev)}
        />
      </div>

      {/* ═══ Bento Settings Form ═══ */}
      <AnimatePresence>
      {editOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mx-4"
        >
          <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-5 space-y-4">
            <p className="text-xs font-bold text-gray-400 dark:text-white/30 uppercase tracking-widest">Profil sozlamalari</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-white/40 mb-1.5">Ism</label>
                <input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="Ismingiz"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-sahifa-400/40 focus:border-sahifa-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-white/40 mb-1.5">Username</label>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.replace(/^@+/, ''))}
                  placeholder="username"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-sahifa-400/40 focus:border-sahifa-400 transition-all"
                />
              </div>
            </div>

            {/* Short Bio (Status) — max 150 chars */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-white/40 mb-1.5">Qisqa bio</label>
              <div className="relative">
                <input
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value.slice(0, 150))}
                  placeholder="Status — profilning boshida ko'rinadi"
                  maxLength={150}
                  className="w-full rounded-xl px-3.5 py-2.5 pr-14 text-sm bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-sahifa-400/40 focus:border-sahifa-400 transition-all"
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium ${editBio.length >= 140 ? 'text-red-400' : 'text-gray-400 dark:text-white/30'}`}>
                  {editBio.length}/150
                </span>
              </div>
            </div>

            {/* About Me (long-form) */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-white/40 mb-1.5">Haqida</label>
              <textarea
                value={editAboutMe}
                onChange={(e) => setEditAboutMe(e.target.value)}
                placeholder="Batafsil ma'lumot — 'Haqida' tabida to'liq ko'rinadi"
                rows={3}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-sahifa-400/40 focus:border-sahifa-400 resize-none leading-relaxed transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-sahifa-500 hover:bg-sahifa-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
              >
                {profileSaving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Saqlash
              </button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ═══ XP Progress Bento ═══ */}
      <div className="px-4">
        <XPProgressBar
          totalXP={effectiveTotalXP}
          level={effectiveLevel}
          dailyQuizXP={dailyQuizXP}
          totalFocusMinutes={totalFocusMinutes || Math.floor((focusSeconds || 0) / 60)}
        />
      </div>

      {/* ═══ Profile Strength Meter (Teachers only) ═══ */}
      {isTeacher && (() => {
        const fields = [
          { label: 'Ism',           done: !!effectiveFirstName },
          { label: 'Qisqa bio',     done: !!((authUser as any)?.bio) },
          { label: 'Rasm',          done: !!photoUrl },
          { label: 'Username',      done: !!effectiveUsername },
          { label: 'Haqida matni',  done: !!((authUser as any)?.about_me) },
        ]
        const score = Math.round((fields.filter(f => f.done).length / fields.length) * 100)
        return (
          <div className="mx-4">
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-sahifa-500" />
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Profil kuchi</p>
                </div>
                <span className="text-sm font-extrabold text-sahifa-600 dark:text-sahifa-400">{score}%</span>
              </div>
              {/* Meter bar */}
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(to right, #F15929, #f97316)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
              </div>
              {/* Step pills */}
              <div className="flex flex-wrap gap-2">
                {fields.map(f => (
                  <span key={f.label} className={['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                    f.done
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-white/40',
                  ].join(' ')}>
                    <CheckCircle className="h-3 w-3" />
                    {f.label}
                  </span>
                ))}
              </div>
              {/* Growth tip */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-900/10 border border-blue-200/60 dark:border-blue-800/40">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
                  To'liq to'ldirilgan profil o'quvchilar ishonchini <strong>40%</strong> ga oshiradi.
                  {score < 100 && (
                    <> <button onClick={() => setEditOpen(true)} className="font-semibold underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">Profilni to'ldirish <ArrowRight className="inline h-3 w-3" /></button></>
                  )}
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Tab Navigation ═══ */}
      <div className="px-4">
        <div className="flex gap-1 p-1 rounded-2xl bg-gray-100/80 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06]">
          {(['lenta', ...(isTeacher ? ['kurslar'] : []), 'haqida'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'lenta' | 'kurslar' | 'haqida')}
              className={`relative flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition-colors ${
                activeTab === tab
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
              }`}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="cabinet-tab-pill"
                  className="absolute inset-0 rounded-xl bg-white dark:bg-white/[0.08] shadow-sm border border-gray-200/60 dark:border-white/[0.06]"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative z-10">
                {tab === 'lenta' ? 'Lenta' : tab === 'kurslar' ? 'Kurslar' : 'Haqida'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>

        {/* ── Lenta tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'lenta' && (
          <motion.div
            key="tab-lenta"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="px-4 space-y-4"
          >
            {ownPostsLoading ? (
              <div className="flex justify-center py-16">
                <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
              </div>
            ) : ownPosts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
                  <PenLine className="w-7 h-7 text-gray-300 dark:text-white/10" />
                </div>
                <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Hali postlar yo'q</p>
                <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Birinchi postingizni yozing!</p>
                <button
                  onClick={() => navigate('/social')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sahifa-500 text-white text-sm font-semibold hover:bg-sahifa-600 transition-colors active:scale-95"
                >
                  <PenLine className="w-4 h-4" /> Post yozish
                </button>
              </div>
            ) : (
              ownPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={effectiveTelegramId ?? undefined}
                  onLike={handleLikePost}
                  onUnlike={handleUnlikePost}
                  onDelete={handleDeletePost}
                  onEdit={handleEditPost}
                />
              ))
            )}
          </motion.div>
        )}

        {/* ── Kurslar tab (teacher only) ─────────────────────────────────────── */}
        {activeTab === 'kurslar' && (
          <motion.div
            key="tab-kurslar"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="px-4"
          >
            {ownCoursesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white/90 dark:bg-[#1A1A1A] rounded-[24px] border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden animate-pulse">
                    <div className="h-44 bg-slate-100 dark:bg-slate-800" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ownCourses.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
                  <PlayCircle className="w-8 h-8 text-gray-300 dark:text-white/10" />
                </div>
                <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Hali kurslar yo'q</p>
                <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Birinchi kursingizni yarating!</p>
                <button
                  onClick={() => navigate('/teacher')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sahifa-500 text-white text-sm font-semibold hover:bg-sahifa-600 transition-colors active:scale-95"
                >
                  <PlayCircle className="w-4 h-4" /> Kurs yaratish
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ownCourses.map((course, i) => (
                  <div key={course.id} className="relative group/kcourse">
                    <CourseCard course={course} index={i} hideTeacher />
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/teacher') }}
                      className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm text-white text-xs font-semibold opacity-0 group-hover/kcourse:opacity-100 transition-all duration-200 hover:bg-sahifa-500/90 border border-white/10 active:scale-95"
                    >
                      <PenLine className="w-3.5 h-3.5" /> Tahrirlash
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Haqida tab (existing content) ─────────────────────────────────── */}
        {activeTab === 'haqida' && (
          <motion.div
            key="tab-haqida"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >

      {/* ═══ Stats Row ═══ */}
      <Section delay={0.05}>
        <div className="flex divide-x divide-gray-100 dark:divide-gray-700/50">
          <StatPill icon={Clock} value={`${focusHours}h`} label="Diqqat" />
          <StatPill icon={BarChart2} value={isWeb ? completedQuizzes.length : effectiveQuizCount} label="Testlar" />
          <StatPill icon={Sparkles} value={effectiveTotalXP.toLocaleString()} label="XP" />
          <StatPill icon={Trophy} value={effectiveLevel} label="Daraja" />
        </div>
      </Section>

      {/* ═══ My Enrolled Courses ═══ */}
      <Section delay={0.08}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sahifa-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Mening Kurslarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {enrolledCourses.length} ta
          </span>
        </div>

        {loadingCourses ? (
          <div className="px-4 py-6 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-slate-400 animate-spin" />
          </div>
        ) : enrolledCourses.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <GraduationCap className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali kursga yozilmagansiz</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">O'rganishni boshlash uchun kurs tanlang</p>
            <button
              onClick={() => navigate('/courses')}
              className="mt-3 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 inline-flex items-center gap-1"
            >
              Kurslarga o'tish <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          enrolledCourses.map((course) => {
            const pct = course.total_lessons > 0
              ? Math.round((course.completed_lessons / course.total_lessons) * 100)
              : 0
            const isDone = pct === 100
            return (
              <button
                key={course.course_id}
                onClick={() => navigate(`/courses/${course.course_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                  {course.thumbnail_url ? (
                    <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center">
                      <GraduationCap className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info + progress */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{course.title}</p>
                  <div className="mt-1.5">
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isDone ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-sahifa-400 to-sahifa-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {course.completed_lessons}/{course.total_lessons} dars •{' '}
                      {isDone ? (
                        <span className="text-emerald-500 font-semibold">Yakunlandi</span>
                      ) : (
                        <span>{pct}% bajarildi</span>
                      )}
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              </button>
            )
          })
        )}
      </Section>

      {/* ═══ Certificates Section ═══ */}
      <Section delay={0.1}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sahifa-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sertifikatlarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {completedQuizzes.length} ta
          </span>
        </div>

        {loadingData ? (
          <div className="px-4 py-6 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-slate-400 animate-spin" />
          </div>
        ) : completedQuizzes.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali sertifikat yo'q</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Quizlardan 80%+ oling va sertifikat qozing!</p>
            <button
              onClick={() => navigate('/quiz')}
              className="mt-3 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 inline-flex items-center gap-1"
            >
              Quizlarga o'tish <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            {visibleCerts.map((quiz) => (
              <button
                key={quiz.id}
                onClick={() => openCertificate(quiz)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center flex-shrink-0">
                  <Trophy className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {quiz.quiz_title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {quiz.score}/{quiz.total} ({quiz.percentage}%) • {new Date(quiz.completed_at).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
                <span className="text-xs font-medium text-sahifa-500 inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Yuklab olish</span>
              </button>
            ))}
            {completedQuizzes.length > 3 && (
              <button
                onClick={() => setExpandCerts(prev => !prev)}
                className="w-full py-2.5 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 text-center"
              >
                {expandCerts ? 'Kamroq' : `Barchasini ko'rish (${completedQuizzes.length})`}
              </button>
            )}
          </>
        )}
      </Section>

      {/* ═══ Course Certificates Section ═══ */}
      <Section delay={0.12}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sahifa-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Kurs sertifikatlarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {courseCerts.length} ta
          </span>
        </div>

        {loadingCourseCerts ? (
          <div className="px-4 py-6 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-slate-400 animate-spin" />
          </div>
        ) : courseCerts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <GraduationCap className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali kurs sertifikati yo'q</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Kurslarni 100% yakunlang va sertifikat oling</p>
          </div>
        ) : (
          courseCerts.map((cert) => (
            <button
              key={cert.certificate_id}
              onClick={() => openCourseCertificate(cert)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-200 dark:from-indigo-900/30 dark:to-violet-800/30 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {cert.courses?.title ?? `Kurs #${cert.course_id}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {cert.completed_lessons}/{cert.total_lessons} dars • {new Date(cert.issued_at).toLocaleDateString('uz-UZ')}
                </p>
              </div>
              <span className="text-xs font-medium text-sahifa-500 inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Yuklab olish</span>
            </button>
          ))
        )}
      </Section>

      {/* ═══ Purchased Books Section ═══ */}
      <Section delay={0.15}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-sahifa-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Xarid qilgan kitoblarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {purchasedBooks.length} ta
          </span>
        </div>

        {loadingData ? (
          <div className="px-4 py-6 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-slate-400 animate-spin" />
          </div>
        ) : purchasedBooks.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali kitob sotib olinmagan</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Premium kitoblarni sotib oling</p>
            <button
              onClick={() => navigate('/kitoblar')}
              className="mt-3 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 inline-flex items-center gap-1"
            >
              Kitoblarga o'tish <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            {visibleBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => navigate(`/kitoblar/${book.book_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                {/* Thumbnail */}
                <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                  {book.thumbnail_url ? (
                    <img
                      src={book.thumbnail_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${coverGradient(book.category)} flex items-center justify-center`}>
                      <BookOpen className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {book.author}
                  </p>
                  {book.completed_at && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(book.completed_at).toLocaleDateString('uz-UZ')}
                    </p>
                  )}
                </div>
                {book.file_url && (
                  <span className="text-xs font-medium text-emerald-500"><Download className="h-4 w-4" /></span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              </button>
            ))}
            {purchasedBooks.length > 3 && (
              <button
                onClick={() => setExpandBooks(prev => !prev)}
                className="w-full py-2.5 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 text-center"
              >
                {expandBooks ? 'Kamroq' : `Barchasini ko'rish (${purchasedBooks.length})`}
              </button>
            )}
          </>
        )}
      </Section>

      {/* ═══ Navigation Menu ═══ */}
      <Section delay={0.2}>
        <MenuRow
          icon={Trophy}
          label="Liderlar Jadvali"
          sublabel="Top 100 o'quvchilar"
          onClick={() => navigate('/leaderboard')}
        />
        <MenuRow
          icon={BarChart2}
          label="Testlar"
          sublabel="Bilimingizni sinab ko'ring"
          onClick={() => navigate('/quiz')}
        />
        <MenuRow
          icon={BookOpen}
          label="Kitoblar"
          sublabel="Bepul va Premium kitoblar"
          onClick={() => navigate('/kitoblar')}
        />
        <MenuRow
          icon={Clock}
          label="O'qish sessiyasi"
          sublabel="Fokus timer + ambient sounds"
          onClick={() => navigate('/workspace?tab=focus')}
        />
        <MenuRow
          icon={Sparkles}
          label="SahifaLab AI"
          sublabel="Savolingiz bormi? Yozing!"
          onClick={() => navigate('/ai-companion')}
        />
        <MenuRow
          icon={GraduationCap}
          label="Kurslar"
          sublabel="Barcha kurslarni ko'rish"
          onClick={() => navigate('/courses')}
        />
      </Section>

      {/* ═══ Role-based: teacher / admin ═══ */}
      {authUser && (
        <Section delay={0.25}>
          {(authUser.role === 'teacher' && authUser.status === 'active') && (
            <MenuRow
              icon={BarChart2}
              label="O'qituvchi paneli"
              sublabel="Kurslarim, talabalar, daromad"
              onClick={() => navigate('/teacher')}
            />
          )}
          {(authUser.role === 'teacher' && authUser.status === 'pending') && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <RefreshCw className="h-5 w-5 text-amber-500 animate-spin" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Ariza ko'rib chiqilmoqda</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Admin tasdiqlashini kuting</p>
              </div>
            </div>
          )}
          {authUser.role === 'student' && (
            <MenuRow
              icon={GraduationCap}
              label="O'qituvchi bo'lish"
              sublabel="O'z kurslaringizni yarating va pul ishlang"
              onClick={() => navigate('/become-teacher')}
            />
          )}
          {authUser.role === 'admin' && (
            <MenuRow
              icon={Sparkles}
              label="Admin paneli"
              sublabel="Platforma boshqaruvi"
              onClick={() => navigate('/admin')}
            />
          )}
        </Section>
      )}

          {/* ── Activity Heatmap ────────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-[24px] bg-white dark:bg-[#1C1C22] border border-slate-100 dark:border-white/[0.07] p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">Faollik tarixim</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">So'nggi yil — testlar va o'qish</p>
              </div>
              {heatmapLoading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
            </div>
            <HeatmapDisplay data={heatmap} />
          </motion.section>

      {/* ═══ Badges / Yutuqlar Section ═══ */}
      {(() => {
        const earned = LEVEL_TITLES.filter(b => effectiveLevel >= b.level)
        const locked = LEVEL_TITLES.filter(b => effectiveLevel < b.level)
        const nextBadge = locked[0]
        const xpForNext = nextBadge ? xpNeededForLevel(nextBadge.level) : 0
        const xpLeft = Math.max(0, xpForNext - effectiveTotalXP)
        const progressToNext = nextBadge
          ? Math.min(1, (effectiveTotalXP - xpNeededForLevel(nextBadge.level - 1)) / Math.max(1, xpForNext - xpNeededForLevel(nextBadge.level - 1)))
          : 1

        return (
          <>
            {/* Next badge card */}
            {nextBadge && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                className="mx-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4"
              >
                <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3 inline-flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" /> Keyingi yutuq</p>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/80 dark:bg-gray-800/60 border-2 border-blue-200 dark:border-blue-700 flex items-center justify-center shadow-sm">
                    <Trophy className="h-7 w-7 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-gray-900 dark:text-white">{nextBadge.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">Lv.{nextBadge.level}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{nextBadge.description}</p>
                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(progressToNext * 100, 2)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 font-medium">
                        Yana {xpLeft.toLocaleString()} XP kerak • Quiz yoki fokus sessiyasi boshla!
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Earned + Locked in one section */}
            <Section delay={0.3}>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-sahifa-500" />
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Yutuqlar</h2>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {earned.length} / {LEVEL_TITLES.length} ochildi
                </span>
              </div>

              {/* Earned badges */}
              {earned.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Ochildi</p>
                  <div className="grid grid-cols-4 gap-2">
                    {earned.map((b) => (
                      <div
                        key={b.level}
                        className="rounded-xl p-2 text-center bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30"
                      >
                        <div className="text-xl leading-none"><Trophy className="h-5 w-5 mx-auto text-emerald-600" /></div>
                        <p className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 mt-1 truncate">{b.title}</p>
                        <p className="text-[8px] text-emerald-600/60 dark:text-emerald-400/50">Lv.{b.level}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Locked badges */}
              {locked.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Yopiq ({locked.length})</p>
                  <div className="space-y-1.5">
                    {locked.slice(0, 5).map((b) => {
                      const reqXP = xpNeededForLevel(b.level)
                      const myProgress = Math.min(1, totalXP / Math.max(1, reqXP))
                      return (
                        <div
                          key={b.level}
                          className="flex items-center gap-3 rounded-xl p-2.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40"
                        >
                          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <Trophy className="h-4 w-4 opacity-40" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{b.title}</p>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">Lv.{b.level} • {reqXP.toLocaleString()} XP</span>
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gray-300 dark:bg-gray-600 transition-all"
                                style={{ width: `${myProgress * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {locked.length > 5 && (
                      <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 pt-1">
                        +{locked.length - 5} ta yopiq yutuq
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {earned.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Quizlar yechib, fokus sessiya boshlab yutuqlar oching!</p>
                </div>
              )}
            </Section>
          </>
        )
      })()}

      {/* ═══ More Items ═══ */}
      <Section delay={0.3}>
        <MenuRow
          icon={Link}
          label="Resurslar"
          sublabel="Foydali linklar va videolar"
          onClick={() => navigate('/resources')}
        />
        <MenuRow
          icon={Info}
          label="Haqimizda"
          sublabel="Bizning hikoyamiz va missiyamiz"
          onClick={() => navigate('/about')}
        />
      </Section>

      {/* ═══ Gamification tip ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className="mx-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3"
      >
        <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
          <strong>Daraja qanday oshadi?</strong> Yangi quizlardan olingan XP va fokus vaqtidan.
          <br />
          <strong>XP farming o'chirilgan:</strong> bir xil quizni qayta ishlash orqali XP olinmaydi.
          <br />
          <strong>Sertifikat:</strong> Quiz natijasi 80%+ bo'lsa, sertifikat yuklab olinadi.
        </p>
      </motion.div>

      {/* Spacer */}
      <div className="h-4" />

          </motion.div>
        )}

      </AnimatePresence>

      {/* ═══ Certificate Modal ═══ */}
      {showCert && certData && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}
    </PageWrapper>
  )
}

export default CabinetPage
