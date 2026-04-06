/**
 * CertificateGenerator -- dual-mode certificate renderer
 *
 * type === 'course' -> Landscape 1500x1060  SAHIFALAB Course Completion design
 * type === 'quiz'   -> Portrait 1080x1350   existing minimalist quiz certificate
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode'
import { Download, Trophy, X, Loader2 } from 'lucide-react'

// -- Types -----------------------------------------------------------------
export interface CertificateData {
  type?: 'quiz' | 'course'
  userName: string
  quizTitle: string
  score?: number
  total?: number
  percentage?: number
  date: string
  certificateId?: string
}

interface Props {
  data: CertificateData
  onClose: () => void
}

// -- Dimensions ------------------------------------------------------------
const CW = 1500
const CH = 1060
const CCX = CW / 2
const QW = 1080
const QH = 1350
const QCX = QW / 2

// -- Palette ---------------------------------------------------------------
const ORANGE        = '#F26722'
const ORANGE_MID    = '#F88A45'
const ORANGE_LIGHT  = '#FFAD6B'
const OFF_WHITE     = '#FAFAFA'
const CHARCOAL      = '#1F2937'
const GOLD          = '#D4AF37'
const MUTED         = '#6B7280'
const BROWN_DARK    = '#4A2008'
const BROWN         = '#7B3F1A'
const TELEGRAM_CHANNEL_URL = 'https://t.me/sahifalab1'

// -- Utilities -------------------------------------------------------------
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  words.forEach(word => {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else { line = test }
  })
  if (line) lines.push(line)
  return lines
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function makeQrImage(url: string, size = 140): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: size, margin: 1,
    color: { dark: CHARCOAL, light: '#0000' },
  })
  return loadImage(dataUrl)
}

function formatCertificateId(data: CertificateData): string {
  if (data.certificateId?.trim()) {
    return data.certificateId.trim().replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
  }
  const seed = data.userName + '|' + data.quizTitle + '|' + data.date + '|' +
    (data.score ?? 0) + '|' + (data.total ?? 1) + '|' + (data.percentage ?? 100)
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const token = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0').slice(0, 8)
  return 'SLH-' + token
}

// ==========================================================================
//  COURSE CERTIFICATE - LANDSCAPE 1500 x 1060
// ==========================================================================

type BlobPath = (ctx: CanvasRenderingContext2D) => void
function blob(ctx: CanvasRenderingContext2D, color: string, path: BlobPath) {
  ctx.fillStyle = color
  ctx.beginPath()
  path(ctx)
  ctx.fill()
}

function drawCornerBlobs(ctx: CanvasRenderingContext2D) {
  const W = CW, H = CH

  // TOP-LEFT (3 layers: light -> mid -> dark)
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(0, 0)
    c.bezierCurveTo(W*0.15, H*-0.03, W*0.40, H*-0.01, W*0.46, H*0.10)
    c.bezierCurveTo(W*0.52, H*0.22,  W*0.36, H*0.33,  W*0.24, H*0.46)
    c.bezierCurveTo(W*0.13, H*0.56,  0,      H*0.52,  0,      H*0.48)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(0, 0)
    c.bezierCurveTo(W*0.12, H*-0.02, W*0.32, H*0.00, W*0.37, H*0.09)
    c.bezierCurveTo(W*0.43, H*0.20,  W*0.28, H*0.30, W*0.17, H*0.41)
    c.bezierCurveTo(W*0.08, H*0.50,  0,      H*0.46, 0,      H*0.42)
    c.closePath()
  })
  blob(ctx, ORANGE, c => {
    c.moveTo(0, 0)
    c.bezierCurveTo(W*0.10, H*-0.01, W*0.24, H*0.01, W*0.28, H*0.08)
    c.bezierCurveTo(W*0.33, H*0.17,  W*0.21, H*0.26, W*0.12, H*0.36)
    c.bezierCurveTo(W*0.06, H*0.43,  0,      H*0.40, 0,      H*0.37)
    c.closePath()
  })

  // TOP-RIGHT
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(W, 0)
    c.bezierCurveTo(W*0.85, H*-0.03, W*0.60, H*-0.01, W*0.54, H*0.10)
    c.bezierCurveTo(W*0.48, H*0.22,  W*0.64, H*0.33,  W*0.76, H*0.46)
    c.bezierCurveTo(W*0.87, H*0.56,  W,      H*0.52,  W,      H*0.48)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(W, 0)
    c.bezierCurveTo(W*0.88, H*-0.02, W*0.68, H*0.00, W*0.63, H*0.09)
    c.bezierCurveTo(W*0.57, H*0.20,  W*0.72, H*0.30, W*0.83, H*0.41)
    c.bezierCurveTo(W*0.92, H*0.50,  W,      H*0.46, W,      H*0.42)
    c.closePath()
  })
  blob(ctx, ORANGE, c => {
    c.moveTo(W, 0)
    c.bezierCurveTo(W*0.90, H*-0.01, W*0.76, H*0.01, W*0.72, H*0.08)
    c.bezierCurveTo(W*0.67, H*0.17,  W*0.79, H*0.26, W*0.88, H*0.36)
    c.bezierCurveTo(W*0.94, H*0.43,  W,      H*0.40, W,      H*0.37)
    c.closePath()
  })

  // BOTTOM-LEFT
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(0, H)
    c.bezierCurveTo(W*0.15, H*1.03, W*0.40, H*1.01, W*0.46, H*0.90)
    c.bezierCurveTo(W*0.52, H*0.78, W*0.36, H*0.67, W*0.24, H*0.54)
    c.bezierCurveTo(W*0.13, H*0.44, 0,      H*0.48, 0,      H*0.52)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(0, H)
    c.bezierCurveTo(W*0.12, H*1.02, W*0.32, H*1.00, W*0.37, H*0.91)
    c.bezierCurveTo(W*0.43, H*0.80, W*0.28, H*0.70, W*0.17, H*0.59)
    c.bezierCurveTo(W*0.08, H*0.50, 0,      H*0.54, 0,      H*0.58)
    c.closePath()
  })
  blob(ctx, ORANGE, c => {
    c.moveTo(0, H)
    c.bezierCurveTo(W*0.10, H*1.01, W*0.24, H*0.99, W*0.28, H*0.92)
    c.bezierCurveTo(W*0.33, H*0.83, W*0.21, H*0.74, W*0.12, H*0.64)
    c.bezierCurveTo(W*0.06, H*0.57, 0,      H*0.60, 0,      H*0.63)
    c.closePath()
  })

  // BOTTOM-RIGHT
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(W, H)
    c.bezierCurveTo(W*0.85, H*1.03, W*0.60, H*1.01, W*0.54, H*0.90)
    c.bezierCurveTo(W*0.48, H*0.78, W*0.64, H*0.67, W*0.76, H*0.54)
    c.bezierCurveTo(W*0.87, H*0.44, W,      H*0.48, W,      H*0.52)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(W, H)
    c.bezierCurveTo(W*0.88, H*1.02, W*0.68, H*1.00, W*0.63, H*0.91)
    c.bezierCurveTo(W*0.57, H*0.80, W*0.72, H*0.70, W*0.83, H*0.59)
    c.bezierCurveTo(W*0.92, H*0.50, W,      H*0.54, W,      H*0.58)
    c.closePath()
  })
  blob(ctx, ORANGE, c => {
    c.moveTo(W, H)
    c.bezierCurveTo(W*0.90, H*1.01, W*0.76, H*0.99, W*0.72, H*0.92)
    c.bezierCurveTo(W*0.67, H*0.83, W*0.79, H*0.74, W*0.88, H*0.64)
    c.bezierCurveTo(W*0.94, H*0.57, W,      H*0.60, W,      H*0.63)
    c.closePath()
  })
}

/** Award medal: orange circle with checkmark + two ribbon strips below */
function drawAwardMedal(ctx: CanvasRenderingContext2D, cx: number, topY: number) {
  const r = 38
  const cy = topY + r

  // Ribbon strips
  ctx.fillStyle = ORANGE
  ctx.beginPath()
  ctx.moveTo(cx - 24, cy + r - 8)
  ctx.lineTo(cx - 38, cy + r + 46)
  ctx.lineTo(cx - 5,  cy + r + 20)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + 24, cy + r - 8)
  ctx.lineTo(cx + 38, cy + r + 46)
  ctx.lineTo(cx + 5,  cy + r + 20)
  ctx.closePath()
  ctx.fill()

  // Circle
  ctx.fillStyle = ORANGE
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Inner ring
  ctx.strokeStyle = 'rgba(255,255,255,0.50)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r - 9, 0, Math.PI * 2)
  ctx.stroke()

  // Checkmark
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 14, cy + 3)
  ctx.lineTo(cx - 3,  cy + 14)
  ctx.lineTo(cx + 18, cy - 14)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

async function drawCourseCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  canvas.width  = CW
  canvas.height = CH
  const ctx = canvas.getContext('2d')!
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, CW, CH)

  // Corner blobs
  drawCornerBlobs(ctx)

  // Thin border
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(30, 24, CW - 60, CH - 48)

  // ---- TITLE: CERTIFICATE -------------------------------------------------
  ctx.font = '900 88px "Arial Black", Impact, Arial, sans-serif'
  ctx.letterSpacing = '7px'
  ctx.fillStyle = 'rgba(200,75,5,0.22)'
  ctx.fillText('CERTIFICATE', CCX + 2, 131)
  ctx.fillStyle = ORANGE
  ctx.fillText('CERTIFICATE', CCX, 129)
  ctx.letterSpacing = '0px'

  // ---- Dotted separator ---------------------------------------------------
  for (let x = CCX - 96; x <= CCX + 96; x += 11) {
    ctx.beginPath()
    ctx.arc(x, 181, 2.2, 0, Math.PI * 2)
    ctx.fillStyle = ORANGE
    ctx.fill()
  }

  // ---- Subtitle -----------------------------------------------------------
  ctx.fillStyle = BROWN
  ctx.font = 'italic 27px Georgia, "Times New Roman", serif'
  ctx.fillText('Ushbu sertifikat egasi', CCX, 224)

  // ---- User name ----------------------------------------------------------
  const safeName = data.userName.trim() || 'Talaba'
  const displayName = '\u201c' + safeName + '\u201d'
  ctx.fillStyle = BROWN_DARK
  ctx.shadowColor = 'rgba(74,32,8,0.12)'
  ctx.shadowBlur  = 6
  ctx.font = 'italic 74px "Brush Script MT", "Segoe Script", "Palatino Linotype", cursive'
  ctx.fillText(displayName, CCX, 320)
  ctx.shadowBlur = 0

  // Orange underline
  const nameW = Math.min(ctx.measureText(displayName).width, 960)
  ctx.strokeStyle = ORANGE
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(CCX - nameW / 2, 368)
  ctx.lineTo(CCX + nameW / 2, 368)
  ctx.stroke()

  // ---- Body text ----------------------------------------------------------
  const courseName = data.quizTitle.trim() || 'Kurs'
  const bodyText = 'Sahifalabning \u201c' + courseName + '\u201d kursini muvaffaqiyatli yakunladi.'
  ctx.fillStyle = '#333333'
  ctx.font = '400 30px Georgia, "Times New Roman", serif'
  wrapText(ctx, bodyText, 880).forEach((line, i) => ctx.fillText(line, CCX, 434 + i * 50))

  // ---- Footer -------------------------------------------------------------
  const footY = 714

  // Horizontal divider
  ctx.strokeStyle = 'rgba(0,0,0,0.11)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(92, footY)
  ctx.lineTo(CW - 92, footY)
  ctx.stroke()

  // Vertical column dividers
  for (const dx of [0.35, 0.65]) {
    ctx.beginPath()
    ctx.moveTo(CW * dx, footY + 14)
    ctx.lineTo(CW * dx, CH - 28)
    ctx.stroke()
  }

  // LEFT: Cursive Signature + SAHIFALAB label
  const c1 = CW * 0.175
  ctx.fillStyle = ORANGE
  ctx.font = 'italic 52px "Brush Script MT", "Segoe Script", cursive'
  ctx.fillText('Sahifalab', c1, footY + 86)
  ctx.strokeStyle = CHARCOAL
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(c1 - 102, footY + 120)
  ctx.lineTo(c1 + 102, footY + 120)
  ctx.stroke()
  ctx.fillStyle = CHARCOAL
  ctx.letterSpacing = '3px'
  ctx.font = '700 18px Arial, sans-serif'
  ctx.fillText('SAHIFALAB', c1, footY + 150)
  ctx.letterSpacing = '0px'

  // CENTER: Award medal + date
  drawAwardMedal(ctx, CCX, footY + 32)
  ctx.fillStyle = CHARCOAL
  ctx.font = '600 23px Arial, sans-serif'
  ctx.fillText(data.date, CCX, footY + 174)

  // RIGHT: Certificate ID
  const c3 = CW * 0.825
  const certId = formatCertificateId(data)
  ctx.fillStyle = MUTED
  ctx.font = '500 17px Arial, sans-serif'
  ctx.fillText('\u201cCertificate ID\u201d', c3, footY + 72)
  ctx.fillStyle = CHARCOAL
  ctx.letterSpacing = '1px'
  ctx.font = '700 20px "Courier New", monospace'
  ctx.fillText(certId, c3, footY + 110)
  ctx.letterSpacing = '0px'

  // QR code bottom-right
  const qrSize = 88
  const qrX = CW - qrSize - 34
  const qrY = CH - qrSize - 26
  const qrImg = await makeQrImage(TELEGRAM_CHANNEL_URL, 104)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.roundRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8)
  ctx.fill()
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
}

// ==========================================================================
//  QUIZ CERTIFICATE - PORTRAIT 1080 x 1350 (existing design, preserved)
// ==========================================================================

function drawPremiumPaperTexture(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = OFF_WHITE
  ctx.fillRect(0, 0, QW, QH)
  const radial = ctx.createRadialGradient(QCX, QH * 0.4, 120, QCX, QH * 0.4, 900)
  radial.addColorStop(0, 'rgba(212,175,55,0.06)')
  radial.addColorStop(1, 'rgba(212,175,55,0)')
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, QW, QH)
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = 'rgba(31,41,55,' + (0.02 + Math.random() * 0.03) + ')'
    ctx.fillRect(Math.random() * QW, Math.random() * QH, 1, 1)
  }
}

function drawCircularText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, radius: number, startAngle: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(startAngle)
  const letters = text.split('')
  const sweep = Math.PI * 1.05
  const step  = letters.length > 1 ? sweep / (letters.length - 1) : 0
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

async function drawQuizCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  canvas.width  = QW
  canvas.height = QH
  const ctx = canvas.getContext('2d')!
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  drawPremiumPaperTexture(ctx)

  ctx.strokeStyle = ORANGE; ctx.lineWidth = 2
  ctx.strokeRect(24, 24, QW - 48, QH - 48)
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1
  ctx.strokeRect(40, 40, QW - 80, QH - 80)

  ctx.fillStyle = CHARCOAL; ctx.font = '700 64px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB', QCX, 130)
  ctx.fillStyle = GOLD; ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('H U B', QCX, 170)

  ctx.strokeStyle = 'rgba(31,41,55,0.22)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(QCX - 210, 212); ctx.lineTo(QCX + 210, 212); ctx.stroke()

  ctx.fillStyle = CHARCOAL; ctx.font = '700 86px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('QUIZ CERTIFICATE', QCX, 300)
  ctx.fillStyle = MUTED; ctx.font = '500 30px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Ushbu sertifikat egasi', QCX, 390)

  const safeName = data.userName.trim() || 'Ishtirokchi'
  ctx.fillStyle = CHARCOAL
  ctx.font = '700 88px "Playfair Display", Georgia, "Times New Roman", serif'
  ctx.fillText(safeName, QCX, 500)

  const nw = Math.min(ctx.measureText(safeName).width + 30, 780)
  const ug = ctx.createLinearGradient(QCX - nw / 2, 0, QCX + nw / 2, 0)
  ug.addColorStop(0, ORANGE); ug.addColorStop(1, GOLD)
  ctx.strokeStyle = ug; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(QCX - nw / 2, 556); ctx.lineTo(QCX + nw / 2, 556); ctx.stroke()

  ctx.fillStyle = CHARCOAL; ctx.font = '500 31px Inter, Montserrat, Arial, sans-serif'
  const ach = "Ushbu sertifikat egasi SAHIFALAB Hub platformasidagi " + data.quizTitle + " testidan muvaffaqiyatli o'tib, o'z bilimini rasman tasdiqladi."
  wrapText(ctx, ach, 850).forEach((line, idx) => ctx.fillText(line, QCX, 640 + idx * 46))

  const sx = 250, sy = 935, sr = 95
  ctx.save()
  ctx.strokeStyle = ORANGE; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(sx, sy, sr - 12, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = ORANGE; ctx.font = '700 13px Inter, Montserrat, Arial, sans-serif'
  drawCircularText(ctx, 'SAHIFALAB - DEEP WORK CERTIFIED', sx, sy, sr - 7, -Math.PI * 0.85)
  ctx.fillStyle = GOLD; ctx.font = '700 32px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('CERTIFIED', sx, sy)
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.fillStyle = ORANGE; ctx.font = 'italic 58px "Brush Script MT", "Segoe Script", cursive'
  ctx.fillText('SAHIFALAB', 670, 920)
  ctx.fillStyle = MUTED; ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Official Digital Signature', 678, 958)

  const certId = formatCertificateId(data)
  const mT = 1080, mX = 95, mW = QW - 190, mH = 160
  const pg = ctx.createLinearGradient(0, mT, 0, mT + mH)
  pg.addColorStop(0, 'rgba(255,255,255,0.8)'); pg.addColorStop(1, 'rgba(255,255,255,0.55)')
  ctx.fillStyle = pg; ctx.strokeStyle = 'rgba(31,41,55,0.16)'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(mX, mT, mW, mH, 20); ctx.fill(); ctx.stroke()
  const cw = mW / 3
  ctx.strokeStyle = 'rgba(31,41,55,0.15)'; ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(mX + i * cw, mT + 18); ctx.lineTo(mX + i * cw, mT + mH - 18); ctx.stroke()
  }
  const metrics = [
    { label: 'Date',           value: data.date },
    { label: 'Score',          value: String(Math.round(data.percentage ?? 100)) + '%' },
    { label: 'Certificate ID', value: certId.length <= 10 ? certId : certId.slice(0, 10) + '...' },
  ]
  ctx.textAlign = 'center'
  metrics.forEach((item, idx) => {
    const x = mX + cw * idx + cw / 2
    ctx.fillStyle = GOLD; ctx.font = '700 19px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.label, x, mT + 46)
    ctx.fillStyle = CHARCOAL
    ctx.font = idx === 2 ? '700 18px Inter, Montserrat, Arial, sans-serif' : '600 28px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.value, x, mT + 104)
  })

  const qb = 130, qx = QW - qb - 68, qy = 760
  const qi = await makeQrImage(TELEGRAM_CHANNEL_URL, 132)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = 'rgba(31,41,55,0.2)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(qx, qy, qb, qb, 14); ctx.fill(); ctx.stroke()
  ctx.drawImage(qi, qx + 9, qy + 9, qb - 18, qb - 18)
  ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = '500 14px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Scan to verify channel', qx, qy - 16)
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD; ctx.font = '700 22px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB HUB', QCX, QH - 44)
}

// ==========================================================================
//  DISPATCH
// ==========================================================================
async function drawCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  if (data.type === 'course') await drawCourseCertificate(canvas, data)
  else await drawQuizCertificate(canvas, data)
}

// ==========================================================================
//  COMPONENT
// ==========================================================================
const CertificateGenerator: React.FC<Props> = ({ data, onClose }) => {
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef   = useRef<HTMLCanvasElement>(null)
  const [dataUrl,   setDataUrl]   = useState<string | null>(null)
  const [rendering, setRendering] = useState(true)

  const isCourseCert = data.type === 'course'
  const srcW = isCourseCert ? CW : QW
  const srcH = isCourseCert ? CH : QH

  const render = useCallback(() => {
    setRendering(true)
    requestAnimationFrame(async () => {
      const offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
      await drawCertificate(offscreen, data)

      const preview = previewRef.current
      if (preview) {
        const scale  = (preview.offsetWidth || 320) / srcW
        preview.width  = srcW * scale
        preview.height = srcH * scale
        const pCtx = preview.getContext('2d')!
        pCtx.setTransform(1, 0, 0, 1, 0, 0)
        pCtx.clearRect(0, 0, preview.width, preview.height)
        pCtx.scale(scale, scale)
        pCtx.drawImage(offscreen, 0, 0)
      }
      setDataUrl(offscreen.toDataURL('image/png'))
      setRendering(false)
    })
  }, [data, srcW, srcH])

  useEffect(() => { render() }, [render])

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'sahifalab-' + (isCourseCert ? 'kurs' : 'quiz') + '-sertifikat-' + data.userName.replace(/\s+/g, '-') + '.png'
    a.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#F26722]" />
            {isCourseCert ? 'Kurs sertifikati' : 'Quiz sertifikati'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-[#fafafa]"
          style={{ aspectRatio: `${srcW} / ${srcH}` }}
        >
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}
          <canvas
            ref={previewRef}
            className="w-full h-full object-contain"
            style={{ opacity: rendering ? 0 : 1, transition: 'opacity 0.35s' }}
          />
        </div>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          {isCourseCert
            ? 'Kursni muvaffaqiyatli tugatganligingiz tasdiqlandi!'
            : 'Premium PNG formatida yuklab oling va ulashing.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Yopish
          </button>
          <button
            onClick={handleDownload}
            disabled={rendering || !dataUrl}
            className="py-3 rounded-xl font-bold text-white bg-gradient-to-r from-[#F26722] to-[#D4AF37] hover:brightness-95 disabled:opacity-50 shadow-md transition-all active:scale-95 inline-flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" /> Yuklab olish
          </button>
        </div>
      </div>
    </div>
  )
}

export default CertificateGenerator
