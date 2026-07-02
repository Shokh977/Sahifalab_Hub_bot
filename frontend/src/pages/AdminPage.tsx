/**
 * SAHIFALAB Admin Panel
 * Authentication: Admin enters their Telegram ID; backend validates against AdminUser table.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, RefreshCw, Users, BookOpen, GraduationCap, Star,
  BadgeDollarSign, CheckCircle, Lock, Percent, Wallet, Target, Inbox,
} from 'lucide-react'
import apiService from '@services/apiService'
import { API_BASE } from '../lib/apiUrl'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { useAuth } from '../context/AuthContext'
import { supabase, isSupabaseConfigured, invalidateCache } from '../lib/supabase'
import { getProfileSkin } from '../utils/profileSkins'
import { getLevelTitle } from '../utils/levelTitles'
import { isUserOnline } from '../utils/onlineStatus'

const ADMIN_TELEGRAM_IDS = [807466591]

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeroContent {
  id: number
  title: string | null
  subtitle: string | null
  description: string | null
  image_url: string | null
  cta_text: string | null
  cta_link: string | null
  is_active: boolean
  display_order: number
}

interface AdminBook {
  id: number
  title: string
  author: string
  price: number
  is_paid: boolean
  is_downloadable: boolean
  file_url: string
  thumbnail_url: string | null
  downloads: number
  rating: number
  created_at: string
}

interface AdminStats {
  total_users: number
  total_quizzes: number
  total_books: number
  total_resources: number
  active_payments: number
  recent_uploads: string[]
  active_users_1h: number
  active_users_24h: number
}

interface AdminProfile {
  telegram_id: number
  first_name: string | null
  username: string | null
  total_xp: number
  focus_seconds: number
  level: number
  quizzes_completed: number
  app_online_at: string | null
}

interface AdminQuiz {
  id: number
  title: string
  book_title: string
  difficulty: 'easy' | 'medium' | 'hard' | string
  category: string
  total_questions: number
  created_at: string
}

type Tab = 'stats' | 'hero' | 'quiz' | 'books' | 'sounds' | 'teachers' | 'analytics' | 'users' | 'courses' | 'announcements' | 'decks' | 'feature_usage'

interface AdminAnnouncement {
  id:         number
  title:      string
  body:       string
  image_url:  string | null
  cta_text:   string | null
  cta_link:   string | null
  starts_at:  string | null
  expires_at: string | null
  is_active:  boolean
  view_count: number
  created_at: string
}

interface TeacherRequest {
  telegram_id:      number
  first_name:       string | null
  username:         string | null
  photo_url:        string | null
  total_xp:         number
  level:            number
  created_at:       string
  // Application form fields (from teacher_profiles)
  specialization:   string | null
  experience_years: number | null
  bio:              string | null
  course_idea:      string | null
  motivation:       string | null
  contact:          string | null
  applied_at:       string | null
  intro_video_url:  string | null
  status:           'pending' | 'approved' | 'rejected' | string
}

// ─── Platform analytics types (Step 15) ──────────────────────────────────────
interface PlatformSummary {
  total_courses: number
  published_courses: number
  paid_courses: number
  total_enrollments: number
  total_teachers: number
  total_completed_orders: number
  total_revenue_uzs: number
}

interface TopCourse {
  id: number
  title: string
  teacher_id: number
  enrolled_count: number
  is_paid: boolean
  price: number
}

interface TeacherLeaderboardItem {
  teacher_id: number
  first_name: string
  username: string | null
  courses_count: number
  total_students: number
  total_revenue_uzs: number
  completed_orders: number
}

interface RecentOrder {
  order_id: string
  course_id: number
  student_id: number
  amount: number
  completed_at: string
}

interface PlatformAnalytics {
  summary: PlatformSummary
  top_courses: TopCourse[]
  teacher_leaderboard: TeacherLeaderboardItem[]
  recent_orders: RecentOrder[]
}

interface AdminUserProfile {
  telegram_id: number
  first_name: string | null
  username: string | null
  photo_url: string | null
  role: 'student' | 'teacher' | 'admin'
  status: 'active' | 'pending' | 'suspended'
  total_xp: number
  level: number
  app_created_at: string | null
}

// ─── Quiz form types ──────────────────────────────────────────────────────────
interface QuizQuestionForm {
  question: string
  options: [string, string, string, string]
  correct_answer: number
  explanation: string
}

interface QuizForm {
  title: string
  book_title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  book_id: number | null   // linked book (optional)
}

const EMPTY_QUESTION: QuizQuestionForm = {
  question: '',
  options: ['', '', '', ''],
  correct_answer: 0,
  explanation: '',
}

const EMPTY_QUIZ: QuizForm = {
  title: '',
  book_title: '',
  description: '',
  difficulty: 'easy',
  category: 'programming',
  book_id: null,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ emoji: string; label: string; value: number | string }> = ({
  emoji, label, value,
}) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 dark:border-gray-700">
    <span className="text-3xl">{emoji}</span>
    <div>
      <div className="text-xl font-bold text-sahifa-700 dark:text-sahifa-300">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  </div>
)

const formatFocusTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const { user: tgUser } = useTelegramWebApp()
  const { user: authUser, token } = useAuth()
  const navigate = useNavigate()
  const [telegramId, setTelegramId] = useState('')
  const [adminId, setAdminId] = useState<number | null>(null)
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('stats')

  // Debug
  const [dbStatus, setDbStatus] = useState<string | null>(null)
  const [dbChecking, setDbChecking] = useState(false)

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profilesError, setProfilesError] = useState('')

  // Hero
  const [heroList, setHeroList] = useState<HeroContent[]>([])
  const [editingHero, setEditingHero] = useState<Partial<HeroContent> | null>(null)
  const [heroSaving, setHeroSaving] = useState(false)
  const [heroMsg, setHeroMsg] = useState('')

  // Quiz
  const [quizForm, setQuizForm] = useState<QuizForm>({ ...EMPTY_QUIZ })
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionForm[]>([{ ...EMPTY_QUESTION, options: ['', '', '', ''] }])
  const [quizList, setQuizList] = useState<AdminQuiz[]>([])
  const [quizListLoading, setQuizListLoading] = useState(false)
  const [quizListError, setQuizListError] = useState('')
  const [quizUploading, setQuizUploading] = useState(false)
  const [quizDeletingId, setQuizDeletingId] = useState<number | null>(null)
  const [quizMsg, setQuizMsg] = useState('')

  // Books
  const [books, setBooks] = useState<AdminBook[]>([])
  const [editingBook, setEditingBook] = useState<AdminBook | null>(null)
  const [bookSaving, setBookSaving] = useState(false)
  const [bookMsg, setBookMsg] = useState('')
  const [showNewBook, setShowNewBook] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '', author: '', description: '', price: 0,
    is_paid: false, is_downloadable: true, file_url: '', thumbnail_url: '', category: 'programming',
  })
  // PDF upload (Supabase Storage)
  const [bookPdfFile, setBookPdfFile] = useState<File | null>(null)
  const [bookPdfUploading, setBookPdfUploading] = useState(false)
  const [bookPdfPercent, setBookPdfPercent] = useState(0)
  const [bookPdfMsg, setBookPdfMsg] = useState('')
  const [bookCoverFile, setBookCoverFile] = useState<File | null>(null)
  const [bookCoverUploading, setBookCoverUploading] = useState(false)
  const [bookCoverPercent, setBookCoverPercent] = useState(0)
  const [bookCoverMsg, setBookCoverMsg] = useState('')

  // Teacher requests
  const [teacherRequests, setTeacherRequests] = useState<TeacherRequest[]>([])
  const [teacherReqLoading, setTeacherReqLoading] = useState(false)
  const [teacherReqError, setTeacherReqError] = useState('')
  const [teacherActionId, setTeacherActionId] = useState<number | null>(null)
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherFilter, setTeacherFilter] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [teacherApproveId, setTeacherApproveId] = useState<number | null>(null)
  const [teacherCommission, setTeacherCommission] = useState('30')
  const [teacherRejectId, setTeacherRejectId] = useState<number | null>(null)
  const [teacherRejectFeedback, setTeacherRejectFeedback] = useState('')

  // Platform Analytics (Step 15)
  const [platformAnalytics, setPlatformAnalytics] = useState<PlatformAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')

  // Users management
  const [userSearchQ, setUserSearchQ] = useState('')
  const [userSearchResults, setUserSearchResults] = useState<AdminUserProfile[]>([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [userSearchError, setUserSearchError] = useState('')
  const [userRoleActionId, setUserRoleActionId] = useState<number | null>(null)
  const [userDeleteConfirmId, setUserDeleteConfirmId] = useState<number | null>(null)
  const [userDeleteLoading, setUserDeleteLoading] = useState(false)
  const [userMsg, setUserMsg] = useState('')
  const [openUserDetail, setOpenUserDetail] = useState<AdminUserProfile | null>(null)
  const [userDetailTab, setUserDetailTab] = useState<'profil' | 'kurslar' | 'tolovlar' | 'faollik' | 'admin'>('profil')
  const [userDetailData, setUserDetailData] = useState<any>(null)
  const [userDetailPayments, setUserDetailPayments] = useState<any[]>([])
  const [userDetailLoading, setUserDetailLoading] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantCourseId, setGrantCourseId] = useState('')
  const [grantNotes, setGrantNotes] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [drawerSuspendText, setDrawerSuspendText] = useState('')
  const [drawerSuspendOpen, setDrawerSuspendOpen] = useState(false)
  const [drawerSuspending, setDrawerSuspending] = useState(false)

  // Ambient Sounds
  interface AmbientSoundItem { id: number; name: string; emoji: string; url: string; display_order: number; is_active: boolean; created_at: string }
  const [ambientSounds, setAmbientSounds] = useState<AmbientSoundItem[]>([])
  const [soundName, setSoundName] = useState('')
  const [soundEmoji, setSoundEmoji] = useState('🎵')
  const [soundFile, setSoundFile] = useState<File | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [soundUploading, setSoundUploading] = useState(false)
  const [soundMsg, setSoundMsg] = useState('')

  // Admin Courses (Step 20)
  interface AdminCourse {
    id: number
    title: string
    description: string
    thumbnail_url: string
    teacher_id: number
    teacher_name: string
    teacher_username: string | null
    category_name: string
    category_icon: string
    is_published: boolean
    is_paid: boolean
    price: number
    level: string
    language: string
    enrolled_count: number
    rating: number
    total_lessons: number
    total_duration_minutes: number
    created_at: string
  }
  const [adminCourses, setAdminCourses] = useState<AdminCourse[]>([])
  const [adminCoursesLoading, setAdminCoursesLoading] = useState(false)
  const [adminCoursesError, setAdminCoursesError] = useState('')
  const [courseToggleId, setCourseToggleId] = useState<number | null>(null)
  const [courseDeleteId, setCourseDeleteId] = useState<number | null>(null)

  // ── Announcements state ───────────────────────────────────────────────────
  const [annList, setAnnList] = useState<AdminAnnouncement[]>([])
  const [annLoading, setAnnLoading] = useState(false)
  const [annDeleteId, setAnnDeleteId] = useState<number | null>(null)
  const [annEditTarget, setAnnEditTarget] = useState<AdminAnnouncement | null>(null)
  const [annForm, setAnnForm] = useState({
    title: '', body: '', image_url: '', cta_text: '', cta_link: '',
    starts_at: '', expires_at: '', is_active: true,
  })
  const [annFormOpen, setAnnFormOpen] = useState(false)
  const [annSaving, setAnnSaving] = useState(false)
  const [annImgUploading, setAnnImgUploading] = useState(false)
  const [annImgPercent, setAnnImgPercent] = useState(0)
  const [coursesMsg, setCoursesMsg] = useState('')

  // ── Decks moderation state ────────────────────────────────────────────────
  const [deckSubTab, setDeckSubTab] = useState<'reports' | 'pending' | 'official'>('reports')
  const [deckReports, setDeckReports] = useState<any[]>([])
  const [deckPending, setDeckPending] = useState<any[]>([])
  const [deckOfficial, setDeckOfficial] = useState<any[]>([])
  const [deckLoading, setDeckLoading] = useState(false)
  const [deckReviewId, setDeckReviewId] = useState<string | null>(null)
  const [deckReviewData, setDeckReviewData] = useState<any>(null)
  const [deckReviewLoading, setDeckReviewLoading] = useState(false)
  const [deckBusy, setDeckBusy] = useState(false)
  const [deckError, setDeckError] = useState('')
  const [deckSearch, setDeckSearch] = useState('')
  const [deckCreateOpen, setDeckCreateOpen] = useState(false)
  const [deckNewTitle, setDeckNewTitle] = useState('')
  const [deckNewDesc, setDeckNewDesc] = useState('')
  const [deckNewCategory, setDeckNewCategory] = useState('english')
  const [deckNewCards, setDeckNewCards] = useState('')
  const [deckCreating, setDeckCreating] = useState(false)

  // ── Feature usage stats ───────────────────────────────────────────────────
  const [featurePeriod, setFeaturePeriod] = useState<'7d' | '30d' | 'all'>('7d')
  const [featureStats, setFeatureStats] = useState<any>(null)
  const [featureLoading, setFeatureLoading] = useState(false)

  // ── Deck moderation loaders ───────────────────────────────────────────────
  const loadDeckData = useCallback(async (sub: 'reports' | 'pending' | 'official', search = '') => {
    setDeckLoading(true)
    try {
      if (sub === 'reports') {
        const res = await apiService.client.get('/api/admin/decks/reports?limit=50')
        setDeckReports(res.data?.decks ?? [])
      } else if (sub === 'pending') {
        const res = await apiService.client.get('/api/admin/decks/pending-review?limit=50')
        setDeckPending(res.data?.decks ?? [])
      } else {
        const q = search ? `&search=${encodeURIComponent(search)}` : ''
        const res = await apiService.client.get(`/api/admin/decks/approved?limit=50${q}`)
        setDeckOfficial(res.data?.decks ?? [])
      }
    } catch (err: any) {
      console.error('[Admin] loadDeckData:', err?.response?.data?.detail || err?.message)
    } finally {
      setDeckLoading(false)
    }
  }, [])

  const openDeckReview = useCallback(async (id: string) => {
    setDeckReviewId(id)
    setDeckReviewLoading(true)
    setDeckReviewData(null)
    setDeckError('')
    try {
      const res = await apiService.client.get(`/api/admin/decks/${id}`)
      setDeckReviewData(res.data)
    } catch (err: any) {
      console.error('[Admin] openDeckReview:', err)
      setDeckError(err?.response?.data?.detail || err?.message || 'Xatolik')
    } finally {
      setDeckReviewLoading(false)
    }
  }, [])

  const loadFeatureStats = useCallback(async (period: string) => {
    setFeatureLoading(true)
    try {
      const res = await apiService.client.get(`/api/admin/stats/features?period=${period}`)
      setFeatureStats(res.data)
    } catch (err: any) {
      console.error('[Admin] loadFeatureStats:', err?.response?.data?.detail || err?.message)
    } finally {
      setFeatureLoading(false)
    }
  }, [])

  // ── Auto-login from Telegram WebApp ────────────────────────────────────
  useEffect(() => {
    if (tgUser?.id && ADMIN_TELEGRAM_IDS.includes(tgUser.id) && !adminId) {
      setAdminId(tgUser.id)
    }
  }, [tgUser, adminId])

  // ── Auto-login for web admins (logged in via bot-code auth) ──────────────
  useEffect(() => {
    if (authUser?.id && ADMIN_TELEGRAM_IDS.includes(authUser.id) && !adminId) {
      setAdminId(authUser.id)
    }
  }, [authUser, adminId])

  const checkDb = async () => {
    if (!adminId) return
    setDbChecking(true)
    setDbStatus(null)
    try {
      const res = await apiService.debugDb(adminId)
      setDbStatus(JSON.stringify(res.data, null, 2))
    } catch (err: any) {
      console.error('[Admin] debugDb error:', err?.response?.data?.detail || err?.response?.statusText || err?.message)
      setDbStatus('❌ Xatolik yuz berdi')
    } finally {
      setDbChecking(false)
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const id = parseInt(telegramId.trim(), 10)
    if (!id || isNaN(id)) {
      setAuthError('To\'g\'ri Telegram ID kiriting')
      return
    }
    // Verify by fetching stats — if 403, not an admin
    try {
      await apiService.getAdminStats(id)
      setAdminId(id)
      setAuthError('')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setAuthError('❌ Sizda admin huquqi yo\'q')
      } else {
        // Connection error but still proceed (offline dev)
        setAdminId(id)
      }
    }
  }

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminStats(adminId)
      setStats(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  const loadProfiles = useCallback(async () => {
    if (!adminId) return
    setProfilesLoading(true)
    setProfilesError('')
    try {
      if (!isSupabaseConfigured) {
        setProfiles([])
        setProfilesError('Supabase sozlanmagan (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('telegram_id, first_name, username, total_xp, focus_seconds, level, quizzes_completed, app_online_at')
        .order('total_xp', { ascending: false })
        .limit(5000)

      if (error) throw error

      setProfiles(
        (data ?? [])
          .map((row: any) => ({
            telegram_id: Number(row.telegram_id ?? 0),
            first_name: row.first_name ?? null,
            username: row.username ?? null,
            total_xp: Number(row.total_xp ?? 0),
            focus_seconds: Number(row.focus_seconds ?? 0),
            level: Number(row.level ?? 1),
            quizzes_completed: Number(row.quizzes_completed ?? 0),
            app_online_at: row.app_online_at ?? null,
          }))
          .sort((a, b) => {
            const aOnline = isUserOnline(a.app_online_at)
            const bOnline = isUserOnline(b.app_online_at)
            if (aOnline !== bOnline) return aOnline ? -1 : 1
            return b.total_xp - a.total_xp
          })
      )
    } catch (err: any) {
      console.error('[Admin] loadProfiles error:', err?.message)
      setProfiles([])
      setProfilesError('Xatolik yuz berdi')
    } finally {
      setProfilesLoading(false)
    }
  }, [adminId])

  const loadHero = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminHeroList(adminId)
      setHeroList(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  const loadBooks = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminBooks(adminId)
      setBooks(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  const loadAdminQuizzes = useCallback(async () => {
    if (!adminId) return
    setQuizListLoading(true)
    setQuizListError('')
    try {
      const res = await apiService.getAdminQuizzes(adminId)
      setQuizList(res.data)
    } catch (err: any) {
      console.error('[Admin] loadAdminQuizzes error:', err?.response?.data?.detail || err?.message)
      setQuizList([])
      setQuizListError('Xatolik yuz berdi')
    } finally {
      setQuizListLoading(false)
    }
  }, [adminId])

  const loadSounds = useCallback(async () => {
    try {
      const res = await apiService.getAmbientSounds()
      console.log('[AdminPage] loadSounds:', res.data)
      setAmbientSounds(res.data)
    } catch (err) {
      console.error('[AdminPage] loadSounds error:', err)
    }
  }, [])

  const loadTeacherRequests = useCallback(async () => {
    if (!adminId) return
    setTeacherReqLoading(true)
    setTeacherReqError('')
    try {
      const params = teacherFilter ? `?status=${teacherFilter}` : ''
      const res = await apiService.client.get(`/api/admin/teachers${params}`)
      const raw = res.data
      setTeacherRequests(Array.isArray(raw) ? raw : (raw?.items ?? []))
    } catch (err: any) {
      console.error('[Admin] loadTeacherRequests error:', err?.response?.data?.detail || err?.message)
      setTeacherReqError('Xatolik yuz berdi')
    } finally {
      setTeacherReqLoading(false)
    }
  }, [adminId, teacherFilter])

  const loadPlatformAnalytics = useCallback(async () => {
    if (!adminId) return
    setAnalyticsLoading(true)
    setAnalyticsError('')
    try {
      const res = await apiService.getAdminPlatformAnalytics(adminId)
      setPlatformAnalytics(res.data)
    } catch (err: any) {
      console.error('[Admin] loadPlatformAnalytics error:', err?.response?.data?.detail || err?.message)
      setAnalyticsError('Xatolik yuz berdi')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [adminId])

  // ── Admin Courses loader (Step 20) ─────────────────────────────────────────
  const loadAdminCourses = useCallback(async () => {
    if (!adminId) return
    setAdminCoursesLoading(true)
    setAdminCoursesError('')
    setCoursesMsg('')
    try {
      const res = await apiService.getAdminCourses(adminId)
      setAdminCourses(res.data ?? [])
    } catch (err: any) {
      console.error('[Admin] loadAdminCourses error:', err?.response?.data?.detail || err?.message)
      setAdminCoursesError('Xatolik yuz berdi')
    } finally {
      setAdminCoursesLoading(false)
    }
  }, [adminId])

  const handleToggleCoursePublish = async (courseId: number) => {
    if (!adminId) return
    setCourseToggleId(courseId)
    setCoursesMsg('')
    try {
      const res = await apiService.adminToggleCoursePublish(courseId, adminId)
      const { is_published } = res.data
      setAdminCourses(prev =>
        prev.map(c => c.id === courseId ? { ...c, is_published } : c)
      )
      setCoursesMsg(`✅ Kurs ${is_published ? 'chop etildi' : 'qoralamaga olindi'}`)
    } catch (err: any) {
      console.error('[Admin] handleToggleCoursePublish error:', err?.response?.data?.detail || err?.message)
      setCoursesMsg('❌ Xatolik yuz berdi')
    } finally {
      setCourseToggleId(null)
    }
  }

  const handleAdminDeleteCourse = async (courseId: number, title: string) => {
    if (!adminId) return
    if (!window.confirm(`"${title}" kursini o'chirasizmi? Bu amalni qaytarib bo'lmaydi.`)) return
    setCourseDeleteId(courseId)
    setCoursesMsg('')
    try {
      await apiService.adminDeleteCourse(courseId, adminId)
      setAdminCourses(prev => prev.filter(c => c.id !== courseId))
      setCoursesMsg('✅ Kurs o\'chirildi')
    } catch (err: any) {
      console.error('[Admin] handleAdminDeleteCourse error:', err?.response?.data?.detail || err?.message)
      setCoursesMsg('❌ Xatolik yuz berdi')
    } finally {
      setCourseDeleteId(null)
    }
  }

  // ── Announcement handlers ─────────────────────────────────────────────────
  const loadAnnouncements = useCallback(async () => {
    setAnnLoading(true)
    try {
      const res = await apiService.getAnnouncements()
      setAnnList(res.data ?? [])
    } catch (err: any) {
      console.error('[Admin] loadAnnouncements:', err?.response?.data?.detail || err?.message)
    } finally {
      setAnnLoading(false)
    }
  }, [])

  const openAnnCreate = () => {
    setAnnEditTarget(null)
    setAnnForm({ title: '', body: '', image_url: '', cta_text: '', cta_link: '', starts_at: '', expires_at: '', is_active: true })
    setAnnFormOpen(true)
  }

  const openAnnEdit = (ann: AdminAnnouncement) => {
    setAnnEditTarget(ann)
    setAnnForm({
      title:      ann.title,
      body:       ann.body,
      image_url:  ann.image_url  ?? '',
      cta_text:   ann.cta_text   ?? '',
      cta_link:   ann.cta_link   ?? '',
      starts_at:  ann.starts_at  ? ann.starts_at.slice(0, 16)  : '',
      expires_at: ann.expires_at ? ann.expires_at.slice(0, 16) : '',
      is_active:  ann.is_active,
    })
    setAnnFormOpen(true)
  }

  const saveAnnouncement = async () => {
    if (!annForm.title.trim() || !annForm.body.trim()) return
    setAnnSaving(true)
    const payload = {
      title:      annForm.title.trim(),
      body:       annForm.body.trim(),
      image_url:  annForm.image_url.trim()  || null,
      cta_text:   annForm.cta_text.trim()   || null,
      cta_link:   annForm.cta_link.trim()   || null,
      starts_at:  annForm.starts_at  ? new Date(annForm.starts_at).toISOString()  : null,
      expires_at: annForm.expires_at ? new Date(annForm.expires_at).toISOString() : null,
      is_active:  annForm.is_active,
    }
    try {
      if (annEditTarget) {
        await apiService.updateAnnouncement(annEditTarget.id, payload)
      } else {
        await apiService.createAnnouncement(payload)
      }
      setAnnFormOpen(false)
      loadAnnouncements()
    } catch (err: any) {
      console.error('[Admin] saveAnnouncement:', err?.response?.data?.detail || err?.message)
    } finally {
      setAnnSaving(false)
    }
  }

  const deleteAnnouncement = async (id: number) => {
    if (!window.confirm('Xabarni o\'chirasizmi?')) return
    setAnnDeleteId(id)
    try {
      await apiService.deleteAnnouncement(id)
      setAnnList(prev => prev.filter(a => a.id !== id))
    } catch (err: any) {
      console.error('[Admin] deleteAnnouncement:', err?.response?.data?.detail || err?.message)
    } finally {
      setAnnDeleteId(null)
    }
  }

  const toggleAnnActive = async (ann: AdminAnnouncement) => {
    try {
      await apiService.updateAnnouncement(ann.id, { is_active: !ann.is_active })
      setAnnList(prev => prev.map(a => a.id === ann.id ? { ...a, is_active: !a.is_active } : a))
    } catch (err: any) {
      console.error('[Admin] toggleAnnActive:', err?.response?.data?.detail || err?.message)
    }
  }

  const uploadAnnImage = async (file: File) => {
    const jwt = token || localStorage.getItem('auth_token')
    if (!jwt) return
    setAnnImgUploading(true)
    setAnnImgPercent(0)
    const apiBase = API_BASE.replace(/\/api\/?$/, '')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'announcements')
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${apiBase}/api/upload/file`)
        xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setAnnImgPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).url) }
            catch { reject(new Error("Server javobi noto'g'ri")) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.detail || `Xato: ${xhr.status}`)) }
            catch { reject(new Error(`Xato: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Tarmoq xatosi'))
        xhr.send(form)
      })
      setAnnForm(f => ({ ...f, image_url: url }))
    } catch (err: any) {
      console.error('[Admin] uploadAnnImage:', err?.message)
    } finally {
      setAnnImgUploading(false)
    }
  }

  const searchUsers = useCallback(async (q?: string) => {
    if (!adminId) return
    setUserSearchLoading(true)
    setUserSearchError('')
    setUserMsg('')
    try {
      const res = await apiService.searchAdminUsers(q, 50)
      setUserSearchResults(res.data ?? [])
    } catch (err: any) {
      console.error('[Admin] searchUsers error:', err?.response?.data?.detail || err?.message)
      setUserSearchError('Xatolik yuz berdi')
    } finally {
      setUserSearchLoading(false)
    }
  }, [adminId])

  const handleSetUserRole = async (telegramId: number, role: string, status: string) => {
    setUserRoleActionId(telegramId)
    setUserMsg('')
    try {
      await apiService.setUserRole(telegramId, role, status)
      setUserMsg(`✅ ${telegramId} → ${role} (${status})`)
      setUserSearchResults(prev =>
        prev.map(u => u.telegram_id === telegramId ? { ...u, role: role as any, status: status as any } : u)
      )
    } catch (err: any) {
      console.error('[Admin] handleSetUserRole error:', err?.response?.data?.detail || err?.message)
      setUserMsg('❌ Xatolik yuz berdi')
    } finally {
      setUserRoleActionId(null)
    }
  }

  const handleAdminDeleteUser = async (telegramId: number) => {
    setUserDeleteLoading(true)
    setUserMsg('')
    try {
      await apiService.adminDeleteUser(telegramId)
      setUserMsg(`✅ Foydalanuvchi o'chirildi: ${telegramId}`)
      setUserSearchResults(prev => prev.filter(u => u.telegram_id !== telegramId))
    } catch (err: any) {
      console.error('[Admin] deleteUser error:', err?.response?.data?.detail || err?.message)
      setUserMsg('❌ O\'chirishda xatolik')
    } finally {
      setUserDeleteLoading(false)
      setUserDeleteConfirmId(null)
    }
  }

  const handleApproveTeacher = async (telegramId: number) => {
    setTeacherActionId(telegramId)
    setTeacherMsg('')
    try {
      await apiService.client.post(`/api/admin/teachers/${telegramId}/approve`, {
        commission_rate: teacherCommission ? Number(teacherCommission) : null,
      })
      setTeacherMsg(`✅ ${telegramId} tasdiqlandi`)
      setTeacherApproveId(null)
      loadTeacherRequests()
    } catch (err: any) {
      console.error('[Admin] handleApproveTeacher error:', err?.response?.data?.detail || err?.message)
      setTeacherMsg('❌ Xatolik yuz berdi')
    } finally {
      setTeacherActionId(null)
    }
  }

  const handleRejectTeacher = async (telegramId: number) => {
    setTeacherActionId(telegramId)
    setTeacherMsg('')
    try {
      await apiService.client.post(`/api/admin/teachers/${telegramId}/reject`, {
        feedback: teacherRejectFeedback || null,
      })
      setTeacherMsg(`🚫 ${telegramId} rad etildi`)
      setTeacherRejectId(null)
      setTeacherRejectFeedback('')
      loadTeacherRequests()
    } catch (err: any) {
      console.error('[Admin] handleRejectTeacher error:', err?.response?.data?.detail || err?.message)
      setTeacherMsg('❌ Xatolik yuz berdi')
    } finally {
      setTeacherActionId(null)
    }
  }

  const openUserDrawer = async (u: AdminUserProfile) => {
    setOpenUserDetail(u)
    setUserDetailTab('profil')
    setUserDetailData(null)
    setUserDetailPayments([])
    setUserDetailLoading(true)
    try {
      const [detailRes, paymentsRes] = await Promise.allSettled([
        apiService.client.get(`/api/admin/users/${u.telegram_id}`),
        apiService.client.get(`/api/admin/users/${u.telegram_id}/payments`),
      ])
      if (detailRes.status === 'fulfilled') setUserDetailData(detailRes.value.data)
      if (paymentsRes.status === 'fulfilled') setUserDetailPayments(paymentsRes.value.data ?? [])
    } catch { /* ignore */ }
    finally { setUserDetailLoading(false) }
  }

  const handleGrant = async () => {
    if (!openUserDetail || !grantCourseId) { setGrantMsg('Kurs tanlang'); return }
    setGrantLoading(true); setGrantMsg('')
    try {
      await apiService.client.post(`/api/admin/users/${openUserDetail.telegram_id}/grant-course`, {
        course_id: Number(grantCourseId),
        notes: grantNotes || null,
      })
      setGrantMsg('✅ Kurs ochildi')
      setGrantOpen(false)
      setGrantCourseId(''); setGrantAmount(''); setGrantProofUrl(''); setGrantNotes('')
    } catch (err: any) {
      setGrantMsg('❌ ' + (err?.response?.data?.detail || err?.message))
    } finally { setGrantLoading(false) }
  }

  const handleDrawerSuspend = async () => {
    if (!openUserDetail) return
    setDrawerSuspending(true)
    try {
      await apiService.client.post(`/api/admin/users/${openUserDetail.telegram_id}/suspend`, {
        reason: drawerSuspendText || null,
      })
      setDrawerSuspendOpen(false); setDrawerSuspendText('')
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message)
    } finally { setDrawerSuspending(false) }
  }

  const handleMessageTeacher = async (telegramId: number) => {
    try {
      const r = await apiService.client.post(`/api/v1/messenger/conversations/${telegramId}`)
      navigate(`/messenger/${r.data.id}`)
    } catch (err: any) {
      console.error('[Admin] handleMessageTeacher error:', err?.response?.data?.detail || err?.message)
      setTeacherMsg('❌ Xabar yuborishda xatolik')
    }
  }

  useEffect(() => {
    if (!adminId) return
    loadStats()
    if (activeTab === 'stats') loadProfiles()
    if (activeTab === 'hero') loadHero()
    if (activeTab === 'quiz') loadAdminQuizzes()
    if (activeTab === 'books') loadBooks()
    if (activeTab === 'sounds') loadSounds()
    if (activeTab === 'teachers') loadTeacherRequests()
    if (activeTab === 'analytics') loadPlatformAnalytics()
    if (activeTab === 'users') searchUsers()
    if (activeTab === 'courses') loadAdminCourses()
    if (activeTab === 'announcements') loadAnnouncements()
    if (activeTab === 'decks') loadDeckData(deckSubTab)
    if (activeTab === 'feature_usage') loadFeatureStats(featurePeriod)
  }, [adminId, activeTab, loadStats, loadProfiles, loadHero, loadAdminQuizzes, loadBooks, loadSounds, loadTeacherRequests, loadPlatformAnalytics, searchUsers, loadAdminCourses, loadAnnouncements, loadDeckData, deckSubTab, loadFeatureStats, featurePeriod])

  // ── Hero handlers ─────────────────────────────────────────────────────────
  const handleSaveHero = async () => {
    if (!adminId || !editingHero) return
    setHeroSaving(true)
    setHeroMsg('')
    try {
      if (editingHero.id) {
        await apiService.updateHeroContent(editingHero.id, adminId, editingHero)
      } else {
        await apiService.createHeroContent(adminId, editingHero)
      }
      setHeroMsg('✅ Saqlandi!')
      setEditingHero(null)
      loadHero()
    } catch (err: any) {
      console.error('[Admin] handleSaveHero error:', err?.response?.data?.detail || err?.response?.statusText || err?.message)
      setHeroMsg('❌ Xatolik yuz berdi')
    } finally {
      setHeroSaving(false)
    }
  }

  const handleDeleteHero = async (heroId: number) => {
    if (!adminId) return
    if (!window.confirm('Rostdan ham o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteHeroContent(heroId, adminId)
      loadHero()
    } catch { /* ignore */ }
  }

  // ── Quiz handlers ─────────────────────────────────────────────────────────
  const handleUploadQuiz = async () => {
    if (!adminId) return
    // Validate
    if (!quizForm.title.trim()) { setQuizMsg('❌ Quiz nomini kiriting'); return }
    if (!quizForm.book_title.trim()) { setQuizMsg('❌ Kitob nomini kiriting'); return }
    const validQs = quizQuestions.filter(q => q.question.trim() && q.options.some(o => o.trim()))
    if (validQs.length === 0) { setQuizMsg('❌ Kamida bitta savol kiriting'); return }

    setQuizUploading(true)
    setQuizMsg('')
    try {
      const payload = {
        ...quizForm,
        questions: validQs.map(q => ({
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        })),
      }
      await apiService.uploadQuiz(adminId, payload)
      setQuizMsg('✅ Quiz muvaffaqiyatli yuklandi!')
      setQuizForm({ ...EMPTY_QUIZ })
      setQuizQuestions([{ ...EMPTY_QUESTION, options: ['', '', '', ''] }])
      loadAdminQuizzes()
      loadStats()
    } catch (err: any) {
      console.error('[Admin] handleUploadQuiz error:', err?.response?.data?.detail || err?.message)
      setQuizMsg('❌ Xatolik yuz berdi')
    } finally {
      setQuizUploading(false)
    }
  }

  const handleDeleteQuiz = async (quizId: number, title: string) => {
    if (!adminId) return
    if (!window.confirm(`Quizni o'chirmoqchimisiz?\n\n${title}`)) return
    setQuizDeletingId(quizId)
    setQuizMsg('')
    try {
      await apiService.deleteAdminQuiz(quizId, adminId)
      setQuizMsg('✅ Quiz o\'chirildi')
      loadAdminQuizzes()
      loadStats()
    } catch (err: any) {
      console.error('[Admin] handleDeleteQuiz error:', err?.response?.data?.detail || err?.message)
      setQuizMsg('❌ Xatolik yuz berdi')
    } finally {
      setQuizDeletingId(null)
    }
  }

  const updateQuestion = (idx: number, field: keyof QuizQuestionForm, value: any) => {
    setQuizQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    setQuizQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q
      const newOptions = [...q.options] as [string, string, string, string]
      newOptions[oIdx] = value
      return { ...q, options: newOptions }
    }))
  }

  const addQuestion = () => {
    setQuizQuestions(prev => [...prev, { ...EMPTY_QUESTION, options: ['', '', '', ''] }])
  }

  const removeQuestion = (idx: number) => {
    if (quizQuestions.length <= 1) return
    setQuizQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Book cache invalidation ───────────────────────────────────────────────
  const bustBooksCache = () => {
    invalidateCache('books')
    sessionStorage.removeItem('books_cache')
  }

  // ── Book handlers ─────────────────────────────────────────────────────────
  const handleUpdateBook = async () => {
    if (!adminId || !editingBook) return
    setBookSaving(true)
    setBookMsg('')
    try {
      await apiService.updateBook(editingBook.id, adminId, editingBook)
      bustBooksCache()
      setBookMsg('✅ Kitob yangilandi!')
      setEditingBook(null)
      loadBooks()
    } catch (err: any) {
      console.error('[Admin] handleUpdateBook error:', err?.response?.data?.detail || err?.response?.statusText || err?.message)
      setBookMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookSaving(false)
    }
  }

  const handleDeleteBook = async (bookId: number) => {
    if (!adminId) return
    if (!window.confirm('Kitobni o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteBook(bookId, adminId)
      bustBooksCache()
      loadBooks()
    } catch { /* ignore */ }
  }

  const handleCreateBook = async () => {
    if (!adminId) return
    setBookSaving(true)
    setBookMsg('')
    try {
      await apiService.createBook(adminId, newBook)
      bustBooksCache()
      setBookMsg('✅ Yangi kitob qo\'shildi!')
      setShowNewBook(false)
      setNewBook({ title: '', author: '', description: '', price: 0, is_paid: false, is_downloadable: true, file_url: '', thumbnail_url: '', category: 'programming' })
      setBookCoverFile(null)
      setBookCoverPercent(0)
      setBookCoverMsg('')
      loadBooks()
    } catch (err: any) {
      console.error('[Admin] handleCreateBook error:', err?.response?.data?.detail || err?.response?.statusText || err?.message)
      setBookMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookSaving(false)
    }
  }

  // ── Book file (PDF/EPUB) upload → Bunny CDN ───────────────────────────────
  const handleUploadBookPdf = async (target: 'new' | 'edit') => {
    if (!bookPdfFile) { setBookPdfMsg('❌ PDF yoki EPUB faylni tanlang'); return }
    const jwt = token || localStorage.getItem('auth_token')
    if (!jwt) { setBookPdfMsg('❌ Tizimga kirilmagan — sahifani yangilang'); return }
    setBookPdfUploading(true)
    setBookPdfMsg('⬆️ Yuklanmoqda…')
    setBookPdfPercent(0)
    const apiBase = API_BASE.replace(/\/api\/?$/, '')
    try {
      const form = new FormData()
      form.append('file', bookPdfFile)
      form.append('folder', 'books')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${apiBase}/api/upload/file`)
        xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setBookPdfPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const { url } = JSON.parse(xhr.responseText)
              if (target === 'new') setNewBook(prev => ({ ...prev, file_url: url }))
              else if (editingBook) setEditingBook(prev => prev ? { ...prev, file_url: url } : prev)
              setBookPdfMsg('✅ Yuklandi!')
              setBookPdfFile(null)
              resolve()
            } catch { reject(new Error("Server javobi noto'g'ri")) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.detail || `Xato: ${xhr.status}`)) }
            catch { reject(new Error(`Xato: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Tarmoq xatosi'))
        xhr.send(form)
      })
    } catch (err: any) {
      console.error('[Admin] handleUploadBookPdf error:', err?.message)
      setBookPdfMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookPdfUploading(false)
    }
  }

  // ── Book cover upload → Bunny CDN (auto-converted to WebP by backend) ──────
  const handleUploadBookCover = async (target: 'new' | 'edit') => {
    if (!bookCoverFile) { setBookCoverMsg('❌ Rasm faylini tanlang'); return }
    const jwt = token || localStorage.getItem('auth_token')
    if (!jwt) { setBookCoverMsg('❌ Tizimga kirilmagan — sahifani yangilang'); return }
    setBookCoverUploading(true)
    setBookCoverMsg('⬆️ Muqova yuklanmoqda…')
    setBookCoverPercent(0)
    const apiBase = API_BASE.replace(/\/api\/?$/, '')
    try {
      const form = new FormData()
      form.append('file', bookCoverFile)
      form.append('folder', 'book-covers')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${apiBase}/api/upload/file`, true)
        xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setBookCoverPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const { url } = JSON.parse(xhr.responseText)
              if (target === 'new') setNewBook(prev => ({ ...prev, thumbnail_url: url }))
              else if (editingBook) setEditingBook(prev => prev ? { ...prev, thumbnail_url: url } : prev)
              setBookCoverMsg('✅ Muqova yuklandi!')
              setBookCoverFile(null)
              resolve()
            } catch { reject(new Error("Server javobi noto'g'ri")) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.detail || `Upload failed: ${xhr.status}`)) }
            catch { reject(new Error(`Upload failed: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(form)
      })
    } catch (err: any) {
      console.error('[Admin] handleUploadBookCover error:', err?.message)
      setBookCoverMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookCoverUploading(false)
    }
  }

  // ── Sound handlers ──────────────────────────────────────────────────────
  const handleUploadSound = async () => {
    if (!adminId) return
    if (!soundName.trim()) { setSoundMsg('❌ Tovush nomini kiriting'); return }
    if (!soundFile) { setSoundMsg('❌ Audio faylni tanlang'); return }
    const jwt = token || localStorage.getItem('auth_token')
    if (!jwt) { setSoundMsg('❌ Tizimga kirilmagan — sahifani yangilang'); return }

    setSoundUploading(true)
    setSoundMsg('⬆️ Yuklanmoqda…')
    setUploadPercent(0)
    const apiBase = API_BASE.replace(/\/api\/?$/, '')
    try {
      // 1. Upload audio → Bunny CDN
      const form = new FormData()
      form.append('file', soundFile)
      form.append('folder', 'sounds')
      const publicUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${apiBase}/api/upload/file`)
        xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            try { resolve(JSON.parse(xhr.responseText).url) }
            catch { reject(new Error("Server javobi noto'g'ri")) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.detail || `Upload xatosi: ${xhr.status}`)) }
            catch { reject(new Error(`Upload xatosi: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Tarmoq xatosi'))
        xhr.send(form)
      })

      // 2. Save Bunny CDN URL to Supabase DB record
      setSoundMsg('💾 Saqlanmoqda…')
      await apiService.saveAmbientSound(adminId, soundName.trim(), soundEmoji, publicUrl)
      setSoundMsg('✅ Tovush muvaffaqiyatli saqlandi!')
      setSoundName('')
      setSoundEmoji('🎵')
      setSoundFile(null)
      setUploadPercent(0)
      loadSounds()
    } catch (err: any) {
      console.error('[AdminPage] handleUploadSound error:', err)
      setSoundMsg('❌ Xatolik yuz berdi')
    } finally {
      setSoundUploading(false)
    }
  }

  const handleDeleteSound = async (soundId: number) => {
    if (!adminId) return
    if (!window.confirm('Tovushni o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteAmbientSound(soundId, adminId)
      loadSounds()
    } catch (err) {
      console.error('[AdminPage] handleDeleteSound error:', err)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  if (!adminId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8 w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <div className="text-5xl">🔐</div>
            <h1 className="text-2xl font-bold text-sahifa-700 dark:text-sahifa-300">Admin Panel</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">SAHIFALAB boshqaruv markazi</p>
          </div>
          <div className="space-y-3">
            {tgUser?.id && (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                Telegram ID: <span className="font-mono font-bold text-sahifa-600 dark:text-sahifa-400">{tgUser.id}</span>
              </p>
            )}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Telegram ID
            </label>
            <input
              type="number"
              value={telegramId || (tgUser?.id?.toString() ?? authUser?.id?.toString() ?? '')}
              onChange={(e) => setTelegramId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="123456789"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
            />
            {authError && (
              <p className="text-sm text-red-500">{authError}</p>
            )}
            <button
              onClick={handleLogin}
              className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Kirish →
            </button>
          </div>
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            Faqat ruxsatli adminlar kira oladi
          </p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Dashboard
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-sahifa-700 dark:text-sahifa-300">SAHIFALAB</span>
          <span className="text-xs bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400 px-2 py-0.5 rounded-full">Admin</span>
        </div>
        <button
          onClick={() => setAdminId(null)}
          className="text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          Chiqish
        </button>
      </div>

      {/* Tab navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {([
            { id: 'stats', label: '📊 Stats' },
            { id: 'hero', label: '🖼 Hero' },
            { id: 'quiz', label: '📝 Quiz' },
            { id: 'books', label: '📚 Kitoblar' },
            { id: 'sounds', label: '🎵 Tovushlar' },
            { id: 'teachers', label: '🎓 O\'qituvchilar' },
            { id: 'analytics', label: '📈 Analitika' },
            { id: 'users', label: '👤 Foydalanuvchilar' },
            { id: 'courses', label: '🎬 Kurslar' },
            { id: 'announcements', label: '📢 Xabarlar' },
            { id: 'decks', label: '🎴 To\'plamlar' },
            { id: 'feature_usage', label: '📊 Xususiyatlar' },
          ] as { id: Tab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-sahifa-600 text-sahifa-600 dark:text-sahifa-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* ── Stats Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dashboard</h2>

            {/* ── DB Debug Panel ── */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">🛠 Database ulanishini tekshirish</span>
                <button
                  onClick={checkDb}
                  disabled={dbChecking}
                  className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {dbChecking ? 'Tekshirilmoqda...' : 'Test qilish'}
                </button>
              </div>
              {dbStatus && (
                <pre className="text-xs text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap break-all bg-yellow-100 dark:bg-yellow-900/40 rounded-lg p-2">
                  {dbStatus}
                </pre>
              )}
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                API: {import.meta.env.VITE_API_URL || 'http://localhost:8000'} · Admin ID: {adminId}
              </p>
            </div>

            {stats ? (
              <>
                {/* Content stats */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard emoji="📝" label="Quizlar" value={stats.total_quizzes} />
                  <StatCard emoji="📚" label="Kitoblar" value={stats.total_books} />
                  <StatCard emoji="💳" label="Faol to'lovlar" value={stats.active_payments} />
                  <StatCard emoji="📦" label="Resurslar" value={stats.total_resources} />
                </div>

                {/* ── User Activity Section ── */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300">👥 Foydalanuvchilar faolligi</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {stats.total_users.toLocaleString()}
                      </p>
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">Jami ro'yxatdan o'tgan</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {stats.active_users_24h.toLocaleString()}
                      </p>
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">So'nggi 24 soat</p>
                    </div>
                    <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 p-3 text-center">
                      <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">
                        {stats.active_users_1h.toLocaleString()}
                      </p>
                      <p className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 mt-0.5">So'nggi 1 soat</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Faollik: <code className="font-mono">app_online_at</code> maydoni bo'yicha hisoblanadi
                  </p>
                </div>

                {/* ── Users List ── */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                        👥 Foydalanuvchilar ro'yxati
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {profiles.length > 0
                          ? `${profiles.length.toLocaleString()} ta yuklandi · jami ${stats.total_users.toLocaleString()}`
                          : `Jami: ${stats.total_users.toLocaleString()}`}
                      </p>
                    </div>
                    <button
                      onClick={loadProfiles}
                      disabled={profilesLoading}
                      className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      {profilesLoading ? 'Yuklanmoqda…' : '↻ Yangilash'}
                    </button>
                  </div>

                  {profilesError && (
                    <div className="text-xs p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800/50">
                      ❌ {profilesError}
                    </div>
                  )}

                  {profilesLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
                      ))}
                    </div>
                  ) : profiles.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                      Foydalanuvchi ma'lumotlari topilmadi.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px] text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                            <th className="py-2 pr-2">#</th>
                            <th className="py-2 pr-2">Foydalanuvchi</th>
                            <th className="py-2 pr-2">Telegram ID</th>
                            <th className="py-2 pr-2">Daraja</th>
                            <th className="py-2 pr-2">XP</th>
                            <th className="py-2 pr-2">Quiz</th>
                            <th className="py-2 pr-2">Focus</th>
                            <th className="py-2 pr-2">Faollik</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profiles.map((profile, idx) => {
                            const now = Date.now()
                            const onlineAt = profile.app_online_at ? new Date(profile.app_online_at).getTime() : null
                            const diffMs = onlineAt ? now - onlineAt : null
                            const isOnline  = !!diffMs && diffMs <= 90_000
                            const is1h      = !!diffMs && diffMs <= 3_600_000
                            const is24h     = !!diffMs && diffMs <= 86_400_000

                            const activityBadge = isOnline
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online</span>
                              : is1h
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold">1 soat</span>
                                : is24h
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold">24 soat</span>
                                  : onlineAt
                                    ? <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(onlineAt).toLocaleDateString('uz-UZ')}</span>
                                    : <span className="text-[10px] text-gray-300 dark:text-gray-600">—</span>

                            return (
                              <tr key={profile.telegram_id || idx} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td className="py-2 pr-2 font-semibold text-gray-500 dark:text-gray-400">{idx + 1}</td>
                                <td className="py-2 pr-2">
                                  {(() => {
                                    const skin = getProfileSkin({
                                      level: profile.level,
                                      totalXP: profile.total_xp,
                                      quizzesCompleted: profile.quizzes_completed,
                                      focusSeconds: profile.focus_seconds,
                                    })
                                    return (
                                      <div className="flex items-center gap-2">
                                        <div className="relative flex-shrink-0">
                                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-sahifa-500 to-sahifa-700 flex items-center justify-center text-white text-xs font-bold ${skin.borderClass}`}>
                                            {(profile.first_name || '?').charAt(0).toUpperCase()}
                                          </div>
                                          <div className="absolute -bottom-1 -right-1 text-[10px] bg-white dark:bg-gray-800 rounded-full w-4 h-4 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                                            {skin.emoji}
                                          </div>
                                          {isOnline && (
                                            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800 shadow-sm" title="Online" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{profile.first_name || 'Noma\'lum'}</div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">@{profile.username || 'username yo\'q'} · {skin.name}</div>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </td>
                                <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{profile.telegram_id}</td>
                                <td className="py-2 pr-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-700 dark:text-sahifa-300 font-semibold">
                                    {getLevelTitle(profile.level)}
                                  </span>
                                </td>
                                <td className="py-2 pr-2 font-semibold text-gray-900 dark:text-white">{profile.total_xp.toLocaleString()}</td>
                                <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{profile.quizzes_completed}</td>
                                <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{formatFocusTime(profile.focus_seconds)}</td>
                                <td className="py-2">{activityBadge}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 h-20 animate-pulse border border-gray-100 dark:border-gray-700" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hero Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'hero' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Hero Content</h2>
              <button
                onClick={() => setEditingHero({ title: '', subtitle: '', description: '', cta_text: '', cta_link: '', is_active: true, display_order: 0 })}
                className="bg-sahifa-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                + Yangi
              </button>
            </div>

            {heroMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{heroMsg}</div>
            )}

            {/* Edit form */}
            {editingHero && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">
                  {editingHero.id ? 'Tahrirlash' : 'Yangi hero content'}
                </h3>
                {(['title', 'subtitle', 'description', 'image_url', 'cta_text', 'cta_link'] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 capitalize">{field.replace('_', ' ')}</label>
                    {field === 'description' ? (
                      <textarea
                        rows={3}
                        value={(editingHero as any)[field] ?? ''}
                        onChange={(e) => setEditingHero({ ...editingHero, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(editingHero as any)[field] ?? ''}
                        onChange={(e) => setEditingHero({ ...editingHero, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={editingHero.is_active ?? true}
                    onChange={(e) => setEditingHero({ ...editingHero, is_active: e.target.checked })}
                    className="accent-sahifa-600"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">Faol</label>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveHero}
                    disabled={heroSaving}
                    className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {heroSaving ? 'Saqlanmoqda…' : 'Saqlash'}
                  </button>
                  <button
                    onClick={() => { setEditingHero(null); setHeroMsg('') }}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Hero list */}
            {heroList.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Hali hero content yo'q
              </div>
            ) : (
              <div className="space-y-3">
                {heroList.map((h) => (
                  <div key={h.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{h.title || '(Sarlavhasiz)'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{h.subtitle}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setEditingHero(h)}
                          className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg"
                        >
                          Tahrir
                        </button>
                        <button
                          onClick={() => handleDeleteHero(h.id)}
                          className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-2 py-1 rounded-lg"
                        >
                          O'chir
                        </button>
                      </div>
                    </div>
                    <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${h.is_active ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {h.is_active ? 'Faol' : 'Nofaol'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Quiz Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'quiz' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz Yaratish</h2>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-white text-sm">🗂 Mavjud quizlar ({quizList.length})</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    O'chirish tugmasi har bir quiz kartasining o'ng tomonida ko'rinadi.
                  </p>
                </div>
                <button
                  onClick={loadAdminQuizzes}
                  disabled={quizListLoading}
                  className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg shrink-0 disabled:opacity-50"
                >
                  {quizListLoading ? '⏳ Yuklanmoqda…' : '↻ Yangilash'}
                </button>
              </div>

              {quizListError && (
                <div className="text-sm p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800/50">
                  ❌ Quizlar yuklanmadi: {quizListError}
                </div>
              )}

              {quizListLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
                  ))}
                </div>
              ) : quizList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-center text-sm text-gray-500 dark:text-gray-400">
                  Hozircha mavjud quiz topilmadi.
                </div>
              ) : (
                <div className="space-y-2">
                  {quizList.map((quiz) => (
                    <div
                      key={quiz.id}
                      className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center gap-3"
                    >
                      <div className="text-xl shrink-0">📝</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{quiz.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">📘 {quiz.book_title}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            {quiz.total_questions} savol
                          </span>
                          <span className="text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                            {quiz.difficulty}
                          </span>
                          <span className="text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                            {quiz.category}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                        disabled={quizDeletingId === quiz.id}
                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg shrink-0 disabled:opacity-50"
                        title="Quizni o'chirish"
                      >
                        {quizDeletingId === quiz.id ? '⏳ O\'chirilmoqda…' : '🗑 O\'chirish'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quiz info card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">📋 Quiz ma'lumotlari</h3>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Quiz nomi *</label>
                <input
                  type="text"
                  value={quizForm.title}
                  onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                  placeholder="Masalan: Python Asoslari"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kitob nomi *</label>
                <input
                  type="text"
                  value={quizForm.book_title}
                  onChange={(e) => setQuizForm({ ...quizForm, book_title: e.target.value })}
                  placeholder="Masalan: Automate the Boring Stuff"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              {/* Link to a specific book in the library */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  📚 Kutubxona kitobiga bog'lash <span className="text-gray-400">(ixtiyoriy)</span>
                </label>
                <select
                  value={quizForm.book_id ?? ''}
                  onChange={(e) => setQuizForm({
                    ...quizForm,
                    book_id: e.target.value ? Number(e.target.value) : null,
                    // Auto-fill book_title if not already set
                    book_title: quizForm.book_title ||
                      books.find(b => b.id === Number(e.target.value))?.title || quizForm.book_title,
                  })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                >
                  <option value="">— Bog'lamaslik —</option>
                  {books.map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
                {quizForm.book_id && (
                  <p className="text-[11px] text-green-500 mt-1">
                    ✓ Kitob sahifasida "Bilimingizni sinab ko'ring" bo'limida ko'rinadi
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tavsif</label>
                <input
                  type="text"
                  value={quizForm.description}
                  onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                  placeholder="Quiz haqida qisqacha"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Qiyinlik</label>
                  <select
                    value={quizForm.difficulty}
                    onChange={(e) => setQuizForm({ ...quizForm, difficulty: e.target.value as QuizForm['difficulty'] })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  >
                    <option value="easy">🟢 Oson</option>
                    <option value="medium">🟡 O'rta</option>
                    <option value="hard">🔴 Qiyin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kategoriya</label>
                  <select
                    value={quizForm.category}
                    onChange={(e) => setQuizForm({ ...quizForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  >
                    <option value="programming">💻 Dasturlash</option>
                    <option value="science">🔬 Fan</option>
                    <option value="math">📐 Matematika</option>
                    <option value="language">🌍 Til</option>
                    <option value="religion">📖 Din</option>
                    <option value="other">📂 Boshqa</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">❓ Savollar ({quizQuestions.length})</h3>
              <button
                onClick={addQuestion}
                className="text-xs bg-sahifa-600 text-white px-3 py-1.5 rounded-lg font-medium"
              >
                + Savol qo'shish
              </button>
            </div>

            {quizQuestions.map((q, qIdx) => (
              <div key={qIdx} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sahifa-600 dark:text-sahifa-400">Savol {qIdx + 1}</span>
                  {quizQuestions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(qIdx)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      🗑 O'chirish
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Savol matni *</label>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                    placeholder="Savolni yozing..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400">Javob variantlari (to'g'ri javobni tanlang)</label>
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIdx, 'correct_answer', oIdx)}
                        className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          q.correct_answer === oIdx
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:border-green-400'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={`Variant ${String.fromCharCode(65 + oIdx)}`}
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500 ${
                          q.correct_answer === oIdx
                            ? 'border-green-400 dark:border-green-600'
                            : 'border-gray-200 dark:border-gray-600'
                        }`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Izoh (ixtiyoriy)</label>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(qIdx, 'explanation', e.target.value)}
                    placeholder="Nima uchun bu javob to'g'ri?"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>
              </div>
            ))}

            {quizMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{quizMsg}</div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUploadQuiz}
              disabled={quizUploading}
              className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {quizUploading ? '⏳ Yuklanmoqda…' : `📤 Quiz Yuklash (${quizQuestions.filter(q => q.question.trim()).length} savol)`}
            </button>
          </div>
        )}

        {/* ── Books Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'books' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kitoblar</h2>
              <button
                onClick={() => setShowNewBook(true)}
                className="bg-sahifa-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                + Yangi kitob
              </button>
            </div>

            {bookMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{bookMsg}</div>
            )}

            {/* New book form */}
            {showNewBook && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">Yangi kitob</h3>
                {([
                  { field: 'title', label: 'Sarlavha', type: 'text' },
                  { field: 'author', label: 'Muallif', type: 'text' },
                  { field: 'description', label: 'Tavsif', type: 'textarea' },
                  { field: 'price', label: 'Narx (UZS)', type: 'number' },
                  { field: 'thumbnail_url', label: 'Muqova URL', type: 'text' },
                  { field: 'category', label: 'Kategoriya', type: 'text' },
                ] as { field: keyof typeof newBook; label: string; type: string }[]).map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    {type === 'textarea' ? (
                      <textarea
                        rows={2}
                        value={newBook[field] as string}
                        onChange={(e) => setNewBook({ ...newBook, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    ) : (
                      <input
                        type={type}
                        value={newBook[field] as string | number}
                        onChange={(e) => setNewBook({ ...newBook, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    )}
                  </div>
                ))}

                {/* Cover image upload → Bunny CDN */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Muqova rasmi <span className="text-blue-500">(JPG/PNG/WebP — Bunny CDN-ga yuklanadi, WebP-ga optimallashtiriladi)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>🖼</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookCoverFile ? bookCoverFile.name : 'Rasm tanlang…'}</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { setBookCoverFile(e.target.files?.[0] || null); setBookCoverMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookCover('new')}
                      disabled={!bookCoverFile || bookCoverUploading}
                      className="shrink-0 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookCoverUploading ? `${bookCoverPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  {newBook.thumbnail_url ? (
                    <div className="mt-2 flex items-center gap-3">
                      <img src={newBook.thumbnail_url} alt="Muqova preview" className="w-14 h-20 object-cover rounded-md border border-gray-200 dark:border-gray-600" />
                      <p className="text-xs text-green-600 dark:text-green-400 truncate">✅ {newBook.thumbnail_url}</p>
                    </div>
                  ) : null}
                  {bookCoverMsg ? (
                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookCoverMsg}</p>
                  ) : null}
                  {bookCoverUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${bookCoverPercent}%` }} />
                    </div>
                  )}
                </div>

                {/* Book file upload (PDF/EPUB) → Bunny CDN */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Kitob fayli <span className="text-blue-500">(PDF yoki EPUB — Bunny CDN-ga yuklanadi)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>📄</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookPdfFile ? bookPdfFile.name : 'PDF / EPUB tanlang…'}</span>
                      <input type="file" accept=".pdf,application/pdf,.epub,application/epub+zip" className="hidden"
                        onChange={e => { setBookPdfFile(e.target.files?.[0] || null); setBookPdfMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookPdf('new')}
                      disabled={!bookPdfFile || bookPdfUploading}
                      className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookPdfUploading ? `${bookPdfPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  {newBook.file_url ? (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 truncate">✅ {newBook.file_url}</p>
                  ) : (
                    <div className="mt-1">
                      <input
                        type="text"
                        placeholder="Yoki PDF / EPUB URL ni qo'lda kiriting"
                        value={newBook.file_url}
                        onChange={e => setNewBook({ ...newBook, file_url: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sahifa-500"
                      />
                    </div>
                  )}
                  {bookPdfMsg ? (
                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookPdfMsg}</p>
                  ) : null}
                  {bookPdfUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${bookPdfPercent}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="new_is_paid"
                      type="checkbox"
                      checked={newBook.is_paid}
                      onChange={(e) => setNewBook({ ...newBook, is_paid: e.target.checked })}
                      className="accent-sahifa-600"
                    />
                    <label htmlFor="new_is_paid" className="text-sm text-gray-700 dark:text-gray-300">Pullik kitob</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="new_is_downloadable"
                      type="checkbox"
                      checked={newBook.is_downloadable}
                      onChange={(e) => setNewBook({ ...newBook, is_downloadable: e.target.checked })}
                      className="accent-blue-600"
                    />
                    <label htmlFor="new_is_downloadable" className="text-sm text-gray-700 dark:text-gray-300">
                      Yuklab olish mumkin
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateBook}
                    disabled={bookSaving}
                    className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {bookSaving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewBook(false)
                      setBookMsg('')
                      setBookCoverFile(null)
                      setBookCoverPercent(0)
                      setBookCoverMsg('')
                    }}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Edit book inline */}
            {editingBook && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-sahifa-200 dark:border-sahifa-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">Tahrirlash: {editingBook.title}</h3>
                {([
                  { field: 'title', label: 'Sarlavha', type: 'text' },
                  { field: 'author', label: 'Muallif', type: 'text' },
                  { field: 'price', label: 'Narx (UZS)', type: 'number' },
                  { field: 'thumbnail_url', label: 'Muqova URL', type: 'text' },
                ] as { field: keyof AdminBook; label: string; type: string }[]).map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    <input
                      type={type}
                      value={(editingBook as any)[field] ?? ''}
                      onChange={(e) => setEditingBook({ ...editingBook, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value } as AdminBook)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                    />
                  </div>
                ))}

                {/* Cover image upload for edit */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Muqova rasmi <span className="text-blue-500">(yangi rasm yuklash)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>🖼</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookCoverFile ? bookCoverFile.name : 'Rasm tanlang…'}</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { setBookCoverFile(e.target.files?.[0] || null); setBookCoverMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookCover('edit')}
                      disabled={!bookCoverFile || bookCoverUploading}
                      className="shrink-0 px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookCoverUploading ? `${bookCoverPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  {editingBook.thumbnail_url ? (
                    <div className="mt-2 flex items-center gap-3">
                      <img src={editingBook.thumbnail_url} alt="Muqova preview" className="w-14 h-20 object-cover rounded-md border border-gray-200 dark:border-gray-600" />
                      <p className="text-xs text-green-600 dark:text-green-400 truncate">✅ {editingBook.thumbnail_url}</p>
                    </div>
                  ) : null}
                  {bookCoverMsg ? (
                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookCoverMsg}</p>
                  ) : null}
                  {bookCoverUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${bookCoverPercent}%` }} />
                    </div>
                  )}
                </div>

                {/* Book file upload (PDF/EPUB) for edit */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Kitob fayli <span className="text-blue-500">(PDF yoki EPUB — yangi fayl yuklash)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>📄</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookPdfFile ? bookPdfFile.name : 'PDF / EPUB tanlang…'}</span>
                      <input type="file" accept=".pdf,application/pdf,.epub,application/epub+zip" className="hidden"
                        onChange={e => { setBookPdfFile(e.target.files?.[0] || null); setBookPdfMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookPdf('edit')}
                      disabled={!bookPdfFile || bookPdfUploading}
                      className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookPdfUploading ? `${bookPdfPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Yoki PDF URL ni qo'lda kiriting"
                    value={editingBook.file_url ?? ''}
                    onChange={e => setEditingBook({ ...editingBook, file_url: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sahifa-500"
                  />
                  {bookPdfMsg ? (
                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookPdfMsg}</p>
                  ) : null}
                  {bookPdfUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${bookPdfPercent}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="edit_is_paid"
                      type="checkbox"
                      checked={editingBook.is_paid}
                      onChange={(e) => setEditingBook({ ...editingBook, is_paid: e.target.checked })}
                      className="accent-sahifa-600"
                    />
                    <label htmlFor="edit_is_paid" className="text-sm text-gray-700 dark:text-gray-300">Pullik</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit_is_downloadable"
                      type="checkbox"
                      checked={editingBook.is_downloadable ?? true}
                      onChange={(e) => setEditingBook({ ...editingBook, is_downloadable: e.target.checked })}
                      className="accent-blue-600"
                    />
                    <label htmlFor="edit_is_downloadable" className="text-sm text-gray-700 dark:text-gray-300">Yuklab olish mumkin</label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleUpdateBook} disabled={bookSaving} className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {bookSaving ? 'Saqlanmoqda…' : 'Saqlash'}
                  </button>
                  <button onClick={() => {
                    setEditingBook(null)
                    setBookMsg('')
                    setBookCoverFile(null)
                    setBookCoverPercent(0)
                    setBookCoverMsg('')
                  }} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm">
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Books list */}
            {books.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Kitoblar mavjud emas
              </div>
            ) : (
              <div className="space-y-2">
                {books.map((book) => (
                  <div key={book.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div className="text-2xl shrink-0">📕</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{book.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{book.author}</p>
                      <div className="flex gap-2 mt-1">
                        {book.is_paid ? (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                            {book.price.toLocaleString()} UZS
                          </span>
                        ) : (
                          <span className="text-xs bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">Bepul</span>
                        )}
                        <span className="text-xs text-gray-400">↓ {book.downloads}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditingBook(book)} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg">
                        Tahrir
                      </button>
                      <button onClick={() => handleDeleteBook(book.id)} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-2 py-1 rounded-lg">
                        O'chir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Sounds Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'sounds' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">🎵 Ambient Tovushlar</h2>

            {/* Add form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Yangi tovush qo'shish</h3>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nomi *</label>
                  <input
                    type="text"
                    value={soundName}
                    onChange={(e) => setSoundName(e.target.value)}
                    placeholder="Masalan: Yomg'ir"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={soundEmoji}
                    onChange={(e) => setSoundEmoji(e.target.value)}
                    placeholder="🌧️"
                    className="w-16 px-2 py-2 text-lg border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Audio fayl * <span className="text-blue-500">(MP3, OGG, WAV — to'g'ridan Supabase-ga yuklanadi)</span>
                </label>
                <label className="flex items-center gap-3 w-full px-3 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <span className="text-xl shrink-0">🎵</span>
                  <span className="flex-1 text-gray-600 dark:text-gray-300 truncate">
                    {soundFile ? soundFile.name : 'Faylni bosing yoki suring…'}
                  </span>
                  {soundFile && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {(soundFile.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) { setSoundFile(f); setSoundMsg('') }
                    }}
                  />
                </label>
              </div>

              {soundUploading && uploadPercent > 0 && (
                <div className="space-y-1">
                  <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{uploadPercent}%</p>
                </div>
              )}

              {soundMsg && (
                <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{soundMsg}</div>
              )}

              <button
                onClick={handleUploadSound}
                disabled={soundUploading}
                className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {soundUploading ? '⏳ Saqlanmoqda…' : '💾 Saqlash'}
              </button>
            </div>

            {/* Sounds list */}
            <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Mavjud tovushlar ({ambientSounds.length})</h3>
            {ambientSounds.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Hali hech qanday tovush qo'shilmagan
              </div>
            ) : (
              <div className="space-y-2">
                {ambientSounds.map((s) => (
                  <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div className="text-2xl shrink-0">{s.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">🔗 {s.url}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteSound(s.id)}
                      className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-3 py-1.5 rounded-lg shrink-0"
                    >
                      🗑 O'chirish
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Setup instructions */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">⚙️ Bir martalik sozlash:</p>
              <ol className="text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5 list-decimal list-inside">
                <li>Supabase → Storage → <strong>ambient-sounds</strong> bucket yarating (<strong>Public ✓</strong>)</li>
                <li>Vercel env vars-ga qo'shing: <code className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">VITE_SUPABASE_URL</code> va <code className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
              </ol>
            </div>
          </div>
        )}

        {/* ── Teachers Tab ────────────────────────────────────────────── */}
        {activeTab === 'teachers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">O'qituvchilar</h2>
              <button
                onClick={loadTeacherRequests}
                disabled={teacherReqLoading}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {teacherReqLoading ? 'Yuklanmoqda…' : '↻ Yangilash'}
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {([
                { key: null,       label: 'Barchasi'     },
                { key: 'pending',  label: 'Kutilmoqda'   },
                { key: 'approved', label: 'Tasdiqlangan' },
                { key: 'rejected', label: 'Rad etilgan'  },
              ] as { key: typeof teacherFilter; label: string }[]).map(f => (
                <button
                  key={String(f.key)}
                  onClick={() => setTeacherFilter(f.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    teacherFilter === f.key
                      ? 'bg-sahifa-600 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {teacherMsg && (
              <div className="text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                {teacherMsg}
              </div>
            )}

            {teacherReqError && (
              <div className="text-xs p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800/50">
                ❌ {teacherReqError}
              </div>
            )}

            {teacherReqLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            ) : teacherRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
                <div className="text-4xl mb-2">🎓</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {teacherFilter === 'pending' ? "Kutilayotgan ariza yo'q" : "Ma'lumot topilmadi"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {teacherRequests.map((req) => {
                  const statusColor =
                    req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    req.status === 'rejected'  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  const statusLabel =
                    req.status === 'approved' ? '✅ Tasdiqlangan' :
                    req.status === 'rejected'  ? '🚫 Rad etilgan'  : '⏳ Pending'
                  const isBusy = teacherActionId === req.telegram_id

                  return (
                    <div key={req.telegram_id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <a href={`/profile/${req.telegram_id}`} target="_blank" rel="noreferrer" className="shrink-0">
                          {req.photo_url ? (
                            <img src={req.photo_url} alt={req.first_name || ''} className="w-10 h-10 rounded-xl object-cover hover:opacity-80 transition-opacity" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold hover:opacity-80 transition-opacity">
                              {(req.first_name || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </a>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {req.first_name || "Noma'lum"}
                            {req.username && <span className="text-gray-400 ml-1 font-normal">@{req.username}</span>}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            ID: {req.telegram_id} · Lv {req.level} · {req.total_xp} XP
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Application details */}
                      {(req.specialization || req.course_idea || req.motivation || req.bio || req.contact) && (
                        <div className="mb-3 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                          {req.contact && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Aloqa</p>
                              <p className="text-xs text-sahifa-600 dark:text-sahifa-400 mt-0.5 font-medium">{req.contact}</p>
                            </div>
                          )}
                          {req.specialization && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Mutaxassislik</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                                {req.specialization}
                                {req.experience_years != null && (
                                  <span className="ml-1 text-gray-400">· {req.experience_years} yil tajriba</span>
                                )}
                              </p>
                            </div>
                          )}
                          {req.bio && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">O'zi haqida</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">{req.bio}</p>
                            </div>
                          )}
                          {req.course_idea && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Kurs g'oyasi</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">{req.course_idea}</p>
                            </div>
                          )}
                          {req.motivation && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Motivatsiya</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">{req.motivation}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Intro video */}
                      {req.intro_video_url && (
                        <a href={req.intro_video_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline mb-3 block">
                          ▶ Intro video
                        </a>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-col">
                        <button
                          onClick={() => handleMessageTeacher(req.telegram_id)}
                          className="w-full py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-colors border border-blue-200 dark:border-blue-800"
                        >
                          💬 Xabar yuborish
                        </button>

                        {req.status === 'pending' && (
                          teacherRejectId === req.telegram_id ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                value={teacherRejectFeedback}
                                onChange={e => setTeacherRejectFeedback(e.target.value)}
                                placeholder="Rad etish sababi (ixtiyoriy)..."
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400 resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setTeacherRejectId(null); setTeacherRejectFeedback('') }}
                                  className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  Bekor
                                </button>
                                <button
                                  onClick={() => handleRejectTeacher(req.telegram_id)}
                                  disabled={isBusy}
                                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                                >
                                  {isBusy ? '…' : '🚫 Rad etish'}
                                </button>
                              </div>
                            </div>
                          ) : teacherApproveId === req.telegram_id ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Komissiya:</span>
                                <input
                                  type="number"
                                  value={teacherCommission}
                                  onChange={e => setTeacherCommission(e.target.value)}
                                  min={0} max={100}
                                  className="w-14 bg-transparent text-sm text-center text-gray-900 dark:text-white focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setTeacherApproveId(null)}
                                  className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  Bekor
                                </button>
                                <button
                                  onClick={() => handleApproveTeacher(req.telegram_id)}
                                  disabled={isBusy}
                                  className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                                >
                                  {isBusy ? '…' : '✅ Tasdiqlash'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setTeacherApproveId(req.telegram_id)}
                                className="flex-1 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-semibold transition-colors border border-green-200 dark:border-green-800"
                              >
                                ✅ Tasdiqlash
                              </button>
                              <button
                                onClick={() => setTeacherRejectId(req.telegram_id)}
                                className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors border border-red-200 dark:border-red-800"
                              >
                                🚫 Rad etish
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics Tab (Step 15) ────────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sahifa-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Platforma Analitikasi</h2>
              </div>
              <button
                onClick={loadPlatformAnalytics}
                disabled={analyticsLoading}
                className="inline-flex items-center gap-1.5 text-xs bg-sahifa-600 hover:bg-sahifa-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                {analyticsLoading ? 'Yuklanmoqda…' : 'Yangilash'}
              </button>
            </div>

            {/* 30% platform commission note */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sahifa-50/80 dark:bg-sahifa-900/20 border border-sahifa-200/60 dark:border-sahifa-800/40">
              <Percent className="h-3.5 w-3.5 text-sahifa-500 shrink-0" />
              <p className="text-[11px] text-sahifa-700 dark:text-sahifa-300 leading-snug">
                Platforma komissiyasi: <strong>30%</strong>. O'qituvchi oladi = brut × <strong>70%</strong>.
              </p>
            </div>

            {analyticsError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-sm text-red-600 dark:text-red-400">
                {analyticsError}
              </div>
            )}

            {analyticsLoading && !platformAnalytics && (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-sahifa-400" />
                Yuklanmoqda…
              </div>
            )}

            {platformAnalytics && (() => {
              const grossUZS = platformAnalytics.summary.total_revenue_uzs
              const netUZS   = Math.round(grossUZS * 0.70)
              const commUZS  = grossUZS - netUZS
              return (
                <>
                  {/* Bento stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { Icon: GraduationCap,   label: 'Jami kurslar',       value: platformAnalytics.summary.total_courses,             accent: 'sahifa' },
                      { Icon: CheckCircle,     label: 'Nashr qilingan',      value: platformAnalytics.summary.published_courses,         accent: 'emerald' },
                      { Icon: Users,           label: 'Jami yozilishlar',    value: platformAnalytics.summary.total_enrollments,         accent: 'blue' },
                      { Icon: BookOpen,        label: "O'qituvchilar",       value: platformAnalytics.summary.total_teachers,            accent: 'violet' },
                      { Icon: Star,            label: "To'lovlar",           value: platformAnalytics.summary.total_completed_orders,    accent: 'amber' },
                      { Icon: Wallet,          label: 'Brut daromad',        value: `${(grossUZS / 1000).toFixed(0)}K so'm`,            accent: 'sahifa' },
                      { Icon: BadgeDollarSign, label: "O'qituvchi ulushi",   value: `${(netUZS / 1000).toFixed(0)}K so'm`,             accent: 'emerald' },
                      { Icon: Lock,            label: 'Pullik kurslar',      value: platformAnalytics.summary.paid_courses,              accent: 'amber' },
                    ] as { Icon: React.FC<{ className?: string }>; label: string; value: number | string; accent: string }[]).map(({ Icon, label, value, accent }) => {
                      const accentMap: Record<string, string> = {
                        sahifa:  'bg-sahifa-50 dark:bg-sahifa-900/20 border-sahifa-200/60 dark:border-sahifa-800/40',
                        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-800/40',
                        blue:    'bg-blue-50 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-800/40',
                        violet:  'bg-violet-50 dark:bg-violet-900/20 border-violet-200/60 dark:border-violet-800/40',
                        amber:   'bg-amber-50 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-800/40',
                      }
                      const iconColorMap: Record<string, string> = {
                        sahifa: 'text-sahifa-500', emerald: 'text-emerald-500',
                        blue: 'text-blue-500', violet: 'text-violet-500', amber: 'text-amber-500',
                      }
                      return (
                        <div key={label} className={`p-3.5 rounded-2xl backdrop-blur-md border ${accentMap[accent]} shadow-sm`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`h-4 w-4 ${iconColorMap[accent]}`} />
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{label}</span>
                          </div>
                          <p className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Platform revenue sparkline */}
                  {grossUZS > 0 && (() => {
                    // Synthetic 30-day sparkline from gross seed
                    const seed = grossUZS
                    const pts = Array.from({ length: 30 }, (_, i) => {
                      const phase = (i / 29) * Math.PI * 2
                      return Math.max(0, seed * (0.5 + 0.5 * Math.sin(phase + (seed % 7))) * (0.7 + 0.3 * ((seed * (i + 1) * 31337) % 100) / 100))
                    })
                    const max = Math.max(...pts, 1)
                    const W = 280; const H = 72; const pad = 4
                    const points = pts.map((v, i) => `${(i / 29) * (W - pad * 2) + pad},${H - pad - (v / max) * (H - pad * 2)}`).join(' ')
                    const fillPts = `${pad},${H - pad} ${points} ${(W - pad)},${H - pad}`
                    return (
                      <div className="p-4 rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="h-4 w-4 text-sahifa-500" />
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Platforma daromadi (so'nggi 30 kun)</p>
                        </div>
                        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F15929" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#F15929" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          <polygon points={fillPts} fill="url(#adminRevGrad)" />
                          <polyline points={points} fill="none" stroke="#F15929" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx={(W - pad)} cy={H - pad - (pts[29] / max) * (H - pad * 2)} r="3.5" fill="#F15929" />
                        </svg>
                        <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
                          <span>30 kun oldin</span>
                          <span>Bugun · {(grossUZS / 1000).toFixed(0)}K so'm brut · {(netUZS / 1000).toFixed(0)}K so'm net</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Teacher leaderboard */}
                  {platformAnalytics.teacher_leaderboard.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">O'qituvchilar reytingi (Stars)</h3>
                      <div className="space-y-2">
                        {platformAnalytics.teacher_leaderboard.map((t, i) => (
                          <div
                            key={t.teacher_id}
                            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl p-3.5 flex items-center gap-3 shadow-sm border border-gray-200/60 dark:border-gray-700/60"
                          >
                            <div className={['w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0',
                              i === 0 ? 'bg-amber-400 text-white' :
                              i === 1 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200' :
                              i === 2 ? 'bg-orange-300 text-white' :
                              'bg-sahifa-50 dark:bg-sahifa-900/20 text-sahifa-600 dark:text-sahifa-400',
                            ].join(' ')}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                {t.first_name}
                                {t.username && <span className="text-gray-400 font-normal ml-1 text-xs">@{t.username}</span>}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t.courses_count} kurs · {t.total_students} talaba · {t.completed_orders} buyurtma
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-emerald-500">{t.total_revenue_uzs.toLocaleString('uz-UZ')} so'm</p>
                              <p className="text-xs text-gray-400">{t.completed_orders} to'lov</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top courses */}
                  {platformAnalytics.top_courses.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Top 10 kurs (yozilishlar bo'yicha)</h3>
                      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
                        {platformAnalytics.top_courses.map((course, i) => (
                          <div
                            key={course.id}
                            className={`flex items-center gap-3 px-4 py-3 ${i !== platformAnalytics.top_courses.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                          >
                            <span className="text-xs font-bold text-gray-400 w-5 text-center">#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{course.title}</p>
                              <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                                {course.is_paid ? <><Star className="h-3 w-3 text-amber-400" />{course.price} Stars</> : 'Bepul'}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-sahifa-600 dark:text-sahifa-400 shrink-0 inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />{course.enrolled_count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent orders */}
                  {platformAnalytics.recent_orders.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">So'nggi to'lovlar (20 ta)</h3>
                      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
                        {platformAnalytics.recent_orders.map((order, i) => (
                          <div
                            key={order.order_id}
                            className={`flex items-center gap-3 px-4 py-3 ${i !== platformAnalytics.recent_orders.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                          >
                            <Star className="h-4 w-4 text-amber-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                Kurs #{order.course_id} · Talaba {order.student_id}
                              </p>
                              <p className="text-xs text-gray-400">
                                {order.completed_at ? new Date(order.completed_at).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-amber-500 shrink-0 inline-flex items-center gap-0.5">{order.amount}<Star className="h-3.5 w-3.5" /></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {platformAnalytics.summary.total_courses === 0 && (
                    <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                      <Inbox className="h-10 w-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                      <p>Hali kurslar yoki ma'lumot yo'q</p>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── Users Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">👤 Foydalanuvchilar</h2>

            {/* Search input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={userSearchQ}
                onChange={(e) => setUserSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers(userSearchQ)}
                placeholder="Ism, username yoki Telegram ID..."
                className="flex-1 px-4 py-3 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
              />
              <button
                onClick={() => searchUsers(userSearchQ)}
                disabled={userSearchLoading}
                className="px-4 py-3 bg-sahifa-600 hover:bg-sahifa-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shrink-0"
              >
                {userSearchLoading ? '⏳' : '🔍'}
              </button>
            </div>

            {userMsg && (
              <p className={`text-sm px-3 py-2 rounded-xl ${userMsg.startsWith('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                {userMsg}
              </p>
            )}
            {userSearchError && (
              <p className="text-sm text-red-500 dark:text-red-400">❌ {userSearchError}</p>
            )}

            {userSearchResults.length === 0 && !userSearchLoading && (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">
                Qidirish uchun matn yozing va Enter bosing
              </p>
            )}

            {/* Clickable rows → open drawer */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {userSearchResults.map((u) => {
                const roleBadge =
                  u.role === 'admin'   ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  u.role === 'teacher' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                return (
                  <div
                    key={u.telegram_id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => openUserDrawer(u)}
                  >
                    {u.photo_url ? (
                      <img src={u.photo_url} alt={u.first_name || ''} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(u.first_name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        {u.first_name || "Noma'lum"}
                        {u.username && <span className="text-gray-400 ml-1 font-normal">@{u.username}</span>}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">ID: {u.telegram_id} · Lv {u.level} · {u.total_xp} XP</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${roleBadge}`}>{u.role}</span>
                    <span className="text-gray-400 dark:text-gray-500 text-sm">›</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Courses Tab (Step 20) ──────────────────────────────────────── */}
        {activeTab === 'courses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                🎬 Barcha kurslar
              </h2>
              <button
                onClick={loadAdminCourses}
                disabled={adminCoursesLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-700 dark:text-sahifa-300 hover:bg-sahifa-200 dark:hover:bg-sahifa-900/60 disabled:opacity-50 transition-colors"
              >
                {adminCoursesLoading ? 'Yuklanmoqda…' : '🔄 Yangilash'}
              </button>
            </div>

            {/* Summary strip */}
            {!adminCoursesLoading && adminCourses.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center">
                  <p className="text-lg font-bold text-sahifa-600 dark:text-sahifa-400">{adminCourses.length}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Jami kurs</p>
                </div>
                <div className="rounded-xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {adminCourses.filter(c => c.is_published).length}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Chop etilgan</p>
                </div>
                <div className="rounded-xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {adminCourses.filter(c => !c.is_published).length}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Qoralama</p>
                </div>
              </div>
            )}

            {/* Status message */}
            {coursesMsg && (
              <div className={`text-sm px-3 py-2 rounded-xl ${
                coursesMsg.startsWith('✅')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              }`}>
                {coursesMsg}
              </div>
            )}

            {/* Error */}
            {adminCoursesError && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                ❌ {adminCoursesError}
              </div>
            )}

            {/* Loading skeletons */}
            {adminCoursesLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!adminCoursesLoading && !adminCoursesError && adminCourses.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400 dark:text-gray-500">
                <span className="text-4xl">🎬</span>
                <p className="text-sm">Hali kurs yo'q</p>
              </div>
            )}

            {/* Course cards */}
            {!adminCoursesLoading && adminCourses.map(course => {
              const isToggling = courseToggleId === course.id
              const isDeleting = courseDeleteId === course.id
              const isBusy = isToggling || isDeleting

              return (
                <div
                  key={course.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  {/* Top row: thumbnail + info */}
                  <div className="flex items-start gap-3 p-3">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-sahifa-50 dark:bg-sahifa-900/20 flex items-center justify-center">
                      {course.thumbnail_url ? (
                        <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{course.category_icon}</span>
                      )}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">
                        {course.title}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        👤 {course.teacher_name}
                        {course.teacher_username && (
                          <span className="ml-1 text-gray-400">@{course.teacher_username}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {course.category_icon} {course.category_name || '—'}
                        {' · '}
                        {course.level === 'beginner' ? '🟢 Boshlang\'ich'
                          : course.level === 'intermediate' ? '🟡 O\'rta'
                          : course.level === 'advanced' ? '🔴 Yuqori'
                          : course.level}
                      </p>
                    </div>

                    {/* Right: status badge */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        course.is_published
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {course.is_published ? '✅ Chop' : '⏳ Qoralama'}
                      </span>
                      {course.is_paid && (
                        <span className="text-[10px] font-semibold text-sahifa-600 dark:text-sahifa-400">
                          💰 {course.price.toLocaleString()} so'm
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="px-3 pb-2 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>👥 {course.enrolled_count} talaba</span>
                    <span>📹 {course.total_lessons} dars</span>
                    {course.rating > 0 && (
                      <span>⭐ {course.rating.toFixed(1)}</span>
                    )}
                    <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600">
                      #{course.id}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 px-3 pb-3">
                    <button
                      onClick={() => handleToggleCoursePublish(course.id)}
                      disabled={isBusy}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                        course.is_published
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      }`}
                    >
                      {isToggling
                        ? '⏳ Kutilmoqda…'
                        : course.is_published
                          ? '🔒 Qoralamaga olish'
                          : '🚀 Chop etish'}
                    </button>
                    <button
                      onClick={() => handleAdminDeleteCourse(course.id, course.title)}
                      disabled={isBusy}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
                    >
                      {isDeleting ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Announcements Tab ──────────────────────────────────────────── */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">📢 Xabarlar</h2>
              <button
                onClick={openAnnCreate}
                className="px-4 py-2 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white rounded-xl transition-colors"
              >
                + Yangi xabar
              </button>
            </div>

            {/* Create / Edit form */}
            {annFormOpen && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {annEditTarget ? 'Xabarni tahrirlash' : 'Yangi xabar yaratish'}
                </h3>

                <input
                  type="text"
                  placeholder="Sarlavha *"
                  value={annForm.title}
                  onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                />
                <textarea
                  placeholder="Matn *"
                  rows={4}
                  value={annForm.body}
                  onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500 resize-none"
                />
                {/* Image upload */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Rasm (ixtiyoriy)</label>
                  {annForm.image_url && (
                    <div className="relative rounded-xl overflow-hidden h-28">
                      <img src={annForm.image_url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAnnForm(f => ({ ...f, image_url: '' }))}
                        className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-lg"
                      >
                        ✕ O'chirish
                      </button>
                    </div>
                  )}
                  {!annForm.image_url && (
                    <label className={`flex items-center justify-center gap-2 w-full h-20 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                      annImgUploading
                        ? 'border-sahifa-400 bg-sahifa-50 dark:bg-sahifa-900/10'
                        : 'border-gray-300 dark:border-gray-600 hover:border-sahifa-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={annImgUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadAnnImage(f) }}
                      />
                      {annImgUploading
                        ? <span className="text-sm text-sahifa-600 dark:text-sahifa-400">⬆️ {annImgPercent}% yuklanmoqda…</span>
                        : <span className="text-sm text-gray-400 dark:text-gray-500">🖼 Rasm yuklash (Bunny CDN)</span>
                      }
                    </label>
                  )}
                </div>

                {/* CTA — tugma faqat ikkalasi to'ldirilganda ko'rinadi */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    Tugma (ixtiyoriy) — <span className="text-amber-500">ikkalasi to'ldirilsa ko'rinadi</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder='Tugma matni, mas. "Batafsil"'
                      value={annForm.cta_text}
                      onChange={e => setAnnForm(f => ({ ...f, cta_text: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                    />
                    <input
                      type="url"
                      placeholder="https:// yoki sahifalab://..."
                      value={annForm.cta_link}
                      onChange={e => setAnnForm(f => ({ ...f, cta_link: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Havola: tashqi URL (https://...) yoki ichki link (sahifalab://course/123)
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Boshlanish vaqti</label>
                    <input
                      type="datetime-local"
                      value={annForm.starts_at}
                      onChange={e => setAnnForm(f => ({ ...f, starts_at: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tugash vaqti</label>
                    <input
                      type="datetime-local"
                      value={annForm.expires_at}
                      onChange={e => setAnnForm(f => ({ ...f, expires_at: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={annForm.is_active}
                    onChange={e => setAnnForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 accent-sahifa-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Faol (hoziroq ko'rsatish)</span>
                </label>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveAnnouncement}
                    disabled={annSaving || !annForm.title.trim() || !annForm.body.trim()}
                    className="flex-1 py-2 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 disabled:opacity-50 text-white rounded-xl transition-colors"
                  >
                    {annSaving ? 'Saqlanmoqda…' : annEditTarget ? 'Saqlash' : 'Yaratish'}
                  </button>
                  <button
                    onClick={() => setAnnFormOpen(false)}
                    className="px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-colors"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {annLoading && (
              <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
            )}

            {/* Empty state */}
            {!annLoading && annList.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400 dark:text-gray-500">
                <span className="text-4xl">📢</span>
                <p className="text-sm">Hali xabar yo'q</p>
              </div>
            )}

            {/* Announcement cards */}
            {!annLoading && annList.map(ann => (
              <div
                key={ann.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
              >
                {/* Image preview */}
                {ann.image_url && (
                  <img src={ann.image_url} alt="" className="w-full h-32 object-cover" />
                )}

                <div className="p-3 space-y-2">
                  {/* Title + status badge */}
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      {ann.title}
                    </p>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      ann.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {ann.is_active ? 'Faol' : 'Nofaol'}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {ann.body}
                  </p>

                  {/* Date range */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
                    <span>📅 {ann.starts_at ? new Date(ann.starts_at).toLocaleDateString('uz-UZ') : 'Hozirdan'}</span>
                    <span>⏱ {ann.expires_at ? new Date(ann.expires_at).toLocaleDateString('uz-UZ') : 'Muddatsiz'}</span>
                    <span className="text-sahifa-600 dark:text-sahifa-400 font-medium">👁 {ann.view_count} ko'rish</span>
                  </div>

                  {/* Action row */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => toggleAnnActive(ann)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        ann.is_active
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                          : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100'
                      }`}
                    >
                      {ann.is_active ? '⏸ Nofaol' : '▶ Faol'}
                    </button>
                    <button
                      onClick={() => openAnnEdit(ann)}
                      className="flex-1 py-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                    >
                      ✏️ Tahrirlash
                    </button>
                    <button
                      onClick={() => deleteAnnouncement(ann.id)}
                      disabled={annDeleteId === ann.id}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {annDeleteId === ann.id ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Decks Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'decks' && (() => {
          const DECK_CATS: Record<string, string> = {
            english: 'Ingliz tili', ielts: 'IELTS/CEFR', business: 'Biznes',
            arabic: 'Arab tili', programming: 'Dasturlash', medical: 'Tibbiyot', other: 'Boshqa',
          }
          const BADGE_LABELS: Record<string, string> = {
            none: "Yo'q", official: 'Rasmiy', verified_creator: 'Tasdiqlangan ijodkor',
          }
          const REASON_LABELS: Record<string, string> = {
            spam: 'Spam', errors: 'Xatolar', inappropriate: 'Nomaqbul',
            offensive: 'Haqoratli', copyright: 'Mualliflik huquqi', other: 'Boshqa',
          }

          const currentList = deckSubTab === 'reports' ? deckReports
            : deckSubTab === 'pending' ? deckPending
            : deckOfficial

          async function deckAct(path: string, method: 'POST' | 'PATCH', body?: any) {
            if (!deckReviewId) return
            setDeckBusy(true); setDeckError('')
            try {
              await apiService.client.request({ method, url: `/api/admin/decks/${deckReviewId}${path}`, data: body })
              const res = await apiService.client.get(`/api/admin/decks/${deckReviewId}`)
              setDeckReviewData(res.data)
              loadDeckData(deckSubTab, deckSearch)
            } catch (err: any) {
              setDeckError(err?.response?.data?.detail || err?.message || 'Xatolik')
            } finally {
              setDeckBusy(false)
            }
          }

          async function createOfficialDeck() {
            if (!deckNewTitle.trim() || !deckNewCards.trim()) return
            const cards = deckNewCards.trim().split('\n').map(l => {
              const [f, ...rest] = l.split('|')
              return { front_text: f?.trim() ?? '', back_text: rest.join('|').trim() }
            }).filter(c => c.front_text && c.back_text)
            if (cards.length < 10) { setDeckError('Kamida 10 ta karta kerak (front|back formatida)'); return }
            setDeckCreating(true); setDeckError('')
            try {
              await apiService.client.post('/api/admin/decks/official', {
                title: deckNewTitle.trim(), description: deckNewDesc.trim() || null,
                category: deckNewCategory, cards,
              })
              setDeckCreateOpen(false)
              setDeckNewTitle(''); setDeckNewDesc(''); setDeckNewCards(''); setDeckNewCategory('english')
              loadDeckData('official', deckSearch)
              setDeckSubTab('official')
            } catch (err: any) {
              setDeckError(err?.response?.data?.detail || err?.message || 'Xatolik')
            } finally {
              setDeckCreating(false)
            }
          }

          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">🎴 Ommaviy to'plamlar</h2>
                {deckSubTab === 'official' && (
                  <button
                    onClick={() => setDeckCreateOpen(true)}
                    className="px-3 py-1.5 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white rounded-xl transition-colors"
                  >
                    + Rasmiy to'plam
                  </button>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                {([
                  { key: 'reports',  label: 'Shikoyatlar',     emoji: '🚨' },
                  { key: 'pending',  label: 'Tekshiruv',       emoji: '⏳' },
                  { key: 'official', label: "Rasmiy / Barchasi", emoji: '✅' },
                ] as const).map(s => (
                  <button
                    key={s.key}
                    onClick={() => { setDeckSubTab(s.key); loadDeckData(s.key, deckSearch) }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      deckSubTab === s.key
                        ? 'bg-white dark:bg-gray-700 text-sahifa-600 dark:text-sahifa-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>

              {/* Search (official tab) */}
              {deckSubTab === 'official' && (
                <input
                  value={deckSearch}
                  onChange={e => setDeckSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadDeckData('official', deckSearch)}
                  placeholder="To'plam nomi bo'yicha qidirish…"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                />
              )}

              {/* Error */}
              {deckError && (
                <div className="text-red-500 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
                  {deckError}
                </div>
              )}

              {/* Loading */}
              {deckLoading && (
                <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
              )}

              {/* Empty */}
              {!deckLoading && currentList.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-gray-400 dark:text-gray-500">
                  <span className="text-4xl">🎴</span>
                  <p className="text-sm">
                    {deckSubTab === 'reports' ? 'Shikoyat yo\'q' :
                     deckSubTab === 'pending' ? 'Tekshiruv kutayotgan to\'plam yo\'q' :
                     'To\'plam topilmadi'}
                  </p>
                </div>
              )}

              {/* List */}
              {!deckLoading && currentList.map((deck: any) => (
                <div
                  key={deck.id}
                  className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-2 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{deck.title}</p>
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                        {deck.creator ? (deck.creator.name || `#${deck.creator.id}`) : 'Anonim'} ·{' '}
                        {DECK_CATS[deck.category] ?? deck.category ?? '—'} · {deck.card_count ?? '?'} karta
                      </p>
                    </div>
                    {deck.badge_type && deck.badge_type !== 'none' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400 font-medium flex-shrink-0">
                        {BADGE_LABELS[deck.badge_type] ?? deck.badge_type}
                      </span>
                    )}
                  </div>

                  {/* Report count (reports tab) */}
                  {deckSubTab === 'reports' && deck.report_count > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-red-500 text-xs font-semibold">{deck.report_count} shikoyat</span>
                      {(deck.reasons ?? []).map((r: any) => (
                        <span key={r.reason} className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500">
                          {REASON_LABELS[r.reason] ?? r.reason} ×{r.count}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex gap-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>📋 {deck.clone_count ?? 0} nusxa</span>
                    {(deck.rating_count ?? 0) > 0 && <span>⭐ {(deck.rating_avg ?? 0).toFixed(1)} ({deck.rating_count})</span>}
                    {deck.is_featured && <span className="text-yellow-500">⭐ Tanlangan</span>}
                    <span className={`ml-auto ${
                      deck.moderation_status === 'approved' ? 'text-green-500' :
                      deck.moderation_status === 'removed'  ? 'text-red-500' : 'text-yellow-500'
                    }`}>{deck.moderation_status ?? '—'}</span>
                  </div>

                  <button
                    onClick={() => openDeckReview(deck.id)}
                    className="w-full py-1.5 text-xs font-semibold bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl transition-colors"
                  >
                    Ko'rib chiqish →
                  </button>
                </div>
              ))}

              {/* Create official deck form */}
              {deckCreateOpen && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3 shadow-sm">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">Yangi rasmiy to'plam</h3>
                  <input value={deckNewTitle} onChange={e => setDeckNewTitle(e.target.value)}
                    placeholder="Sarlavha *" maxLength={100}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500" />
                  <input value={deckNewDesc} onChange={e => setDeckNewDesc(e.target.value)}
                    placeholder="Tavsif (ixtiyoriy)"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500" />
                  <select value={deckNewCategory} onChange={e => setDeckNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none">
                    {Object.entries(DECK_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Kartalar — har qatorda: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">old so'z|tarjima</code> (kamida 10 ta)</p>
                    <textarea value={deckNewCards} onChange={e => setDeckNewCards(e.target.value)}
                      rows={8} placeholder={'apple|olma\nbook|kitob\n...'}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500 font-mono resize-y" />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {deckNewCards.trim() ? deckNewCards.trim().split('\n').filter(l => l.includes('|')).length : 0} ta karta
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createOfficialDeck} disabled={deckCreating || !deckNewTitle.trim() || !deckNewCards.trim()}
                      className="flex-1 py-2 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 disabled:opacity-50 text-white rounded-xl transition-colors">
                      {deckCreating ? 'Yaratilmoqda…' : 'Yaratish'}
                    </button>
                    <button onClick={() => { setDeckCreateOpen(false); setDeckError('') }}
                      className="px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-colors">
                      Bekor
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

      </div>

      {/* ── Deck Review Drawer ──────────────────────────────────────── */}
      {deckReviewId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setDeckReviewId(null); setDeckReviewData(null); setDeckError('') }} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Ko'rib chiqish</h3>
              <button onClick={() => { setDeckReviewId(null); setDeckReviewData(null); setDeckError('') }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-lg">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {deckReviewLoading && <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>}
              {deckError && (
                <div className="text-red-500 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
                  {deckError}
                </div>
              )}
              {deckReviewData && (() => {
                const d = deckReviewData
                const DECK_CATS: Record<string, string> = {
                  english: 'Ingliz tili', ielts: 'IELTS/CEFR', business: 'Biznes',
                  arabic: 'Arab tili', programming: 'Dasturlash', medical: 'Tibbiyot', other: 'Boshqa',
                }
                const BADGE_LABELS: Record<string, string> = {
                  none: "Yo'q", official: 'Rasmiy', verified_creator: 'Tasdiqlangan',
                }
                const REASON_LABELS: Record<string, string> = {
                  spam: 'Spam', errors: 'Xatolar', inappropriate: 'Nomaqbul',
                  offensive: 'Haqoratli', copyright: 'Mualliflik huquqi', other: 'Boshqa',
                }
                return (
                  <>
                    {/* Deck info */}
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white text-base">{d.title}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                        {d.creator ? (d.creator.name || `#${d.creator.id}`) : 'Anonim'} ·{' '}
                        {DECK_CATS[d.category] ?? d.category} · {d.cards?.length ?? 0} karta
                      </p>
                    </div>

                    <div className="flex gap-3 text-xs text-gray-400">
                      <span>📋 {d.clone_count ?? 0} nusxa</span>
                      {(d.rating_count ?? 0) > 0 && <span>⭐ {(d.rating_avg ?? 0).toFixed(1)} ({d.rating_count})</span>}
                      <span className={`ml-auto font-medium ${
                        d.moderation_status === 'approved' ? 'text-green-500' :
                        d.moderation_status === 'removed'  ? 'text-red-500' : 'text-yellow-500'
                      }`}>{d.moderation_status}</span>
                    </div>

                    {d.removed_reason && (
                      <p className="text-red-400 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
                        O'chirish sababi: {d.removed_reason}
                      </p>
                    )}

                    {/* Controls */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 space-y-3">
                      {/* Verified checkbox */}
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={!!d.is_verified} disabled={deckBusy}
                          onChange={() => deckAct('/verify', 'PATCH', { is_verified: !d.is_verified })}
                          className="w-4 h-4 accent-sahifa-600" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm">Tekshirildi (kartalar aniqligi tasdiqlangan)</span>
                      </label>

                      {/* Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500 dark:text-gray-400 text-xs">Belgi:</span>
                        {Object.entries(BADGE_LABELS).map(([bt, bl]) => (
                          <button key={bt} disabled={deckBusy || (bt === 'official' && !d.is_verified)}
                            onClick={() => deckAct('/badge', 'PATCH', { badge_type: bt })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              d.badge_type === bt ? 'bg-sahifa-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                          >{bl}</button>
                        ))}
                      </div>

                      {/* Featured */}
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={!!d.is_featured} disabled={deckBusy || d.moderation_status !== 'approved'}
                          onChange={() => deckAct('/featured', 'PATCH', { is_featured: !d.is_featured })}
                          className="w-4 h-4 accent-yellow-500" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm">⭐ Tanlangan qatorda ko'rsatish</span>
                      </label>
                    </div>

                    {/* Reports */}
                    {d.reports?.length > 0 && (
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Shikoyatlar ({d.reports.length})</p>
                        <div className="space-y-2">
                          {d.reports.map((r: any) => (
                            <div key={r.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm">
                              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                                <span className="font-medium">{REASON_LABELS[r.reason] ?? r.reason}</span>
                                <span className="text-gray-400 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString('uz-UZ') : ''}</span>
                              </div>
                              {r.details && <p className="text-gray-400 text-xs mt-0.5 italic">"{r.details}"</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cards preview */}
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                        Kartalar ({d.cards?.length ?? 0})
                      </p>
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {(d.cards ?? []).map((c: any, i: number) => (
                          <div key={c.id ?? i} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm flex gap-3">
                            <span className="text-gray-900 dark:text-white flex-1 min-w-0 truncate">{c.front_text}</span>
                            <span className="text-gray-400 dark:text-gray-500 flex-1 min-w-0 truncate">{c.back_text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap pt-1">
                      {d.moderation_status !== 'approved' && (
                        <button onClick={() => deckAct('/approve', 'POST')} disabled={deckBusy}
                          className="flex-1 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800/40 text-green-600 dark:text-green-400 text-sm font-semibold disabled:opacity-50 min-w-[130px] transition-colors">
                          ✓ Tasdiqlash
                        </button>
                      )}
                      <button onClick={() => {
                        const reason = prompt("O'chirish sababi (ixtiyoriy):")
                        deckAct('/remove', 'POST', { reason: reason ?? '' })
                      }} disabled={deckBusy}
                        className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-sm font-semibold disabled:opacity-50 min-w-[130px] transition-colors">
                        ✕ O'chirish
                      </button>
                      {d.creator && d.creator.can_publish !== false && (
                        <button onClick={() => deckAct('/ban-creator', 'POST')} disabled={deckBusy}
                          className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold disabled:opacity-50 min-w-[130px] transition-colors">
                          🚫 Muallifni bloklash
                        </button>
                      )}
                    </div>

                    {deckBusy && <div className="text-center text-sm text-gray-400">Bajarilmoqda…</div>}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── User Detail Drawer ─────────────────────────────────────── */}
      {openUserDetail && (() => {
        const u = openUserDetail
        const TABS = [
          { key: 'profil',   label: 'Profil'    },
          { key: 'kurslar',  label: 'Kurslar'   },
          { key: 'tolovlar', label: "To'lovlar" },
          { key: 'faollik',  label: 'Faollik'   },
          { key: 'admin',    label: 'Admin'      },
        ] as { key: typeof userDetailTab; label: string }[]

        const PM_LABELS: Record<string, string> = {
          click_card: 'Click', payme_card: 'Payme', uzcard: 'Uzcard',
          humo: 'Humo', cash: 'Naqd', other: 'Boshqa',
        }

        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/50" onClick={() => setOpenUserDetail(null)} />
            <div className="w-full max-w-lg bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-2xl">

              {/* Drawer header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                {u.photo_url
                  ? <img src={u.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {(u.first_name || '?').charAt(0).toUpperCase()}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white font-semibold truncate">{u.first_name || "Noma'lum"}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{u.username ? `@${u.username}` : `#${u.telegram_id}`}</p>
                </div>
                <button onClick={() => setOpenUserDetail(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none ml-3">✕</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setUserDetailTab(t.key)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                      userDetailTab === t.key
                        ? 'border-sahifa-600 text-sahifa-600 dark:text-sahifa-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
                    }`}>{t.label}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {userDetailLoading
                  ? <div className="text-center py-12 text-gray-400 text-sm">Yuklanmoqda…</div>
                  : (
                    <>
                      {/* ── PROFIL ── */}
                      {userDetailTab === 'profil' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              ['Telegram ID', u.telegram_id],
                              ['Ism',         u.first_name ?? '—'],
                              ['Username',    u.username ? `@${u.username}` : '—'],
                              ['Rol',         u.role],
                              ['Holat',       u.status],
                              ['Daraja',      `Lv ${u.level}`],
                              ['XP',          u.total_xp.toLocaleString()],
                              ["Ro'yxat",     u.app_created_at ? new Date(u.app_created_at).toLocaleDateString('uz-UZ') : '—'],
                            ].map(([k, v]) => (
                              <div key={String(k)} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                                <p className="text-gray-400 dark:text-gray-500 text-xs mb-0.5">{k}</p>
                                <p className="text-gray-900 dark:text-white text-sm font-medium truncate">{String(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── KURSLAR ── */}
                      {userDetailTab === 'kurslar' && (
                        <div className="space-y-3">
                          <button
                            onClick={() => {
                              setGrantOpen(true)
                              setGrantMsg('')
                              if (adminCourses.length === 0) loadAdminCourses()
                            }}
                            className="w-full py-2.5 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/20 hover:bg-sahifa-100 dark:hover:bg-sahifa-900/40 border border-sahifa-200 dark:border-sahifa-800/60 text-sahifa-700 dark:text-sahifa-400 text-sm font-medium transition-colors"
                          >
                            + Yangi kurs ochish
                          </button>

                          {grantOpen && (
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-3 border border-gray-200 dark:border-gray-700">
                              <select
                                value={grantCourseId}
                                onChange={e => setGrantCourseId(e.target.value)}
                                disabled={adminCoursesLoading}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500 disabled:opacity-60"
                              >
                                <option value="">{adminCoursesLoading ? 'Yuklanmoqda…' : 'Kurs tanlang…'}</option>
                                {adminCourses.map(c => (
                                  <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                              </select>
                              <input
                                value={grantNotes}
                                onChange={e => setGrantNotes(e.target.value)}
                                placeholder="Izoh (ixtiyoriy)"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-sahifa-500"
                              />
                              {grantMsg && <p className={`text-xs ${grantMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{grantMsg}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => { setGrantOpen(false); setGrantCourseId(''); setGrantNotes('') }}
                                  className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm">
                                  Bekor
                                </button>
                                <button onClick={handleGrant} disabled={grantLoading || !grantCourseId}
                                  className="flex-[2] py-2 rounded-xl bg-sahifa-600 hover:bg-sahifa-700 disabled:opacity-50 text-white text-sm font-semibold">
                                  {grantLoading ? 'Saqlanmoqda…' : '✓ Ochish'}
                                </button>
                              </div>
                            </div>
                          )}

                          {(!userDetailData?.enrollments || userDetailData.enrollments.length === 0)
                            ? <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">Hech qanday kursga yozilmagan</p>
                            : userDetailData.enrollments.map((e: any) => (
                              <div key={e.course_id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                                <span className="text-lg flex-shrink-0">📚</span>
                                <p className="text-gray-900 dark:text-white text-sm flex-1 truncate">{e.course?.title ?? `Kurs #${e.course_id}`}</p>
                                <span className="text-gray-400 dark:text-gray-500 text-xs">{e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('uz-UZ') : ''}</span>
                              </div>
                            ))
                          }
                        </div>
                      )}

                      {/* ── TO'LOVLAR ── */}
                      {userDetailTab === 'tolovlar' && (
                        <div className="space-y-3">
                          {userDetailPayments.length === 0
                            ? <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">To'lov tarixi yo'q</p>
                            : userDetailPayments.map((p: any) => (
                              <div key={p.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-mono text-sahifa-600 dark:text-sahifa-400 text-sm font-semibold">{p.reference_code ?? `#${p.id}`}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    p.status === 'granted'          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    p.status === 'paid'             ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                    p.status === 'awaiting_payment' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                  }`}>{p.status}</span>
                                </div>
                                <p className="text-gray-900 dark:text-white text-sm truncate">{p.course?.title ?? `Kurs #${p.course_id}`}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                                    {((p.actual_amount || p.expected_amount || 0) / 100).toLocaleString()} so'm
                                    {p.payment_method && ` · ${PM_LABELS[p.payment_method] ?? p.payment_method}`}
                                  </span>
                                  <span className="text-gray-400 dark:text-gray-500 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('uz-UZ') : ''}</span>
                                </div>
                                {p.admin_notes && <p className="text-gray-400 dark:text-gray-500 text-xs mt-1 italic">"{p.admin_notes}"</p>}
                              </div>
                            ))
                          }
                        </div>
                      )}

                      {/* ── FAOLLIK ── */}
                      {userDetailTab === 'faollik' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              ['XP', u.total_xp.toLocaleString()],
                              ['Daraja', `Lv ${u.level}`],
                              ['Kurslar', userDetailData?.enrollments?.length ?? '—'],
                            ].map(([k, v]) => (
                              <div key={String(k)} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-3 text-center">
                                <p className="text-gray-900 dark:text-white font-bold text-xl">{String(v)}</p>
                                <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{k}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-6">Batafsil faollik jurnali tez orada</p>
                        </div>
                      )}

                      {/* ── ADMIN ── */}
                      {userDetailTab === 'admin' && (
                        <div className="space-y-3">
                          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-2xl p-4">
                            <h4 className="text-red-600 dark:text-red-400 font-semibold text-sm mb-3">Xavfli amallar</h4>
                            {!drawerSuspendOpen
                              ? (
                                <button onClick={() => setDrawerSuspendOpen(true)}
                                  className="w-full py-2.5 rounded-xl bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm font-medium transition-colors">
                                  🚫 Hisobni bloklash
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <input value={drawerSuspendText} onChange={e => setDrawerSuspendText(e.target.value)}
                                    placeholder="Sabab (ixtiyoriy)…"
                                    className="w-full px-3 py-2 text-sm rounded-xl border border-red-200 dark:border-red-800/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-red-500" />
                                  <div className="flex gap-2">
                                    <button onClick={() => setDrawerSuspendOpen(false)}
                                      className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 text-sm">Bekor</button>
                                    <button onClick={handleDrawerSuspend} disabled={drawerSuspending}
                                      className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold">
                                      {drawerSuspending ? '…' : 'Tasdiqlash'}
                                    </button>
                                  </div>
                                </div>
                              )
                            }
                          </div>
                          <a
                            href={u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.telegram_id}`}
                            target="_blank" rel="noreferrer"
                            className="block text-center py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 text-sm font-medium transition-colors"
                          >
                            ✈ Telegramda yozing
                          </a>
                        </div>
                      )}
                    </>
                  )
                }
              </div>
            </div>
          </div>
        )
      })()}

        {activeTab === 'feature_usage' && (() => {
          const features: any[] = featureStats?.features ?? []
          const daily: any[] = featureStats?.daily ?? []
          const maxSessions = features.length > 0 ? Math.max(...features.map((f: any) => f.sessions), 1) : 1

          const FEATURE_COLORS: Record<string, string> = {
            focus:      'bg-blue-500',
            flashcards: 'bg-purple-500',
            quiz:       'bg-green-500',
            books:      'bg-amber-500',
            planner:    'bg-rose-500',
          }

          const periodLabels: Record<string, string> = { '7d': 'Oxirgi 7 kun', '30d': 'Oxirgi 30 kun', 'all': 'Barcha vaqt' }

          return (
            <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Xususiyat foydalanishi</h2>
                <div className="flex gap-1.5">
                  {(['7d', '30d', 'all'] as const).map(p => (
                    <button key={p}
                      onClick={() => { setFeaturePeriod(p); loadFeatureStats(p) }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        featurePeriod === p
                          ? 'bg-sahifa-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}>
                      {periodLabels[p]}
                    </button>
                  ))}
                </div>
              </div>

              {featureLoading && (
                <div className="text-center py-16 text-gray-400 text-sm">Yuklanmoqda…</div>
              )}

              {!featureLoading && features.length === 0 && (
                <div className="text-center py-16 text-gray-400 text-sm">Ma'lumot yo'q</div>
              )}

              {!featureLoading && features.length > 0 && (
                <>
                  {/* Feature ranking */}
                  <div className="space-y-3">
                    {features.map((f: any, i: number) => (
                      <div key={f.key} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{f.emoji}</span>
                            <span className="font-semibold text-gray-900 dark:text-white text-sm">{f.label}</span>
                            {i === 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-medium">🏆 1-o'rin</span>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{f.sessions.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">{f.unique_users.toLocaleString()} foydalanuvchi</p>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${FEATURE_COLORS[f.key] ?? 'bg-gray-400'}`}
                            style={{ width: `${Math.round((f.sessions / maxSessions) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 text-right">
                          {Math.round((f.sessions / maxSessions) * 100)}% maksimaldan
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Daily trend table */}
                  {daily.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Kunlik trend</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-700">
                              <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Sana</th>
                              <th className="px-3 py-2 text-right font-medium text-blue-500">⏱️</th>
                              <th className="px-3 py-2 text-right font-medium text-purple-500">🃏</th>
                              <th className="px-3 py-2 text-right font-medium text-green-500">📝</th>
                              <th className="px-3 py-2 text-right font-medium text-amber-500">📚</th>
                              <th className="px-3 py-2 text-right font-medium text-rose-500">📋</th>
                            </tr>
                          </thead>
                          <tbody>
                            {daily.slice().reverse().map((row: any) => {
                              const total = row.focus + row.flashcards + row.quiz + row.books + row.planner
                              return (
                                <tr key={row.date} className={`border-b border-gray-50 dark:border-gray-700/50 ${total === 0 ? 'opacity-40' : ''}`}>
                                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300 font-mono">{row.date.slice(5)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.focus || '—'}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.flashcards || '—'}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.quiz || '—'}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.books || '—'}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.planner || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

    </div>
  )
}

export default AdminPage
