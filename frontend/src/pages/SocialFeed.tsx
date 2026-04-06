/**
 * SocialFeed — The main social feed page.
 *
 * Two tabs: "Feed" (followed users) and "Explore" (all posts).
 * Bento-grid inspired layout with glassmorphism cards.
 * Dark mode primary (#1C1C22 bg), Sahifalab Orange accents.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Users, Loader2, RefreshCw } from 'lucide-react'
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

  const telegramId = (user as any)?.telegram_id || (user as any)?.id

  const fetchPosts = useCallback(async (pg = 1, reset = false) => {
    try {
      const endpoint = tab === 'feed' ? '/api/v1/social/posts/feed' : '/api/v1/social/posts/explore'
      const res = await api.client.get(endpoint, { params: { page: pg, page_size: 20 } })
      const data = res.data
      const fetched = data.posts || []
      setPosts(prev => reset ? fetched : [...prev, ...fetched])
      setHasMore(fetched.length >= 20)
      setPage(pg)
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
    <div className="min-h-screen bg-pitch pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-pitch/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <h1 className="text-lg font-bold text-white tracking-tight">Lenta</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
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
                  ? 'bg-sahifa-500/15 text-sahifa-400'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              <Users className="w-4 h-4" /> Kuzatuv
            </button>
            <button
              onClick={() => setTab('explore')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                tab === 'explore'
                  ? 'bg-sahifa-500/15 text-sahifa-400'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              <Compass className="w-4 h-4" /> Kashfiyot
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Post composer */}
        <CreatePost
          user={identityUser}
          onSubmit={handleCreatePost}
          uploadImage={handleUploadImage}
        />

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
              <div className="text-center py-20">
                <p className="text-white/30 text-sm">
                  {tab === 'feed'
                    ? "Hali hech kim kuzatilmayapti. Kashfiyot bo'limidan foydalanuvchilarni toping!"
                    : "Hali postlar yo'q. Birinchi bo'ling!"}
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
                  />
                ))}

                {hasMore && (
                  <button
                    onClick={handleLoadMore}
                    className="w-full py-3 rounded-xl text-sm text-white/40 hover:text-white/60 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors"
                  >
                    Ko'proq yuklash
                  </button>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default SocialFeed
