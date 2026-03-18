/**
 * CertificateGenerator
 * Renders a 1080 × 1350 certificate on an offscreen Canvas, shows a live
 * preview inside a modal, and lets the user download it as a PNG.
 *
 * Size: 1080 × 1350 px  (Instagram Stories / Portrait 4:5)
 * Design: minimalist luxury — cream background, gold borders, clean serif typography
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CertificateData {
  userName: string
  quizTitle: string
  score: number
  total: number
  percentage: number
  date: string
  certificateId?: string
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
const ORANGE = '#F26722'
const OFF_WHITE = '#FAFAFA'
const CHARCOAL = '#1F2937'
const GOLD = '#D4AF37'
const MUTED = '#6B7280'
const TELEGRAM_CHANNEL_URL = 'https://t.me/sahifalab1'

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function makeQrImage(url: string, size = 140): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: {
      dark: CHARCOAL,
      light: '#0000',
    },
  })
  return loadImage(dataUrl)
}

function formatCertificateId(data: CertificateData): string {
  if (data.certificateId?.trim()) {
    return data.certificateId.trim().replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
  }

  const seed = `${data.userName}|${data.quizTitle}|${data.date}|${data.score}|${data.total}|${data.percentage}`
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }

  const token = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0').slice(0, 8)
  return `SLH-${token}`
}

function drawPremiumPaperTexture(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = OFF_WHITE
  ctx.fillRect(0, 0, W, H)

  const radial = ctx.createRadialGradient(cx, H * 0.4, 120, cx, H * 0.4, 900)
  radial.addColorStop(0, 'rgba(212,175,55,0.06)')
  radial.addColorStop(1, 'rgba(212,175,55,0)')
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, W, H)

  for (let i = 0; i < 2200; i += 1) {
    const x = Math.random() * W
    const y = Math.random() * H
    const alpha = 0.02 + Math.random() * 0.03
    ctx.fillStyle = `rgba(31,41,55,${alpha})`
    ctx.fillRect(x, y, 1, 1)
  }

  for (let i = 0; i < 80; i += 1) {
    const x = Math.random() * W
    const h = 60 + Math.random() * 180
    const y = Math.random() * (H - h)
    ctx.fillStyle = 'rgba(31,41,55,0.015)'
    ctx.fillRect(x, y, 1, h)
  }
}

function drawCircularText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(startAngle)

  const letters = text.split('')
  const sweep = Math.PI * 1.05
  const step = letters.length > 1 ? sweep / (letters.length - 1) : 0

  letters.forEach((ch, idx) => {
    ctx.save()
    ctx.rotate(idx * step)
    ctx.translate(0, -radius)
    ctx.rotate(Math.PI / 2)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })

  ctx.restore()
}

// ─── Main draw function ────────────────────────────────────────────────────────
async function drawCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  drawPremiumPaperTexture(ctx)

  ctx.strokeStyle = ORANGE
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, W - 48, H - 48)

  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1
  ctx.strokeRect(40, 40, W - 80, H - 80)

  ctx.fillStyle = CHARCOAL
  ctx.font = '700 64px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB', cx, 130)

  ctx.fillStyle = GOLD
  ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('H U B', cx, 170)

  ctx.strokeStyle = 'rgba(31,41,55,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - 210, 212)
  ctx.lineTo(cx + 210, 212)
  ctx.stroke()

  ctx.fillStyle = CHARCOAL
  ctx.font = '700 86px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('QUIZ CERTIFICATE', cx, 300)

  ctx.fillStyle = MUTED
  ctx.font = '500 30px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Ushbu sertifikat egasi', cx, 390)

  const safeName = data.userName.trim() || 'Ishtirokchi'
  ctx.fillStyle = CHARCOAL
  ctx.font = '700 88px "Playfair Display", Georgia, "Times New Roman", serif'
  ctx.fillText(safeName, cx, 500)

  const nameWidth = Math.min(ctx.measureText(safeName).width + 30, 780)
  const underlineGradient = ctx.createLinearGradient(cx - nameWidth / 2, 0, cx + nameWidth / 2, 0)
  underlineGradient.addColorStop(0, ORANGE)
  underlineGradient.addColorStop(1, GOLD)
  ctx.strokeStyle = underlineGradient
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - nameWidth / 2, 556)
  ctx.lineTo(cx + nameWidth / 2, 556)
  ctx.stroke()

  ctx.fillStyle = CHARCOAL
  ctx.font = '500 31px Inter, Montserrat, Arial, sans-serif'
  const achievement = `Ushbu sertifikat egasi SAHIFALAB Hub platformasidagi ${data.quizTitle} testidan muvaffaqiyatli o'tib, o'z bilimini rasman tasdiqladi.`
  const achievementLines = wrapText(ctx, achievement, 850)
  achievementLines.forEach((line, idx) => {
    ctx.fillText(line, cx, 640 + idx * 46)
  })

  const sealX = 250
  const sealY = 935
  const sealR = 95

  ctx.save()
  ctx.strokeStyle = ORANGE
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(sealX, sealY, sealR, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(sealX, sealY, sealR - 12, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = ORANGE
  ctx.font = '700 13px Inter, Montserrat, Arial, sans-serif'
  drawCircularText(ctx, 'SAHIFALAB - DEEP WORK CERTIFIED', sealX, sealY, sealR - 7, -Math.PI * 0.85)

  ctx.fillStyle = GOLD
  ctx.font = '700 32px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('CERTIFIED', sealX, sealY)
  ctx.restore()

  const signatureX = 760
  const signatureY = 935
  ctx.textAlign = 'left'
  ctx.fillStyle = ORANGE
  ctx.font = 'italic 58px "Brush Script MT", "Segoe Script", cursive'
  ctx.fillText('SAHIFALAB Team', signatureX - 90, signatureY)

  ctx.fillStyle = MUTED
  ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Official Digital Signature', signatureX - 82, signatureY + 38)

  const certificateId = formatCertificateId(data)

  const metricsTop = 1040
  const metricsX = 95
  const metricsW = W - 190
  const metricsH = 185

  const panelGradient = ctx.createLinearGradient(0, metricsTop, 0, metricsTop + metricsH)
  panelGradient.addColorStop(0, 'rgba(255,255,255,0.8)')
  panelGradient.addColorStop(1, 'rgba(255,255,255,0.55)')

  ctx.fillStyle = panelGradient
  ctx.strokeStyle = 'rgba(31,41,55,0.16)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(metricsX, metricsTop, metricsW, metricsH, 20)
  ctx.fill()
  ctx.stroke()

  const colW = metricsW / 3
  ctx.strokeStyle = 'rgba(31,41,55,0.15)'
  ctx.lineWidth = 1
  for (let i = 1; i < 3; i += 1) {
    const px = metricsX + i * colW
    ctx.beginPath()
    ctx.moveTo(px, metricsTop + 18)
    ctx.lineTo(px, metricsTop + metricsH - 18)
    ctx.stroke()
  }

  const metrics = [
    { label: 'Date', value: data.date },
    { label: 'Score', value: `${Math.round(data.percentage)}%` },
    { label: 'Certificate ID', value: certificateId },
  ]

  ctx.textAlign = 'center'
  metrics.forEach((item, idx) => {
    const x = metricsX + colW * idx + colW / 2
    ctx.fillStyle = GOLD
    ctx.font = '700 19px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.label, x, metricsTop + 52)

    ctx.fillStyle = CHARCOAL
    ctx.font = idx === 2
      ? '700 24px Inter, Montserrat, Arial, sans-serif'
      : '600 30px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.value, x, metricsTop + 112)
  })

  const qrBox = 152
  const qrX = W - qrBox - 68
  const qrY = H - qrBox - 68
  const qrImg = await makeQrImage(TELEGRAM_CHANNEL_URL, 132)

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.strokeStyle = 'rgba(31,41,55,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(qrX, qrY, qrBox, qrBox, 14)
  ctx.fill()
  ctx.stroke()

  ctx.drawImage(qrImg, qrX + 10, qrY + 10, qrBox - 20, qrBox - 20)

  ctx.textAlign = 'left'
  ctx.fillStyle = MUTED
  ctx.font = '500 14px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Scan to verify channel', qrX, qrY - 16)

  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font = '700 22px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB HUB', cx, H - 44)
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
    requestAnimationFrame(async () => {
      const offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
      await drawCertificate(offscreen, data)

      // Scale down into the preview canvas
      const preview = previewRef.current
      if (preview) {
        const scale = preview.offsetWidth / W || 320 / W
        preview.width  = W * scale
        preview.height = H * scale
        const ctx = preview.getContext('2d')!
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, preview.width, preview.height)
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
    a.download = `sahifalab-certificate-${data.userName.replace(/\s+/g, '-')}.png`
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
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-[#fafafa] aspect-[4/5]">
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-3xl animate-spin">⏳</div>
            </div>
          )}
          <canvas
            ref={previewRef}
            className="w-full h-full object-contain"
            style={{ opacity: rendering ? 0 : 1, transition: 'opacity 0.35s' }}
          />
        </div>

        {/* Info */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">Premium PNG formatida yuklab oling va ulashing.</p>

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
            className="py-3 rounded-xl font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-95 disabled:opacity-50 shadow-md transition-all active:scale-95"
          >
            ⬇️ Yuklab olish
          </button>
        </div>
      </div>
    </div>
  )
}

export default CertificateGenerator
