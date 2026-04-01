/**
 * VideoPlayer
 *
 * Renders the right player depending on video_source:
 *   'youtube' → YouTube iframe embed
 *   'bunny'   → native <video> with controls + Bunny CDN URL
 *   'none'    → placeholder (no video yet)
 *   locked    → lock overlay (paid lesson, not enrolled)
 *
 * Props:
 *   videoSource  — 'youtube' | 'bunny' | 'none'
 *   videoUrl     — YouTube URL or Bunny CDN URL
 *   title?       — shown in placeholder / locked state
 *   locked?      — show locked overlay instead of player
 */
import React, { useState } from 'react'
import { toEmbedUrl } from './VideoSourcePicker'

type VideoSource = 'youtube' | 'bunny' | 'none'

interface Props {
  videoSource: VideoSource
  videoUrl:    string
  title?:      string
  locked?:     boolean
}

// ── Aspect-ratio shell ────────────────────────────────────────────────────────
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-video border border-slate-200 dark:border-slate-800">
    {children}
  </div>
)

// ── Main component ────────────────────────────────────────────────────────────
const VideoPlayer: React.FC<Props> = ({ videoSource, videoUrl, title, locked }) => {

  const [error, setError] = useState(false)

  // ── Locked overlay ────────────────────────────────────────────────────────
  if (locked) {
    return (
      <Shell>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 text-white">
          <span className="text-5xl">🔒</span>
          <p className="text-sm font-semibold">{title ?? 'Bu dars pullik'}</p>
          <p className="text-xs text-slate-400">Kursga yoziling yoki xarid qiling</p>
        </div>
      </Shell>
    )
  }

  // ── No video ──────────────────────────────────────────────────────────────
  if (videoSource === 'none' || !videoUrl) {
    return (
      <Shell>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-400">
          <span className="text-4xl">🎬</span>
          <p className="text-xs">Video hali yuklanmagan</p>
        </div>
      </Shell>
    )
  }

  // ── YouTube embed ─────────────────────────────────────────────────────────
  if (videoSource === 'youtube') {
    const embedUrl = toEmbedUrl(videoUrl)
    if (!embedUrl) {
      return (
        <Shell>
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs">
            ⚠️ Noto'g'ri YouTube havolasi
          </div>
        </Shell>
      )
    }
    return (
      <Shell>
        <iframe
          src={embedUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          title={title ?? 'Video'}
        />
      </Shell>
    )
  }

  // ── Bunny.net native player ───────────────────────────────────────────────
  if (videoSource === 'bunny') {
    if (error) {
      return (
        <Shell>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-400">
            <span className="text-3xl">⚠️</span>
            <p className="text-xs">Video yuklanmadi</p>
            <button
              className="text-xs text-sahifa-400 underline"
              onClick={() => setError(false)}
            >
              Qayta urinish
            </button>
          </div>
        </Shell>
      )
    }
    return (
      <Shell>
        <video
          src={videoUrl}
          controls
          controlsList="nodownload"
          onContextMenu={e => e.preventDefault()}
          onError={() => setError(true)}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          title={title}
        >
          Brauzeringiz video formatini qo'llab-quvvatlamaydi.
        </video>
      </Shell>
    )
  }

  return null
}

export default VideoPlayer
