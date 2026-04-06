/**
 * CreatePost — Post composer with text + single image.
 * Client-side compresses images to ≤1MB / 1200px before upload.
 */

import React, { useState, useRef } from 'react'
import { Image, X, Send, Loader2 } from 'lucide-react'
import { compressImage } from '../../utils/imageCompressor'
import UserIdentity from './UserIdentity'
import type { UserIdentityUser } from './UserIdentity'

interface Props {
  user: UserIdentityUser
  onSubmit: (content: string, imageUrl?: string) => Promise<void>
  uploadImage: (file: Blob) => Promise<string>
}

const CreatePost: React.FC<Props> = ({ user, onSubmit, uploadImage }) => {
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [posting, setPosting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canPost = (content.trim() || imageBlob) && !posting

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    setCompressing(true)
    try {
      const result = await compressImage(file)
      setImageBlob(result.blob)
      setPreview(URL.createObjectURL(result.blob))
    } catch (err) {
      console.error('Compression failed:', err)
    }
    setCompressing(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeImage = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setImageBlob(null)
  }

  const handleSubmit = async () => {
    if (!canPost) return
    setPosting(true)
    try {
      let imageUrl: string | undefined
      if (imageBlob) {
        imageUrl = await uploadImage(imageBlob)
      }
      await onSubmit(content.trim(), imageUrl)
      setContent('')
      removeImage()
    } catch (err) {
      console.error('Post failed:', err)
    }
    setPosting(false)
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] backdrop-blur-md p-4">
      <div className="flex gap-3">
        <UserIdentity user={user} size="sm" showName={false} />

        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Fikringizni ulashing..."
            rows={2}
            maxLength={2000}
            className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/30 resize-none outline-none leading-relaxed"
          />

          {/* Image preview */}
          {preview && (
            <div className="relative mt-2 rounded-xl overflow-hidden max-h-60 bg-pitch-700">
              <img src={preview} alt="" className="w-full max-h-60 object-cover" />
              <button
                onClick={removeImage}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {compressing && (
            <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
              <Loader2 className="w-3 h-3 animate-spin" /> Rasm siqilmoqda...
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.04]">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!!imageBlob || compressing}
              className="p-2 rounded-lg text-white/40 hover:text-sahifa-400 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
            >
              <Image className="w-5 h-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />

            <button
              onClick={handleSubmit}
              disabled={!canPost}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold text-white bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {posting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreatePost
