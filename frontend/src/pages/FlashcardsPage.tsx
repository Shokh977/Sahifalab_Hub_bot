/**
 * FlashcardsPage — "Kartalar" deck list (SAHIFALAB Hub).
 *
 * Core flashcard surface: deck list with due/mastery stats, create/edit/
 * delete decks. Study sessions live at /flashcards/:deckId/study, per-deck
 * card management at /flashcards/:deckId. Backend: /api/flashcards/*
 * (see backend/app/api/v1/endpoints/flashcards.py).
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Layers, CheckCircle2, X } from 'lucide-react'
import apiService from '../services/apiService'
import PageWrapper from '../components/PageWrapper'
import DeleteConfirmModal from '../components/social/DeleteConfirmModal'
import { showToast } from '../components/ErrorBoundary'
import type { FlashcardDeck, FlashcardStats } from '../types/flashcards'
import { DECK_COLORS } from '../types/flashcards'

// ─── Deck card ───────────────────────────────────────────────────────────

const DeckCard: React.FC<{
  deck: FlashcardDeck
  onOpen: () => void
  onDelete: () => void
}> = ({ deck, onOpen, onDelete }) => {
  const masteryPct = deck.card_count > 0 ? Math.round((deck.mastered_count / deck.card_count) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md hover:border-sahifa-300 dark:hover:border-sahifa-600 transition-all"
    >
      <button onClick={onOpen} className="w-full text-left p-4 pl-5">
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: deck.color }} />

        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1 flex-1">{deck.title}</h3>
          {deck.due_count > 0 && (
            <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sahifa-500 text-white">
              {deck.due_count}
            </span>
          )}
        </div>

        {deck.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{deck.description}</p>
        )}

        <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
          <span>{deck.card_count} ta karta</span>
          <span>{masteryPct}% o'zlashtirilgan</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${masteryPct}%`, backgroundColor: deck.color }}
          />
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-white dark:bg-slate-700 shadow flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"
        aria-label="To'plamni o'chirish"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

// ─── Create/edit deck modal ─────────────────────────────────────────────

const DeckFormModal: React.FC<{
  open: boolean
  onClose: () => void
  onSaved: (deck: FlashcardDeck) => void
}> = ({ open, onClose, onSaved }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>(DECK_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setTitle(''); setDescription(''); setColor(DECK_COLORS[0]) }
  }, [open])

  const handleSave = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const { data } = await apiService.createFlashcardDeck({ title: title.trim(), description: description.trim() || undefined, color })
      onSaved(data)
      onClose()
    } catch {
      showToast("To'plam yaratilmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Yangi to'plam</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Nomi</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: Ingliz tili so'zlari"
              maxLength={100}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Tavsif (ixtiyoriy)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qisqacha tavsif…"
              maxLength={300}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sahifa-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Rang</label>
            <div className="flex flex-wrap gap-2">
              {DECK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform"
                  style={{ backgroundColor: c, transform: color === c ? 'scale(1.15)' : 'scale(1)', boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="w-full mt-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 disabled:opacity-40 transition-all"
        >
          {saving ? 'Yaratilmoqda…' : 'Yaratish'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────

const FlashcardsPage: React.FC = () => {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<FlashcardDeck[]>([])
  const [stats, setStats] = useState<FlashcardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FlashcardDeck | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [decksRes, statsRes] = await Promise.all([
        apiService.listFlashcardDecks(),
        apiService.getFlashcardStats(),
      ])
      setDecks(decksRes.data)
      setStats(statsRes.data)
    } catch {
      showToast("To'plamlar yuklanmadi.", 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiService.deleteFlashcardDeck(deleteTarget.id)
      setDecks(prev => prev.filter(d => d.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      showToast("O'chirib bo'lmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageWrapper className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Layers className="w-6 h-6 text-sahifa-500" />Kartalar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Aralashib takrorlang, uzoq muddat eslab qoling</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-sahifa-500 to-sahifa-600 hover:from-sahifa-600 hover:to-sahifa-700 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />Yangi to'plam
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_due}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Bugun kerak</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_cards}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Jami karta</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white inline-flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />{stats.total_mastered}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">O'zlashtirilgan</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-700">
          <Layers className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-700 dark:text-gray-200 font-semibold">Hali to'plam yo'q</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">Birinchi kartalar to'plamingizni yarating.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm text-white bg-sahifa-500 hover:bg-sahifa-600 transition-colors"
          >
            <Plus className="w-4 h-4" />To'plam yaratish
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => navigate(`/flashcards/${deck.id}`)}
              onDelete={() => setDeleteTarget(deck)}
            />
          ))}
        </div>
      )}

      <DeckFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={(deck) => setDecks(prev => [deck, ...prev])} />

      <DeleteConfirmModal
        open={!!deleteTarget}
        title="To'plamni o'chirasizmi?"
        description={`"${deleteTarget?.title}" va undagi barcha kartalar butunlay o'chiriladi.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  )
}

export default FlashcardsPage
