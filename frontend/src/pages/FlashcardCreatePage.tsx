/**
 * FlashcardCreatePage — "Yangi to'plam" (View E).
 * Matn/Rasm modes hit the real AI generation endpoint (/api/ai/flashcards/
 * generate + /generate/confirm); PDF has no backend support yet, shown as
 * "tez orada"; Qo'lda creates an empty deck and hands off to the deck page's
 * own add-card flow.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Sparkles, ImageIcon, FileText, Pencil, Trash2 } from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import FlashcardsRoot from './flashcards/FlashcardsRoot'
import FlashcardHeader from './flashcards/FlashcardHeader'
import { DECK_COLORS } from '../types/flashcards'

type SourceMode = 'text' | 'image' | 'pdf' | 'manual'
type GeneratedCard = { front: string; back: string }

const CATEGORY_OPTIONS = [
  { value: '', label: 'Kategoriya' },
  { value: 'english', label: 'Ingliz tili' },
  { value: 'ielts', label: 'IELTS/CEFR' },
  { value: 'business', label: 'Biznes' },
  { value: 'medical', label: 'Tibbiyot' },
  { value: 'arabic', label: 'Arab tili' },
  { value: 'programming', label: 'Dasturlash' },
  { value: 'other', label: 'Boshqa' },
]

function readFileAsBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      resolve({ base64, mime: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const FlashcardCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState<SourceMode>('text')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [color] = useState(DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [freeRemaining, setFreeRemaining] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reviewing, setReviewing] = useState<GeneratedCard[] | null>(null)
  const [reviewTitle, setReviewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiService.getAiLimits().then(({ data }) => setFreeRemaining(data.free_remaining_today)).catch(() => {})
  }, [])

  const handleManualCreate = async () => {
    if (!title.trim()) return
    try {
      const { data } = await apiService.createFlashcardDeck({ title: title.trim(), color })
      navigate(`/flashcards/${data.id}`)
    } catch {
      showToast("To'plam yaratilmadi.", 'error')
    }
  }

  const handleGenerate = async () => {
    if (mode === 'pdf') { showToast('PDF orqali yaratish tez orada qo\'shiladi.', 'info'); return }
    if (mode === 'text' && !text.trim()) return
    if (mode === 'image' && !imageFile) return
    setGenerating(true)
    try {
      const action_id = crypto.randomUUID()
      let body: Parameters<typeof apiService.generateFlashcardsAI>[0]
      if (mode === 'image' && imageFile) {
        const { base64, mime } = await readFileAsBase64(imageFile)
        body = { action_id, image_base64: base64, image_mime_type: mime }
      } else {
        body = { action_id, text: text.trim() }
      }
      const { data } = await apiService.generateFlashcardsAI(body)
      setReviewing(data.cards)
      setReviewTitle(title.trim() || data.deck_title)
      setFreeRemaining(data.free_remaining_today)
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Yaratib bo'lmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirmGenerated = async () => {
    if (!reviewing || !reviewTitle.trim() || saving) return
    setSaving(true)
    try {
      const { data } = await apiService.confirmGeneratedFlashcards({
        deck_title: reviewTitle.trim(), color,
        cards: reviewing.filter(c => c.front.trim() && c.back.trim()),
      })
      showToast(`${data.card_count} ta karta saqlandi!`, 'success')
      navigate(`/flashcards/${data.deck_id}`)
    } catch {
      showToast("Saqlanmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Review step ──────────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <FlashcardsRoot>
        <FlashcardHeader title="Ko'rib chiqish" />
        <div className="fc-body">
          <div className="fc-col">
            <button className="fc-back" onClick={() => setReviewing(null)}><ChevronLeft size={15} strokeWidth={2.4} />Ortga</button>
            <div className="fc-form-panel">
              <div>
                <label className="fc-field-label">To'plam nomi</label>
                <input className="fc-input" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} maxLength={100} />
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>{reviewing.length} ta karta yaratildi — kerak bo'lsa tahrirlang yoki o'chiring.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviewing.map((c, i) => (
                  <div key={i} className="fc-card-row" style={{ gridTemplateColumns: '10px minmax(0,1fr) minmax(0,1.15fr) 24px' }}>
                    <span className="fc-status-dot" style={{ background: 'var(--purple)' }} />
                    <input
                      className="fc-input" style={{ padding: '8px 10px', fontSize: 13 }}
                      value={c.front}
                      onChange={(e) => setReviewing(prev => prev!.map((x, j) => j === i ? { ...x, front: e.target.value } : x))}
                    />
                    <input
                      className="fc-input" style={{ padding: '8px 10px', fontSize: 13 }}
                      value={c.back}
                      onChange={(e) => setReviewing(prev => prev!.map((x, j) => j === i ? { ...x, back: e.target.value } : x))}
                    />
                    <button className="fc-row-menu" onClick={() => setReviewing(prev => prev!.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="fc-btn-primary purple" style={{ justifyContent: 'center' }}
                disabled={!reviewTitle.trim() || reviewing.length === 0 || saving}
                onClick={handleConfirmGenerated}
              >
                {saving ? 'Saqlanmoqda…' : `${reviewing.length} ta kartani saqlash`}
              </button>
            </div>
          </div>
          <div className="fc-rail" />
        </div>
      </FlashcardsRoot>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <FlashcardsRoot>
      <FlashcardHeader title="Yangi to'plam" />
      <div className="fc-body">
        <div className="fc-col">
          <button className="fc-back" onClick={() => navigate('/flashcards')}><ChevronLeft size={15} strokeWidth={2.4} />Kartalar</button>

          <div className="fc-form-panel">
            <div>
              <h2 className="fc-form-title">Yangi to'plam</h2>
              <p className="fc-form-sub">Qo'lda kiriting yoki AI yordamida matn, rasm va PDF dan yarating.</p>
            </div>

            <div className="fc-tabs">
              <button className={`fc-tab${mode === 'text' ? ' active' : ''}`} onClick={() => setMode('text')}>Matn</button>
              <button className={`fc-tab${mode === 'image' ? ' active' : ''}`} onClick={() => setMode('image')}>Rasm</button>
              <button className={`fc-tab${mode === 'pdf' ? ' active' : ''}`} onClick={() => setMode('pdf')}>PDF</button>
              <button className={`fc-tab${mode === 'manual' ? ' active' : ''}`} onClick={() => setMode('manual')}>Qo'lda</button>
            </div>

            <div className="fc-field-row">
              <input className="fc-input" placeholder="To'plam nomi" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
              <select className="fc-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {mode === 'text' && (
              <textarea
                className="fc-textarea-drop"
                placeholder="Darslik matnini shu yerga joylashtiring (kamida bir nechta jumla)…"
                value={text} onChange={(e) => setText(e.target.value)} maxLength={8000}
              />
            )}

            {mode === 'image' && (
              <div
                className="fc-textarea-drop"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={28} color="var(--muted)" />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{imageFile ? imageFile.name : 'Rasm yuklash uchun bosing'}</span>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {mode === 'pdf' && (
              <div className="fc-textarea-drop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <FileText size={28} color="var(--muted)" />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>PDF orqali yaratish tez orada qo'shiladi</span>
              </div>
            )}

            {mode === 'manual' && (
              <div className="fc-textarea-drop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderStyle: 'solid' }}>
                <Pencil size={26} color="var(--muted)" />
                <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                  To'plam nomini kiriting va bo'sh to'plam yaratiladi — kartalarni keyingi sahifada qo'shasiz.
                </span>
              </div>
            )}

            <div className="fc-form-actions">
              {mode !== 'manual' && (
                <span className="fc-quota-text">
                  ✦ Bugun {freeRemaining != null ? <b>{freeRemaining} ta bepul</b> : '…'} amal qoldi
                </span>
              )}
              <div style={{ flex: 1 }} />
              {mode !== 'manual' ? (
                <>
                  <button className="fc-btn-secondary" onClick={() => setMode('manual')}>Qo'lda qo'shish</button>
                  <button
                    className="fc-btn-primary purple"
                    disabled={generating || (mode === 'text' && !text.trim()) || (mode === 'image' && !imageFile) || mode === 'pdf'}
                    onClick={handleGenerate}
                  >
                    <Sparkles size={15} />{generating ? 'Yaratilmoqda…' : 'Flashcard yaratish'}
                  </button>
                </>
              ) : (
                <button className="fc-btn-primary purple" disabled={!title.trim()} onClick={handleManualCreate}>
                  Bo'sh to'plam yaratish
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="fc-rail">
          <div className="fc-panel">
            <p className="fc-panel-title">Yaxshi natija uchun</p>
            <div className="fc-tips-list">
              <p style={{ margin: 0 }}>1 — Matnni bo'limlarga ajrating, har biri bitta tushunchani yoritsin.</p>
              <p style={{ margin: 0 }}>2 — Ta'riflar va raqamlar AI uchun eng yaxshi manba.</p>
              <p style={{ margin: 0 }}>3 — 10–30 karta oralig'i kunlik takrorlash uchun ideal.</p>
            </div>
          </div>
          <div className="fc-cta-panel">
            <p className="fc-cta-title">SM-2 algoritmi</p>
            <p className="fc-cta-body">Har bir javobingiz kartaning keyingi takrorlash oralig'ini hisoblaydi — bilganingiz kamroq, qiynalganingiz tez-tez qaytadi.</p>
          </div>
        </div>
      </div>
    </FlashcardsRoot>
  )
}

export default FlashcardCreatePage
