/**
 * FlashcardDeckPage — deck detail (View C): card list, add/edit/delete
 * cards, deck settings, mastery/next-review breakdown, entry into a study
 * session at /flashcards/:deckId/study.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Settings, Star, Share2 } from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import FlashcardsRoot from './flashcards/FlashcardsRoot'
import FlashcardHeader from './flashcards/FlashcardHeader'
import CardFormModal from './flashcards/CardFormModal'
import DeckFormModal from './flashcards/DeckFormModal'
import ConfirmModal from './flashcards/ConfirmModal'
import { gradientFromColor, deckCode } from './flashcards/colors'
import type { FlashcardDeck, Flashcard, CardStatus } from '../types/flashcards'

const STATUS_DOT: Record<CardStatus, string> = {
  new: 'var(--purple)', learning: 'var(--accent)', reviewing: 'var(--accent)', mastered: 'var(--green)',
}
const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'Yangi', learning: "O'rganilmoqda", reviewing: 'Takrorlash', mastered: "O'rganilgan",
}
const STATUS_PILL_BG: Record<CardStatus, string> = {
  new: 'var(--purpleSoft)', learning: 'var(--accentSoft)', reviewing: 'var(--accentSoft)', mastered: 'var(--greenSoft)',
}
const STATUS_PILL_FG: Record<CardStatus, string> = {
  new: 'var(--purple)', learning: 'var(--accent)', reviewing: 'var(--accent)', mastered: 'var(--green)',
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

const FlashcardDeckPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const id = Number(deckId)

  const [deck, setDeck] = useState<FlashcardDeck | null>(null)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [cardModal, setCardModal] = useState<{ open: boolean; editing: Flashcard | null }>({ open: false, editing: null })
  const [deckEditOpen, setDeckEditOpen] = useState(false)
  const [deleteCard, setDeleteCard] = useState<Flashcard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deckRes, cardsRes] = await Promise.all([apiService.getFlashcardDeck(id), apiService.listFlashcards(id)])
      setDeck(deckRes.data && typeof deckRes.data === 'object' ? deckRes.data : null)
      setCards(Array.isArray(cardsRes.data) ? cardsRes.data : [])
    } catch {
      showToast("To'plam yuklanmadi.", 'error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  const handleCardSaved = (card: Flashcard, wasEdit: boolean) => {
    if (wasEdit) {
      setCards(prev => prev.map(c => c.id === card.id ? card : c))
    } else {
      setCards(prev => [...prev, card])
      setDeck(prev => prev ? { ...prev, card_count: prev.card_count + 1 } : prev)
    }
  }

  const handleDeleteCard = async () => {
    if (!deleteCard) return
    setDeleting(true)
    try {
      await apiService.deleteFlashcard(deleteCard.id)
      setCards(prev => prev.filter(c => c.id !== deleteCard.id))
      setDeck(prev => prev ? { ...prev, card_count: Math.max(0, prev.card_count - 1) } : prev)
      setDeleteCard(null)
    } catch {
      showToast("O'chirib bo'lmadi.", 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Havola nusxalandi!', 'success')
    } catch {
      showToast('Havolani nusxalab bo\'lmadi.', 'error')
    }
  }

  const handleRate = async () => {
    if (!deck?.cloned_from_deck_id) {
      showToast("Bu to'plam ommaviy manbadan olinmagan.", 'info')
      return
    }
    const raw = window.prompt("1 dan 5 gacha baho bering:", "5")
    const rating = Number(raw)
    if (!raw || !Number.isFinite(rating) || rating < 1 || rating > 5) return
    try {
      await apiService.rateFlashcardDeck(deck.cloned_from_deck_id, { rating })
      showToast('Rahmat! Bahoyingiz saqlandi.', 'success')
    } catch {
      showToast("Baholab bo'lmadi.", 'error')
    }
  }

  const masteryTally = useMemo(() => {
    const t = { new: 0, active: 0, mastered: 0 }
    for (const c of cards) {
      if (c.status === 'new') t.new++
      else if (c.status === 'mastered') t.mastered++
      else t.active++
    }
    return t
  }, [cards])

  const nextReviewBuckets = useMemo(() => {
    let today = 0, tomorrow = 0, later = 0
    for (const c of cards) {
      const d = daysUntil(c.next_review)
      if (d === null) continue
      if (d <= 0) today++
      else if (d === 1) tomorrow++
      else later++
    }
    return { today, tomorrow, later }
  }, [cards])

  if (loading) {
    return (
      <FlashcardsRoot>
        <FlashcardHeader title="Yuklanmoqda…" />
        <div className="fc-body">
          <div className="fc-col">
            <div className="fc-skeleton-pulse" style={{ height: 120, borderRadius: 20, background: 'var(--surface2)' }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="fc-skeleton-pulse" style={{ height: 64, borderRadius: 16, background: 'var(--surface2)' }} />
            ))}
          </div>
        </div>
      </FlashcardsRoot>
    )
  }

  if (!deck) {
    return (
      <FlashcardsRoot>
        <FlashcardHeader title="Topilmadi" />
        <div className="fc-body"><div className="fc-col">
          <p style={{ color: 'var(--muted)' }}>To'plam topilmadi.</p>
          <button className="fc-back" onClick={() => navigate('/flashcards')}><ChevronLeft size={15} strokeWidth={2.4} />Kartalar</button>
        </div></div>
      </FlashcardsRoot>
    )
  }

  const [g1, g2] = gradientFromColor(deck.color)

  return (
    <FlashcardsRoot>
      <FlashcardHeader title={deck.title} />
      <div className="fc-body">
        <div className="fc-col">
          <button className="fc-back" onClick={() => navigate('/flashcards')}>
            <ChevronLeft size={15} strokeWidth={2.4} />Kartalar
          </button>

          <div className="fc-deck-header">
            <div className="fc-deck-icon" style={{ background: `linear-gradient(140deg, ${g1}, ${g2})` }}>
              {deckCode(deck.title)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="fc-deck-header-title">{deck.title}</h2>
              {deck.description && <p className="fc-deck-header-desc">{deck.description}</p>}
            </div>
            <button className="fc-modal-close" onClick={() => setDeckEditOpen(true)} aria-label="Sozlamalar">
              <Settings size={18} />
            </button>
          </div>

          <div className="fc-section-head">
            <h3 className="fc-section-title">Kartalar <span className="fc-section-count">({cards.length})</span></h3>
            <button className="fc-link-accent" onClick={() => setCardModal({ open: true, editing: null })}>
              + Qo'shish
            </button>
          </div>

          {cards.length === 0 ? (
            <div className="fc-panel" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>Hali karta yo'q.</p>
              <button className="fc-btn-primary" style={{ margin: '0 auto' }} onClick={() => setCardModal({ open: true, editing: null })}>
                <Plus size={16} />Birinchi kartani qo'shish
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cards.map((card) => (
                <div key={card.id} className="fc-card-row" style={{ position: 'relative' }}>
                  <span className="fc-status-dot" style={{ background: STATUS_DOT[card.status] }} />
                  <p className="fc-card-front">{card.front_text}</p>
                  <p className="fc-card-back">{card.back_text}</p>
                  <span className="fc-status-pill" style={{ background: STATUS_PILL_BG[card.status], color: STATUS_PILL_FG[card.status] }}>
                    {STATUS_LABEL[card.status]}
                  </span>
                  <button className="fc-row-menu" onClick={() => setOpenMenuId(openMenuId === card.id ? null : card.id)}>···</button>
                  {openMenuId === card.id && (
                    <div
                      style={{
                        position: 'absolute', right: 18, top: '100%', marginTop: 4, zIndex: 3,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                        boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden', minWidth: 120,
                      }}
                    >
                      <button
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
                        onClick={() => { setCardModal({ open: true, editing: card }); setOpenMenuId(null) }}
                      >
                        Tahrirlash
                      </button>
                      <button
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
                        onClick={() => { setDeleteCard(card); setOpenMenuId(null) }}
                      >
                        O'chirish
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fc-rail">
          <div className="fc-study-cta">
            <p className="fc-study-cta-title">{deck.due_count} ta karta kutmoqda</p>
            <button
              className="fc-btn-block solid purple"
              disabled={deck.card_count === 0}
              onClick={() => navigate(`/flashcards/${deck.id}/study`)}
            >
              O'rganishni boshlash
            </button>
            {deck.card_count > 0 && (
              <button className="fc-study-cta-link" onClick={() => navigate(`/flashcards/${deck.id}/study?practice=1`)}>
                Barchasini mashq qilish ({deck.card_count} ta)
              </button>
            )}
          </div>

          <div className="fc-panel">
            <div className="fc-section-head">
              <p className="fc-panel-title">O'rganilganlik darajasi</p>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>{deck.mastered_count}/{deck.card_count}</span>
            </div>
            <div className="fc-bar lg" style={{ marginTop: 12 }}>
              <div className="fc-bar-fill" style={{ width: `${deck.card_count > 0 ? (deck.mastered_count / deck.card_count) * 100 : 0}%`, background: 'var(--purple)' }} />
            </div>
            <div className="fc-mastery-legend">
              <div className="fc-mastery-row"><span className="fc-status-dot" style={{ background: 'var(--purple)' }} />Yangi<span className="count">{masteryTally.new}</span></div>
              <div className="fc-mastery-row"><span className="fc-status-dot" style={{ background: 'var(--accent)' }} />O'rganilmoqda<span className="count">{masteryTally.active}</span></div>
              <div className="fc-mastery-row"><span className="fc-status-dot" style={{ background: 'var(--green)' }} />O'rganilgan<span className="count">{masteryTally.mastered}</span></div>
            </div>
          </div>

          <div className="fc-panel">
            <p className="fc-panel-title">Keyingi takrorlash</p>
            <div className="fc-nextreview-row"><span>Bugun</span><span className="val">{nextReviewBuckets.today} karta</span></div>
            <div className="fc-nextreview-row"><span>Ertaga</span><span className="val">{nextReviewBuckets.tomorrow} karta</span></div>
            <div className="fc-nextreview-row"><span>Keyinroq</span><span className="val">{nextReviewBuckets.later} karta</span></div>
          </div>

          <div className="fc-half-row">
            <button className="fc-btn-half" onClick={handleRate}><Star size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Baholash</button>
            <button className="fc-btn-half" onClick={handleShare}><Share2 size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Ulashish</button>
          </div>
        </div>
      </div>

      <CardFormModal
        open={cardModal.open} deckId={id} editing={cardModal.editing}
        onClose={() => setCardModal({ open: false, editing: null })}
        onSaved={handleCardSaved}
      />
      <DeckFormModal open={deckEditOpen} deck={deck} onClose={() => setDeckEditOpen(false)} onSaved={setDeck} />
      <ConfirmModal
        open={!!deleteCard}
        title="Kartani o'chirasizmi?"
        description="Bu amalni ortga qaytarib bo'lmaydi."
        loading={deleting}
        onConfirm={handleDeleteCard}
        onCancel={() => setDeleteCard(null)}
      />
    </FlashcardsRoot>
  )
}

export default FlashcardDeckPage
