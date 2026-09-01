import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmModal: React.FC<Props> = ({ open, title, description, confirmLabel = "O'chirish", loading, onConfirm, onCancel }) => {
  if (!open) return null
  return (
    <div className="fc-modal-backdrop" onClick={onCancel}>
      <div className="fc-modal-scrim" />
      <div className="fc-modal" style={{ maxWidth: 380, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--redSoft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <AlertTriangle size={22} color="var(--red)" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>{description}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="fc-btn-half" disabled={loading} onClick={onCancel}>Bekor qilish</button>
          <button
            className="fc-btn-half"
            disabled={loading}
            style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={onConfirm}
          >
            {loading ? "O'chirilmoqda…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
