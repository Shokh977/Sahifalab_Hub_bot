/**
 * VideoPlayer
 *
 * Renders the right player depending on video_source:
 *   'youtube' → YouTube iframe embed
 *   'bunny'   → HLS adaptive streaming (.m3u8) or direct MP4 fallback
 *   'none'    → placeholder (no video yet)
 *   locked    → lock overlay (paid lesson, not enrolled)
 *
 * HLS support:
 *   If videoUrl ends with .m3u8 (Bunny Stream), we use hls.js for adaptive
 *   bitrate streaming. On Safari (which supports HLS natively), we skip hls.js
 *   and let the browser handle it. For plain .mp4 URLs from Bunny CDN Storage,
 *   we fall back to a standard <video> tag with preload="metadata".
 *
 * Props:
 *   videoSource  — 'youtube' | 'bunny' | 'none'
 *   videoUrl     — YouTube URL, .m3u8 URL, or direct .mp4 Bunny CDN URL
 *   title?       — shown in placeholder / locked state
 *   locked?      — show locked overlay instead of player
 */
import React, { useEffect, useRef, useState } from 'react'
import { ExclamationTriangleIcon, FilmIcon, LockClosedIcon } from '@heroicons/react/24/outline'
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

// ── HLS / MP4 player ─────────────────────────────────────────────────────────
const BunnyPlayer: React.FC<{ url: string; title?: string; onError: () => void }> = ({ url, title, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<any>(null)
  const isHLS    = url.endsWith('.m3u8') || url.includes('.m3u8?')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // If it's an HLS manifest, use hls.js (or native HLS on Safari)
    if (isHLS) {
      // Safari/iOS can play HLS natively
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        return
      }

      // Dynamically import hls.js (code-split — only loaded when needed)
      let cancelled = false
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          // Fallback: try native
          video.src = url
          return
        }
        const hls = new Hls({
          maxBufferLength:       30,
          maxMaxBufferLength:    60,
          enableWorker:          true,
          lowLatencyMode:        false,
          startLevel:            -1,         // auto quality
          capLevelToPlayerSize:  true,        // don't fetch 4K on a 400px player
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) {
            hls.destroy()
            onError()
          }
        })
        hlsRef.current = hls
      }).catch(() => {
        // If dynamic import fails, try native
        video.src = url
      })

      return () => {
        cancelled = true
        hlsRef.current?.destroy()
        hlsRef.current = null
      }
    }

    // Plain MP4 — just set src
    video.src = url
    return undefined
  }, [url, isHLS, onError])

  return (
    <video
      ref={videoRef}
      controls
      controlsList="nodownload"
      preload="metadata"
      onContextMenu={e => e.preventDefault()}
      onError={onError}
      className="absolute inset-0 w-full h-full object-contain bg-black"
      title={title}
    >
      Brauzeringiz video formatini qo'llab-quvvatlamaydi.
    </video>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const VideoPlayer: React.FC<Props> = ({ videoSource, videoUrl, title, locked }) => {

  const [error, setError] = useState(false)

  // ── Locked overlay ────────────────────────────────────────────────────────
  if (locked) {
    return (
      <Shell>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 text-white">
          <LockClosedIcon className="w-12 h-12" />
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
          <FilmIcon className="w-10 h-10" />
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
            <span className="inline-flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4" /> Noto'g'ri YouTube havolasi
            </span>
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

  // ── Bunny.net player (HLS + MP4 fallback) ────────────────────────────────
  if (videoSource === 'bunny') {
    if (error) {
      return (
        <Shell>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-400">
            <ExclamationTriangleIcon className="w-8 h-8" />
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
        <BunnyPlayer url={videoUrl} title={title} onError={() => setError(true)} />
      </Shell>
    )
  }

  return null
}

export default VideoPlayer
