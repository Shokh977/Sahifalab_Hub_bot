/**
 * SocialFeed — The main social feed page.
 *
 * Two tabs: "Feed" (followed users) and "Explore" (all posts).
 * Bento-grid inspired layout with glassmorphism cards.
 * Dark mode primary (#1C1C22 bg), Sahifalab Orange accents.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Users, Loader2, RefreshCw, ArrowUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProgressStore } from '../context/progressStore'
import api from '../services/apiService'
import PostCard from '../components/social/PostCard'
import CreatePost from '../components/social/CreatePost'
import type { PostData } from '../components/social/PostCard'

type Tab = 'feed' | 'explore'

const SocialFeed: React.FC = () => {
  const { user } = useAuth()
  const { level: storeLevel, totalXP, isInitialized } = useProgressStore()
  const [tab, setTab] = useState<Tab>('feed')
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const telegramId = (user as any)?.telegram_id || (user as any)?.id

  // Show scroll-to-top after 300px scroll
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const fetchPosts = useCallback(async (pg = 1, reset = false) => {
    try {
      const endpoint = tab === 'feed' ? '/api/v1/social/posts/feed' : '/api/v1/social/posts/explore'
      const res = await api.client.get(endpoint, { params: { page: pg, page_size: 20 } })
      const data = res.data
      const fetched = data.posts || []
      setPosts(prev => reset ? fetched : [...prev, ...fetched])
      setHasMore(fetched.length >= 20)
      setPage(pg)
      // Trigger one organic-growth tick once per browser session
      if (reset && pg === 1 && !sessionStorage.getItem('sahifa_growth_ticked')) {
        sessionStorage.setItem('sahifa_growth_ticked', '1')
        api.client.post('/api/v1/social/simulate-growth').catch(() => {})
      }
    } catch (err) {
      console.error('Feed fetch error:', err)
    }
    setLoading(false)
    setRefreshing(false)
  }, [tab])

  useEffect(() => {
    setLoading(true)
    setPosts([])
    fetchPosts(1, true)
  }, [tab, fetchPosts])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchPosts(1, true)
  }

  const handleLoadMore = () => {
    fetchPosts(page + 1)
  }

  const handleCreatePost = async (content: string, imageUrl?: string) => {
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
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-pitch/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Lenta</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-30"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 pb-2">
            <button
              onClick={() => setTab('feed')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                tab === 'feed'
                  ? 'bg-sahifa-500/15 text-sahifa-500 dark:text-sahifa-400'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Users className="w-4 h-4" /> Kuzatuv
            </button>
            <button
              onClick={() => setTab('explore')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                tab === 'explore'
                  ? 'bg-sahifa-500/15 text-sahifa-500 dark:text-sahifa-400'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Compass className="w-4 h-4" /> Kashfiyot
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Post composer — only for authenticated users */}
        {user && (
          <CreatePost
            user={identityUser}
            onSubmit={handleCreatePost}
            uploadImage={handleUploadImage}
          />
        )}

        {/* Posts — fade-in on tab switch */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-4"
          >
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-24 h-24 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-sahifa-500/10 to-sahifa-600/5 border border-sahifa-500/10 flex items-center justify-center">
                  {tab === 'feed' ? (
                    <Users className="w-10 h-10 text-sahifa-500/30" />
                  ) : (
                    <Compass className="w-10 h-10 text-sahifa-500/30" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-gray-500 dark:text-white/50 mb-1">
                  {tab === 'feed' ? "Lenta bo'sh" : "Hali postlar yo'q"}
                </h3>
                <p className="text-sm text-gray-400 dark:text-white/25 max-w-xs mx-auto leading-relaxed">
                  {tab === 'feed'
                    ? "Kashfiyot bo'limidan qiziqarli foydalanuvchilarni toping va kuzating!"
                    : "Birinchi bo'lib post yozing va jamiyatga ilhom ulashing!"}
                </p>
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
                    className="w-full py-3 rounded-xl text-sm text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 bg-white/50 dark:bg-white/[0.02] hover:bg-white/70 dark:hover:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.04] transition-colors"
                  >
                    Ko'proq yuklash
                  </button>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scroll-to-top FAB */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={scrollToTop}
            className="fixed bottom-24 right-5 z-40 p-3 rounded-full bg-sahifa-500 text-white shadow-glow hover:bg-sahifa-600 active:scale-90 transition-all dark:bg-sahifa-500 dark:hover:bg-sahifa-600"
            aria-label="Tepaga"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SocialFeed
