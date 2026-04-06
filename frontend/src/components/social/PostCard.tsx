/**
 * PostCard — Glassmorphism post card for the social feed.
 *
 * Shows author identity (rank ring + badge), content, optional image,
 * like/comment counts with optimistic updates.
 */

import React, { useState } from 'react'
import { Heart, MessageCircle, Trash2, Pencil, MoreHorizontal, Send, Loader2, X, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import UserIdentity from './UserIdentity'
import type { UserIdentityUser } from './UserIdentity'
import DeleteConfirmModal from './DeleteConfirmModal'
import UnifiedComment from './UnifiedComment'
import { linkify } from '../../utils/linkify'
import api from '../../services/apiService'

export interface PostData {
  id: number
  author: UserIdentityUser
  content: string
  image_url?: string | null
  likes_count: number
  comments_count: number
  is_liked: boolean
  created_at: string
}

interface Comment {
  id: number
  author: UserIdentityUser
  content: string
  created_at: string
}

interface Props {
  post: PostData
  currentUserId?: number
  onLike: (postId: number) => Promise<void>
  onUnlike: (postId: number) => Promise<void>
  onDelete?: (postId: number) => Promise<void>
  onEdit?: (postId: number, content: string) => Promise<void>
  onComment?: (postId: number) => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'hozirgina'
  if (mins < 60) return `${mins} daq`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} soat`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} kun`
  return new Date(dateStr).toLocaleDateString('uz-UZ')
}

const PostCard: React.FC<Props> = ({
  post,
  currentUserId,
  onLike,
  onUnlike,
  onDelete,
  onEdit,
  onComment,
}) => {
  const [liked, setLiked] = useState(post.is_liked)
  const [likesCount, setLikesCount] = useState(post.likes_count)
  const [commentsCount, setCommentsCount] = useState(post.comments_count)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)

  // Post edit state
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.content)
  const [savingEdit, setSavingEdit] = useState(false)
  const [displayContent, setDisplayContent] = useState(post.content)

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment'; id: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Comment menu state (tracks which comment's ⋯ menu is open)
  const [showCommentMenu, setShowCommentMenu] = useState<number | null>(null)

  const navigate = useNavigate()
  const isOwner = currentUserId === post.author.telegram_id

  const handleLikeToggle = async () => {
    // Optimistic update
    if (liked) {
      setLiked(false)
      setLikesCount(c => c - 1)
      try { await onUnlike(post.id) } catch { setLiked(true); setLikesCount(c => c + 1) }
    } else {
      setLiked(true)
      setLikesCount(c => c + 1)
      try { await onLike(post.id) } catch { setLiked(false); setLikesCount(c => c - 1) }
    }
  }

  const handleToggleComments = async () => {
    if (showComments) {
      setShowComments(false)
      return
    }
    setShowComments(true)
    if (comments.length === 0) {
      setLoadingComments(true)
      try {
        const res = await api.client.get(`/api/v1/social/posts/${post.id}/comments`)
        setComments(res.data?.comments || res.data || [])
      } catch (err) {
        console.error('Failed to fetch comments:', err)
      }
      setLoadingComments(false)
    }
  }

  const handleSendComment = async () => {
    const text = commentText.trim()
    if (!text || sendingComment) return
    setSendingComment(true)
    try {
      const res = await api.client.post(`/api/v1/social/posts/${post.id}/comments`, { content: text })
      setComments(prev => [...prev, res.data])
      setCommentsCount(c => c + 1)
      setCommentText('')
    } catch (err) {
      console.error('Failed to send comment:', err)
    }
    setSendingComment(false)
  }

  // ── Post editing ────────────────────────────────────────────────────────
  const handleStartEdit = () => {
    setEditText(displayContent)
    setEditing(true)
    setShowMenu(false)
  }

  const handleSaveEdit = async () => {
    const text = editText.trim()
    if (!text || savingEdit) return
    setSavingEdit(true)
    try {
      await onEdit?.(post.id, text)
      setDisplayContent(text)
      setEditing(false)
    } catch (err) {
      console.error('Failed to edit post:', err)
    }
    setSavingEdit(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditText(displayContent)
  }

  // ── Delete confirm flow ─────────────────────────────────────────────────
  const handleRequestDelete = (type: 'post' | 'comment', id: number) => {
    setDeleteTarget({ type, id })
    setShowMenu(false)
    setShowCommentMenu(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'post') {
        await onDelete?.(deleteTarget.id)
      } else {
        await api.client.delete(`/api/v1/social/comments/${deleteTarget.id}`)
        setComments(prev => prev.filter(c => c.id !== deleteTarget.id))
        setCommentsCount(c => c - 1)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  // ── Comment editing (called from UnifiedComment) ────────────────────────
  const handleEditComment = async (commentId: number, newContent: string) => {
    await api.client.patch(`/api/v1/social/comments/${commentId}`, { content: newContent })
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent } : c))
  }

  return (
    <>
    <article className="relative rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.04] backdrop-blur-md p-4 transition-all shadow-frost dark:shadow-bento hover:shadow-frost-hover dark:hover:shadow-bento-hover hover:bg-white/80 dark:hover:bg-white/[0.06]">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <UserIdentity
          user={post.author}
          size="sm"
          showRank
          onClick={() => navigate(`/profile/${post.author.telegram_id}`)}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-white/40">{timeAgo(post.created_at)}</span>
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-lg text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/95 dark:bg-pitch-700/95 backdrop-blur-xl shadow-frost-lg dark:shadow-glass-lg py-1">
                  <button
                    onClick={handleStartEdit}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Tahrirlash
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); handleRequestDelete('post', post.id) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> O'chirish
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content — view or edit mode */}
      {post.content && !editing && (
        <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap leading-relaxed mb-3">
          {linkify(displayContent)}
        </p>
      )}

      {editing && (
        <div className="mb-3">
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-sahifa-500/30 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none resize-none focus:border-sahifa-500/50 transition-colors"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3 h-3" /> Bekor
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editText.trim() || savingEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-40 transition-colors active:scale-95"
            >
              {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Saqlash
            </button>
          </div>
        </div>
      )}

      {/* Image */}
      {post.image_url && (
        <div className="relative rounded-xl overflow-hidden mb-3 bg-gray-100 dark:bg-pitch-700">
          {!imgLoaded && (
            <div className="absolute inset-0 animate-pulse bg-gray-200/50 dark:bg-white/[0.04]" />
          )}
          <img
            src={post.image_url}
            alt=""
            className={`w-full max-h-[500px] object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-5 pt-1">
        <button
          onClick={handleLikeToggle}
          className={`flex items-center gap-1.5 text-sm transition-all active:scale-90 ${
            liked
              ? 'text-sahifa-500'
              : 'text-gray-400 dark:text-white/40 hover:text-sahifa-400'
          }`}
        >
          <Heart className={`w-[18px] h-[18px] ${liked ? 'fill-sahifa-500' : ''}`} />
          <span className="tabular-nums">{likesCount || ''}</span>
        </button>

        <button
          onClick={handleToggleComments}
          className={`flex items-center gap-1.5 text-sm transition-colors active:scale-90 ${
            showComments ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-white/40 hover:text-blue-500 dark:hover:text-blue-400'
          }`}
        >
          <MessageCircle className={`w-[18px] h-[18px] ${showComments ? 'fill-blue-400/20' : ''}`} />
          <span className="tabular-nums">{commentsCount || ''}</span>
        </button>
      </div>

      {/* Inline Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-white/[0.06]">
              {/* Comment input */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendComment() }}
                  placeholder="Izoh yozing..."
                  className="flex-1 px-3 py-2 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:border-sahifa-500/40 dark:focus:border-sahifa-500/30 transition-colors"
                />
                <button
                  onClick={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  className="p-2 rounded-xl bg-sahifa-500/10 text-sahifa-400 hover:bg-sahifa-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Comments list */}
              {loadingComments ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-white/20" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/20 text-center py-3">Hali izohlar yo'q</p>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {comments.map(comment => (
                    <UnifiedComment
                      key={comment.id}
                      comment={comment}
                      isOwner={currentUserId === comment.author.telegram_id}
                      menuOpen={showCommentMenu === comment.id}
                      onToggleMenu={() => setShowCommentMenu(showCommentMenu === comment.id ? null : comment.id)}
                      onEdit={handleEditComment}
                      onRequestDelete={id => handleRequestDelete('comment', id)}
                      onAuthorClick={() => navigate(`/profile/${comment.author.telegram_id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>

    {/* Delete confirm modal */}
    <DeleteConfirmModal
      open={!!deleteTarget}
      title={deleteTarget?.type === 'post' ? "Postni o'chirish" : "Izohni o'chirish"}
      description={deleteTarget?.type === 'post' ? "Bu post butunlay o'chiriladi. Ortga qaytarib bo'lmaydi." : "Bu izoh butunlay o'chiriladi."}
      loading={deleting}
      onConfirm={handleConfirmDelete}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  )
}

export default PostCard
