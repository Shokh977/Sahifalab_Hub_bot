/**
 * AboutSection — bio card with inline edit for the profile owner.
 */

import React, { useState } from 'react'
import { BookOpen, PenSquare, Loader2, Check, X } from 'lucide-react'
import api from '../../services/apiService'

interface AboutSectionProps {
  bio: string | null
  isOwnProfile: boolean
  onSaved: (bio: string) => void
}

const AboutSection: React.FC<AboutSectionProps> = ({ bio, isOwnProfile, onSaved }) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(bio ?? '')
  const [saving, setSaving]   = useState(false)

  if (!bio && !isOwnProfile) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.client.put('/api/profile/me', { bio: value.trim() })
      onSaved(value.trim())
      setEditing(false)
    } catch {
      // silent — surface via toast if the app has a global one wired up elsewhere
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-sahifa-500" /> Haqida
        </h2>
        {isOwnProfile && !editing && (
          <button
            onClick={() => { setValue(bio ?? ''); setEditing(true) }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <PenSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="O'zingiz haqida qisqacha yozing..."
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none bg-gray-50 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.08] text-gray-900 dark:text-white focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 dark:text-white/30">{value.length}/500</p>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Bekor qilish
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sahifa-500 text-white hover:bg-sahifa-600 transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Saqlash
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-white/60 leading-relaxed whitespace-pre-line">
          {bio || (isOwnProfile ? "O'zingiz haqida yozish uchun tahrirlash tugmasini bosing." : '')}
        </p>
      )}
    </div>
  )
}

export default AboutSection
