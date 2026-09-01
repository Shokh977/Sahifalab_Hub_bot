import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import apiService from '../../services/apiService'
import { showToast } from '../../components/ErrorBoundary'
import { DECK_COLORS } from '../../types/flashcards'
import type { FlashcardDeck } from '../../types/flashcards'

interface Props {
  open: boolean
  deck: FlashcardDeck | null   // null = create mode
  onClose: () => void
  onSaved: (deck: FlashcardDeck) => void
}

const DeckFormModal: React.FC<Props> = ({ open, deck, onClose, onSaved }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>(DECK_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(deck?.title ?? '')
    setDescription(deck?.description ?? '')
    setColor(deck?.color ?? DECK_COLORS[0])
  }, [open, deck])

  const handleSave = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      if (deck) {
        const { data } = await apiService.updateFlashcardDeck(deck.id, { title: title.trim(), description: description.trim(), color })
        onSaved(data)
      } else {
        const { data } = await apiService.createFlashcardDeck({ title: title.trim(), description: description.trim() || undefined, color })
        onSaved(data)
      }
      onClose()
    } catch {
      showToast("Saqlanmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fc-modal-backdrop" onClick={onClose}>
      <div className="fc-modal-scrim" />
      <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-head">
          <h2 className="fc-modal-title">{deck ? "To'plam sozlamalari" : "Yangi to'plam"}</h2>
          <button className="fc-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="fc-field-label">Nomi</label>
            <input className="fc-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus placeholder="Masalan: Ingliz tili so'zlari" />
          </div>
          <div>
            <label className="fc-field-label">Tavsif (ixtiyoriy)</label>
            <textarea className="fc-textarea-drop" style={{ minHeight: 70 }} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Qisqacha tavsif…" />
          </div>
          <div>
            <label className="fc-field-label">Rang</label>
            <div className="fc-color-row">
              {DECK_COLORS.map((c) => (
                <button
                  key={c} className="fc-color-dot" onClick={() => setColor(c)}
                  style={{ background: c, transform: color === c ? 'scale(1.15)' : 'scale(1)', boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none' }}
                />
              ))}
            </div>
          </div>
        </div>
        <button className="fc-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={!title.trim() || saving} onClick={handleSave}>
          {saving ? 'Saqlanmoqda…' : deck ? 'Saqlash' : 'Yaratish'}
        </button>
      </div>
    </div>
  )
}

export default DeckFormModal
