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
import { motion } from 'framer-motion'
import {
  useProgressStore,
  levelProgress,
  levelBounds,
  formatFocusTime,
} from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { LEVEL_TITLES, getLevelTitle, getLevelDescription, getLevelEmoji } from '../utils/levelTitles'
import CertificateGenerator, { CertificateData } from '../components/CertificateGenerator'
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

// ── Avatar colour based on telegram_id ───────────────────────────────────────
const AVATAR_COLORS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-emerald-400 to-green-600',
  'from-orange-400 to-amber-600',
  'from-pink-400 to-rose-600',
  'from-indigo-400 to-violet-600',
  'from-teal-400 to-cyan-600',
]

function avatarColor(telegramId: number | null): string {
  if (!telegramId) return AVATAR_COLORS[0]
  return AVATAR_COLORS[telegramId % AVATAR_COLORS.length]
}

// ── Level gradient ───────────────────────────────────────────────────────────
function levelGradient(level: number): string {
  if (level >= 50) return 'from-amber-300 to-yellow-600'
  if (level >= 40) return 'from-rose-500 to-pink-700'
  if (level >= 30) return 'from-indigo-500 to-violet-700'
  if (level >= 25) return 'from-fuchsia-400 to-purple-600'
  if (level >= 20) return 'from-rose-400 to-pink-600'
  if (level >= 15) return 'from-indigo-400 to-violet-600'
  if (level >= 10) return 'from-orange-400 to-red-500'
  if (level >= 7)  return 'from-yellow-400 to-amber-500'
  if (level >= 5)  return 'from-purple-400 to-purple-600'
  if (level >= 3)  return 'from-blue-400 to-blue-600'
  if (level >= 2)  return 'from-emerald-400 to-green-500'
  return 'from-gray-400 to-gray-500'
}

// ── Menu row component ────────────────────────────────────────────────────────
const MenuRow: React.FC<{
  icon: string
  label: string
  sublabel?: string
  value?: string
  onClick?: () => void
}> = ({ icon, label, sublabel, value, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
  >
    <span className="text-xl w-8 text-center flex-shrink-0">{icon}</span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{label}</p>
      {sublabel && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{sublabel}</p>
      )}
    </div>
    {value && (
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{value}</span>
    )}
    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
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
  emoji: string
  value: string | number
  label: string
}> = ({ emoji, value, label }) => (
  <div className="flex-1 text-center py-3">
    <p className="text-lg font-bold text-gray-900 dark:text-white">{emoji} {value}</p>
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

// ── XP needed for a target level ──────────────────────────────────────────────
function xpNeededForLevel(targetLevel: number): number {
  return Math.max(0, (targetLevel - 1) ** 2 * 100)
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════
const CabinetPage: React.FC = () => {
  const navigate = useNavigate()
  const { user: tgUser } = useTelegramWebApp()
  const {
    telegramId, firstName, username,
    totalXP, focusSeconds, level, quizzesCompleted,
    isLoading,
  } = useProgressStore()

  const [photoError, setPhotoError] = useState(false)
  const photoUrl = (!photoError && tgUser?.photo_url) ? tgUser.photo_url : null

  // Certificate & books state
  const [completedQuizzes, setCompletedQuizzes] = useState<CompletedQuiz[]>([])
  const [purchasedBooks, setPurchasedBooks] = useState<PurchasedBook[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showCert, setShowCert] = useState(false)
  const [certData, setCertData] = useState<CertificateData | null>(null)
  const [expandCerts, setExpandCerts] = useState(false)
  const [expandBooks, setExpandBooks] = useState(false)

  const progress  = levelProgress(totalXP)
  const { start, end } = levelBounds(level)
  const xpInLevel = totalXP - start
  const xpForLevel = end - start
  const grad = levelGradient(level)
  const displayName = firstName || 'Foydalanuvchi'
  const focusHours = (focusSeconds / 3600).toFixed(1)

  // ── Load certificates & purchased books ──────────────────────────────────
  useEffect(() => {
    if (!telegramId) { setLoadingData(false); return }
    setLoadingData(true)

    Promise.all([
      fetchMyCompletedQuizzes(telegramId).then(async (completions) => {
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
      fetchMyPurchasedBooks(telegramId).then(async (purchases) => {
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
  }, [telegramId])

  // ── Open certificate modal ──────────────────────────────────────────────
  const openCertificate = useCallback((quiz: CompletedQuiz) => {
    setCertData({
      userName: displayName,
      quizTitle: quiz.quiz_title || `Quiz #${quiz.quiz_id}`,
      score: quiz.score,
      total: quiz.total,
      percentage: quiz.percentage,
      date: new Date(quiz.completed_at).toLocaleDateString('uz-UZ'),
      certificateId: `SL-${quiz.quiz_id}-${telegramId}-${quiz.id}`,
    })
    setShowCert(true)
  }, [displayName, telegramId])

  const visibleCerts = expandCerts ? completedQuizzes : completedQuizzes.slice(0, 3)
  const visibleBooks = expandBooks ? purchasedBooks : purchasedBooks.slice(0, 3)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-spin">⏳</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Yuklanmoqda…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto pb-24 space-y-3">

      {/* ═══ Profile Header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="px-4 pt-4 pb-5"
      >
        {/* Top row: Avatar + Name + XP */}
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0 relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                onError={() => setPhotoError(true)}
                className="w-16 h-16 rounded-full object-cover shadow-lg ring-2 ring-white dark:ring-gray-700"
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarColor(telegramId)} flex items-center justify-center shadow-lg`}
              >
                <span className="text-2xl font-black text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Level pip */}
            <div
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-r ${grad} text-white text-[10px] font-black flex items-center justify-center shadow-md border-2 border-white dark:border-gray-900`}
            >
              {level}
            </div>
          </div>

          {/* Name + handle + level */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-gray-900 dark:text-white truncate">
              {displayName}
            </h1>
            {username && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{username}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${grad} text-white text-[11px] font-semibold shadow-sm`}
              >
                <span>{getLevelEmoji(level)}</span>
                <span>{getLevelTitle(level)}</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                ⚡ {totalXP.toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>

        {/* XP progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 px-0.5">
            <span>Lv.{level}</span>
            <span>{xpInLevel} / {xpForLevel} XP</span>
            <span>Lv.{level + 1}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${grad}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ═══ Stats Row ═══ */}
      <Section delay={0.05}>
        <div className="flex divide-x divide-gray-100 dark:divide-gray-700/50">
          <StatPill emoji="⏱" value={`${focusHours}h`} label="Diqqat" />
          <StatPill emoji="📝" value={quizzesCompleted} label="Testlar" />
          <StatPill emoji="⚡" value={totalXP.toLocaleString()} label="XP" />
          <StatPill emoji="🏅" value={level} label="Daraja" />
        </div>
      </Section>

      {/* ═══ Certificates Section ═══ */}
      <Section delay={0.1}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎓</span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sertifikatlarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {completedQuizzes.length} ta
          </span>
        </div>

        {loadingData ? (
          <div className="px-4 py-6 text-center">
            <div className="text-2xl animate-pulse">⏳</div>
          </div>
        ) : completedQuizzes.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-3xl mb-2">📜</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali sertifikat yo'q</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Quizlardan 80%+ oling va sertifikat qozing!</p>
            <button
              onClick={() => navigate('/quiz')}
              className="mt-3 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600"
            >
              Quizlarga o'tish →
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
                  <span className="text-lg">🏆</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {quiz.quiz_title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {quiz.score}/{quiz.total} ({quiz.percentage}%) • {new Date(quiz.completed_at).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
                <span className="text-xs font-medium text-sahifa-500">Yuklab olish</span>
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

      {/* ═══ Purchased Books Section ═══ */}
      <Section delay={0.15}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Xarid qilgan kitoblarim</h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {purchasedBooks.length} ta
          </span>
        </div>

        {loadingData ? (
          <div className="px-4 py-6 text-center">
            <div className="text-2xl animate-pulse">⏳</div>
          </div>
        ) : purchasedBooks.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Hali kitob sotib olinmagan</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Premium kitoblarni sotib oling</p>
            <button
              onClick={() => navigate('/kitoblar')}
              className="mt-3 text-xs font-semibold text-sahifa-500 hover:text-sahifa-600"
            >
              Kitoblarga o'tish →
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
                      <span className="text-lg">📕</span>
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
                  <span className="text-xs font-medium text-emerald-500">📥</span>
                )}
                <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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
          icon="🏆"
          label="Liderlar Jadvali"
          sublabel="Top 10 o'quvchilar"
          onClick={() => navigate('/leaderboard')}
        />
        <MenuRow
          icon="📝"
          label="Testlar"
          sublabel="Bilimingizni sinab ko'ring"
          onClick={() => navigate('/quiz')}
        />
        <MenuRow
          icon="📚"
          label="Kitoblar"
          sublabel="Bepul va Premium kitoblar"
          onClick={() => navigate('/kitoblar')}
        />
        <MenuRow
          icon="🎯"
          label="O'qish sessiyasi"
          sublabel="Fokus timer + ambient sounds"
          onClick={() => navigate('/study')}
        />
        <MenuRow
          icon="🤖"
          label="SahifaLab AI"
          sublabel="Savolingiz bormi? Yozing!"
          onClick={() => navigate('/ai-companion')}
        />
      </Section>

      {/* ═══ Badges / Yutuqlar Section ═══ */}
      {(() => {
        const earned = LEVEL_TITLES.filter(b => level >= b.level)
        const locked = LEVEL_TITLES.filter(b => level < b.level)
        const nextBadge = locked[0]
        const xpForNext = nextBadge ? xpNeededForLevel(nextBadge.level) : 0
        const xpLeft = Math.max(0, xpForNext - totalXP)
        const progressToNext = nextBadge
          ? Math.min(1, (totalXP - xpNeededForLevel(nextBadge.level - 1)) / Math.max(1, xpForNext - xpNeededForLevel(nextBadge.level - 1)))
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
                <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">🎯 Keyingi yutuq</p>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/80 dark:bg-gray-800/60 border-2 border-blue-200 dark:border-blue-700 flex items-center justify-center shadow-sm">
                    <span className="text-2xl">{getLevelEmoji(nextBadge.level)}</span>
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
                  <span className="text-lg">🏅</span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Yutuqlar</h2>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {earned.length} / {LEVEL_TITLES.length} ochildi
                </span>
              </div>

              {/* Earned badges */}
              {earned.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">✅ Ochildi</p>
                  <div className="grid grid-cols-4 gap-2">
                    {earned.map((b) => (
                      <div
                        key={b.level}
                        className="rounded-xl p-2 text-center bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30"
                      >
                        <div className="text-xl leading-none">{getLevelEmoji(b.level)}</div>
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
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">🔒 Yopiq ({locked.length})</p>
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
                            <span className="text-base opacity-40 grayscale">{getLevelEmoji(b.level)}</span>
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
                  <p className="text-3xl mb-2">🌱</p>
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
          icon="🔗"
          label="Resurslar"
          sublabel="Foydali linklar va videolar"
          onClick={() => navigate('/resources')}
        />
        <MenuRow
          icon="🔥"
          label="Kunlik vazifalar"
          sublabel="Daily streak va missiyalar"
          onClick={() => navigate('/daily')}
        />
        <MenuRow
          icon="🗓️"
          label="O'qish rejasi"
          sublabel="7/14/30 kunlik yo'l xaritasi"
          onClick={() => navigate('/plans')}
        />
        <MenuRow
          icon="ℹ️"
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
          📌 <strong>Daraja qanday oshadi?</strong> Yangi quizlardan olingan XP va fokus vaqtidan.
          <br />
          🛡️ <strong>XP farming o'chirilgan:</strong> bir xil quizni qayta ishlash orqali XP olinmaydi.
          <br />
          🎓 <strong>Sertifikat:</strong> Quiz natijasi 80%+ bo'lsa, sertifikat yuklab olinadi.
        </p>
      </motion.div>

      {/* Spacer */}
      <div className="h-4" />

      {/* ═══ Certificate Modal ═══ */}
      {showCert && certData && (
        <CertificateGenerator data={certData} onClose={() => setShowCert(false)} />
      )}
    </div>
  )
}

export default CabinetPage
