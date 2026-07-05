/**
 * CoverPhoto — LinkedIn-style banner used inside ProfileHeaderCard.
 * Bleeds to the parent card's edges (parent must cancel its own padding on top).
 * Shows a hover camera-upload overlay when `onUpload` is provided (owner only).
 */

import React, { useRef } from 'react'
import { Camera, Loader2, Image as ImageIcon } from 'lucide-react'

interface CoverPhotoProps {
  url?: string | null
  onUpload?: (file: File) => void
  uploading?: boolean
  className?: string
}

const CoverPhoto: React.FC<CoverPhotoProps> = ({ url, onUpload, uploading = false, className = '' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUpload) onUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      className={`relative h-36 sm:h-48 w-full overflow-hidden group/cover bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-slate-800 dark:to-slate-900 ${className}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-sahifa-300/60 dark:text-white/10" />
        </div>
      )}

      {onUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/35 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-all duration-200 cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 text-white text-xs font-medium">
                <Camera className="w-4 h-4" /> Muqova rasmini o'zgartirish
              </span>
            )}
          </button>
        </>
      )}
    </div>
  )
}

export default CoverPhoto
