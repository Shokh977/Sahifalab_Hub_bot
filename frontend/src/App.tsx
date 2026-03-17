import React, { useCallback } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import HeroSection from './components/HeroSection'
import MenuGrid from './components/MenuGrid'
import StudyWithMe from './pages/StudyPage'
import QuizPage from './pages/QuizPage'
import KitoblarPage from './pages/KitoblarPage'
import BookDetailPage from './pages/BookDetailPage'
import ResourcesPage from './pages/ResourcesPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import CabinetPage from './pages/CabinetPage'
import LeaderboardPage from './pages/LeaderboardPage'
import GlobalProgressBar from './components/GlobalProgressBar'
import ProgressProvider from './components/ProgressProvider'
import { useTelegramWebApp, useTelegramBackButton } from './hooks/useTelegramWebApp'

const ADMIN_TELEGRAM_IDS = [807466591]

const HomePage: React.FC = () => {
  const { user } = useTelegramWebApp()

  return (
    <main className="max-w-md mx-auto py-4 px-4 pb-20">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-sahifa-700 dark:text-sahifa-300">
          SAHIFALAB
        </h1>
        <p className="text-base text-gray-700 dark:text-gray-300 mt-1 font-medium">
          {user?.first_name
            ? `Assalomu alaykum, ${user.first_name}! 👋`
            : 'Assalomu alaykum! 👋'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Men Sam — o'qishni osonlashtiramiz 📚
        </p>
      </div>

      <HeroSection />
      <MenuGrid />
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
    <div className="min-h-screen bg-white dark:bg-gray-900">
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
          </Routes>
        </ProgressProvider>
      </Router>
    </div>
  )
}

export default App
