import React, { useState, useEffect, useCallback } from 'react'
import { Bookmark, Loader2 } from 'lucide-react'
import api from '../services/apiService'
import PostCard from '../components/social/PostCard'
import type { PostData } from '../components/social/PostCard'

const SavedPostsPage: React.FC = () => {
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback(async (p: number, replace = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true)
    try {
      const r = await api.client.get('/api/v1/social/posts/saved', { params: { page: p, page_size: 20 } })
      const data = r.data
      const fetched: PostData[] = data.posts || []
      setPosts(prev => replace ? fetched : [...prev, ...fetched])
      setHasMore(fetched.length === 20)
    } catch {}
    if (p === 1) setLoading(false); else setLoadingMore(false)
  }, [])

  useEffect(() => { fetchPage(1, true) }, [fetchPage])

  const handleUnsave = useCallback((postId: number) => {
    setPosts(prev => prev.filter(p => p.id !== postId))
  }, [])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPage(next)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-1">
        <Bookmark className="w-5 h-5 text-[#e8792f]" />
        <h1 className="text-lg font-bold text-white">Saqlangan postlar</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-white/20" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Bookmark className="w-10 h-10 text-white/10" />
          <p className="text-white/40 text-sm">Hali hech narsa saqlanmagan</p>
          <p className="text-white/25 text-xs">Postlar ostidagi 📌 tugmasini bosib saqlang</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={async (id) => { await api.client.post(`/api/v1/social/posts/${id}/like`) }}
                onUnlike={async (id) => { await api.client.delete(`/api/v1/social/posts/${id}/like`) }}
                onUnsave={handleUnsave}
              />
            ))}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/50 text-sm hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Ko'proq yuklash
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default SavedPostsPage
