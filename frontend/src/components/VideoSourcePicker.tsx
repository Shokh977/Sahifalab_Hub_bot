/**
 * VideoSourcePicker
 *
 * Tab-based toggle: 📺 YouTube (unlisted embed) vs 🐇 Bunny Stream (file upload)
 *
 * Props:
 *   courseId?        — for path organisation
 *   source           — controlled: 'youtube' | 'bunny' | 'none'
 *   videoUrl         — controlled: current URL / YouTube link
 *   bunnyVideoId?    — existing Bunny Stream GUID (edit mode)
 *   onSourceChange   — (source) => void
 *   onVideoChange    — (url: string, durationSeconds: number, videoId?: string) => void
 *   disabled?
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { VideoCameraIcon, CloudArrowUpIcon, LightBulbIcon } from '@heroicons/react/24/outline'
import VideoUploadWidget from './VideoUploadWidget'

type Source = 'youtube' | 'bunny' | 'none'

interface Props {
  courseId?:        number
  source:           Source
  videoUrl:         string
  bunnyVideoId?:    string
  onSourceChange:   (s: Source) => void
  onVideoChange:    (url: string, durationSeconds: number, videoId?: string) => void
  disabled?:        boolean
}

// ── YouTube helpers ───────────────────────────────────────────────────────────
const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

export const extractYouTubeId = (url: string): string | null => {
  const m = url.match(YT_REGEX)
  return m ? m[1] : null
}

export const toEmbedUrl = (url: string): string | null => {
  const id = extractYouTubeId(url)
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null
}

// ── Tab button ────────────────────────────────────────────────────────────────
const Tab: React.FC<{
  active: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
      active
        ? 'bg-sahifa-500 text-white shadow'
        : 'text-gray-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
)

const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-400 transition'

// ── Main component ────────────────────────────────────────────────────────────
const VideoSourcePicker: React.FC<Props> = ({
  courseId,
  source,
  videoUrl,
  bunnyVideoId,
  onSourceChange,
  onVideoChange,
  disabled,
}) => {
  const [ytInput, setYtInput] = useState(source === 'youtube' ? videoUrl : '')
  const [ytError, setYtError] = useState('')

  const handleSourceTab = (s: Source) => {
    onSourceChange(s)
    if (s === 'youtube') {
      setYtInput(videoUrl)
    }
  }

  const handleYtBlur = () => {
    if (!ytInput.trim()) {
      setYtError('')
      onVideoChange('', 0)
      return
    }
    const id = extractYouTubeId(ytInput.trim())
    if (!id) {
      setYtError("To'g'ri YouTube havolasi kiriting (youtube.com/watch?v=... yoki youtu.be/...)")
      return
    }
    setYtError('')
    onVideoChange(ytInput.trim(), 0)
  }

  const embedUrl = source === 'youtube' ? toEmbedUrl(videoUrl) : null

  return (
    <div className="space-y-3">

      {/* Tab row */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
        <Tab active={source === 'youtube'} onClick={() => handleSourceTab('youtube')}>
          <span className="inline-flex items-center gap-1.5">
            <VideoCameraIcon className="w-4 h-4" />
            YouTube (bepul)
          </span>
        </Tab>
        <Tab active={source === 'bunny'} onClick={() => handleSourceTab('bunny')}>
          <span className="inline-flex items-center gap-1.5">
            <CloudArrowUpIcon className="w-4 h-4" />
            Bunny.net (pullik)
          </span>
        </Tab>
      </div>

      <AnimatePresence mode="wait">

        {/* ── YouTube tab ── */}
        {source === 'youtube' && (
          <motion.div
            key="youtube"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <input
                type="url"
                value={ytInput}
                onChange={e => { setYtInput(e.target.value); setYtError('') }}
                onBlur={handleYtBlur}
                placeholder="https://www.youtube.com/watch?v=..."
                className={inputCls}
                disabled={disabled}
              />
              {ytError && (
                <p className="text-[11px] text-red-500">{ytError}</p>
              )}
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <LightBulbIcon className="w-3.5 h-3.5" />
                  YouTube studioda videoni <strong>Unlisted (Cheklangan)</strong> qilib yuklang — faqat havola orqali ko'rinadi.
                </span>
              </p>
            </div>

            {/* Live preview */}
            {embedUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video bg-black">
                <iframe
                  src={embedUrl}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                  title="YouTube preview"
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ── Bunny tab ── */}
        {source === 'bunny' && (
          <motion.div
            key="bunny"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <VideoUploadWidget
              courseId={courseId}
              existingUrl={source === 'bunny' ? videoUrl : ''}
              existingVideoId={bunnyVideoId}
              onUploaded={(urlOrId, dur) => onVideoChange(urlOrId, dur, urlOrId)}
              onStreamUpload={({ videoId }) => onVideoChange('', 0, videoId)}
              disabled={disabled}
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
              Bunny Stream — adaptive HLS, faqat to'lov qilgan talabalar ko'radi.
            </p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default VideoSourcePicker
