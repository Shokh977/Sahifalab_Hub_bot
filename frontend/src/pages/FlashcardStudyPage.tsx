/**
 * FlashcardStudyPage — SM-2 study/review session (View D), full width,
 * no rail — bare route so the card gets room on desktop.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { X, Check, RotateCcw } from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import { useThemeStore } from '../context/themeStore'
import './flashcards/flashcards.css'
import type { FlashcardDeck, Flashcard } from '../types/flashcards'

type Rating = 1 | 2 | 3

function fmtDays(d: number): string {
  if (d <= 1) return 'Ertaga'
  if (d < 7) return `${d} kundan keyin`
  if (d < 30) return `${Math.round(d / 7)} haftadan keyin`
  return `${Math.round(d / 30)} oydan keyin`
}

/** Mirrors backend's _apply_sm2 (weekly_review_service-style deterministic
 * preview) purely for the UI hint under each rating button — the real
 * scheduling decision always happens server-side in POST .../review. */
function previewLabel(card: Flashcard, rating: Rating): string {
  if (rating === 1) return 'Shu seansda yana'
  const rep = card.repetitions
  const iv = card.interval_days
  const ef = card.ease_factor
  if (rating === 2) {
    const newRep = rep + 1
    const newIv = newRep > 1 ? Math.max(1, iv * 1.2) : 1
    return fmtDays(Math.round(newIv))
  }
  const newRep = rep + 1
  const newIv = newRep === 1 ? 1 : newRep === 2 ? 3 : iv * ef
  return fmtDays(Math.round(newIv))
}

type View = 'loading' | 'studying' | 'complete' | 'empty' | 'error'

const FlashcardStudyPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const practice = searchParams.get('practice') === '1'
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const id = Number(deckId)

  const [view, setView] = useState<View>('loading')
  const [deck, setDeck] = useState<FlashcardDeck | null>(null)
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [totalInSession, setTotalInSession] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState<{ xp_awarded: number } | null>(null)

  const startedAtRef = useRef<number>(Date.now())
  const cardStartRef = useRef<number>(Date.now())
  const current = queue[0] ?? null

  useEffect(() => {
    let cancelled = false
    Promise.all([apiService.getFlashcardDeck(id), apiService.getFlashcardStudySession(id, practice)])
      .then(([deckRes, sessionRes]) => {
        if (cancelled) return
        setDeck(deckRes.data)
        const cards: Flashcard[] = Array.isArray(sessionRes.data?.cards) ? sessionRes.data.cards : []
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

  useEffect(() => {
    if (view !== 'studying') return
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [view])

  const finishSession = useCallback(async (finalReviewed: number) => {
    setCompleting(true)
    try {
      const { data } = await apiService.completeFlashcardSession(id, {
        total_time_ms: Date.now() - startedAtRef.current,
        cards_reviewed: finalReviewed,
      })
      setResult({ xp_awarded: data.xp_awarded })
      if (data.stages_completed?.length > 0) showToast(`Yangi bosqich: ${data.stages_completed[0].title}!`, 'success')
    } catch {
      setResult({ xp_awarded: 0 })
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

    const wasLast = rating !== 1 && queue.length === 1
    setQueue(prev => {
      const rest = prev.slice(1)
      if (rating === 1) {
        const reinsertAt = Math.min(3, rest.length)
        return [...rest.slice(0, reinsertAt), current, ...rest.slice(reinsertAt)]
      }
      return rest
    })
    setFlipped(false)
    cardStartRef.current = Date.now()
    if (wasLast) finishSession(nextReviewed)
  }, [current, reviewed, queue.length, finishSession])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (view !== 'studying') return
      if (e.code === 'Escape') { navigate(`/flashcards/${id}`); return }
      if (e.code === 'Space') { e.preventDefault(); setFlipped(f => !f); return }
      if (flipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
        handleRate(Number(e.key) as Rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, flipped, handleRate, navigate, id])

  const accuracy = reviewed > 0 ? Math.round((correctCount / reviewed) * 100) : 0
  const mm = Math.floor(elapsedSec / 60)
  const ss = elapsedSec % 60

  const wrap = (children: React.ReactNode) => (
    <div className="fc" data-theme={theme}><div className="fc-study-wrap">{children}</div></div>
  )

  if (view === 'loading') {
    return wrap(<div style={{ width: 40, height: 40, border: '3px solid var(--ringTrack)', borderTopColor: 'var(--purple)', borderRadius: '50%' }} />)
  }

  if (view === 'empty' || view === 'error') {
    return wrap(
      <div className="fc-study-block" style={{ textAlign: 'center', paddingTop: 120 }}>
        <p style={{ fontWeight: 700, margin: '0 0 10px' }}>
          {view === 'empty' ? "Bu to'plamda hozircha o'rganish uchun karta yo'q" : "Yuklab bo'lmadi"}
        </p>
        <button className="fc-back" style={{ margin: '0 auto' }} onClick={() => navigate(`/flashcards/${id}`)}>To'plamga qaytish</button>
      </div>,
    )
  }

  if (view === 'complete') {
    return wrap(
      <div className="fc-study-block" style={{ maxWidth: 380, marginTop: 100 }}>
        <div className="fc-modal" style={{ maxWidth: '100%', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--greenSoft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={26} color="var(--green)" />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Sessiya yakunlandi!</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>{deck?.title}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
            <div className="fc-stat-tile"><p className="fc-stat-num" style={{ fontSize: 18 }}>{reviewed}</p><p className="fc-stat-label">Ko'rildi</p></div>
            <div className="fc-stat-tile"><p className="fc-stat-num" style={{ fontSize: 18 }}>{accuracy}%</p><p className="fc-stat-label">Aniqlik</p></div>
            <div className="fc-stat-tile"><p className="fc-stat-num" style={{ fontSize: 18, color: 'var(--accent)' }}>{completing ? '…' : `+${result?.xp_awarded ?? 0}`}</p><p className="fc-stat-label">XP</p></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fc-btn-half" onClick={() => navigate(`/flashcards/${id}`)}>To'plamga qaytish</button>
            <button className="fc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.location.reload()}>
              <RotateCcw size={14} />Yana
            </button>
          </div>
        </div>
      </div>,
    )
  }

  if (!current) return null

  const progressPct = totalInSession > 0 ? (reviewed / totalInSession) * 100 : 0

  return wrap(
    <>
      <div className="fc-study-block fc-study-progress-row">
        <button className="fc-study-close" onClick={() => navigate(`/flashcards/${id}`)}><X size={16} /></button>
        <div className="fc-study-track"><div className="fc-study-track-fill" style={{ width: `${progressPct}%` }} /></div>
        <span className="fc-study-counter">{reviewed + 1} / {totalInSession}</span>
        <span className="fc-study-timer">{mm}:{String(ss).padStart(2, '0')}</span>
      </div>

      <div className="fc-study-block">
        <div className="fc-study-card" onClick={() => setFlipped(f => !f)}>
          <div className="fc-study-card-edge" />
          <div className="fc-study-card-body">
            <span className="fc-study-side-label">{flipped ? 'ORQA TOMON' : 'OLD TOMON'}</span>
            <p className={`fc-study-face ${flipped ? 'back' : 'front'}`}>
              {flipped ? current.back_text : current.front_text}
            </p>
            <span className="fc-study-hint">{flipped ? 'Qanchalik yaxshi bildingiz?' : 'Kartani bosing'}</span>
          </div>
        </div>
      </div>

      <div className="fc-study-block">
        {!flipped ? (
          <button className="fc-study-reveal-btn" onClick={() => setFlipped(true)}>Javobni ko'rsatish · Space</button>
        ) : (
          <div className="fc-rate-grid">
            <button className="fc-rate-btn forgot" onClick={() => handleRate(1)}>
              ✗ Bilmayman<span className="fc-rate-sub">{previewLabel(current, 1)}</span>
            </button>
            <button className="fc-rate-btn hard" onClick={() => handleRate(2)}>
              ~ Qiyin<span className="fc-rate-sub">{previewLabel(current, 2)}</span>
            </button>
            <button className="fc-rate-btn good" onClick={() => handleRate(3)}>
              ✓ Bilaman<span className="fc-rate-sub">{previewLabel(current, 3)}</span>
            </button>
          </div>
        )}
      </div>
    </>,
  )
}

export default FlashcardStudyPage
