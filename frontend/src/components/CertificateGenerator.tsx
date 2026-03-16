/**
 * CertificateGenerator
 * Renders a 1080 × 1350 certificate on an offscreen Canvas, shows a live
 * preview inside a modal, and lets the user download it as a PNG.
 *
 * Size: 1080 × 1350 px  (Instagram Stories / Portrait 4:5)
 * Design: minimalist luxury — cream background, gold borders, clean serif typography
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CertificateData {
  userName: string
  quizTitle: string
  score: number
  total: number
  percentage: number
  date: string
}

interface Props {
  data: CertificateData
  onClose: () => void
}

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const W = 1080
const H = 1350
const cx = W / 2

// ─── Color palette ────────────────────────────────────────────────────────────
const GOLD   = '#C9A84C'
const DARK   = '#1a1a1a'
const BODY   = '#333333'
const MUTED  = '#888888'
const LIGHT  = '#aaaaaa'
const BG     = '#FFFEF7'

// ─── Utility: draw centered text with manual letter spacing ───────────────────
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  if (spacing === 0) { ctx.fillText(text, x, y); return }
  const chars = text.split('')
  const widths = chars.map(c => ctx.measureText(c).width)
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let px = x - totalW / 2
  chars.forEach((c, i) => {
    ctx.fillText(c, px + widths[i] / 2, y)
    px += widths[i] + spacing
  })
}

// ─── Utility: wrap text to multiple lines ─────────────────────────────────────
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  })
  if (line) lines.push(line)
  return lines
}

// ─── Main draw function ────────────────────────────────────────────────────────
function drawCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Subtle radial warm glow in center
  const glow = ctx.createRadialGradient(cx, H * 0.45, 50, cx, H * 0.45, 600)
  glow.addColorStop(0, 'rgba(201,168,76,0.07)')
  glow.addColorStop(1, 'rgba(255,254,247,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ── Outer border (gold, 5 px) ──────────────────────────────────────────────
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 5
  ctx.strokeRect(24, 24, W - 48, H - 48)

  // ── Inner border (gold, 1 px) ──────────────────────────────────────────────
  ctx.lineWidth = 1
  ctx.strokeRect(46, 46, W - 92, H - 92)

  // ── Corner diamonds ────────────────────────────────────────────────────────
  const corners: [number, number][] = [
    [24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24],
  ]
  corners.forEach(([dx, dy]) => {
    ctx.save()
    ctx.translate(dx, dy)
    // Erase borders at corner
    ctx.fillStyle = BG
    ctx.fillRect(-8, -8, 16, 16)
    // Diamond
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(10, 0)
    ctx.lineTo(0, 10)
    ctx.lineTo(-10, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  })

  // ── "SAHIFALAB" header ─────────────────────────────────────────────────────
  ctx.fillStyle = DARK
  ctx.font = 'bold 60px Georgia, serif'
  spacedText(ctx, 'SAHIFALAB', cx, 148, 11)

  ctx.fillStyle = GOLD
  ctx.font = '19px Georgia, serif'
  spacedText(ctx, "O'QUV MARKAZI", cx, 188, 7)

  // Decorative dots flanking header
  ctx.fillStyle = GOLD
  const dotY = 115
  ;[-260, 260].forEach(offset => {
    ctx.beginPath()
    ctx.arc(cx + offset, dotY, 4, 0, Math.PI * 2)
    ctx.fill()
  })

  // ── Short gold divider ─────────────────────────────────────────────────────
  const divider = (y: number, w: number, thick = 1) => {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = thick
    ctx.beginPath()
    ctx.moveTo(cx - w / 2, y)
    ctx.lineTo(cx + w / 2, y)
    ctx.stroke()
  }

  divider(212, 260, 2)

  // ── "SERTIFIKAT" main title ────────────────────────────────────────────────
  ctx.fillStyle = DARK
  ctx.font = 'bold 92px Georgia, serif'
  spacedText(ctx, 'SERTIFIKAT', cx, 315, 5)

  // Three-line ornament below title
  divider(345, 700, 3)
  divider(353, 700, 1)
  divider(361, 700, 3)

  // ── Body: "Ushbu sertifikat" ───────────────────────────────────────────────
  ctx.fillStyle = MUTED
  ctx.font = 'italic 30px Georgia, serif'
  ctx.fillText('Ushbu sertifikat', cx, 428)

  // User name (the hero element of the certificate)
  ctx.fillStyle = DARK
  ctx.font = 'bold 74px Georgia, serif'
  const nameY = 520
  ctx.fillText(data.userName, cx, nameY)

  // Underline the name with a gold rule
  const nameW = Math.min(ctx.measureText(data.userName).width, 800)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - nameW / 2, nameY + 12)
  ctx.lineTo(cx + nameW / 2, nameY + 12)
  ctx.stroke()

  ctx.fillStyle = MUTED
  ctx.font = 'italic 28px Georgia, serif'
  ctx.fillText("ga topshiriladi", cx, 575)

  // ── Quiz title ─────────────────────────────────────────────────────────────
  divider(610, 380, 1)

  ctx.fillStyle = GOLD
  ctx.font = 'bold 33px Georgia, serif'
  const titleLines = wrapText(ctx, `«${data.quizTitle}»`, 750)
  titleLines.forEach((line, i) => ctx.fillText(line, cx, 660 + i * 42))

  const titleBottom = 660 + titleLines.length * 42
  ctx.fillStyle = MUTED
  ctx.font = '24px Georgia, serif'
  ctx.fillText("bo'yicha bilim sinovidan", cx, titleBottom + 20)
  ctx.fillText("muvaffaqiyatli o'tganligi uchun", cx, titleBottom + 56)

  // ── Score badge ────────────────────────────────────────────────────────────
  const bx = cx, by = titleBottom + 180, br = 82

  // Background circle
  ctx.beginPath()
  ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fillStyle = BG
  ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 3
  ctx.stroke()

  // Progress arc
  const arcStart = -Math.PI / 2
  const arcEnd   = arcStart + (Math.PI * 2 * data.percentage) / 100
  ctx.beginPath()
  ctx.arc(bx, by, br - 10, arcStart, arcEnd)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.lineCap = 'butt'

  ctx.fillStyle = GOLD
  ctx.font = 'bold 46px Georgia, serif'
  ctx.fillText(`${data.percentage}%`, bx, by + 16)

  ctx.fillStyle = MUTED
  ctx.font = '18px Georgia, serif'
  ctx.fillText(`${data.score}/${data.total} to'g'ri`, bx, by + 44)

  // ── Date ───────────────────────────────────────────────────────────────────
  const dateY = by + br + 80
  ctx.fillStyle = MUTED
  ctx.font = 'italic 24px Georgia, serif'
  ctx.fillText(`Sana: ${data.date}`, cx, dateY)

  divider(dateY + 24, 340, 1)

  // ── Signature area ─────────────────────────────────────────────────────────
  const sigY = dateY + 100

  // Left: text signature
  ctx.textAlign = 'left'
  ctx.fillStyle = BODY
  ctx.font = 'italic bold 54px Georgia, serif'
  ctx.fillText('Sam', 175, sigY)

  ctx.fillStyle = MUTED
  ctx.font = '19px Georgia, serif'
  ctx.fillText('SAHIFALAB asoschisi', 158, sigY + 36)

  // Center vertical rule
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx, dateY + 32)
  ctx.lineTo(cx, sigY + 60)
  ctx.stroke()

  // Right: official seal
  const sx = 830, sy = sigY - 10, sr = 62
  ctx.beginPath()
  ctx.arc(sx, sy, sr, 0, Math.PI * 2)
  ctx.fillStyle = BG
  ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.setLineDash([5, 4])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.arc(sx, sy, sr - 14, 0, Math.PI * 2)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font = 'bold 15px Georgia, serif'
  spacedText(ctx, 'SAHIFALAB', sx, sy - 8, 2)
  ctx.font = 'bold 13px Georgia, serif'
  ctx.fillText('✓ TASDIQLANDI', sx, sy + 14)
  ctx.fillStyle = MUTED
  ctx.font = '12px Georgia, serif'
  ctx.fillText('2026', sx, sy + 34)

  // ── Motivational quote ─────────────────────────────────────────────────────
  const quoteY = sigY + 100
  divider(quoteY, 500, 1)

  ctx.fillStyle = LIGHT
  ctx.font = 'italic 21px Georgia, serif'
  const quote = '"Kitob o\'qigan inson hech qachon mag\'lub bo\'lmaydi"'
  const qLines = wrapText(ctx, quote, 800)
  qLines.forEach((line, i) => ctx.fillText(line, cx, quoteY + 38 + i * 30))

  ctx.fillStyle = GOLD
  ctx.font = '19px Georgia, serif'
  ctx.fillText('— Sam, SAHIFALAB', cx, quoteY + 38 + qLines.length * 30 + 6)

  // ── Bottom divider + domain ────────────────────────────────────────────────
  divider(H - 90, W - 160, 2)

  ctx.fillStyle = GOLD
  ctx.font = 'bold 22px Georgia, serif'
  spacedText(ctx, 'SAHIFALAB.UZ', cx, H - 56, 6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const CertificateGenerator: React.FC<Props> = ({ data, onClose }) => {
  const offscreenRef  = useRef<HTMLCanvasElement | null>(null)
  const previewRef    = useRef<HTMLCanvasElement>(null)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(true)

  const render = useCallback(() => {
    setRendering(true)
    // Small tick ensures the browser has painted the modal before we hit the GPU
    requestAnimationFrame(() => {
      const offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
      drawCertificate(offscreen, data)

      // Scale down into the preview canvas
      const preview = previewRef.current
      if (preview) {
        const scale = preview.offsetWidth / W || 320 / W
        preview.width  = W * scale
        preview.height = H * scale
        const ctx = preview.getContext('2d')!
        ctx.scale(scale, scale)
        ctx.drawImage(offscreen, 0, 0)
      }

      setDataUrl(offscreen.toDataURL('image/png'))
      setRendering(false)
    })
  }, [data])

  useEffect(() => { render() }, [render])

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `sahifalab-sertifikat-${data.userName.replace(/\s+/g, '-')}.png`
    a.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">🏆 Sertifikat</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Preview */}
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-amber-50 aspect-[4/5]">
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-3xl animate-spin">⏳</div>
            </div>
          )}
          <canvas
            ref={previewRef}
            className="w-full h-full object-contain"
            style={{ opacity: rendering ? 0 : 1, transition: 'opacity 0.3s' }}
          />
        </div>

        {/* Info */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          📲 PNG sifatida yuklab oling va Instagram Stories ga joylang!
        </p>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Yopish
          </button>
          <button
            onClick={handleDownload}
            disabled={rendering || !dataUrl}
            className="py-3 rounded-xl font-bold text-white bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 disabled:opacity-50 shadow-md transition-all active:scale-95"
          >
            ⬇️ Yuklab olish
          </button>
        </div>
      </div>
    </div>
  )
}

export default CertificateGenerator
