import React, { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import apiService from '../../services/apiService'
import { showToast } from '../../components/ErrorBoundary'
import type { Flashcard } from '../../types/flashcards'

interface Props {
  open: boolean
  deckId: number
  editing: Flashcard | null
  onClose: () => void
  onSaved: (card: Flashcard, wasEdit: boolean) => void
}

const CardFormModal: React.FC<Props> = ({ open, deckId, editing, onClose, onSaved }) => {
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
      if (keepOpen) { setFront(''); setBack(''); frontRef.current?.focus() } else { onClose() }
    } catch {
      showToast("Karta saqlanmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fc-modal-backdrop" onClick={onClose}>
      <div className="fc-modal-scrim" />
      <div className="fc-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-head">
          <h2 className="fc-modal-title">{editing ? 'Kartani tahrirlash' : 'Yangi karta'}</h2>
          <button className="fc-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="fc-field-row">
          <div>
            <label className="fc-field-label">Old tomon (savol)</label>
            <textarea ref={frontRef} className="fc-textarea-drop" style={{ minHeight: 110 }} value={front} onChange={(e) => setFront(e.target.value)} placeholder="Masalan: Apple" />
          </div>
          <div>
            <label className="fc-field-label">Orqa tomon (javob)</label>
            <textarea className="fc-textarea-drop" style={{ minHeight: 110 }} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Masalan: Olma" />
          </div>
        </div>

        <div className="fc-form-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          {!editing ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={quickAdd} onChange={(e) => setQuickAdd(e.target.checked)} />
              Tez qo'shish (formani ochiq qoldirish)
            </label>
          ) : <span />}
          <button className="fc-btn-primary" disabled={!front.trim() || !back.trim() || saving} onClick={() => handleSave(quickAdd && !editing)}>
            {saving ? 'Saqlanmoqda…' : editing ? 'Saqlash' : "Qo'shish"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CardFormModal
