/**
 * UnifiedComment — Single reusable comment/review component for the entire platform.
 *
 * Master template extracted from PostCard comment UI.
 * Used in both social feed (post comments) and course page (reviews).
 *
 * Features:
 * - UserIdentity avatar with rank-colored border rings
 * - Verification badges (Blue for Teachers, Orange for Admins)
 * - Glassmorphism styling + Oxygen font
 * - Three-dot menu with Edit / Delete actions (owner only, reveals on hover)
 * - URLs auto-linked and styled in Sahifalab Orange
 * - Optional star rating display (for course reviews)
 * - Light / Dark mode support
 */

import React, { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, Star } from 'lucide-react'
import UserIdentity from './UserIdentity'
import type { UserIdentityUser } from './UserIdentity'
import { linkify } from '../../utils/linkify'

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'hozirgina'
  if (mins < 60) return `${mins} daq`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} soat`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} kun`
  return new Date(dateStr).toLocaleDateString('uz-UZ')
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedCommentData {
  id: number
  author: UserIdentityUser
  content: string
  created_at: string
  rating?: number // optional star rating (for course reviews)
}

interface Props {
  comment: UnifiedCommentData
  isOwner?: boolean
  /** Whether this comment's dropdown menu is currently visible */
  menuOpen?: boolean
  /** Toggle this comment's dropdown menu (parent tracks which one is open) */
  onToggleMenu?: () => void
  /** Called when user confirms an edit. Parent should do the API call and update data. */
  onEdit?: (id: number, newContent: string) => Promise<void>
  /** Called when user requests deletion (parent shows DeleteConfirmModal). */
  onRequestDelete?: (id: number) => void
  /** Navigate to user profile on avatar/name click */
  onAuthorClick?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

const UnifiedComment: React.FC<Props> = ({
  comment,
  isOwner = false,
  menuOpen = false,
  onToggleMenu,
  onEdit,
  onRequestDelete,
  onAuthorClick,
}) => {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [saving, setSaving] = useState(false)

  const handleStartEdit = () => {
    setEditText(comment.content)
    setEditing(true)
    onToggleMenu?.() // close menu
  }

  const handleSave = async () => {
    const text = editText.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await onEdit?.(comment.id, text)
      setEditing(false)
    } catch {
      /* stay in edit mode on error */
    }
    setSaving(false)
  }

  const handleCancel = () => {
    setEditing(false)
    setEditText(comment.content)
  }

  return (
    <div className="group flex gap-2">
      {/* Rank-ring avatar */}
      <UserIdentity
        user={comment.author}
        size="xs"
        showName={false}
        onClick={onAuthorClick}
      />

      <div className="flex-1 min-w-0">
        {/* Header: name · time · ⋯ menu */}
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-xs font-semibold text-gray-700 dark:text-white/70 truncate cursor-pointer hover:text-sahifa-500 dark:hover:text-sahifa-400 transition-colors"
            onClick={onAuthorClick}
          >
            {comment.author.full_name || comment.author.first_name || comment.author.username || 'Foydalanuvchi'}
          </span>

          <span className="text-[10px] text-gray-400 dark:text-white/25 flex-shrink-0">
            {timeAgo(comment.created_at)}
          </span>

          {isOwner && !editing && (
            <div className="relative ml-auto">
              <button
                onClick={onToggleMenu}
                className="p-0.5 rounded text-gray-300 dark:text-white/20 hover:text-gray-500 dark:hover:text-white/50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-5 z-20 w-32 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white/95 dark:bg-pitch-700/95 backdrop-blur-xl shadow-frost dark:shadow-glass-lg py-1">
                  <button
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Tahrirlash
                  </button>
                  <button
                    onClick={() => {
                      onToggleMenu?.()
                      onRequestDelete?.(comment.id)
                    }}
                    className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> O'chirish
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Star rating row (course reviews only) */}
        {comment.rating !== undefined && comment.rating > 0 && (
          <div className="flex gap-0.5 mt-0.5 mb-1">
            {[1, 2, 3, 4, 5].map(s => (
              <Star
                key={s}
                className={`w-3 h-3 ${
                  s <= comment.rating!
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-200 dark:text-white/10'
                }`}
              />
            ))}
          </div>
        )}

        {/* Content — edit mode or linkified text */}
        {editing ? (
          <div className="mt-1">
            <input
              type="text"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
              className="w-full px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-sahifa-500/30 text-xs text-gray-800 dark:text-white outline-none focus:border-sahifa-500/50 transition-colors"
              autoFocus
            />
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={handleCancel}
                className="text-[10px] text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50"
              >
                Bekor
              </button>
              <button
                onClick={handleSave}
                disabled={!editText.trim() || saving}
                className="text-[10px] text-sahifa-500 font-semibold hover:text-sahifa-600 disabled:opacity-40"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600 dark:text-white/60 leading-relaxed mt-0.5">
            {linkify(comment.content)}
          </p>
        )}
      </div>
    </div>
  )
}

export default UnifiedComment
