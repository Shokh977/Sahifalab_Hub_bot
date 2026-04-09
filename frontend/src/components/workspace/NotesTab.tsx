/**
 * NotesTab — quick notes for the Workspace planner.
 *
 * Simple CRUD: create, view, edit inline, delete.
 * Each note has a title and free-text content.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, X, FileText, Save, Edit3 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const API = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

interface PlannerNote {
  id: number
  title: string
  content: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

const NotesTab: React.FC = () => {
  const { user } = useAuth()
  const [notes, setNotes]       = useState<PlannerNote[]>([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAdd, setShowAdd]   = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`${API}/api/planner/notes/${user.id}`)
      if (res.ok) setNotes(await res.json())
    } catch (err) {
      console.error('[Notes] fetch error', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  // ── Add ────────────────────────────────────────────────────────────────
  const addNote = useCallback(async (title: string, content: string) => {
    if (!user?.id || !title.trim()) return
    try {
      const res = await fetch(`${API}/api/planner/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, title: title.trim(), content: content.trim() || null }),
      })
      if (res.ok) {
        const note = await res.json()
        setNotes(prev => [note, ...prev])
        setShowAdd(false)
      }
    } catch (err) { console.error('[Notes] add error', err) }
  }, [user?.id])

  // ── Update ─────────────────────────────────────────────────────────────
  const updateNote = useCallback(async (id: number, title: string, content: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title, content } : n))
    setEditingId(null)
    try {
      await fetch(`${API}/api/planner/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: content || null }),
      })
    } catch { fetchNotes() }
  }, [fetchNotes])

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteNote = useCallback(async (id: number) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    try {
      await fetch(`${API}/api/planner/notes/${id}`, { method: 'DELETE' })
    } catch { fetchNotes() }
  }, [fetchNotes])

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-8 w-24 rounded-xl bg-slate-200 dark:bg-slate-700" />
        </div>
        {/* Note card skeletons */}
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl bg-white dark:bg-[#222230] border border-slate-200/60 dark:border-white/5 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="h-4 w-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex gap-1">
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-4/5 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-3 w-16 rounded-full bg-slate-100 dark:bg-slate-800 mt-3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {notes.length} ta qayd
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sahifa-500 hover:bg-sahifa-600 shadow-glow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Yangi qayd
        </button>
      </div>

      {/* Add note form */}
      <AnimatePresence>
        {showAdd && (
          <NoteForm
            onSave={(t, c) => addNote(t, c)}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      {/* Notes list */}
      {notes.length === 0 && !showAdd && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
            <FileText className="w-7 h-7 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Hali qaydlar yo'q</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Yangi qayd qo'shing va g'oyalaringizni yozing</p>
        </motion.div>
      )}

      <div className="space-y-3">
        <AnimatePresence>
          {notes.map(note => (
            <motion.div
              key={note.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl bg-white dark:bg-[#222230] border border-slate-200/60 dark:border-white/5 overflow-hidden shadow-sm"
            >
              {editingId === note.id ? (
                <NoteForm
                  initial={note}
                  onSave={(t, c) => updateNote(note.id, t, c)}
                  onCancel={() => setEditingId(null)}
                  embedded
                />
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white leading-snug">{note.title}</h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingId(note.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {note.content && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {note.content}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-2">
                    {new Date(note.updated_at).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

// ── NoteForm (used for both add and edit) ─────────────────────────────────────

interface NoteFormProps {
  initial?: { title: string; content: string | null }
  onSave: (title: string, content: string) => void
  onCancel: () => void
  embedded?: boolean
}

const NoteForm: React.FC<NoteFormProps> = ({ initial, onSave, onCancel, embedded }) => {
  const [title, setTitle]     = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave(title, content)
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      className={embedded ? 'p-4' : 'mb-4 p-4 rounded-2xl bg-white dark:bg-[#222230] border border-sahifa-400/30 dark:border-sahifa-500/20 shadow-sm'}
    >
      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Sarlavha..."
        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-400 mb-2"
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Qayd matni..."
        rows={4}
        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-400 resize-none mb-3"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
          <X className="w-3 h-3 inline mr-1" />
          Bekor
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-40 transition-colors shadow-glow-sm"
        >
          <Save className="w-3 h-3 inline mr-1" />
          Saqlash
        </button>
      </div>
    </motion.form>
  )
}

export default NotesTab
