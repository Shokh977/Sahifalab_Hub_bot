/**
 * FlashcardPublicDetailPage — read-only preview of a public-library deck
 * before cloning it (spec nav map: "Any deck card → Detail").
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Star, Users, Copy } from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import FlashcardsRoot from './flashcards/FlashcardsRoot'
import FlashcardHeader from './flashcards/FlashcardHeader'
import { gradientFromColor, deckCode } from './flashcards/colors'
import type { PublicDeckDetail } from '../types/flashcards'

const FlashcardPublicDetailPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const id = Number(deckId)

  const [deck, setDeck] = useState<PublicDeckDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cloning, setCloning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiService.getPublicFlashcardDeck(id)
      setDeck(data)
    } catch {
      showToast("To'plam yuklanmadi.", 'error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  const handleClone = async () => {
    if (!deck) return
    setCloning(true)
    try {
      const { data } = await apiService.cloneFlashcardDeck(deck.id)
      showToast("To'plam kartalarimga qo'shildi!", 'success')
      navigate(`/flashcards/${data.id}`)
    } catch {
      showToast("Nusxa olinmadi. Qayta urinib ko'ring.", 'error')
      setCloning(false)
    }
  }

  if (loading) {
    return (
      <FlashcardsRoot>
        <FlashcardHeader title="Yuklanmoqda…" />
        <div className="fc-body"><div className="fc-col">
          <div className="fc-skeleton-pulse" style={{ height: 140, borderRadius: 20, background: 'var(--surface2)' }} />
        </div></div>
      </FlashcardsRoot>
    )
  }

  if (!deck) {
    return (
      <FlashcardsRoot>
        <FlashcardHeader title="Topilmadi" />
        <div className="fc-body"><div className="fc-col">
          <button className="fc-back" onClick={() => navigate('/flashcards')}><ChevronLeft size={15} />Kartalar</button>
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
          <button className="fc-back" onClick={() => navigate('/flashcards')}><ChevronLeft size={15} strokeWidth={2.4} />Kartalar</button>

          <div className="fc-deck-header">
            <div className="fc-deck-icon" style={{ background: `linear-gradient(140deg, ${g1}, ${g2})` }}>{deckCode(deck.title)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="fc-deck-header-title">{deck.title}</h2>
              {deck.description && <p className="fc-deck-header-desc">{deck.description}</p>}
              <div className="fc-deck-author-row">
                <span className="fc-deck-author-avatar">{(deck.creator?.name ?? '?').slice(0, 2).toUpperCase()}</span>
                <span className="fc-deck-author-name">{deck.creator?.name ?? "Noma'lum"}</span>
                <span className="fc-deck-author-extra">
                  · {deck.card_count} karta
                  {deck.rating_count > 0 && <> · ★ {deck.rating_avg.toFixed(1)} ({deck.rating_count} ta baho)</>}
                  · {deck.clone_count} nusxa
                </span>
              </div>
            </div>
          </div>

          <div className="fc-section-head">
            <h3 className="fc-section-title">Namuna kartalar</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deck.preview_cards.map((c, i) => (
              <div key={i} className="fc-card-row" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)' }}>
                <p className="fc-card-front" style={{ whiteSpace: 'normal' }}>{c.front_text}</p>
                <p className="fc-card-back" style={{ whiteSpace: 'normal' }}>{c.back_text}</p>
              </div>
            ))}
          </div>

          {deck.recent_ratings.length > 0 && (
            <>
              <div className="fc-section-head"><h3 className="fc-section-title">Fikrlar</h3></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {deck.recent_ratings.map((r, i) => (
                  <div key={i} className="fc-panel" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.comment ? 6 : 0 }}>
                      <strong style={{ fontSize: 13 }}>{r.rater.name}</strong>
                      <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>{'★'.repeat(r.rating)}</span>
                    </div>
                    {r.comment && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{r.comment}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="fc-rail">
          <div className="fc-panel" style={{ textAlign: 'center' }}>
            <p className="fc-panel-title" style={{ fontSize: 24 }}>{deck.card_count}</p>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 16px' }}>karta</p>
            <button className="fc-btn-block solid purple" style={{ marginTop: 0 }} disabled={deck.already_cloned || cloning} onClick={handleClone}>
              <Copy size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              {deck.already_cloned ? 'Allaqachon olingan' : cloning ? 'Olinmoqda…' : "Kartalarimga qo'shish"}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16, fontSize: 12.5, color: 'var(--muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} />{deck.clone_count}</span>
              {deck.rating_count > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={13} />{deck.rating_avg.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </FlashcardsRoot>
  )
}

export default FlashcardPublicDetailPage
