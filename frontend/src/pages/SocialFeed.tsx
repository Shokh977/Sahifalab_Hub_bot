/**
 * SocialFeed — 3-column feed page (/feed).
 *
 * Layout: left nav (WebLayout), center 680px, right sidebar 280px (xl+).
 * Tabs: Kuzatuv (follow-based, scored) | Kashfiyot (discover, scored).
 * Composer with rotating placeholders.
 * Right sidebar: suggested connections, recent jobs, popular courses.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Compass, Loader2, RefreshCw, ArrowUp,
  Image, Send, X, LogIn,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProgressStore } from '../context/progressStore'
import api from '../services/apiService'
import PostCard from '../components/social/PostCard'
import type { PostData } from '../components/social/PostCard'

type Tab = 'explore' | 'feed'

// ── Rotating composer prompts ────────────────────────────────────────────────

const PROMPTS = [
  'Bugun nimani o\'rgandingiz?',
  'Kasbiy maslahat ulashing…',
  'Qaysi kitob sizga ta\'sir qildi?',
  'Muvaffaqiyatingiz bilan ulashing!',
  'Jamiyatga savolingiz bormi?',
]

function useRotatingPrompt() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PROMPTS.length), 3500)
    return () => clearInterval(t)
  }, [])
  return PROMPTS[idx]
}

// ── Mini composer card ───────────────────────────────────────────────────────

interface ComposerProps {
  user: { photo_url?: string; full_name?: string; username?: string }
  onPost: (content: string, imageUrl?: string) => Promise<void>
  uploadImage: (blob: Blob) => Promise<string>
}

const Composer: React.FC<ComposerProps> = ({ user, onPost, uploadImage }) => {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const placeholder = useRotatingPrompt()

  const canPost = (content.trim() || imageBlob) && !posting

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    // simple preview without compression for now
    setImageBlob(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!canPost) return
    setPosting(true)
    try {
      let imageUrl: string | undefined
      if (imageBlob) {
        imageUrl = await uploadImage(imageBlob)
      }
      await onPost(content, imageUrl)
      setContent('')
      setPreview(null)
      setImageBlob(null)
      setOpen(false)
    } catch (err) {
      console.error('Post failed:', err)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-[#1c1d27] border border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-white/10 ring-2 ring-white/[0.06]">
          {user.photo_url ? (
            <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/60">
              {(user.full_name || 'U')[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Collapsed trigger */}
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-left px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-sm transition-colors"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={placeholder}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="text-white/35 block"
              >
                {placeholder}
              </motion.span>
            </AnimatePresence>
          </button>
        ) : null}

        {open && (
          <div className="flex-1">
            <textarea
              autoFocus
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="w-full bg-transparent text-sm text-white/90 placeholder-white/30 resize-none outline-none leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Expanded controls */}
      {open && (
        <div className="mt-3 space-y-3">
          {preview && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={preview} alt="" className="w-full max-h-48 object-cover rounded-xl" />
              <button
                onClick={() => { setPreview(null); setImageBlob(null) }}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <Image className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setOpen(false); setContent(''); setPreview(null); setImageBlob(null) }}
                className="px-3 py-1.5 rounded-lg text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
              >
                Bekor
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canPost}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#e8792f] text-white hover:bg-[#d4692a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Ulashish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main SocialFeed ──────────────────────────────────────────────────────────

const SocialFeed: React.FC = () => {
  const { user } = useAuth()
  const { level: storeLevel, totalXP, isInitialized } = useProgressStore()
  const [tab, setTab] = useState<Tab>('explore')
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const telegramId = (user as any)?.telegram_id || (user as any)?.id

  // Scroll-to-top button
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fetchPosts = useCallback(async (pageNum: number, reset = false) => {
    // Kuzatuv tab requires auth — skip API call for guests to avoid error toasts
    if (tab === 'feed' && !user) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      const endpoint = tab === 'feed'
        ? '/api/v1/social/posts/feed'
        : '/api/v1/social/posts/explore'
      const res = await api.client.get(endpoint, { params: { page: pageNum, page_size: 20 } })
      const fetched: PostData[] = res.data.posts || res.data || []
      setPosts(prev => reset ? fetched : [...prev, ...fetched])
      setHasMore(fetched.length === 20)
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [tab, user])

  useEffect(() => {
    setLoading(true)
    setPosts([])
    setPage(1)
    setHasMore(false)
    fetchPosts(1, true)
  }, [tab, fetchPosts])

  const handleRefresh = () => {
    setRefreshing(true)
    setPage(1)
    fetchPosts(1, true)
  }

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPosts(next)
  }

  // Post creation
  const handlePost = async (content: string, imageUrl?: string) => {
    const res = await api.client.post('/api/v1/social/posts', { content, image_url: imageUrl })
    setPosts(prev => [res.data, ...prev])
  }

  const handleUploadImage = async (blob: Blob): Promise<string> => {
    const formData = new FormData()
    formData.append('file', blob, 'post.webp')
    formData.append('category', 'posts')
    const res = await api.client.post('/api/v1/upload/file', formData)
    return res.data.url
  }

  // Interaction handlers
  const handleLike = async (postId: number) => {
    await api.client.post(`/api/v1/social/posts/${postId}/like`)
  }
  const handleUnlike = async (postId: number) => {
    await api.client.delete(`/api/v1/social/posts/${postId}/like`)
  }
  const handleDelete = async (postId: number) => {
    await api.client.delete(`/api/v1/social/posts/${postId}`)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }
  const handleEdit = async (postId: number, content: string) => {
    await api.client.patch(`/api/v1/social/posts/${postId}`, { content })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }
  const identityUser = {
    telegram_id: telegramId,
    full_name: (user as any)?.full_name || (user as any)?.first_name || (user as any)?.name,
    username: (user as any)?.username,
    photo_url: (user as any)?.photo_url,
    role: (user as any)?.role || 'student',
    level: isInitialized ? storeLevel : ((user as any)?.level || 1),
    xp: isInitialized ? totalXP : ((user as any)?.xp || (user as any)?.total_xp || 0),
  }

  return (
    <>
            {/* Tab switcher + refresh */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 p-1 bg-[#1c1d27] rounded-xl border border-white/[0.06]">
                <button
                  onClick={() => setTab('feed')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === 'feed'
                      ? 'bg-[#e8792f] text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Kuzatuv
                </button>
                <button
                  onClick={() => setTab('explore')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === 'explore'
                      ? 'bg-[#e8792f] text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  Kashfiyot
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                title="Yangilash"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Composer */}
            {user && (
              <div className="mb-4">
                <Composer
                  user={identityUser}
                  onPost={handlePost}
                  uploadImage={handleUploadImage}
                />
              </div>
            )}

            {/* Posts */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-4"
              >
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-white/20" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1c1d27] border border-white/[0.06] flex items-center justify-center">
                      {tab === 'feed'
                        ? <Users className="w-9 h-9 text-white/15" />
                        : <Compass className="w-9 h-9 text-white/15" />
                      }
                    </div>
                    {tab === 'feed' && !user ? (
                      <>
                        <h3 className="text-sm font-semibold text-white/40 mb-1">Kirish talab qilinadi</h3>
                        <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed mb-4">
                          Kuzatuv lentasini ko'rish uchun tizimga kiring
                        </p>
                        <Link
                          to="/login"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e8792f] text-white text-sm font-medium hover:bg-[#d4692a] transition-colors"
                        >
                          <LogIn className="w-4 h-4" />
                          Kirish / Ro'yxatdan o'tish
                        </Link>
                      </>
                    ) : tab === 'feed' ? (
                      <>
                        <h3 className="text-sm font-semibold text-white/40 mb-1">Lenta bo'sh</h3>
                        <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed mb-4">
                          Hali hech kimni kuzatmayapsiz. Qiziqarli foydalanuvchilarni toping!
                        </p>
                        <button
                          onClick={() => setTab('explore')}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1c1d27] border border-white/[0.08] text-white/50 text-sm font-medium hover:text-white/70 hover:border-white/20 transition-colors"
                        >
                          <Compass className="w-4 h-4" />
                          Kashfiyot bo'limiga o'tish
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-sm font-semibold text-white/40 mb-1">Hali postlar yo'q</h3>
                        <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed">
                          Birinchi bo'lib post yozing va jamiyatga ilhom ulashing!
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {posts.map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        currentUserId={telegramId}
                        onLike={handleLike}
                        onUnlike={handleUnlike}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    ))}

                    {hasMore && (
                      <button
                        onClick={handleLoadMore}
                        className="w-full py-3 rounded-xl text-sm text-white/30 hover:text-white/50 bg-[#1c1d27] hover:bg-white/[0.04] border border-white/[0.06] transition-colors"
                      >
                        Ko'proq yuklash
                      </button>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

      {/* Scroll-to-top FAB */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-24 right-5 z-40 p-3 rounded-full bg-[#e8792f] text-white shadow-lg hover:bg-[#d4692a] active:scale-90 transition-all"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}

export default SocialFeed
