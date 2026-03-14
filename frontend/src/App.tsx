import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HeroSection from './components/HeroSection'
import MenuGrid from './components/MenuGrid'
import StudyWithMe from './pages/StudyPage'
import QuizPage from './pages/QuizPage'
import KitoblarPage from './pages/KitoblarPage'
import ResourcesPage from './pages/ResourcesPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import { useTelegramWebApp } from './hooks/useTelegramWebApp'

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

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/study" element={<StudyWithMe />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/kitoblar" element={<KitoblarPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Router>
    </div>
  )
}

export default App
