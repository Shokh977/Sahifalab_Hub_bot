import React, { useCallback, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ErrorBoundary, ToastContainer } from './components/ErrorBoundary'
import HeroSection from './components/HeroSection'
import MenuGrid from './components/MenuGrid'
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
import DailyPage from './pages/DailyPage'
import PlansPage from './pages/PlansPage'
import GlobalProgressBar from './components/GlobalProgressBar'
import ProgressProvider from './components/ProgressProvider'
import { useTelegramWebApp, useTelegramBackButton } from './hooks/useTelegramWebApp'

const ADMIN_TELEGRAM_IDS = [807466591]

const HomePage: React.FC = () => {
  const { user } = useTelegramWebApp()

  return (
    <main className="max-w-md mx-auto pt-6 px-5 pb-28 paper-texture">
      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-sahifa-400 via-sahifa-500 to-sahifa-600 bg-clip-text text-transparent">
              SAHIFALAB
            </span>
          </h1>
          <ThemeToggle />
        </div>

        {/* Sam speech bubble */}
        <div className="speech-bubble mt-4 px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            {user?.first_name
              ? `Assalomu alaykum, ${user.first_name}! 👋`
              : 'Assalomu alaykum! 👋'}
          </p>
          <p className="text-xs text-sahifa-600/80 dark:text-sahifa-400/80 mt-1 italic">
           Sahifalab sizning mentoringiz 📚
          </p>
        </div>
      </motion.div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <HeroSection />
      </motion.div>

      {/* ── Menu Grid ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <MenuGrid />
      </motion.div>

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

// Handles Telegram BackButton for the whole app
const TelegramBackButtonHandler: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'
  const handleBack = useCallback(() => navigate(-1), [navigate])
  useTelegramBackButton(isHome, handleBack)

  // Google Analytics — track page views on route change
  useEffect(() => {
    const g = (window as any).gtag
    if (typeof g === 'function') {
      g('event', 'page_view', { page_path: location.pathname })
    }
  }, [location.pathname])

  return null
}

// Route guard: only allows admin Telegram users through
const AdminRoute: React.FC = () => {
  const { user } = useTelegramWebApp()
  const isAdmin = user?.id ? ADMIN_TELEGRAM_IDS.includes(user.id) : false

  // If Telegram WebApp not loaded yet (user is null), still show AdminPage
  // because it has its own login gate. But if user IS detected and NOT admin, redirect.
  if (user && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <AdminPage />
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-950 transition-colors duration-300">
        <Router>
          <ProgressProvider>
            <TelegramBackButtonHandler />
            <GlobalProgressBar />
            <Routes>
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
              <Route path="/daily" element={<DailyPage />} />
              <Route path="/plans" element={<PlansPage />} />
            </Routes>
          </ProgressProvider>
        </Router>
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}

export default App
