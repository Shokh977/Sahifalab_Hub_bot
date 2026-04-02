/**
 * FileUploadWidget — Drag-and-drop file uploader for images, PDFs, and documents.
 *
 * Calls POST /api/upload/file (multipart), shows a progress bar,
 * and fires onUploaded(url, originalName) when done.
 *
 * Props:
 *   accept         — MIME types to accept (e.g. 'image/*' or 'application/pdf')
 *   courseId?       — for Bunny.net path organisation
 *   folder?         — subfolder in Bunny.net (e.g. 'thumbnails', 'materials')
 *   onUploaded      — callback with CDN URL + original filename
 *   existingUrl?    — pre-fill (edit mode)
 *   existingName?   — existing file name for display
 *   disabled?       — locks the widget
 *   maxSizeMB?      — max file size in MB (default 50)
 *   label?          — custom label text
 *   hint?           — custom hint text
 *   variant?        — 'image' | 'document' (controls preview)
 */
import React, { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'

// Normalise base origin: strip any trailing /api so we can always prefix /api/ ourselves.
// This matches the convention used in apiService.ts (VITE_API_URL = origin only, no /api suffix).
const _apiOrigin = (
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://sahifalab-hub-bot-hsgt.vercel.app'
).replace(/\/api\/?$/, '').replace(/\/$/, '')

interface Props {
  accept?:       string
  courseId?:      number
  folder?:       string
  onUploaded:    (url: string, originalName: string) => void
  existingUrl?:  string
  existingName?: string
  disabled?:     boolean
  maxSizeMB?:    number
  label?:        string
  hint?:         string
  variant?:      'image' | 'document'
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

const fmtBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const FileUploadWidget: React.FC<Props> = ({
  accept = 'image/*,application/pdf',
  courseId,
  folder,
  onUploaded,
  existingUrl,
  existingName,
  disabled,
  maxSizeMB = 50,
  label,
  hint,
  variant = 'document',
}) => {
  const { token } = useAuth()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [state,      setState]      = useState<UploadState>(existingUrl ? 'done' : 'idle')
  const [progress,   setProgress]   = useState(0)
  const [cdnUrl,     setCdnUrl]     = useState(existingUrl ?? '')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [fileName,   setFileName]   = useState(existingName ?? '')
  const [isDragging, setIsDragging] = useState(false)

  const upload = useCallback(async (file: File) => {
    if (!token) { setErrorMsg('Tizimga kiring'); setState('error'); return }

    const mb = file.size / (1024 ** 2)
    if (mb > maxSizeMB) {
      setErrorMsg(`Fayl juda katta (${mb.toFixed(1)} MB). Maksimal: ${maxSizeMB} MB.`)
      setState('error')
      return
    }

    setState('uploading')
    setProgress(0)
    setErrorMsg('')
    setFileName(file.name)

    const formData = new FormData()
    formData.append('file', file)
    if (courseId) formData.append('course_id', String(courseId))
    if (folder) formData.append('folder', folder)

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${_apiOrigin}/api/upload/file`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            setCdnUrl(data.url)
            setState('done')
            onUploaded(data.url, data.original_name || file.name)
            resolve()
          } catch {
            setErrorMsg('Server javobi noto\'g\'ri')
            setState('error')
            reject()
          }
        } else {
          let detail = 'Yuklashda xatolik'
          try { detail = JSON.parse(xhr.responseText).detail || detail } catch {}
          setErrorMsg(detail)
          setState('error')
          reject()
        }
      }

      xhr.onerror = () => {
        setErrorMsg('Tarmoq xatosi')
        setState('error')
        reject()
      }

      xhr.send(formData)
    }).catch(() => {})
  }, [token, courseId, folder, maxSizeMB, onUploaded])

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || disabled) return
    upload(files[0])
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!disabled) setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }

  const reset = () => {
    setState('idle')
    setProgress(0)
    setCdnUrl('')
    setFileName('')
    setErrorMsg('')
    onUploaded('', '')
  }

  const isImage = variant === 'image'

  // ── Done state with preview ──────────────────────────────────────────────
  if (state === 'done' && cdnUrl) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isImage && cdnUrl && (
          <div className="relative aspect-[16/9] bg-slate-100 dark:bg-slate-800">
            <img src={cdnUrl} alt={fileName} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        )}
        <div className="flex items-center gap-3 p-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isImage ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
            {isImage ? <PhotoIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{fileName || 'Yuklangan fayl'}</p>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              <span>Yuklandi</span>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={reset}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-red-300 hover:text-red-500 dark:border-slate-700 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all
          ${isDragging
            ? 'border-[#F26722] bg-[#F26722]/5 dark:bg-[#F26722]/10'
            : 'border-slate-200 bg-slate-50/80 hover:border-[#F26722]/40 hover:bg-[#F26722]/5 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-[#F26722]/40'
          }
          ${disabled ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
          disabled={disabled}
        />

        <AnimatePresence mode="wait">
          {state === 'uploading' ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-3"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F26722]/10">
                <ArrowUpTrayIcon className="h-6 w-6 animate-bounce text-[#F26722]" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Yuklanmoqda…</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{fileName}</p>
              </div>
              <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#F26722] to-[#FFB347]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs font-semibold text-[#F26722]">{progress}%</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                {isImage ? (
                  <PhotoIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                ) : (
                  <ArrowUpTrayIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {label || (isImage ? 'Rasm yuklash' : 'Fayl yuklash')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {hint || `Drag & drop yoki bosing · Max ${maxSizeMB} MB`}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {state === 'error' && errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"
        >
          <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button type="button" onClick={() => { setErrorMsg(''); setState('idle') }}>
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </div>
  )
}

export default FileUploadWidget
