/**
 * PostCard — Glassmorphism post card for the social feed.
 *
 * Shows author identity (rank ring + badge), content, optional image,
 * like/comment counts with optimistic updates.
 */

import React, { useState } from 'react'
import { Heart, MessageCircle, Trash2, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import UserIdentity from './UserIdentity'
import type { UserIdentityUser } from './UserIdentity'

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

interface Props {
  post: PostData
  currentUserId?: number
  onLike: (postId: number) => Promise<void>
  onUnlike: (postId: number) => Promise<void>
  onDelete?: (postId: number) => Promise<void>
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
  onComment,
}) => {
  const [liked, setLiked] = useState(post.is_liked)
  const [likesCount, setLikesCount] = useState(post.likes_count)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
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

  return (
    <article className="relative rounded-2xl border border-white/[0.06] bg-white/[0.04] backdrop-blur-md p-4 transition-all hover:bg-white/[0.06] hover:shadow-glass">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <UserIdentity
          user={post.author}
          size="sm"
          showRank
          onClick={() => navigate(`/profile/${post.author.telegram_id}`)}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">{timeAgo(post.created_at)}</span>
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-white/[0.08] bg-pitch-700/95 backdrop-blur-xl shadow-glass-lg py-1">
                  <button
                    onClick={() => { setShowMenu(false); onDelete?.(post.id) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> O'chirish
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed mb-3">
          {post.content}
        </p>
      )}

      {/* Image */}
      {post.image_url && (
        <div className="relative rounded-xl overflow-hidden mb-3 bg-pitch-700">
          {!imgLoaded && (
            <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
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
              : 'text-white/40 hover:text-sahifa-400'
          }`}
        >
          <Heart className={`w-[18px] h-[18px] ${liked ? 'fill-sahifa-500' : ''}`} />
          <span className="tabular-nums">{likesCount || ''}</span>
        </button>

        <button
          onClick={() => onComment?.(post.id)}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-blue-400 transition-colors active:scale-90"
        >
          <MessageCircle className="w-[18px] h-[18px]" />
          <span className="tabular-nums">{post.comments_count || ''}</span>
        </button>
      </div>
    </article>
  )
}

export default PostCard
