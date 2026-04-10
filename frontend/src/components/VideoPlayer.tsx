/**
 * VideoPlayer
 *
 * Renders the right player depending on video_source:
 *   'youtube' → YouTube iframe embed
 *   'bunny'   → Bunny Stream iframe embed (signed URL, adaptive HLS)
 *              → Legacy: direct MP4 / .m3u8 via <video> tag (backward compat)
 *   'none'    → placeholder (no video yet)
 *   locked    → lock overlay (paid lesson, not enrolled)
 *
 * Bunny Stream (preferred):
 *   When embed_url is provided, we use the Bunny Stream iframe player which
 *   handles adaptive bitrate, DRM, captions, and analytics out of the box.
 *   The embed URL is pre-signed by the backend with a 4-hour token.
 *
 * Legacy HLS:
 *   If only videoUrl is provided (no embed_url), we use hls.js for .m3u8 or
 *   a plain <video> tag for .mp4. This supports old lessons uploaded before
 *   the Bunny Stream migration.
 *
 * Props:
 *   videoSource   — 'youtube' | 'bunny' | 'none'
 *   videoUrl      — YouTube URL, legacy .m3u8 / .mp4 URL
 *   embedUrl?     — Bunny Stream signed iframe embed URL (preferred)
 *   hlsUrl?       — Bunny Stream signed HLS .m3u8 URL (for custom player)
 *   thumbnailUrl? — Stream thumbnail for poster
 *   encodingStatus? — 'processing' | 'finished' | etc.
 *   title?        — shown in placeholder / locked state
 *   locked?       — show locked overlay instead of player
 */
import React, { useEffect, useRef, useState } from 'react'
import { ExclamationTriangleIcon, FilmIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { toEmbedUrl } from './VideoSourcePicker'

type VideoSource = 'youtube' | 'bunny' | 'none'

interface Props {
  videoSource:     VideoSource
  videoUrl:        string
  embedUrl?:       string
  hlsUrl?:         string
  thumbnailUrl?:   string
  encodingStatus?: string
  title?:          string
  locked?:         boolean
}

// ── Aspect-ratio shell ────────────────────────────────────────────────────────
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-video border border-slate-200 dark:border-slate-800">
    {children}
  </div>
)

// ── Bunny Stream iframe embed (signed URL) ────────────────────────────────────
const BunnyStreamPlayer: React.FC<{ embedUrl: string; title?: string }> = ({ embedUrl, title }) => (
  <iframe
    src={embedUrl}
    loading="lazy"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
    className="absolute inset-0 w-full h-full"
    title={title ?? 'Video'}
    style={{ border: 'none' }}
  />
)

// ── Encoding progress overlay ─────────────────────────────────────────────────
const EncodingOverlay: React.FC<{ status: string; thumbnailUrl?: string }> = ({ status, thumbnailUrl }) => {
  const label = status === 'processing' || status === 'transcoding'
    ? 'Video transkoding qilinmoqda...'
    : status === 'uploaded'
      ? "Video yuklandi, navbatda..."
      : status === 'created'
        ? "Video yuklanmagan"
        : status === 'error' || status === 'upload_failed'
          ? "Video xatolik yuz berdi"
          : 'Video tayyorlanmoqda...'

  const isError = status === 'error' || status === 'upload_failed'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 text-white">
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
        />
      )}
      <div className="relative z-10 flex flex-col items-center gap-3">
        {isError ? (
          <ExclamationTriangleIcon className="w-10 h-10 text-red-400" />
        ) : (
          <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        <p className="text-sm font-medium">{label}</p>
        {!isError && (
          <p className="text-xs text-slate-400">Adaptive HLS streaming tayyorlanmoqda</p>
        )}
      </div>
    </div>
  )
}

// ── Legacy HLS / MP4 player (backward compat for old lessons) ─────────────────
const LegacyBunnyPlayer: React.FC<{ url: string; title?: string; poster?: string; onError: () => void }> = ({ url, title, poster, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<any>(null)
  const isHLS    = url.endsWith('.m3u8') || url.includes('.m3u8?')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isHLS) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        return
      }

      let cancelled = false
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          video.src = url
          return
        }
        const hls = new Hls({
          maxBufferLength:       30,
          maxMaxBufferLength:    60,
          enableWorker:          true,
          lowLatencyMode:        false,
          startLevel:            -1,
          capLevelToPlayerSize:  true,
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
        video.src = url
      })

      return () => {
        cancelled = true
        hlsRef.current?.destroy()
        hlsRef.current = null
      }
    }

    video.src = url
    return undefined
  }, [url, isHLS, onError])

  return (
    <video
      ref={videoRef}
      controls
      controlsList="nodownload"
      preload="metadata"
      poster={poster}
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
const VideoPlayer: React.FC<Props> = ({
  videoSource, videoUrl, embedUrl, hlsUrl, thumbnailUrl, encodingStatus, title, locked,
}) => {

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
  if (videoSource === 'none' || (!videoUrl && !embedUrl)) {
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
    const ytUrl = toEmbedUrl(videoUrl)
    if (!ytUrl) {
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
          src={ytUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          title={title ?? 'Video'}
        />
      </Shell>
    )
  }

  // ── Bunny.net video ───────────────────────────────────────────────────────
  if (videoSource === 'bunny') {

    // Show encoding progress for videos still being transcoded
    if (encodingStatus && encodingStatus !== 'finished' && encodingStatus !== 'none' && embedUrl) {
      return (
        <Shell>
          <EncodingOverlay status={encodingStatus} thumbnailUrl={thumbnailUrl} />
        </Shell>
      )
    }

    // ── Bunny Stream iframe embed (preferred) ───────────────────────────
    if (embedUrl) {
      return (
        <Shell>
          <BunnyStreamPlayer embedUrl={embedUrl} title={title} />
        </Shell>
      )
    }

    // ── Error state ─────────────────────────────────────────────────────
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

    // ── Legacy: direct CDN .m3u8 / .mp4 (old lessons) ──────────────────
    if (videoUrl) {
      return (
        <Shell>
          <LegacyBunnyPlayer
            url={videoUrl}
            title={title}
            poster={thumbnailUrl}
            onError={() => setError(true)}
          />
        </Shell>
      )
    }
  }

  return null
}

export default VideoPlayer
