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
  Image, Send, X, LogIn, BarChart2, Plus, Trash2,
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
  onPost: (content: string, imageUrls?: string[], pollOptions?: string[]) => Promise<void>
  uploadImage: (blob: Blob) => Promise<string>
}

const MAX_IMAGES = 3

const Composer: React.FC<ComposerProps> = ({ user, onPost, uploadImage }) => {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [imageBlobs, setImageBlobs] = useState<Blob[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [pollMode, setPollMode] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const placeholder = useRotatingPrompt()

  const hasPoll = pollMode && pollOptions.filter(o => o.trim()).length >= 2
  const canPost = !posting && (content.trim() || imageBlobs.length > 0 || hasPoll)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (fileRef.current) fileRef.current.value = ''
    const remaining = MAX_IMAGES - imageBlobs.length
    const toAdd = files.slice(0, remaining).filter(f => f.type.startsWith('image/'))
    setImageBlobs(prev => [...prev, ...toAdd])
    setPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
  }

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(previews[idx])
    setImageBlobs(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const updatePollOption = (idx: number, val: string) => {
    setPollOptions(prev => prev.map((o, i) => i === idx ? val : o))
  }

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions(prev => [...prev, ''])
  }

  const removePollOption = (idx: number) => {
    if (pollOptions.length <= 2) return
    setPollOptions(prev => prev.filter((_, i) => i !== idx))
  }

  const togglePollMode = () => {
    if (!pollMode && imageBlobs.length > 0) return // can't mix
    setPollMode(v => !v)
    if (pollMode) setPollOptions(['', ''])
  }

  const reset = () => {
    previews.forEach(URL.revokeObjectURL)
    setContent(''); setImageBlobs([]); setPreviews([])
    setPollMode(false); setPollOptions(['', '']); setOpen(false)
  }

  const handleSubmit = async () => {
    if (!canPost) return
    setPosting(true)
    try {
      if (pollMode && hasPoll) {
        const opts = pollOptions.map(o => o.trim()).filter(Boolean)
        await onPost(content.trim(), undefined, opts)
      } else if (imageBlobs.length > 0) {
        const urls = await Promise.all(imageBlobs.map(b => uploadImage(b)))
        await onPost(content.trim(), urls)
      } else {
        await onPost(content.trim())
      }
      reset()
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
        ) : (
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
          {/* Image previews (up to 3) */}
          {previews.length > 0 && (
            <div className={`grid gap-2 ${previews.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {previews.map((src, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden">
                  <img src={src} alt="" className="w-full object-cover rounded-xl" style={{ maxHeight: previews.length === 1 ? 192 : 120 }} />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Poll builder */}
          {pollMode && (
            <div className="space-y-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-xs text-white/40 font-medium uppercase tracking-wide mb-2">So'rovnoma</p>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={e => updatePollOption(i, e.target.value)}
                    placeholder={`Variant ${i + 1}`}
                    maxLength={80}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white/90 placeholder-white/30 outline-none focus:border-[#e8792f]/50 transition-colors"
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => removePollOption(i)} className="p-1 text-white/30 hover:text-white/60 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button onClick={addPollOption} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors mt-1">
                  <Plus className="w-3.5 h-3.5" /> Variant qo'shish
                </button>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={pollMode || imageBlobs.length >= MAX_IMAGES}
                title={`Rasm (${imageBlobs.length}/${MAX_IMAGES})`}
                className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Image className="w-4 h-4" />
              </button>
              <button
                onClick={togglePollMode}
                disabled={imageBlobs.length > 0}
                title="So'rovnoma"
                className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${pollMode ? 'text-[#e8792f] bg-[#e8792f]/10' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'}`}
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={reset}
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
    // Kuzatuv (feed) requires auth — guests only see Kashfiyot (explore)
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
  const handlePost = async (content: string, imageUrls?: string[], pollOptions?: string[]) => {
    const body: Record<string, unknown> = { content }
    if (imageUrls && imageUrls.length > 0) {
      body.image_url = imageUrls[0]
      if (imageUrls.length > 1) body.image_urls = imageUrls
    }
    if (pollOptions && pollOptions.length >= 2) body.poll_options = pollOptions
    const res = await api.client.post('/api/v1/social/posts', body)
    setPosts(prev => [res.data, ...prev])
  }

  const handleUploadImage = async (blob: Blob): Promise<string> => {
    const formData = new FormData()
    formData.append('file', blob, 'post.webp')
    formData.append('category', 'posts')
    const res = await api.client.post('/api/upload/post-image', formData)
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
                {/* Kuzatuv tab — only for logged-in users */}
                {user && (
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
                )}
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
                      // Guest somehow on feed tab — shouldn't happen, just show explore prompt
                      <>
                        <h3 className="text-sm font-semibold text-white/40 mb-1">Kirish talab qilinadi</h3>
                        <Link to="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e8792f] text-white text-sm font-medium hover:bg-[#d4692a] transition-colors mt-3">
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
