/**
 * VideoUploadWidget
 *
 * Drag-and-drop / click-to-browse video uploader.
 *
 * Upload flow (Bunny Stream, 2-step):
 *   1. POST /api/stream/create-video { title } → { video_id, library_id }
 *   2. PUT  /api/stream/upload/{video_id} (multipart) → triggers transcoding
 *   3. Fires onUploaded(videoId, durationSeconds) with the Stream GUID
 *
 * Fallback (legacy Bunny CDN Storage):
 *   If Bunny Stream is not configured (503), falls back to POST /api/upload/video
 *   which uploads directly to CDN Storage and returns a CDN URL.
 *
 * Props:
 *   courseId?      — passed for path organisation
 *   onUploaded     — callback with video_id (Stream) or CDN url + duration
 *   onStreamUpload?— callback specifically for Stream upload { videoId, encodingStatus }
 *   existingUrl?   — pre-fill (edit mode)
 *   existingVideoId? — existing Bunny Stream GUID (edit mode)
 *   disabled?      — locks the widget while parent form is saving
 */
import React, { useCallback, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FilmIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'

const _apiOrigin = (
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://sahifalab-hub-bot-hsgt.vercel.app'
).replace(/\/api\/?$/, '').replace(/\/$/, '')

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const MAX_MB = 2048  // 2 GB for Stream

interface Props {
  courseId?:         number
  onUploaded:       (url: string, durationSeconds: number) => void
  onStreamUpload?:  (info: { videoId: string; encodingStatus: string }) => void
  existingUrl?:     string
  existingVideoId?: string
  disabled?:        boolean
}

type UploadState = 'idle' | 'creating' | 'uploading' | 'encoding' | 'done' | 'error'

const fmtBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const VideoUploadWidget: React.FC<Props> = ({
  courseId,
  onUploaded,
  onStreamUpload,
  existingUrl,
  existingVideoId,
  disabled,
}) => {
  const { token } = useAuth()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [state,     setState]     = useState<UploadState>('idle')
  const [progress,  setProgress]  = useState(0)
  const [cdnUrl,    setCdnUrl]    = useState(existingUrl ?? '')
  const [videoId,   setVideoId]   = useState(existingVideoId ?? '')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [fileName,  setFileName]  = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [encodeProgress, setEncodeProgress] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Mark as done if pre-filled
  useEffect(() => {
    if (existingUrl || existingVideoId) {
      setState('done')
    }
  }, [existingUrl, existingVideoId])

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

  // ── Poll encoding status ─────────────────────────────────────────────────
  const startEncodingPoll = useCallback((vid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    const poll = async () => {
      try {
        const res = await fetch(`${_apiOrigin}/api/stream/status/${vid}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        setEncodeProgress(data.encode_progress ?? 0)

        if (data.status === 4) {
          // Finished
          if (pollRef.current) clearInterval(pollRef.current)
          setState('done')
          onStreamUpload?.({ videoId: vid, encodingStatus: 'finished' })
        } else if (data.status === 5 || data.status === 6) {
          // Error
          if (pollRef.current) clearInterval(pollRef.current)
          setErrorMsg('Video transkodingda xatolik yuz berdi')
          setState('error')
        }
      } catch {
        // Ignore poll errors, will retry
      }
    }

    // Poll every 5 seconds
    pollRef.current = setInterval(poll, 5000)
    // Immediate first poll
    poll()
  }, [token, onStreamUpload])

  // ── 2-step Stream upload ──────────────────────────────────────────────────
  const uploadToStream = useCallback(async (file: File) => {
    if (!token) { setErrorMsg('Tizimga kiring'); setState('error'); return }

    const duration = await getDuration(file)

    // Step 1: Create video placeholder
    setState('creating')
    setProgress(0)

    let vid = ''
    try {
      const createRes = await fetch(`${_apiOrigin}/api/stream/create-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: file.name.replace(/\.[^/.]+$/, ''),
          course_id: courseId,
        }),
      })

      if (createRes.status === 503) {
        // Bunny Stream not configured — fall back to legacy upload
        await uploadToLegacy(file, duration)
        return
      }

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err.detail || 'Video yaratishda xatolik')
      }

      const createData = await createRes.json()
      vid = createData.video_id
      setVideoId(vid)
    } catch (e: any) {
      setErrorMsg(e.message || 'Video yaratishda xatolik')
      setState('error')
      return
    }

    // Step 2: Upload raw bytes
    setState('uploading')

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', `${_apiOrigin}/api/stream/upload/${vid}`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setState('encoding')
          setEncodeProgress(0)

          // Fire callback with video ID
          onUploaded(vid, duration)
          onStreamUpload?.({ videoId: vid, encodingStatus: 'uploaded' })

          // Start polling encoding status
          startEncodingPoll(vid)
          resolve()
        } else {
          reject(new Error('Yuklashda xatolik yuz berdi'))
        }
      }

      xhr.onerror = () => reject(new Error('Tarmoq xatoligi'))

      // Send as multipart (backend expects UploadFile)
      const formData = new FormData()
      formData.append('file', file)
      xhr.send(formData)
    }).catch(err => {
      setErrorMsg(err.message || 'Yuklashda xatolik')
      setState('error')
    })
  }, [token, courseId, onUploaded, onStreamUpload, startEncodingPoll])

  // ── Legacy CDN upload (fallback) ──────────────────────────────────────────
  const uploadToLegacy = useCallback(async (file: File, duration: number) => {
    setState('uploading')
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    if (courseId) formData.append('course_id', String(courseId))

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${_apiOrigin}/api/upload/video`)
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
            reject(new Error("Javob o'qishda xatolik"))
          }
        } else {
          reject(new Error('Yuklashda xatolik yuz berdi'))
        }
      }

      xhr.onerror = () => reject(new Error('Tarmoq xatoligi'))
      xhr.send(formData)
    }).catch(err => {
      setErrorMsg(err.message || 'Yuklashda xatolik')
      setState('error')
    })
  }, [token, courseId, onUploaded])

  // ── Main upload handler ───────────────────────────────────────────────────
  const upload = useCallback(async (file: File) => {
    if (!token) { setErrorMsg('Tizimga kiring'); return }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg("Faylni turi noto'g'ri. mp4, webm, mov, mkv kiriting.")
      setState('error')
      return
    }
    const mb = file.size / (1024 ** 2)
    if (mb > MAX_MB) {
      setErrorMsg(`Fayl juda katta (${mb.toFixed(1)} MB). Maksimal: ${MAX_MB} MB.`)
      setState('error')
      return
    }

    setErrorMsg('')
    setFileName(file.name)

    // Try Stream first, fallback to legacy
    await uploadToStream(file)
  }, [token, uploadToStream])

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
    if (pollRef.current) clearInterval(pollRef.current)
    setState('idle')
    setCdnUrl('')
    setVideoId('')
    setProgress(0)
    setEncodeProgress(0)
    setErrorMsg('')
    setFileName('')
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">

        {/* ── DONE: show result + replace button ── */}
        {state === 'done' ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
          >
            <CheckCircleIcon className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                {fileName || 'Video yuklandi'}
              </p>
              <p className="text-[10px] text-emerald-500 dark:text-emerald-400 truncate">
                {videoId
                  ? `Bunny Stream · ${videoId.slice(0, 8)}...`
                  : cdnUrl}
              </p>
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

        ) : state === 'encoding' ? (

          /* ── ENCODING: transcoding progress ── */
          <motion.div
            key="encoding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                🎬 Adaptive streaming tayyorlanmoqda...
              </span>
              <span className="text-xs font-bold text-blue-600">{encodeProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${encodeProgress}%` }}
                transition={{ ease: 'linear', duration: 0.5 }}
              />
            </div>
            <p className="text-[10px] text-blue-500 dark:text-blue-400 text-center">
              240p → 1080p HLS transkoding. Sahifani yopishingiz mumkin.
            </p>
          </motion.div>

        ) : state === 'uploading' || state === 'creating' ? (

          /* ── UPLOADING: upload progress bar ── */
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  {state === 'creating' ? 'Tayyorlanmoqda...' : fileName}
                </span>
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
              Bunny Stream ga yuklanmoqda...
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
            {state === 'error'
              ? <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
              : <FilmIcon className="w-8 h-8 text-slate-500" />}
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {isDragging ? 'Tashlang!' : 'Video yuklash'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                mp4 · webm · mov · mkv — maks. {MAX_MB > 999 ? `${(MAX_MB / 1024).toFixed(0)} GB` : `${MAX_MB} MB`}
              </p>
              <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
                ⚡ Bunny Stream — adaptive HLS streaming
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
        <p className="text-[11px] text-red-600 dark:text-red-400 px-1 inline-flex items-center gap-1.5">
          <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {errorMsg}
        </p>
      )}
    </div>
  )
}

export default VideoUploadWidget
