/**
 * PostCard — redesigned professional post card.
 *
 * Changes from v1:
 *   • ⭐ "Foydali" replaces ❤️ (professional framing)
 *   • 📌 Save/Bookmark toggle
 *   • Author headline shown under name
 *   • Author name links to /profile/:username
 *   • Action bar order: 💬 | 🔄 | ⭐ | 👁 | 📌
 *   • New post types: course_announcement | achievement | poll
 *   • Full dark theme (#13141a / #1c1d27) matching design system
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  Star, MessageCircle, Trash2, Pencil, MoreHorizontal,
  Loader2, X, Check, Repeat2, Eye, Bookmark, CheckCircle2,
  Award, BadgeCheck, Share2,
  Heart, CornerDownRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getLevelTitle, getLevelEmoji } from '../../utils/levelTitles'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { UserIdentityUser } from './UserIdentity'
import DeleteConfirmModal from './DeleteConfirmModal'
import { linkify } from '../../utils/linkify'
import api from '../../services/apiService'

import { markViewed } from '../../utils/viewBuffer'
import { useGuestGuard } from '../../hooks/useGuestGuard'

// ── Module-level view tracker ─────────────────────────────────────────────────
const _viewedPostIds = new Set<number>()

// ── Number formatter ──────────────────────────────────────────────────────────
function fmtCount(n: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'hozirgina'
  if (mins < 60) return `${mins} daq`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs} soat`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days} kun`
  return new Date(dateStr).toLocaleDateString('uz-UZ')
}

// ── Extended PostData type ────────────────────────────────────────────────────

export interface PostData {
  id: number
  author: UserIdentityUser & { headline?: string | null; account_type?: string; is_verified?: boolean }
  content: string
  image_url?: string | null
  // New post types (migration 047)
  post_type?: 'text' | 'course_announcement' | 'achievement' | 'poll'
  post_metadata?: {
    // course_announcement
    course_id?: number
    course_title?: string
    course_thumbnail?: string
    lessons_count?: number
    price?: number
    // achievement
    achievement_type?: 'level_up' | 'certificate'
    level?: number
    level_name?: string
    course_title_cert?: string
    score?: number
    // poll
    question?: string
    options?: { text: string; votes_count: number }[]
    total_votes?: number
    user_voted_option_idx?: number
    images?: string[]
  } | null
  likes_count: number
  comments_count: number
  views_count?: number
  reposts_count?: number
  shares_count?: number
  saves_count?: number
  base_views_added?: number
  is_liked: boolean
  is_reposted?: boolean
  is_saved?: boolean
  created_at: string
  repost_by?: UserIdentityUser | null
}

interface Comment {
  id: number
  author: UserIdentityUser
  content: string
  created_at: string
  parent_id:   number | null
  likes_count: number
  is_liked:    boolean
}

interface Thread {
  comment: Comment
  replies: Comment[]
}

interface ReplyingTo {
  id:         number
  authorName: string
  username:   string | null
}

function buildThreads(list: Comment[]): Thread[] {
  const top: Comment[] = []
  const map = new Map<number, Comment[]>()
  for (const c of list) {
    if (c.parent_id) {
      const bucket = map.get(c.parent_id) ?? []
      bucket.push(c)
      map.set(c.parent_id, bucket)
    } else {
      top.push(c)
    }
  }
  return top.map(c => ({ comment: c, replies: map.get(c.id) ?? [] }))
}

interface Props {
  post: PostData
  currentUserId?: number
  onLike: (postId: number) => Promise<void>
  onUnlike: (postId: number) => Promise<void>
  onDelete?: (postId: number) => Promise<void>
  onEdit?: (postId: number, content: string) => Promise<void>
  onUnsave?: (postId: number) => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// Post type sub-renderers
// ═══════════════════════════════════════════════════════════════════════════════

const CourseAnnouncementCard: React.FC<{ meta: NonNullable<PostData['post_metadata']> }> = ({ meta }) => {
  const navigate = useNavigate()
  return (
    <div className="rounded-xl border border-[#e8792f]/20 bg-[#e8792f]/5 overflow-hidden mt-3">
      {meta.course_thumbnail && (
        <img src={meta.course_thumbnail} alt={meta.course_title} className="w-full h-36 object-cover" />
      )}
      <div className="p-3">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{meta.course_title}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
          {meta.lessons_count && <span>📹 {meta.lessons_count} ta dars</span>}
          {meta.price != null && (
            <span className={meta.price === 0 ? 'text-emerald-400' : 'text-[#e8792f]'}>
              {meta.price === 0 ? 'Bepul' : `${meta.price.toLocaleString()} so'm`}
            </span>
          )}
        </div>
        <button
          onClick={() => meta.course_id && navigate(`/courses/${meta.course_id}`)}
          className="mt-2.5 w-full py-2 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-semibold transition-colors"
        >
          Kursga yozilish →
        </button>
      </div>
    </div>
  )
}

const AchievementCard: React.FC<{ meta: NonNullable<PostData['post_metadata']> }> = ({ meta }) => {
  const isLevel = meta.achievement_type === 'level_up'
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 mt-3 flex items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
        {isLevel
          ? <span className="text-2xl">⬆️</span>
          : <Award className="w-7 h-7 text-amber-400" />
        }
      </div>
      <div>
        {isLevel ? (
          <>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{getLevelEmoji(meta.level ?? 1)} Daraja {meta.level} — {getLevelTitle(meta.level ?? 1)}</p>
            <p className="text-xs text-white/40 mt-0.5">Yangi darajaga ko'tarildi!</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{meta.course_title_cert}</p>
            <p className="text-xs text-white/40 mt-0.5">
              Sertifikat oldi{meta.score != null ? ` · ${meta.score}%` : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const PollCard: React.FC<{
  meta: NonNullable<PostData['post_metadata']>
  postId: number
  onVoted: (newMeta: any) => void
  onVoteGuard: (fn: (idx: number) => void) => (idx: number) => void
}> = ({ meta, postId, onVoted, onVoteGuard }) => {
  const [voting, setVoting] = useState<number | null>(null)
  const voted = meta.user_voted_option_idx != null
  const total = meta.total_votes || 0

  const handleVote = onVoteGuard(async (idx: number) => {
    if (voted) return
    setVoting(idx)
    try {
      const r = await api.client.post(`/api/v1/social/posts/${postId}/vote`, null, { params: { option_idx: idx } })
      onVoted(r.data)
    } catch {}
    setVoting(null)
  })

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      {meta.question && (
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{meta.question}</p>
      )}
      <div className="space-y-2">
        {(meta.options || []).map((opt, idx) => {
          const pct = total > 0 ? Math.round((opt.votes_count / total) * 100) : 0
          const isMyVote = meta.user_voted_option_idx === idx
          return (
            <button
              key={idx}
              onClick={() => handleVote(idx)}
              disabled={voted || voting != null}
              className={`relative w-full text-left rounded-xl overflow-hidden border transition-all ${
                isMyVote
                  ? 'border-[#e8792f]/40 bg-[#e8792f]/10'
                  : 'border-white/[0.08] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06]'
              } disabled:cursor-default`}
            >
              {voted && (
                <div
                  className={`absolute inset-y-0 left-0 ${isMyVote ? 'bg-[#e8792f]/20' : 'bg-white/[0.04]'} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.text}</span>
                <div className="flex items-center gap-2">
                  {voting === idx && <Loader2 className="w-3 h-3 animate-spin text-white/40" />}
                  {isMyVote && <CheckCircle2 className="w-3.5 h-3.5 text-[#e8792f]" />}
                  {voted && <span className="text-xs text-white/40 tabular-nums">{pct}%</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {voted && (
        <p className="text-[11px] text-white/30 text-center mt-2">{total.toLocaleString()} ta ovoz</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main PostCard
// ═══════════════════════════════════════════════════════════════════════════════

const PostCard: React.FC<Props> = ({ post, currentUserId, onLike, onUnlike, onDelete, onEdit, onUnsave }) => {
  const [liked,         setLiked]         = useState(post.is_liked)
  const [likesCount,    setLikesCount]    = useState(post.likes_count)
  const [commentsCount, setCommentsCount] = useState(post.comments_count)
  const [viewsCount,    setViewsCount]    = useState((post.views_count ?? 0) + (post.base_views_added ?? 0))
  const [repostsCount,  setRepostsCount]  = useState(post.reposts_count ?? 0)
  const [reposted,      setReposted]      = useState(post.is_reposted ?? false)
  const [saved,         setSaved]         = useState(post.is_saved ?? false)
  const [,              setSavesCount]    = useState(post.saves_count ?? 0)
  const [imgLoaded,     setImgLoaded]     = useState(false)
  const [showMenu,      setShowMenu]      = useState(false)
  const [showComments,  setShowComments]  = useState(false)
  const [comments,      setComments]      = useState<Comment[]>([])
  const [commentText,   setCommentText]   = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [sendingComment,  setSendingComment]  = useState(false)
  const [replyingTo,    setReplyingTo]    = useState<ReplyingTo | null>(null)
  const [expandedThreads, setExpandedThreads] = useState<Set<number>>(new Set())
  const [editing,   setEditing]   = useState(false)
  const [editText,  setEditText]  = useState(post.content)
  const [savingEdit, setSavingEdit] = useState(false)
  const [displayContent, setDisplayContent] = useState(post.content)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment'; id: number } | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [pollMeta, setPollMeta] = useState(post.post_metadata)

  const navigate    = useNavigate()
  const isOwner     = currentUserId === post.author.telegram_id
  const { withAuth, isAuthenticated } = useGuestGuard()
  const articleRef  = useRef<HTMLElement>(null)

  // ── View tracking ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_viewedPostIds.has(post.id)) return
    const el = articleRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!_viewedPostIds.has(post.id)) {
          timer = setTimeout(() => {
            if (_viewedPostIds.has(post.id)) return
            _viewedPostIds.add(post.id)
            setViewsCount(c => c + 1)
            markViewed(post.id)
          }, 500)
        }
      } else {
        if (timer) { clearTimeout(timer); timer = null }
      }
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => { observer.disconnect(); if (timer) clearTimeout(timer) }
  }, [post.id])

  // ── Repost ───────────────────────────────────────────────────────────────────
  const handleRepostToggle = async () => {
    if (reposted) {
      setReposted(false); setRepostsCount(c => Math.max(0, c - 1))
      try { await api.client.delete(`/api/v1/social/posts/${post.id}/repost`) }
      catch { setReposted(true); setRepostsCount(c => c + 1) }
    } else {
      setReposted(true); setRepostsCount(c => c + 1)
      try { await api.client.post(`/api/v1/social/posts/${post.id}/repost`) }
      catch { setReposted(false); setRepostsCount(c => Math.max(0, c - 1)) }
    }
  }

  // ── Like (now "Foydali") ─────────────────────────────────────────────────────
  const handleLikeToggle = async () => {
    if (liked) {
      setLiked(false); setLikesCount(c => c - 1)
      try { await onUnlike(post.id) } catch { setLiked(true); setLikesCount(c => c + 1) }
    } else {
      setLiked(true); setLikesCount(c => c + 1)
      try { await onLike(post.id) } catch { setLiked(false); setLikesCount(c => c - 1) }
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSaveToggle = async () => {
    if (saved) {
      setSaved(false); setSavesCount(c => Math.max(0, c - 1))
      try {
        await api.client.delete(`/api/v1/social/posts/${post.id}/save`)
        onUnsave?.(post.id)
      } catch { setSaved(true); setSavesCount(c => c + 1) }
    } else {
      setSaved(true); setSavesCount(c => c + 1)
      try { await api.client.post(`/api/v1/social/posts/${post.id}/save`) }
      catch { setSaved(false); setSavesCount(c => Math.max(0, c - 1)) }
    }
  }

  // ── Share ─────────────────────────────────────────────────────────────────────
  const [shareToast, setShareToast] = React.useState(false)
  const handleShare = async () => {
    const ogUrl = `${window.location.origin}/feed`
    const text  = (post.content || '').slice(0, 80)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'SAHIFALAB post', text, url: ogUrl })
      } else {
        await navigator.clipboard.writeText(ogUrl)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2000)
      }
    } catch { /* user cancelled */ }
  }

  // ── Comments ─────────────────────────────────────────────────────────────────
  const handleToggleComments = async () => {
    if (showComments) { setShowComments(false); return }
    setShowComments(true)
    if (comments.length === 0) {
      setLoadingComments(true)
      try {
        const res = await api.client.get(`/api/v1/social/posts/${post.id}/comments`)
        setComments(res.data?.comments || res.data || [])
      } catch {}
      setLoadingComments(false)
    }
  }

  const handleSendComment = withAuth(async () => {
    const text = commentText.trim()
    if (!text || sendingComment) return
    const mention   = replyingTo ? `@${replyingTo.username ?? replyingTo.authorName} ` : ''
    const content   = `${mention}${text}`
    const parentId  = replyingTo?.id ?? undefined
    setSendingComment(true)
    try {
      const res = await api.client.post(`/api/v1/social/posts/${post.id}/comments`, {
        content,
        ...(parentId ? { parent_id: parentId } : {}),
      })
      const newComment: Comment = {
        ...res.data,
        parent_id:   parentId ?? res.data.parent_id ?? null,
        likes_count: res.data.likes_count ?? 0,
        is_liked:    res.data.is_liked    ?? false,
      }
      setComments(prev => [...prev, newComment])
      setCommentsCount(c => c + 1)
      setCommentText('')
      setReplyingTo(null)
      if (parentId) {
        api.client.post(`/api/v1/social/comments/${parentId}/reply-notify`).catch(() => {})
      }
    } catch {}
    setSendingComment(false)
  })

  const handleLikeComment = async (id: number) => {
    setComments(prev => prev.map(c => {
      if (c.id !== id) return c
      const liked = !c.is_liked
      const req = liked
        ? api.client.post(`/api/v1/social/comments/${id}/like`)
        : api.client.delete(`/api/v1/social/comments/${id}/like`)
      req.catch(() => {})
      return { ...c, is_liked: liked, likes_count: liked ? c.likes_count + 1 : Math.max(0, c.likes_count - 1) }
    }))
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    const text = editText.trim()
    if (!text || savingEdit) return
    setSavingEdit(true)
    try {
      await onEdit?.(post.id, text)
      setDisplayContent(text)
      setEditing(false)
    } catch {}
    setSavingEdit(false)
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'post') {
        await onDelete?.(deleteTarget.id)
      } else {
        await api.client.delete(`/api/v1/social/comments/${deleteTarget.id}`)
        setComments(prev => {
          const removed = prev.filter(
            c => c.id === deleteTarget.id || c.parent_id === deleteTarget.id
          )
          setCommentsCount(c => Math.max(0, c - removed.length))
          return prev.filter(
            c => c.id !== deleteTarget.id && c.parent_id !== deleteTarget.id
          )
        })
      }
    } catch {}
    setDeleting(false)
    setDeleteTarget(null)
  }

  const postType = post.post_type || 'text'

  return (
    <>
      <article
        ref={articleRef}
        className="rounded-2xl bg-[#1c1d27] border border-white/[0.06] p-4 hover:border-white/[0.10] transition-colors"
      >
        {/* Repost banner */}
        {post.repost_by && (
          <button
            onClick={() => navigate(`/profile/${post.repost_by!.username || post.repost_by!.telegram_id}`)}
            className="flex items-center gap-1.5 mb-3 text-[11px] font-medium text-emerald-400/70 hover:text-emerald-400 transition-colors max-w-full"
          >
            <Repeat2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[160px]">{post.repost_by.full_name || post.repost_by.username}</span>
            <span className="flex-shrink-0">repost qildi</span>
          </button>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Avatar */}
            <button
              onClick={() => navigate(`/profile/${post.author.username || post.author.telegram_id}`)}
              className="flex-shrink-0"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#24253a]">
                {post.author.photo_url
                  ? <img src={post.author.photo_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                      <span className="text-white text-xs font-bold">
                        {(post.author.full_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                }
              </div>
            </button>

            {/* Name + headline */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  onClick={() => navigate(`/profile/${post.author.username || post.author.telegram_id}`)}
                  className="text-sm font-bold hover:text-[#e8792f] transition-colors leading-tight truncate max-w-[180px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {post.author.full_name || post.author.username}
                </button>
                {post.author.is_verified && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#e8792f] flex-shrink-0" />
                )}
                {(() => {
                  const isAdmin   = post.author.account_type === 'admin'   || post.author.role === 'admin'
                  const isTeacher = post.author.account_type === 'teacher' || post.author.role === 'teacher'
                  if (isAdmin)   return <BadgeCheck className="w-3.5 h-3.5 text-[#e8792f] flex-shrink-0" aria-label="Admin" />
                  if (isTeacher) return <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-label="O'qituvchi" />
                  return null
                })()}
              </div>
              {post.author.headline ? (
                <p className="text-[11px] text-white/40 truncate leading-tight mt-0.5">{post.author.headline}</p>
              ) : (
                <p className="text-[11px] text-white/30 leading-tight mt-0.5">
                  Lv.{post.author.level || 1}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span className="text-[11px] text-white/30">{timeAgo(post.created_at)}</span>
            {isOwner && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-7 z-20 w-36 rounded-xl border border-white/[0.08] bg-[#1c1d27] shadow-2xl py-1">
                    <button
                      onClick={() => { setEditText(displayContent); setEditing(true); setShowMenu(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Tahrirlash
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setDeleteTarget({ type: 'post', id: post.id }) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
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
        {(displayContent || post.content) && !editing && (
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed mb-3">
            {linkify(displayContent)}
          </p>
        )}

        {editing && (
          <div className="mb-3">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-[#e8792f]/30 text-sm focus:outline-none focus:border-[#e8792f]/50 resize-none transition-colors"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => { setEditing(false); setEditText(displayContent) }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-3 h-3" /> Bekor
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editText.trim() || savingEdit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#e8792f] hover:bg-[#c44a1a] disabled:opacity-40 transition-colors"
              >
                {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Saqlash
              </button>
            </div>
          </div>
        )}

        {/* Image(s) */}
        {(() => {
          const multiImages = post.post_metadata?.images
          if (multiImages && multiImages.length > 1) {
            return (
              <div className={`grid gap-1.5 mb-3 ${multiImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {multiImages.map((src, i) => (
                  <div key={i} className="rounded-xl overflow-hidden bg-[#24253a] aspect-square">
                    <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            )
          }
          if (post.image_url) {
            return (
              <div className="relative rounded-xl overflow-hidden mb-3 bg-[#24253a]">
                {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
                <img
                  src={post.image_url}
                  alt=""
                  className={`w-full max-h-[500px] object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                  loading="lazy"
                  onLoad={() => setImgLoaded(true)}
                />
              </div>
            )
          }
          return null
        })()}

        {/* Post-type specific cards */}
        {postType === 'course_announcement' && pollMeta && (
          <CourseAnnouncementCard meta={pollMeta} />
        )}
        {postType === 'achievement' && pollMeta && (
          <AchievementCard meta={pollMeta} />
        )}
        {postType === 'poll' && pollMeta && (
          <PollCard meta={pollMeta} postId={post.id} onVoted={setPollMeta} onVoteGuard={withAuth} />
        )}

        {/* Action bar: 💬 | 🔄 | ⭐ | 👁 | 📌 */}
        <div className="flex items-center gap-4 pt-3 mt-1 border-t border-white/[0.04]">
          {/* Comments */}
          <button
            onClick={handleToggleComments}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              showComments ? 'text-blue-400' : 'text-white/30 hover:text-blue-400'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs tabular-nums">{fmtCount(commentsCount)}</span>
          </button>

          {/* Repost */}
          <motion.button
            onClick={withAuth(handleRepostToggle)}
            whileTap={{ scale: 0.82 }}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              reposted ? 'text-emerald-400' : 'text-white/30 hover:text-emerald-400'
            }`}
          >
            <motion.div
              key={String(reposted)}
              initial={{ rotate: reposted ? -30 : 0, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            >
              <Repeat2 className="w-4 h-4" />
            </motion.div>
            <span className="text-xs tabular-nums">{fmtCount(repostsCount)}</span>
          </motion.button>

          {/* Foydali (⭐ replaces ❤️) */}
          <motion.button
            onClick={withAuth(handleLikeToggle)}
            whileTap={{ scale: 0.82 }}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              liked ? 'text-amber-400' : 'text-white/30 hover:text-amber-400'
            }`}
          >
            <motion.div
              key={String(liked)}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            >
              <Star className={`w-4 h-4 ${liked ? 'fill-amber-400' : ''}`} />
            </motion.div>
            <span className="text-xs tabular-nums">{fmtCount(likesCount)}</span>
          </motion.button>

          {/* Views */}
          {(viewsCount > 0) && (
            <span className="flex items-center gap-1 text-xs text-white/20 tabular-nums">
              <Eye className="w-3.5 h-3.5" /> {fmtCount(viewsCount)}
            </span>
          )}

          {/* Share */}
          <button
            onClick={handleShare}
            className={`flex items-center gap-1 text-sm transition-colors ml-auto ${
              shareToast ? 'text-sky-400' : 'text-white/30 hover:text-sky-400'
            }`}
          >
            <Share2 className="w-4 h-4" />
            {shareToast && <span className="text-[10px]">Nusxalandi</span>}
          </button>

          {/* Save (📌 Bookmark) */}
          <motion.button
            onClick={withAuth(handleSaveToggle)}
            whileTap={{ scale: 0.82 }}
            className={`flex items-center gap-1 text-sm transition-colors ml-${viewsCount > 0 ? '0' : 'auto'} ${
              saved ? 'text-[#e8792f]' : 'text-white/30 hover:text-[#e8792f]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? 'fill-[#e8792f]' : ''}`} />
          </motion.button>
        </div>

        {/* Comments section — YouTube-style threading */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-white/[0.04] space-y-0">
                {loadingComments ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-white/30" />
                  </div>
                ) : (
                  buildThreads(comments).map(({ comment, replies }) => {
                    const isExpanded  = expandedThreads.has(comment.id)
                    const isOwn       = currentUserId === comment.author.telegram_id
                    const authorName  = comment.author.full_name || comment.author.username || 'Foydalanuvchi'

                    return (
                      <div key={comment.id} className="flex gap-2 py-2">

                        {/* Left col: avatar + thread line */}
                        <div className="flex flex-col items-center w-8 flex-shrink-0">
                          <button
                            onClick={() => navigate(`/profile/${comment.author.username || comment.author.telegram_id}`)}
                            className="flex-shrink-0"
                          >
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#24253a] flex-shrink-0">
                              {comment.author.photo_url
                                ? <img src={comment.author.photo_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                                    <span className="text-white text-[10px] font-bold">{authorName.charAt(0).toUpperCase()}</span>
                                  </div>
                              }
                            </div>
                          </button>
                          {isExpanded && replies.length > 0 && (
                            <div className="flex-1 w-0.5 bg-white/[0.08] mt-1 rounded-full min-h-2" />
                          )}
                        </div>

                        {/* Right col: content + inline replies */}
                        <div className="flex-1 min-w-0">

                          {/* Parent comment */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <button
                              onClick={() => navigate(`/profile/${comment.author.username || comment.author.telegram_id}`)}
                              className="text-xs font-semibold hover:text-[#e8792f] transition-colors truncate max-w-[140px]"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {authorName}
                            </button>
                            <span className="text-[10px] text-white/25">
                              {timeAgo(comment.created_at)}
                            </span>
                            {isOwn && (
                              <button
                                onClick={() => setDeleteTarget({ type: 'comment', id: comment.id })}
                                className="ml-auto p-0.5 text-white/20 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-white/70 leading-relaxed">{linkify(comment.content)}</p>

                          {/* Actions */}
                          <div className="flex items-center gap-4 mt-1.5">
                            <button
                              onClick={() => handleLikeComment(comment.id)}
                              className={`flex items-center gap-1 text-[11px] transition-colors ${comment.is_liked ? 'text-red-400' : 'text-white/30 hover:text-red-400'}`}
                            >
                              <Heart className={`w-3 h-3 ${comment.is_liked ? 'fill-red-400' : ''}`} />
                              {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
                            </button>
                            <button
                              onClick={() => setReplyingTo({ id: comment.id, authorName, username: comment.author.username ?? null })}
                              className="flex items-center gap-1 text-[11px] text-white/30 hover:text-[#e8792f] transition-colors"
                            >
                              <CornerDownRight className="w-3 h-3" />
                              Javob
                            </button>
                          </div>

                          {/* Toggle replies */}
                          {replies.length > 0 && (
                            <button
                              onClick={() => setExpandedThreads(prev => {
                                const next = new Set(prev)
                                next.has(comment.id) ? next.delete(comment.id) : next.add(comment.id)
                                return next
                              })}
                              className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-[#e8792f] hover:text-[#c44a1a] transition-colors"
                            >
                              {isExpanded
                                ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                : <><ChevronDown className="w-3 h-3" /> {replies.length} ta javob</>
                              }
                            </button>
                          )}

                          {/* Inline replies */}
                          {isExpanded && replies.map(reply => {
                            const replyAuthor = reply.author.full_name || reply.author.username || 'Foydalanuvchi'
                            const isReplyOwn  = currentUserId === reply.author.telegram_id
                            return (
                              <div key={reply.id} className="flex gap-2 mt-3">
                                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#24253a] flex-shrink-0">
                                  {reply.author.photo_url
                                    ? <img src={reply.author.photo_url} alt="" className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                                        <span className="text-white text-[9px] font-bold">{replyAuthor.charAt(0).toUpperCase()}</span>
                                      </div>
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <button
                                      onClick={() => navigate(`/profile/${reply.author.username || reply.author.telegram_id}`)}
                                      className="text-[11px] font-semibold hover:text-[#e8792f] transition-colors truncate max-w-[120px]"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {replyAuthor}
                                    </button>
                                    <span className="text-[10px] text-white/25">{timeAgo(reply.created_at)}</span>
                                    {isReplyOwn && (
                                      <button
                                        onClick={() => setDeleteTarget({ type: 'comment', id: reply.id })}
                                        className="ml-auto p-0.5 text-white/20 hover:text-red-400 transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-white/60 leading-relaxed">{linkify(reply.content)}</p>
                                  <div className="flex items-center gap-4 mt-1">
                                    <button
                                      onClick={() => handleLikeComment(reply.id)}
                                      className={`flex items-center gap-1 text-[10px] transition-colors ${reply.is_liked ? 'text-red-400' : 'text-white/30 hover:text-red-400'}`}
                                    >
                                      <Heart className={`w-2.5 h-2.5 ${reply.is_liked ? 'fill-red-400' : ''}`} />
                                      {reply.likes_count > 0 && <span>{reply.likes_count}</span>}
                                    </button>
                                    {/* Reply to reply targets the parent thread */}
                                    <button
                                      onClick={() => setReplyingTo({ id: comment.id, authorName: replyAuthor, username: reply.author.username ?? null })}
                                      className="flex items-center gap-1 text-[10px] text-white/30 hover:text-[#e8792f] transition-colors"
                                    >
                                      <CornerDownRight className="w-2.5 h-2.5" />
                                      Javob
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                )}

                {/* Reply context strip */}
                {replyingTo && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#e8792f]/10 border-l-2 border-[#e8792f] mx-0 mt-1">
                    <CornerDownRight className="w-3 h-3 text-[#e8792f] flex-shrink-0" />
                    <span className="text-[11px] text-[#e8792f] flex-1 flex items-center gap-0.5 min-w-0">
                      <span className="truncate max-w-[120px]">{replyingTo.authorName}</span>
                      <span className="flex-shrink-0">ga javob</span>
                    </span>
                    <button onClick={() => setReplyingTo(null)} className="text-white/30 hover:text-white/60 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Comment input */}
                {!isAuthenticated ? (
                  <button
                    onClick={withAuth(() => {})}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/30 text-left transition-colors hover:border-[#e8792f]/30 hover:text-white/50 mt-2"
                  >
                    Izoh yozish uchun kiring...
                  </button>
                ) : (
                  <div className="flex items-start gap-2 mt-2">
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment() } }}
                      placeholder={replyingTo ? `${replyingTo.authorName}ga javob...` : 'Izoh yozing...'}
                      className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.06] text-sm placeholder:text-white/25 focus:outline-none focus:border-[#e8792f]/30 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      autoFocus={!!replyingTo}
                    />
                    <button
                      onClick={handleSendComment}
                      disabled={!commentText.trim() || sendingComment}
                      className="px-3 py-2 rounded-xl bg-[#e8792f] hover:bg-[#c44a1a] text-white text-sm font-medium disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yuborish'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </article>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          open={true}
          description={deleteTarget.type === 'post' ? "Bu postni o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi." : "Bu izohni o'chirishni tasdiqlaysizmi?"}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </>
  )
}

export default PostCard
