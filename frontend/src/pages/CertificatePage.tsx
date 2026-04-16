/**
 * CertificatePage — /certificate/:share_token
 *
 * Public page (no auth required). Shows a branded certificate card,
 * OG meta tags, and share options: copy link, Telegram, canvas download.
 */

import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award, Share2, Copy, Download, CheckCircle,
  Loader2, BookOpen, Star, X,
  Calendar, BarChart2, Zap,
} from 'lucide-react'
import api from '../services/apiService'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CertData {
  share_token: string
  certificate_id: string
  course_id: number
  course_name: string
  course_thumbnail: string | null
  student_name: string
  student_username: string | null
  student_photo: string | null
  student_level: number
  student_xp: number
  score_pct: number
  completed_lessons: number
  total_lessons: number
  issued_at: string | null
  skill_tags: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })
}

function scoreColor(pct: number): string {
  if (pct >= 90) return '#10b981'
  if (pct >= 70) return '#f59e0b'
  return '#6366f1'
}

// ── OG Meta Tags (injected into <head> dynamically) ───────────────────────────

function injectOgTags(cert: CertData) {
  const setMeta = (property: string, content: string) => {
    let el = document.querySelector(`meta[property="${property}"]`)
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el) }
    el.setAttribute('content', content)
  }
  const setName = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`)
    if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
    el.setAttribute('content', content)
  }

  const title = `${cert.student_name} — "${cert.course_name}" kursi sertifikati`
  const desc = `${cert.student_name} SAHIFALAB platformasida "${cert.course_name}" kursini ${cert.score_pct}% natija bilan muvaffaqiyatli yakunladi.`
  const url = window.location.href

  document.title = title
  setMeta('og:type', 'website')
  setMeta('og:url', url)
  setMeta('og:title', title)
  setMeta('og:description', desc)
  setMeta('og:site_name', 'SAHIFALAB')
  if (cert.course_thumbnail) setMeta('og:image', cert.course_thumbnail)
  setMeta('twitter:card', 'summary_large_image')
  setMeta('twitter:title', title)
  setMeta('twitter:description', desc)
  if (cert.course_thumbnail) setMeta('twitter:image', cert.course_thumbnail)
  setName('description', desc)
}

// ── Canvas Certificate Download ────────────────────────────────────────────────

async function downloadCertificate(cert: CertData) {
  const W = 1200, H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D & {
    roundRect: (x: number, y: number, w: number, h: number, r: number) => void
  }

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#0f172a')
  grad.addColorStop(1, '#1e293b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Decorative arc
  ctx.strokeStyle = 'rgba(255,106,42,0.15)'
  ctx.lineWidth = 120
  ctx.beginPath()
  ctx.arc(W, 0, 600, 0, Math.PI / 2)
  ctx.stroke()

  // Inner card
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.beginPath()
  ctx.roundRect(40, 40, W - 80, H - 80, 24)
  ctx.fill()

  // Border
  ctx.strokeStyle = 'rgba(255,106,42,0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(40, 40, W - 80, H - 80, 24)
  ctx.stroke()

  // Logo pill
  ctx.fillStyle = '#ff6a2a'
  ctx.beginPath()
  ctx.roundRect(80, 80, 160, 40, 20)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText('SAHIFALAB', 160, 106)

  // Certificate label
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '14px system-ui'
  ctx.textAlign = 'left'
  ctx.fillText('SERTIFIKAT', 80, 165)

  // Student name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px system-ui'
  ctx.fillText(cert.student_name, 80, 240)

  // "muvaffaqiyatli yakunladi"
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '22px system-ui'
  ctx.fillText('kursini muvaffaqiyatli yakunladi', 80, 285)

  // Course name
  ctx.fillStyle = '#ff6a2a'
  ctx.font = 'bold 32px system-ui'
  const maxCourseWidth = W - 200
  let courseName = cert.course_name
  while (ctx.measureText(`"${courseName}"`) .width > maxCourseWidth && courseName.length > 10) {
    courseName = courseName.slice(0, -1)
  }
  if (courseName !== cert.course_name) courseName += '...'
  ctx.fillText(`"${courseName}"`, 80, 340)

  // Score pill
  const scoreX = 80, scoreY = 390
  ctx.fillStyle = scoreColor(cert.score_pct) + '33'
  ctx.beginPath()
  ctx.roundRect(scoreX, scoreY, 120, 36, 18)
  ctx.fill()
  ctx.fillStyle = scoreColor(cert.score_pct)
  ctx.font = 'bold 18px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(`${cert.score_pct}%`, scoreX + 60, scoreY + 24)

  // Date
  if (cert.issued_at) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '16px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(formatDate(cert.issued_at), 220, scoreY + 25)
  }

  // Skill tags (bottom)
  if (cert.skill_tags.length > 0) {
    let x = 80
    const y = H - 80
    cert.skill_tags.slice(0, 6).forEach(tag => {
      const w = ctx.measureText(tag).width + 28
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.roundRect(x, y - 28, w, 28, 14)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(tag, x + w / 2, y - 8)
      ctx.textAlign = 'left'
      x += w + 8
      if (x > W - 200) return
    })
  }

  // Right decorative: level badge
  const cx = W - 120, cy = H / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 70, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,106,42,0.08)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,106,42,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '13px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText('DARAJA', cx, cy - 20)
  ctx.fillStyle = '#ff6a2a'
  ctx.font = 'bold 40px system-ui'
  ctx.fillText(cert.student_level.toString(), cx, cy + 18)

  // Download
  const link = document.createElement('a')
  link.download = `sahifalab-certificate-${cert.certificate_id}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// ── Share Modal ────────────────────────────────────────────────────────────────

const ShareModal: React.FC<{
  cert: CertData
  onClose: () => void
}> = ({ cert, onClose }) => {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const shareUrl = window.location.href

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const shareToTelegram = () => {
    const text = encodeURIComponent(
      `Men SAHIFALAB platformasida "${cert.course_name}" kursini ${cert.score_pct}% natija bilan yakunladim! 🎓`
    )
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank')
  }

  const handleDownload = async () => {
    setDownloading(true)
    try { await downloadCertificate(cert) } finally { setDownloading(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 dark:text-white">Ulashish</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Copy link */}
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              {copied ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5 text-slate-500" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{copied ? 'Nusxalandi!' : 'Havolani nusxalash'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{shareUrl}</p>
            </div>
          </button>

          {/* Telegram */}
          <button
            onClick={shareToTelegram}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-[#2AABEE]/10 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#2AABEE]">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Telegram orqali ulashish</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Do'stlaringizga yuboring</p>
            </div>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-xl bg-sahifa-50 dark:bg-sahifa-900/30 flex items-center justify-center flex-shrink-0">
              {downloading
                ? <Loader2 className="w-5 h-5 text-sahifa-500 animate-spin" />
                : <Download className="w-5 h-5 text-sahifa-500" />
              }
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {downloading ? 'Yuklanmoqda...' : 'Rasmni yuklab olish'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">1200×630 PNG format</p>
            </div>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Certificate Card (visual) ──────────────────────────────────────────────────

const CertificateCard: React.FC<{ cert: CertData }> = ({ cert }) => {
  const sc = scoreColor(cert.score_pct)

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl">
      {/* Decorative rings */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full border-[60px] border-sahifa-500/10 pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full border-[40px] border-white/5 pointer-events-none" />

      {/* Inner */}
      <div className="relative p-7 sm:p-10">
        {/* Header row */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sahifa-500 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] text-sahifa-400 font-semibold uppercase tracking-widest">SAHIFALAB</p>
              <p className="text-xs text-white/40 mt-0.5">Sertifikat</p>
            </div>
          </div>

          {/* Level badge */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex flex-col items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-sahifa-400 mb-0.5" />
              <p className="text-xl font-extrabold text-white leading-none">{cert.student_level}</p>
            </div>
            <p className="text-[10px] text-white/30 mt-1">Daraja</p>
          </div>
        </div>

        {/* Student info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-white/10">
            {cert.student_photo
              ? <img src={cert.student_photo} alt={cert.student_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center bg-sahifa-900 text-sahifa-300 text-2xl font-extrabold">
                  {cert.student_name[0]}
                </div>
            }
          </div>
          <div>
            <p className="text-white/50 text-xs uppercase tracking-widest mb-0.5">Bitiruvchi</p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">{cert.student_name}</h2>
            {cert.student_username && (
              <p className="text-sm text-white/40">@{cert.student_username}</p>
            )}
          </div>
        </div>

        {/* Completion text */}
        <p className="text-white/50 text-sm mb-2">kursini muvaffaqiyatli yakunladi</p>
        <h3 className="text-lg sm:text-xl font-bold text-sahifa-400 leading-snug mb-6">
          "{cert.course_name}"
        </h3>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: sc + '22' }}>
              <BarChart2 className="w-4 h-4" style={{ color: sc }} />
            </div>
            <div>
              <p className="text-xs text-white/40">Natija</p>
              <p className="text-sm font-bold" style={{ color: sc }}>{cert.score_pct}%</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <p className="text-xs text-white/40">Darslar</p>
              <p className="text-sm font-bold text-white">{cert.completed_lessons}/{cert.total_lessons}</p>
            </div>
          </div>

          {cert.issued_at && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <p className="text-xs text-white/40">Sana</p>
                <p className="text-sm font-bold text-white">{formatDate(cert.issued_at)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Skill tags */}
        {cert.skill_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {cert.skill_tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/60 border border-white/10">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Award stamp */}
        <div className="flex items-center gap-2 pt-4 border-t border-white/10">
          <Award className="w-5 h-5 text-sahifa-400" />
          <p className="text-xs text-white/30">
            Sertifikat ID: <span className="font-mono text-white/40">{cert.certificate_id}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const CertificatePage: React.FC = () => {
  const { share_token } = useParams<{ share_token: string }>()
  const [cert, setCert] = useState<CertData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    if (!share_token) { setNotFound(true); setLoading(false); return }

    // Fetch from public backend endpoint (no auth needed)
    const fetchCert = async () => {
      try {
        const res = await api.get(`/certificates/share/${share_token}`)
        const data: CertData = res.data
        setCert(data)
        injectOgTags(data)
      } catch (err: any) {
        if (err?.response?.status === 404) setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchCert()
  }, [share_token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-sahifa-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Sertifikat yuklanmoqda...</p>
        </div>
      </div>
    )
  }

  if (notFound || !cert) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-950 px-6">
        <div className="w-20 h-20 rounded-3xl bg-sahifa-500/10 flex items-center justify-center">
          <Award className="w-9 h-9 text-sahifa-500" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-xl font-extrabold text-white">Sertifikat topilmadi</h1>
          <p className="text-sm text-slate-400">Bu havola eskirgan yoki noto'g'ri bo'lishi mumkin.</p>
        </div>
        <Link
          to="/"
          className="px-6 py-2.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-sahifa-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-10 sm:py-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-sahifa-500 flex items-center justify-center group-hover:bg-sahifa-600 transition-colors">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-extrabold text-white">SAHIFALAB</span>
          </Link>
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Ulashish
          </button>
        </motion.div>

        {/* Certificate card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <CertificateCard cert={cert} />
        </motion.div>

        {/* CTA section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center space-y-4"
        >
          <p className="text-slate-400 text-sm leading-relaxed">
            Bu sertifikat <span className="text-white font-semibold">SAHIFALAB</span> platformasida
            tasdiqlanган. Siz ham o'rganishni boshlang!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-sahifa-500/20"
            >
              <Star className="w-4 h-4" />
              Sahifalab'ga qo'shiling →
            </Link>
            <button
              onClick={() => setShowShare(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Sertifikatni ulashish
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-xs text-slate-600">
            © 2026 SAHIFALAB · @Sahifalab_hub_bot
          </p>
        </motion.div>
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showShare && <ShareModal cert={cert} onClose={() => setShowShare(false)} />}
      </AnimatePresence>
    </div>
  )
}

export default CertificatePage
