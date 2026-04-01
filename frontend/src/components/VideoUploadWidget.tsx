/**
 * VideoUploadWidget
 *
 * Drag-and-drop / click-to-browse video uploader.
 * Calls POST /api/upload/video (multipart), shows a progress bar,
 * and fires onUploaded(url, durationSeconds) when done.
 *
 * Props:
 *   courseId?      — passed as form field to build the correct Bunny.net path
 *   onUploaded     — callback with CDN url + detected duration in seconds
 *   existingUrl?   — pre-fill (edit mode): shows thumbnail + replace button
 *   disabled?      — locks the widget (while parent form is saving)
 */
import React, { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://sahifalab-hub-bot-hsgt.vercel.app/api'

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const MAX_MB = 500

interface Props {
  courseId?:    number
  onUploaded:   (url: string, durationSeconds: number) => void
  existingUrl?: string
  disabled?:    boolean
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

const fmtBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const VideoUploadWidget: React.FC<Props> = ({
  courseId,
  onUploaded,
  existingUrl,
  disabled,
}) => {
  const { token } = useAuth()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [state,    setState]    = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)       // 0-100
  const [cdnUrl,   setCdnUrl]   = useState(existingUrl ?? '')
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // ── detect video duration via browser ────────────────────────────────────
  const getDuration = (file: File): Promise<number> =>
    new Promise(resolve => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      const url = URL.createObjectURL(file)
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve(isFinite(video.duration) ? Math.round(video.duration) : 0)
      }
      video.onerror = () => { URL.revokeObjectURL(url); resolve(0) }
      video.src = url
    })

  // ── upload with XHR so we can track progress ──────────────────────────────
  const upload = useCallback(async (file: File) => {
    if (!token) { setErrorMsg('Tizimga kiring'); return }

    // validate
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg(`Faylni turi noto'g'ri. mp4, webm, mov, mkv kiriting.`)
      setState('error')
      return
    }
    const mb = file.size / (1024 ** 2)
    if (mb > MAX_MB) {
      setErrorMsg(`Fayl juda katta (${mb.toFixed(1)} MB). Maksimal: ${MAX_MB} MB.`)
      setState('error')
      return
    }

    setState('uploading')
    setProgress(0)
    setErrorMsg('')
    setFileName(file.name)

    const duration = await getDuration(file)

    const form = new FormData()
    form.append('file', file)
    if (courseId) form.append('course_id', String(courseId))

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/upload/video`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            setCdnUrl(data.url)
            setState('done')
            onUploaded(data.url, duration)
            resolve()
          } catch {
            reject(new Error('Javob o\'qishda xatolik'))
          }
        } else {
          let detail = `HTTP ${xhr.status}`
          try { detail = JSON.parse(xhr.responseText)?.detail ?? detail } catch { /* ignore */ }
          reject(new Error(detail))
        }
      }

      xhr.onerror = () => reject(new Error('Tarmoq xatoligi'))
      xhr.send(form)
    }).catch(err => {
      setErrorMsg(String(err?.message ?? err))
      setState('error')
    })
  }, [token, courseId, onUploaded])

  // ── drag handlers ─────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }, [upload])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload(file)
    e.target.value = ''
  }

  const reset = () => {
    setState('idle')
    setCdnUrl('')
    setProgress(0)
    setErrorMsg('')
    setFileName('')
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">

        {/* ── DONE: show CDN url + replace button ── */}
        {state === 'done' || (state === 'idle' && cdnUrl) ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
          >
            <span className="text-2xl">🎬</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                {fileName || 'Video yuklandi'}
              </p>
              <p className="text-[10px] text-emerald-500 dark:text-emerald-400 truncate">{cdnUrl}</p>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800 transition-colors"
              >
                Almashtirish
              </button>
            )}
          </motion.div>
        ) : state === 'uploading' ? (

          /* ── UPLOADING: progress bar ── */
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                ⏫ {fileName}
              </span>
              <span className="text-xs font-bold text-sahifa-500">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-sahifa-400"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'linear', duration: 0.3 }}
              />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
              Bunny.net CDN ga yuklanmoqda...
            </p>
          </motion.div>

        ) : (

          /* ── IDLE / ERROR: drop zone ── */
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={disabled ? undefined : onDrop}
            onClick={() => !disabled && inputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-2
              py-8 px-4 rounded-xl border-2 border-dashed cursor-pointer
              transition-colors text-center
              ${disabled
                ? 'border-slate-100 dark:border-slate-800 cursor-not-allowed opacity-60'
                : isDragging
                  ? 'border-sahifa-400 bg-sahifa-50 dark:bg-sahifa-900/20'
                  : state === 'error'
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-sahifa-300 dark:hover:border-sahifa-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }
            `}
          >
            <span className="text-3xl">{state === 'error' ? '⚠️' : '📹'}</span>
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {isDragging ? 'Tashlang!' : 'Video yuklash'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                mp4 · webm · mov · mkv — maks. {MAX_MB} MB
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
              className="hidden"
              onChange={onFileChange}
              disabled={disabled}
            />
          </motion.div>

        )}
      </AnimatePresence>

      {/* Error message */}
      {errorMsg && state === 'error' && (
        <p className="text-[11px] text-red-600 dark:text-red-400 px-1">⚠️ {errorMsg}</p>
      )}
    </div>
  )
}

export default VideoUploadWidget
