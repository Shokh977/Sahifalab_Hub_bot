/**
 * CertificateGenerator -- dual-mode certificate renderer
 *
 * type === 'course' -> Landscape 1500x1060  SAHIFALAB Course Completion
 * type === 'quiz'   -> Portrait  1080x1350  Quiz certificate
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
const CW  = 1500                // course canvas width
const CH  = 1060                // course canvas height
const CCX = CW / 2
const QW  = 1080                // quiz canvas width
const QH  = 1350                // quiz canvas height
const QCX = QW / 2

// -- Palette ---------------------------------------------------------------
const ORANGE       = '#F26722'
const ORANGE_MID   = '#F88A45'
const ORANGE_LIGHT = '#FFAD6B'
const OFF_WHITE    = '#FAFAFA'
const CHARCOAL     = '#1F2937'
const GOLD         = '#D4AF37'
const MUTED        = '#6B7280'
const BROWN_DARK   = '#4A2008'
const BROWN        = '#7B3F1A'
const TELEGRAM_CHANNEL_URL = 'https://t.me/sahifalab1'

// -- Utilities -------------------------------------------------------------
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  words.forEach(word => {
    const test = line ? line + ' ' + word : word
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
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function makeQrImage(
  url: string,
  size = 140,
  qrColor = CHARCOAL,
): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: { dark: qrColor, light: '#0000' },
  })
  return loadImage(dataUrl)
}

function formatCertificateId(data: CertificateData): string {
  if (data.certificateId?.trim()) {
    return data.certificateId
      .trim()
      .replace(/[^A-Za-z0-9-]/g, '')
      .toUpperCase()
  }
  const seed =
    data.userName + '|' + data.quizTitle + '|' + data.date + '|' +
    (data.score ?? 0) + '|' + (data.total ?? 1) + '|' + (data.percentage ?? 100)
  let hash = 0
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const token = Math.abs(hash)
    .toString(36)
    .toUpperCase()
    .padStart(8, '0')
    .slice(0, 8)
  return 'SLH-' + token
}

// ==========================================================================
//  COURSE CERTIFICATE helpers
// ==========================================================================

type BlobPath = (ctx: CanvasRenderingContext2D) => void
function blob(ctx: CanvasRenderingContext2D, color: string, path: BlobPath) {
  ctx.fillStyle = color
  ctx.beginPath()
  path(ctx)
  ctx.fill()
}

/**
 * Corner waves — organic S-curve shapes.
 * ONLY top-right (dominant) and bottom-left (secondary).
 * Bottom-right has a tiny accent for QR area.
 * NO top-left corner blobs — matches the reference exactly.
 */
function drawCornerBlobs(ctx: CanvasRenderingContext2D) {
  const W = CW
  const H = CH

  // ===== TOP-RIGHT — 3 organic S-curve wave layers =====
  // Outermost (lightest, yellow-orange tint)
  blob(ctx, '#F9C56B', c => {
    c.moveTo(W * 0.72, 0)
    c.bezierCurveTo(W * 0.78, H * 0.02, W * 0.86, H * 0.01, W * 0.92, 0)
    c.lineTo(W, 0)
    c.lineTo(W, H * 0.12)
    c.bezierCurveTo(W * 0.98, H * 0.08, W * 0.94, H * 0.04, W * 0.72, 0)
    c.closePath()
  })
  // Layer 2 — light orange
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(W * 0.52, 0)
    c.bezierCurveTo(W * 0.58, H * 0.08, W * 0.72, H * 0.14, W * 0.82, H * 0.12)
    c.bezierCurveTo(W * 0.92, H * 0.10, W * 0.97, H * 0.06, W, H * 0.20)
    c.lineTo(W, 0)
    c.lineTo(W * 0.52, 0)
    c.closePath()
  })
  // Layer 3 — mid orange
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(W * 0.58, 0)
    c.bezierCurveTo(W * 0.64, H * 0.06, W * 0.74, H * 0.12, W * 0.84, H * 0.14)
    c.bezierCurveTo(W * 0.92, H * 0.15, W * 0.96, H * 0.12, W, H * 0.28)
    c.lineTo(W, 0)
    c.lineTo(W * 0.58, 0)
    c.closePath()
  })
  // Layer 4 — darkest, most prominent orange
  blob(ctx, ORANGE, c => {
    c.moveTo(W * 0.66, 0)
    c.bezierCurveTo(W * 0.72, H * 0.05, W * 0.80, H * 0.10, W * 0.88, H * 0.14)
    c.bezierCurveTo(W * 0.94, H * 0.17, W * 0.97, H * 0.20, W, H * 0.34)
    c.lineTo(W, 0)
    c.lineTo(W * 0.66, 0)
    c.closePath()
  })

  // ===== BOTTOM-LEFT — 3 organic S-curve wave layers =====
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(0, H * 0.68)
    c.bezierCurveTo(W * 0.04, H * 0.72, W * 0.10, H * 0.82, W * 0.14, H * 0.86)
    c.bezierCurveTo(W * 0.20, H * 0.92, W * 0.30, H * 0.96, W * 0.38, H)
    c.lineTo(0, H)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(0, H * 0.74)
    c.bezierCurveTo(W * 0.03, H * 0.78, W * 0.08, H * 0.86, W * 0.12, H * 0.90)
    c.bezierCurveTo(W * 0.18, H * 0.95, W * 0.24, H * 0.97, W * 0.30, H)
    c.lineTo(0, H)
    c.closePath()
  })
  blob(ctx, ORANGE, c => {
    c.moveTo(0, H * 0.80)
    c.bezierCurveTo(W * 0.02, H * 0.84, W * 0.06, H * 0.90, W * 0.10, H * 0.93)
    c.bezierCurveTo(W * 0.14, H * 0.96, W * 0.18, H * 0.98, W * 0.22, H)
    c.lineTo(0, H)
    c.closePath()
  })

  // ===== BOTTOM-RIGHT — tiny accent =====
  blob(ctx, ORANGE_LIGHT, c => {
    c.moveTo(W, H * 0.91)
    c.bezierCurveTo(W * 0.97, H * 0.93, W * 0.94, H * 0.96, W * 0.91, H)
    c.lineTo(W, H)
    c.closePath()
  })
  blob(ctx, ORANGE_MID, c => {
    c.moveTo(W, H * 0.94)
    c.bezierCurveTo(W * 0.98, H * 0.95, W * 0.96, H * 0.97, W * 0.94, H)
    c.lineTo(W, H)
    c.closePath()
  })
}

/**
 * Award medal/badge: rosette with checkmark + ribbon strips.
 * Matches the golden-orange badge in the reference center-bottom.
 */
function drawAwardMedal(ctx: CanvasRenderingContext2D, cx: number, topY: number) {
  const r  = 30
  const cy = topY + r

  // Ribbon strips (behind medal)
  ctx.fillStyle = ORANGE_MID
  ctx.beginPath()
  ctx.moveTo(cx - 18, cy + r - 4)
  ctx.lineTo(cx - 30, cy + r + 42)
  ctx.lineTo(cx - 4, cy + r + 18)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + 18, cy + r - 4)
  ctx.lineTo(cx + 30, cy + r + 42)
  ctx.lineTo(cx + 4, cy + r + 18)
  ctx.closePath()
  ctx.fill()

  // Rosette points (star-like rim)
  ctx.fillStyle = '#F2B84A'
  ctx.beginPath()
  for (let i = 0; i < 20; i++) {
    const a  = (Math.PI * 2 * i) / 20 - Math.PI / 2
    const rr = i % 2 === 0 ? r + 5 : r - 1
    const px = cx + Math.cos(a) * rr
    const py = cy + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()

  // Center disc
  ctx.fillStyle = '#F4C35F'
  ctx.beginPath()
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2)
  ctx.fill()

  // Inner ring
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r - 10, 0, Math.PI * 2)
  ctx.stroke()

  // Checkmark
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 3.5
  ctx.lineCap  = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 10, cy + 2)
  ctx.lineTo(cx - 2, cy + 10)
  ctx.lineTo(cx + 14, cy - 10)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/**
 * Handwritten signature — traced from the uploaded signature image.
 * The signature shows: initial loop bottom-left, ascending zigzag
 * strokes, tall right ascender, trailing descending curve.
 */
function drawSignature(ctx: CanvasRenderingContext2D, cx: number, baseY: number) {
  ctx.save()
  const s = 0.72           // scale to fit ~140px wide
  ctx.translate(cx - 70, baseY - 26)
  ctx.scale(s, s)

  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth   = 2.8
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'

  // Stroke 1 — initial loop (bottom-left oval)
  ctx.beginPath()
  ctx.moveTo(28, 106)
  ctx.bezierCurveTo(12, 98, 4, 78, 16, 62)
  ctx.bezierCurveTo(28, 46, 48, 52, 42, 68)
  ctx.bezierCurveTo(36, 84, 18, 96, 28, 106)
  ctx.stroke()

  // Stroke 2 — ascending diagonal from loop through zigzag
  ctx.beginPath()
  ctx.moveTo(28, 106)
  ctx.bezierCurveTo(38, 90, 56, 58, 72, 40)
  ctx.bezierCurveTo(88, 22, 112, 10, 140, 8)
  ctx.stroke()

  // Stroke 3 — zigzag peaks (the "www" part)
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(52, 76)
  ctx.bezierCurveTo(56, 60, 64, 50, 68, 56)
  ctx.bezierCurveTo(72, 62, 70, 72, 76, 58)
  ctx.bezierCurveTo(82, 44, 86, 52, 90, 60)
  ctx.bezierCurveTo(94, 68, 92, 56, 98, 46)
  ctx.bezierCurveTo(104, 36, 108, 42, 112, 50)
  ctx.bezierCurveTo(116, 58, 114, 44, 120, 36)
  ctx.stroke()

  // Stroke 4 — tall ascending stroke (right side)
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(120, 36)
  ctx.bezierCurveTo(128, 22, 136, 8, 148, 2)
  ctx.bezierCurveTo(156, -2, 160, 6, 158, 18)
  ctx.stroke()

  // Stroke 5 — descending tail/flourish
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(158, 18)
  ctx.bezierCurveTo(162, 36, 170, 56, 178, 68)
  ctx.bezierCurveTo(186, 80, 190, 76, 192, 64)
  ctx.bezierCurveTo(194, 52, 188, 44, 182, 52)
  ctx.bezierCurveTo(176, 60, 180, 72, 186, 76)
  ctx.stroke()

  ctx.restore()
}

// ==========================================================================
//  COURSE CERTIFICATE — LANDSCAPE 1500 × 1060
// ==========================================================================

async function drawCourseCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
) {
  canvas.width  = CW
  canvas.height = CH
  const ctx = canvas.getContext('2d')!
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  // ── 1. Background ──────────────────────────────────────────────────────
  ctx.fillStyle = '#FEFEFE'
  ctx.fillRect(0, 0, CW, CH)

  // ── 2. Corner waves (UNDER borders) ────────────────────────────────────
  drawCornerBlobs(ctx)

  // ── 3. Double orange border frame ──────────────────────────────────────
  //       Outer rect + inner rect, both ORANGE
  ctx.strokeStyle = ORANGE_MID
  ctx.lineWidth   = 2.2
  ctx.strokeRect(52, 38, CW - 104, CH - 76)
  ctx.lineWidth = 1.0
  ctx.strokeRect(66, 52, CW - 132, CH - 104)

  // ── 4. Title: CERTIFICATE ──────────────────────────────────────────────
  ctx.font = '900 82px "Arial Black", Impact, Arial, sans-serif'
  ctx.letterSpacing = '6px'
  // shadow
  ctx.fillStyle = 'rgba(200,75,5,0.18)'
  ctx.fillText('CERTIFICATE', CCX + 2, 134)
  // main
  ctx.fillStyle = ORANGE
  ctx.fillText('CERTIFICATE', CCX, 132)
  ctx.letterSpacing = '0px'

  // ── 5. Dotted separator ────────────────────────────────────────────────
  ctx.fillStyle = ORANGE
  for (let x = CCX - 90; x <= CCX + 90; x += 12) {
    ctx.beginPath()
    ctx.arc(x, 186, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // ── 6. Subtitle ────────────────────────────────────────────────────────
  ctx.fillStyle = BROWN
  ctx.font = 'italic 28px Georgia, "Times New Roman", serif'
  ctx.fillText('Ushbu sertifikat egasi', CCX, 232)

  // ── 7. User name — THE LARGEST, MOST PROMINENT element ─────────────────
  const safeName    = data.userName.trim() || 'Talaba'
  const displayName = '\u201c' + safeName + '\u201d'
  ctx.fillStyle     = BROWN_DARK
  ctx.shadowColor   = 'rgba(74,32,8,0.10)'
  ctx.shadowBlur    = 5
  ctx.font = 'italic 96px "Brush Script MT", "Segoe Script", "Palatino Linotype", cursive'
  ctx.fillText(displayName, CCX, 348)
  ctx.shadowBlur = 0

  // ── 8. Orange underline ────────────────────────────────────────────────
  const nameW = Math.min(ctx.measureText(displayName).width + 20, 1000)
  ctx.strokeStyle = ORANGE
  ctx.lineWidth   = 3
  ctx.beginPath()
  ctx.moveTo(CCX - nameW / 2, 408)
  ctx.lineTo(CCX + nameW / 2, 408)
  ctx.stroke()

  // ── 9. Body text ───────────────────────────────────────────────────────
  const courseName = data.quizTitle.trim() || 'Kurs'
  const bodyText =
    'Sahifalabning \u201c' + courseName + '\u201d kursini muvaffaqiyatli\nyakunladi.'
  ctx.fillStyle = '#444444'
  ctx.font = '400 28px Georgia, "Times New Roman", serif'
  bodyText.split('\n').forEach((line, i) => {
    ctx.fillText(line.trim(), CCX, 472 + i * 44)
  })

  // ── 10. Footer — three columns ─────────────────────────────────────────
  const footY = 660

  // ---- LEFT: Signature + line + SAHIFALAB label ----
  const c1 = CW * 0.20
  drawSignature(ctx, c1, footY + 34)
  // Horizontal line
  ctx.strokeStyle = '#888888'
  ctx.lineWidth   = 0.8
  ctx.beginPath()
  ctx.moveTo(c1 - 72, footY + 108)
  ctx.lineTo(c1 + 72, footY + 108)
  ctx.stroke()
  // SAHIFALAB — small caps style (first letter bigger via separate draws)
  ctx.fillStyle = BROWN_DARK
  ctx.font = '700 26px Georgia, "Times New Roman", serif'
  ctx.letterSpacing = '3px'
  ctx.fillText('SAHIFALAB', c1, footY + 142)
  ctx.letterSpacing = '0px'

  // ---- CENTER: Badge + "DATE" ----
  drawAwardMedal(ctx, CCX, footY + 20)
  ctx.fillStyle = '#444444'
  ctx.font = '600 16px Georgia, "Times New Roman", serif'
  ctx.fillText('\u201c' + data.date + '\u201d', CCX, footY + 130)

  // ---- RIGHT: "Certificate ID" label + value ----
  const c3 = CW * 0.80
  const certId = formatCertificateId(data)
  // Label
  ctx.fillStyle = BROWN_DARK
  ctx.font = '700 18px Georgia, "Times New Roman", serif'
  ctx.letterSpacing = '2px'
  ctx.fillText('\u201cCERTIFICATE ID\u201d', c3, footY + 58)
  ctx.letterSpacing = '0px'
  // Thin line
  ctx.strokeStyle = '#888888'
  ctx.lineWidth   = 0.8
  ctx.beginPath()
  ctx.moveTo(c3 - 100, footY + 80)
  ctx.lineTo(c3 + 100, footY + 80)
  ctx.stroke()
  // Value
  ctx.fillStyle = BROWN_DARK
  ctx.font = '700 24px Georgia, "Times New Roman", serif'
  ctx.letterSpacing = '2px'
  ctx.fillText(certId, c3, footY + 110)
  ctx.letterSpacing = '0px'

  // ── 11. QR code — bottom-right, orange ─────────────────────────────────
  const qrSize = 80
  const qrX    = CW - qrSize - 56
  const qrY    = CH - qrSize - 32
  const qrImg  = await makeQrImage(TELEGRAM_CHANNEL_URL, 96, ORANGE)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
}

// ==========================================================================
//  QUIZ CERTIFICATE — PORTRAIT 1080 × 1350
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

async function drawQuizCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
) {
  canvas.width  = QW
  canvas.height = QH
  const ctx = canvas.getContext('2d')!
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  drawPremiumPaperTexture(ctx)

  ctx.strokeStyle = ORANGE
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, QW - 48, QH - 48)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1
  ctx.strokeRect(40, 40, QW - 80, QH - 80)

  ctx.fillStyle = CHARCOAL
  ctx.font = '700 64px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB', QCX, 130)
  ctx.fillStyle = GOLD
  ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('H U B', QCX, 170)

  ctx.strokeStyle = 'rgba(31,41,55,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(QCX - 210, 212)
  ctx.lineTo(QCX + 210, 212)
  ctx.stroke()

  ctx.fillStyle = CHARCOAL
  ctx.font = '700 86px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('QUIZ CERTIFICATE', QCX, 300)
  ctx.fillStyle = MUTED
  ctx.font = '500 30px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Ushbu sertifikat egasi', QCX, 390)

  const safeName = data.userName.trim() || 'Ishtirokchi'
  ctx.fillStyle = CHARCOAL
  ctx.font =
    '700 88px "Playfair Display", Georgia, "Times New Roman", serif'
  ctx.fillText(safeName, QCX, 500)

  const nw = Math.min(ctx.measureText(safeName).width + 30, 780)
  const ug = ctx.createLinearGradient(QCX - nw / 2, 0, QCX + nw / 2, 0)
  ug.addColorStop(0, ORANGE)
  ug.addColorStop(1, GOLD)
  ctx.strokeStyle = ug
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(QCX - nw / 2, 556)
  ctx.lineTo(QCX + nw / 2, 556)
  ctx.stroke()

  ctx.fillStyle = CHARCOAL
  ctx.font = '500 31px Inter, Montserrat, Arial, sans-serif'
  const ach =
    "Ushbu sertifikat egasi SAHIFALAB Hub platformasidagi " +
    data.quizTitle +
    " testidan muvaffaqiyatli o'tib, o'z bilimini rasman tasdiqladi."
  wrapText(ctx, ach, 850).forEach((line, idx) =>
    ctx.fillText(line, QCX, 640 + idx * 46),
  )

  const sx = 250
  const sy = 935
  const sr = 95
  ctx.save()
  ctx.strokeStyle = ORANGE
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(sx, sy, sr, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(sx, sy, sr - 12, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = ORANGE
  ctx.font = '700 13px Inter, Montserrat, Arial, sans-serif'
  drawCircularText(
    ctx,
    'SAHIFALAB - DEEP WORK CERTIFIED',
    sx,
    sy,
    sr - 7,
    -Math.PI * 0.85,
  )
  ctx.fillStyle = GOLD
  ctx.font = '700 32px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('CERTIFIED', sx, sy)
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.fillStyle = ORANGE
  ctx.font = 'italic 58px "Brush Script MT", "Segoe Script", cursive'
  ctx.fillText('SAHIFALAB', 670, 920)
  ctx.fillStyle = MUTED
  ctx.font = '500 20px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Official Digital Signature', 678, 958)

  const certId = formatCertificateId(data)
  const mT  = 1080
  const mX  = 95
  const mW  = QW - 190
  const mH  = 160
  const pg  = ctx.createLinearGradient(0, mT, 0, mT + mH)
  pg.addColorStop(0, 'rgba(255,255,255,0.8)')
  pg.addColorStop(1, 'rgba(255,255,255,0.55)')
  ctx.fillStyle   = pg
  ctx.strokeStyle = 'rgba(31,41,55,0.16)'
  ctx.lineWidth   = 1.2
  ctx.beginPath()
  ctx.roundRect(mX, mT, mW, mH, 20)
  ctx.fill()
  ctx.stroke()
  const cw = mW / 3
  ctx.strokeStyle = 'rgba(31,41,55,0.15)'
  ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(mX + i * cw, mT + 18)
    ctx.lineTo(mX + i * cw, mT + mH - 18)
    ctx.stroke()
  }
  const metrics = [
    { label: 'Date', value: data.date },
    {
      label: 'Score',
      value: String(Math.round(data.percentage ?? 100)) + '%',
    },
    {
      label: 'Certificate ID',
      value:
        certId.length <= 10 ? certId : certId.slice(0, 10) + '...',
    },
  ]
  ctx.textAlign = 'center'
  metrics.forEach((item, idx) => {
    const x = mX + cw * idx + cw / 2
    ctx.fillStyle = GOLD
    ctx.font = '700 19px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.label, x, mT + 46)
    ctx.fillStyle = CHARCOAL
    ctx.font =
      idx === 2
        ? '700 18px Inter, Montserrat, Arial, sans-serif'
        : '600 28px Inter, Montserrat, Arial, sans-serif'
    ctx.fillText(item.value, x, mT + 104)
  })

  const qb = 130
  const qx = QW - qb - 68
  const qy = 760
  const qi = await makeQrImage(TELEGRAM_CHANNEL_URL, 132)
  ctx.fillStyle   = 'rgba(255,255,255,0.9)'
  ctx.strokeStyle = 'rgba(31,41,55,0.2)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.roundRect(qx, qy, qb, qb, 14)
  ctx.fill()
  ctx.stroke()
  ctx.drawImage(qi, qx + 9, qy + 9, qb - 18, qb - 18)
  ctx.textAlign = 'left'
  ctx.fillStyle = MUTED
  ctx.font = '500 14px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('Scan to verify channel', qx, qy - 16)
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font = '700 22px Inter, Montserrat, Arial, sans-serif'
  ctx.fillText('SAHIFALAB HUB', QCX, QH - 44)
}

// ==========================================================================
//  DISPATCH
// ==========================================================================
async function drawCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
) {
  if (data.type === 'course') await drawCourseCertificate(canvas, data)
  else await drawQuizCertificate(canvas, data)
}

// ==========================================================================
//  COMPONENT
// ==========================================================================
const CertificateGenerator: React.FC<Props> = ({ data, onClose }) => {
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef   = useRef<HTMLCanvasElement>(null)
  const [dataUrl, setDataUrl]     = useState<string | null>(null)
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
        const scale = (preview.offsetWidth || 320) / srcW
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

  useEffect(() => {
    render()
  }, [render])

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href     = dataUrl
    a.download =
      'sahifalab-' +
      (isCourseCert ? 'kurs' : 'quiz') +
      '-sertifikat-' +
      data.userName.replace(/\s+/g, '-') +
      '.png'
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
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
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
            style={{
              opacity: rendering ? 0 : 1,
              transition: 'opacity 0.35s',
            }}
          />
        </div>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          {isCourseCert
            ? 'Kursni muvaffaqiyatli tugatganligingiz tasdiqlandi!'
            : 'Premium PNG formatida yuklab oling va ulashing.'}
        </p>

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
