/**
 * FlashcardDeckPage — deck detail: card list + add/edit/delete cards,
 * deck settings, and the entry point into a study session
 * (/flashcards/:deckId/study).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Play, RefreshCw, Pencil, Trash2, X, Settings,
} from 'lucide-react'
import apiService from '../services/apiService'
import PageWrapper from '../components/PageWrapper'
import DeleteConfirmModal from '../components/social/DeleteConfirmModal'
import { showToast } from '../components/ErrorBoundary'
import type { FlashcardDeck, Flashcard, CardStatus } from '../types/flashcards'
import { DECK_COLORS } from '../types/flashcards'

const STATUS_DOT: Record<CardStatus, string> = {
  new: 'bg-gray-300 dark:bg-gray-600',
  learning: 'bg-orange-400',
  reviewing: 'bg-blue-400',
  mastered: 'bg-emerald-500',
}
const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'Yangi', learning: "O'rganilmoqda", reviewing: 'Takrorlanmoqda', mastered: "O'zlashtirilgan",
}

// ─── Add/edit card modal ─────────────────────────────────────────────────

const CardFormModal: React.FC<{
  open: boolean
  deckId: number
  editing: Flashcard | null
  onClose: () => void
  onSaved: (card: Flashcard, wasEdit: boolean) => void
}> = ({ open, deckId, editing, onClose, onSaved }) => {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [quickAdd, setQuickAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const frontRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setFront(editing?.front_text ?? '')
    setBack(editing?.back_text ?? '')
    setTimeout(() => frontRef.current?.focus(), 50)
  }, [open, editing])

  const handleSave = async (keepOpen: boolean) => {
    if (!front.trim() || !back.trim() || saving) return
    setSaving(true)
    try {
      if (editing) {
        const { data } = await apiService.updateFlashcard(editing.id, { front_text: front.trim(), back_text: back.trim() })
        onSaved(data, true)
      } else {
        const { data } = await apiService.addFlashcard(deckId, { front_text: front.trim(), back_text: back.trim() })
        onSaved(data, false)
      }
      if (keepOpen) {
        setFront(''); setBack(''); frontRef.current?.focus()
      } else {
        onClose()
      }
    } catch {
      showToast("Karta saqlanmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{editing ? 'Kartani tahrirlash' : 'Yangi karta'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Old tomon (savol)</label>
            <textarea
              ref={frontRef}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Masalan: Apple"
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sahifa-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Orqa tomon (javob)</label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Masalan: Olma"
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sahifa-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          {!editing ? (
            <label className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={quickAdd} onChange={(e) => setQuickAdd(e.target.checked)} className="rounded" />
              Tez qo'shish (formani ochiq qoldirish)
            </label>
          ) : <span />}
          <button
            onClick={() => handleSave(quickAdd && !editing)}
            disabled={!front.trim() || !back.trim() || saving}
            className="px-5 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 disabled:opacity-40 transition-all"
          >
            {saving ? 'Saqlanmoqda…' : editing ? 'Saqlash' : 'Qo\'shish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit deck modal ─────────────────────────────────────────────────────

const DeckEditModal: React.FC<{
  open: boolean
  deck: FlashcardDeck | null
  onClose: () => void
  onSaved: (deck: FlashcardDeck) => void
}> = ({ open, deck, onClose, onSaved }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>(DECK_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && deck) { setTitle(deck.title); setDescription(deck.description ?? ''); setColor(deck.color) }
  }, [open, deck])

  const handleSave = async () => {
    if (!deck || !title.trim() || saving) return
    setSaving(true)
    try {
      const { data } = await apiService.updateFlashcardDeck(deck.id, { title: title.trim(), description: description.trim(), color })
      onSaved(data)
      onClose()
    } catch {
      showToast("Saqlanmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open || !deck) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">To'plam sozlamalari</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-400"
          />
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sahifa-400"
          />
          <div className="flex flex-wrap gap-2">
            {DECK_COLORS.map((c) => (
              <button
                key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform"
                style={{ backgroundColor: c, transform: color === c ? 'scale(1.15)' : 'scale(1)', boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="w-full mt-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 disabled:opacity-40 transition-all"
        >
          {saving ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deckRes, cardsRes] = await Promise.all([
        apiService.getFlashcardDeck(id),
        apiService.listFlashcards(id),
      ])
      setDeck(deckRes.data)
      setCards(cardsRes.data)
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

  if (loading) {
    return (
      <PageWrapper className="space-y-4">
        <div className="h-8 w-40 rounded bg-gray-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-28 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </PageWrapper>
    )
  }

  if (!deck) {
    return (
      <PageWrapper className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">To'plam topilmadi.</p>
        <Link to="/flashcards" className="text-sahifa-500 font-semibold text-sm mt-2 inline-block">Ortga qaytish</Link>
      </PageWrapper>
    )
  }

  const masteryPct = deck.card_count > 0 ? Math.round((deck.mastered_count / deck.card_count) * 100) : 0

  return (
    <PageWrapper className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/flashcards')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: deck.color }} />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1 truncate">{deck.title}</h1>
        <button onClick={() => setDeckEditOpen(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5">
          <Settings className="w-4.5 h-4.5" />
        </button>
      </div>
      {deck.description && <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3">{deck.description}</p>}

      {/* Study hero */}
      <div className="bg-gradient-to-br from-sahifa-50 to-orange-50 dark:from-sahifa-900/20 dark:to-orange-900/10 rounded-2xl border border-sahifa-100 dark:border-sahifa-800/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{deck.due_count}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">bugun takrorlash kerak</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{masteryPct}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">o'zlashtirilgan</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/60 dark:bg-black/20 overflow-hidden mb-4">
          <div className="h-full rounded-full bg-gradient-to-r from-sahifa-400 to-sahifa-600" style={{ width: `${masteryPct}%` }} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => navigate(`/flashcards/${deck.id}/study`)}
            disabled={deck.card_count === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 disabled:opacity-40 transition-all"
          >
            <Play className="w-4 h-4" />
            {deck.due_count > 0 ? "O'rganishni boshlash" : 'Yangi kartalarni ko\'rish'}
          </button>
          {deck.card_count > 0 && (
            <button
              onClick={() => navigate(`/flashcards/${deck.id}/study?practice=1`)}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-semibold text-sm text-sahifa-700 dark:text-sahifa-300 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-all"
            >
              <RefreshCw className="w-4 h-4" />Barchasini mashq qilish
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Kartalar ({cards.length})</h2>
        <button
          onClick={() => setCardModal({ open: true, editing: null })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-sahifa-600 dark:text-sahifa-400 hover:text-sahifa-700"
        >
          <Plus className="w-3.5 h-3.5" />Karta qo'shish
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Hali karta yo'q.</p>
          <button
            onClick={() => setCardModal({ open: true, editing: null })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm text-white bg-sahifa-500 hover:bg-sahifa-600 transition-colors"
          >
            <Plus className="w-4 h-4" />Birinchi kartani qo'shish
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {cards.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
                className="group flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[card.status]}`} title={STATUS_LABEL[card.status]} />
                <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-1 sm:gap-4">
                  <p className="text-sm text-gray-900 dark:text-white truncate">{card.front_text}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate hidden sm:block">{card.back_text}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setCardModal({ open: true, editing: card })} className="p-1.5 text-gray-400 hover:text-sahifa-500">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteCard(card)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <CardFormModal
        open={cardModal.open}
        deckId={id}
        editing={cardModal.editing}
        onClose={() => setCardModal({ open: false, editing: null })}
        onSaved={handleCardSaved}
      />
      <DeckEditModal open={deckEditOpen} deck={deck} onClose={() => setDeckEditOpen(false)} onSaved={setDeck} />
      <DeleteConfirmModal
        open={!!deleteCard}
        title="Kartani o'chirasizmi?"
        description="Bu amalni ortga qaytarib bo'lmaydi."
        loading={deleting}
        onConfirm={handleDeleteCard}
        onCancel={() => setDeleteCard(null)}
      />
    </PageWrapper>
  )
}

export default FlashcardDeckPage
