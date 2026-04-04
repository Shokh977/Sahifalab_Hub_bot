import React, { useCallback, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpenIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { ErrorBoundary, ToastContainer } from './components/ErrorBoundary'
import HeroSection from './components/HeroSection'
import MenuGrid from './components/MenuGrid'
import DashboardHome from './components/DashboardHome'
import ThemeToggle from './components/ThemeToggle'
import StudyWithMe from './pages/StudyPage'
import QuizPage from './pages/QuizPage'
import KitoblarPage from './pages/KitoblarPage'
import BookDetailPage from './pages/BookDetailPage'
import ResourcesPage from './pages/ResourcesPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import CabinetPage from './pages/CabinetPage'
import LeaderboardPage from './pages/LeaderboardPage'
import BookSummarizerPage from './pages/BookSummarizerPage'
import AICompanionPage from './pages/AICompanionPage'
import GlobalProgressBar from './components/GlobalProgressBar'
import ProgressProvider from './components/ProgressProvider'
import TelegramLayout from './components/TelegramLayout'
import WebLayout from './components/WebLayout'
import AuthGuard from './components/AuthGuard'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import RoleGuard from './components/RoleGuard'
import TeacherDashboardPage from './pages/TeacherDashboardPage'
import TeacherApplyPage from './pages/TeacherApplyPage'
import TeacherProfileSetupPage from './pages/TeacherProfileSetupPage'
import TeacherPublicPage from './pages/TeacherPublicPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'
import CourseCreatePage from './pages/CourseCreatePage'
import LessonCreatePage from './pages/LessonCreatePage'
import { usePlatform } from './hooks/usePlatform'
import { useTelegramBackButton } from './hooks/useTelegramWebApp'

const HomePage: React.FC = () => {
  const { user } = useAuth()
  const { isTelegram } = usePlatform()

  // Web mode: premium dashboard (sidebar already handles navigation)
  if (!isTelegram) return <DashboardHome />

  return (
    <main className={`mx-auto pt-6 px-5 pb-10 paper-texture ${isTelegram ? 'max-w-md pb-28' : 'max-w-6xl'}`}>

      {/* ── Desktop two-column layout ───────────────────────────────────── */}
      <div className="lg:flex lg:gap-12 lg:items-start">

        {/* Left column: header + hero (desktop) or full width (Telegram/mobile) */}
        <div className="lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-4">

          {/* Header — hidden in web (sidebar already shows logo) */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`mb-6 ${!isTelegram ? 'lg:hidden' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sahifa-500 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(255,106,42,0.18)]">
                  <BookOpenIcon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-gray-900 dark:text-white">
                    SAHIFALAB
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Premium learning workspace</p>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </motion.div>

          {/* Welcome card — always visible */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mb-6"
          >
            <div className="speech-bubble px-4 py-3">
              <div className="flex items-center gap-2 mb-2 text-sahifa-500">
                <SparklesIcon className="w-4 h-4" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Dashboard</span>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed font-medium">
                {user?.first_name
                  ? `Assalomu alaykum, ${user.first_name}!`
                  : 'Assalomu alaykum!'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Fokus, kurslar va bilim — bitta tartibli ish maydonida.
              </p>
            </div>
          </motion.div>

          {/* Hero — below welcome on mobile, sidebar-pinned on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <HeroSection />
          </motion.div>
        </div>

        {/* Right column: Menu Grid */}
        <div className="flex-1 min-w-0 mt-6 lg:mt-0">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Section label on desktop */}
            <p className="hidden lg:block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500 mb-3">
              Asosiy bo'limlar
            </p>
            <MenuGrid />
          </motion.div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-12 text-center space-y-1.5"
      >
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-sahifa-500/30 to-transparent mx-auto" />
        <p className="text-[11px] text-slate-400 dark:text-slate-500 tracking-wide font-medium">
          @Sahifalab_hub_bot
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-600">
          Powered by SAHIFALAB · 2026
        </p>
      </motion.footer>
    </main>
  )
}

// Handles Telegram BackButton for the whole app (Telegram mode only)
const TelegramBackButtonHandler: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'
  const handleBack = useCallback(() => navigate(-1), [navigate])
  useTelegramBackButton(isHome, handleBack)
  return null
}

// Route guard: only allows admin role through
const AdminRoute: React.FC = () => {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />

  return <AdminPage />
}

// 404 page
const NotFoundPage: React.FC = () => {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 bg-[#FAFAFA] dark:bg-slate-950">
      <div className="w-20 h-20 rounded-[28px] bg-sahifa-500/10 text-sahifa-500 flex items-center justify-center">
        <BookOpenIcon className="w-9 h-9" />
      </div>
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">404</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Bu sahifa mavjud emas</p>
      </div>
      <button
        onClick={() => navigate('/', { replace: true })}
        className="px-6 py-2.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        Bosh sahifaga qaytish
      </button>
    </div>
  )
}

// All app routes — shared between both layout modes
const AppRoutes: React.FC = () => (
  <Routes>
    {/* Public — accessible without authentication */}
    <Route path="/login" element={<LoginPage />} />

    {/* Protected — AuthGuard checks JWT in web mode; passes through in Telegram */}
    <Route element={<AuthGuard />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<StudyWithMe />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="/kitoblar" element={<KitoblarPage />} />
      <Route path="/kitoblar/:id" element={<BookDetailPage />} />
      <Route path="/resources" element={<ResourcesPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/cabinet" element={<CabinetPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/book-summarizer" element={<BookSummarizerPage />} />
      <Route path="/ai-companion" element={<AICompanionPage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/courses/:id" element={<CourseDetailPage />} />

      {/* Public teacher profile page — no auth required */}
      <Route path="/teacher/:id" element={<TeacherPublicPage />} />

      {/* Teacher & Admin role-gated routes */}
      <Route element={<RoleGuard roles={['teacher', 'admin']} />}>
        <Route path="/teacher" element={<TeacherDashboardPage />} />
        <Route path="/teacher/setup" element={<TeacherProfileSetupPage />} />
        <Route path="/courses/create" element={<CourseCreatePage />} />
        <Route path="/courses/:id/edit" element={<CourseCreatePage />} />
        <Route path="/courses/:courseId/lessons/add" element={<LessonCreatePage />} />
        <Route path="/courses/:courseId/lessons/:lessonId/edit" element={<LessonCreatePage />} />
      </Route>

      {/* Teacher application — any authenticated user */}
      <Route path="/become-teacher" element={<TeacherApplyPage />} />
    </Route>

    {/* 404 — catch-all */}
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
)

/**
 * MaintenanceBanner — shows a dismissible Uzbek warning until 11-April 2026.
 * Auto-hidden after the deadline; dismissed state stored in sessionStorage.
 */
const MAINTENANCE_END = new Date('2026-04-11T00:00:00+05:00') // UTC+5 Tashkent

const MaintenanceBanner: React.FC = () => {
  const [visible, setVisible] = React.useState(() => {
    if (new Date() >= MAINTENANCE_END) return false
    return sessionStorage.getItem('maintenance_dismissed') !== '1'
  })

  if (!visible) return null

  return (
    <div className="relative z-[9999] w-full bg-amber-400 dark:bg-amber-500 text-amber-950 dark:text-amber-950">
      <div className="max-w-3xl mx-auto flex items-start gap-3 px-4 py-3 text-sm">
        <span className="text-xl leading-none mt-0.5" aria-hidden>🚧</span>
        <div className="flex-1 leading-snug">
          <span className="font-bold">Texnik ishlar davom etmoqda.</span>{' '}
          Platforma <span className="font-semibold">11-aprelgacha</span> yangilanish
          jarayonida — ba'zi bo'limlar vaqtincha cheklangan bo'lishi mumkin.
          Noqulaylik uchun uzr so'raymiz 🙏
        </div>
        <button
          onClick={() => { sessionStorage.setItem('maintenance_dismissed', '1'); setVisible(false) }}
          className="flex-shrink-0 ml-1 p-0.5 rounded hover:bg-amber-500/40 dark:hover:bg-amber-600/40 transition-colors"
          aria-label="Yopish"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * AppShell — picks TelegramLayout or WebLayout based on detected platform.
 *
 * Telegram Mini App:  TelegramLayout → same behavior as before (no change)
 * Normal browser:     WebLayout → desktop sidebar + mobile bottom nav
 *
 * GA4 page view tracking runs in BOTH modes from a single place here.
 */
const AppShell: React.FC = () => {
  const { isTelegram } = usePlatform()
  const location = useLocation()

  // Google Analytics — track page views on every route change (both modes)
  useEffect(() => {
    const g = (window as any).gtag
    if (typeof g === 'function') {
      g('event', 'page_view', { page_path: location.pathname })
    }
  }, [location.pathname])

  if (isTelegram) {
    return (
      <TelegramLayout>
        <MaintenanceBanner />
        <TelegramBackButtonHandler />
        <GlobalProgressBar />
        <AppRoutes />
      </TelegramLayout>
    )
  }

  return (
    <WebLayout>
      <MaintenanceBanner />
      <AppRoutes />
    </WebLayout>
  )
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <ProgressProvider>
            <AppShell />
          </ProgressProvider>
        </AuthProvider>
        <ToastContainer />
      </Router>
    </ErrorBoundary>
  )
}

export default App
