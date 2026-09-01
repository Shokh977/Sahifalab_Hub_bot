/**
 * FlashcardStudyPage — the SM-2 study/review session (/flashcards/:deckId/study).
 *
 * Bare route (no AppLayout sidebar column) — an immersive, centered card
 * flow, wider and more spacious on desktop than the mobile phone-width
 * stepper this mirrors conceptually (app/(screens)/flashcard-study/[id].tsx).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw, CheckCircle2, Clock, Zap, ArrowRight } from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import type { FlashcardDeck, Flashcard } from '../types/flashcards'

type Rating = 1 | 2 | 3 | 4

const RATING_BUTTONS: { rating: Rating; label: string; className: string }[] = [
  { rating: 1, label: 'Bilmayman', className: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30' },
  { rating: 2, label: 'Qiyin', className: 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30' },
  { rating: 3, label: 'Bilaman', className: 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30' },
  { rating: 4, label: 'Oson', className: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30' },
]

function cardFontSize(text: string): string {
  if (text.length > 100) return 'text-base sm:text-lg'
  if (text.length > 50) return 'text-lg sm:text-xl'
  if (text.length > 20) return 'text-xl sm:text-2xl'
  return 'text-2xl sm:text-3xl'
}

type View = 'loading' | 'studying' | 'complete' | 'empty' | 'error'

const FlashcardStudyPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const practice = searchParams.get('practice') === '1'
  const navigate = useNavigate()
  const id = Number(deckId)

  const [view, setView] = useState<View>('loading')
  const [deck, setDeck] = useState<FlashcardDeck | null>(null)
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [totalInSession, setTotalInSession] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState<{ xp_awarded: number; streak_days: number } | null>(null)

  const startedAtRef = useRef<number>(Date.now())
  const cardStartRef = useRef<number>(Date.now())

  const current = queue[0] ?? null

  useEffect(() => {
    let cancelled = false
    Promise.all([apiService.getFlashcardDeck(id), apiService.getFlashcardStudySession(id, practice)])
      .then(([deckRes, sessionRes]) => {
        if (cancelled) return
        setDeck(deckRes.data)
        const cards: Flashcard[] = sessionRes.data.cards
        if (cards.length === 0) { setView('empty'); return }
        setQueue(cards)
        setTotalInSession(cards.length)
        startedAtRef.current = Date.now()
        cardStartRef.current = Date.now()
        setView('studying')
      })
      .catch(() => { if (!cancelled) setView('error') })
    return () => { cancelled = true }
  }, [id, practice])

  const finishSession = useCallback(async (finalReviewed: number) => {
    setCompleting(true)
    try {
      const { data } = await apiService.completeFlashcardSession(id, {
        total_time_ms: Date.now() - startedAtRef.current,
        cards_reviewed: finalReviewed,
      })
      setResult({ xp_awarded: data.xp_awarded, streak_days: data.streak_days })
      if (data.stages_completed?.length > 0) {
        showToast(`Yangi bosqich: ${data.stages_completed[0].title}!`, 'success')
      }
    } catch {
      setResult({ xp_awarded: 0, streak_days: 0 })
    } finally {
      setView('complete')
      setCompleting(false)
    }
  }, [id])

  const handleRate = useCallback((rating: Rating) => {
    if (!current) return
    const timeSpent = Date.now() - cardStartRef.current
    apiService.reviewFlashcard(current.id, { rating, time_spent_ms: timeSpent }).catch(() => {})

    const nextReviewed = reviewed + 1
    setReviewed(nextReviewed)
    if (rating >= 3) setCorrectCount(c => c + 1)

    setQueue(prev => {
      const rest = prev.slice(1)
      if (rating === 1) {
        // "Forgot" — show it again later in the same session, not removed.
        const reinsertAt = Math.min(3, rest.length)
        return [...rest.slice(0, reinsertAt), current, ...rest.slice(reinsertAt)]
      }
      return rest
    })
    setFlipped(false)
    cardStartRef.current = Date.now()

    const isLastEver = rating !== 1 && queue.length === 1
    if (isLastEver) finishSession(nextReviewed)
  }, [current, reviewed, queue.length, finishSession])

  const accuracy = reviewed > 0 ? Math.round((correctCount / reviewed) * 100) : 0
  const progressPct = totalInSession > 0 ? Math.round((reviewed / totalInSession) * 100) : 0

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-sahifa-500 animate-spin" />
        </div>
      </div>
    )
  }

  if (view === 'empty' || view === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-slate-900 px-4 text-center">
        <p className="text-gray-700 dark:text-gray-200 font-semibold">
          {view === 'empty' ? "Bu to'plamda hozircha o'rganish uchun karta yo'q" : "Yuklab bo'lmadi"}
        </p>
        <button onClick={() => navigate(`/flashcards/${id}`)} className="text-sahifa-500 font-semibold text-sm">
          To'plamga qaytish
        </button>
      </div>
    )
  }

  // ── Session complete ────────────────────────────────────────────────────
  if (view === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 text-center shadow-xl"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Sessiya yakunlandi!</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{deck?.title}</p>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{reviewed}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Ko'rib chiqildi</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{accuracy}%</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Aniqlik</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white inline-flex items-center gap-0.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />{completing ? '…' : `+${result?.xp_awarded ?? 0}`}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">XP</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/flashcards/${id}`)}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              To'plamga qaytish
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />Yana
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Studying ─────────────────────────────────────────────────────────────
  if (!current) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="max-w-2xl w-full mx-auto px-4 pt-5 pb-2 flex items-center gap-3">
        <button onClick={() => navigate(`/flashcards/${id}`)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span className="font-medium truncate">{deck?.title}</span>
            <span className="tabular-nums shrink-0 ml-2">{reviewed} / {totalInSession}</span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: deck?.color ?? '#F5A623' }}
            />
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">
          <div
            className="relative w-full aspect-[16/9] sm:aspect-[2/1] cursor-pointer"
            style={{ perspective: '1400px' }}
            onClick={() => setFlipped(f => !f)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  {/* Front */}
                  <div
                    className="absolute inset-0 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center p-8 sm:p-12"
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    <p className={`font-bold text-gray-900 dark:text-white text-center leading-snug ${cardFontSize(current.front_text)}`}>
                      {current.front_text}
                    </p>
                  </div>
                  {/* Back */}
                  <div
                    className="absolute inset-0 rounded-3xl bg-sahifa-50 dark:bg-sahifa-900/20 border border-sahifa-200 dark:border-sahifa-800/40 shadow-lg flex items-center justify-center p-8 sm:p-12"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  >
                    <p className={`font-bold text-gray-900 dark:text-white text-center leading-snug ${cardFontSize(current.back_text)}`}>
                      {current.back_text}
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3 inline-flex items-center gap-1 justify-center w-full">
            {!flipped ? (
              <>Javobni ko'rish uchun bosing <ArrowRight className="w-3 h-3" /></>
            ) : (
              <><Clock className="w-3 h-3" />Qanchalik yaxshi bildingiz?</>
            )}
          </p>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="max-w-2xl w-full mx-auto px-4 pb-8">
        <div className={`grid grid-cols-4 gap-2 transition-opacity ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {RATING_BUTTONS.map((btn) => (
            <button
              key={btn.rating}
              onClick={() => handleRate(btn.rating)}
              className={`py-3 rounded-xl font-semibold text-sm transition-colors ${btn.className}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default FlashcardStudyPage
