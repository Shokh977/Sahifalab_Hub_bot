/**
 * PublicProfile — User profile page.
 *
 * Shows rank-ringed avatar, stats (followers/following), verification badges,
 * follow/message buttons, and a grid/list of their posts.
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, UserPlus, UserMinus, MessageCircle, Loader2, Grid3X3, List, BadgeCheck, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import UserIdentity, { getRankInfo } from '../components/social/UserIdentity'
import PostCard from '../components/social/PostCard'
import type { PostData } from '../components/social/PostCard'
import type { UserIdentityUser } from '../components/social/UserIdentity'

interface ProfileData extends UserIdentityUser {
  bio?: string | null
  followers_count: number
  following_count: number
  is_following: boolean
}

const PublicProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [followLoading, setFollowLoading] = useState(false)

  const myId = (user as any)?.telegram_id || (user as any)?.id
  const targetId = Number(userId)
  const isOwnProfile = myId === targetId

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true)
      try {
        const [profileRes, postsRes] = await Promise.all([
          api.client.get(`/api/v1/social/users/${targetId}/profile`),
          api.client.get(`/api/v1/social/users/${targetId}/posts`, { params: { page: 1, page_size: 50 } }),
        ])
        setProfile(profileRes.data)
        setPosts(postsRes.data.posts || [])
      } catch (err) {
        console.error('Profile fetch error:', err)
      }
      setLoading(false)
    }
    fetchProfile()
  }, [targetId])

  const handleFollow = async () => {
    if (!profile) return
    setFollowLoading(true)
    try {
      if (profile.is_following) {
        await api.client.delete(`/api/v1/social/users/${targetId}/follow`)
        setProfile(p => p ? { ...p, is_following: false, followers_count: p.followers_count - 1 } : p)
      } else {
        await api.client.post(`/api/v1/social/users/${targetId}/follow`)
        setProfile(p => p ? { ...p, is_following: true, followers_count: p.followers_count + 1 } : p)
      }
    } catch {}
    setFollowLoading(false)
  }

  const handleMessage = async () => {
    try {
      const res = await api.client.post(`/api/v1/messenger/conversations/${targetId}`)
      navigate(`/messenger/${res.data.id}`)
    } catch {}
  }

  const handleLike = async (postId: number) => { await api.client.post(`/api/v1/social/posts/${postId}/like`) }
  const handleUnlike = async (postId: number) => { await api.client.delete(`/api/v1/social/posts/${postId}/like`) }
  const handleDelete = async (postId: number) => {
    await api.client.delete(`/api/v1/social/posts/${postId}`)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  const handleEdit = async (postId: number, content: string) => {
    await api.client.patch(`/api/v1/social/posts/${postId}`, { content })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/30" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch flex items-center justify-center">
        <p className="text-gray-400 dark:text-white/40">Foydalanuvchi topilmadi</p>
      </div>
    )
  }

  const rank = getRankInfo(profile.level || 1)

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-pitch/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{profile.full_name || profile.username || 'Profil'}</h1>
        </div>
      </div>

      {/* Profile card */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-frost dark:shadow-none p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Large avatar */}
            <UserIdentity user={profile} size="xl" showName={false} />

            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="text-lg font-bold text-gray-900 dark:text-white">{profile.full_name || profile.username || 'Foydalanuvchi'}</span>
                {profile.role === 'teacher' && (
                  <BadgeCheck className="w-[18px] h-[18px] text-blue-400 fill-blue-400/20 flex-shrink-0" />
                )}
                {profile.role === 'admin' && (
                  <Shield className="w-[18px] h-[18px] text-sahifa-500 fill-sahifa-500/20 flex-shrink-0" />
                )}
              </div>
              {profile.username && (
                <p className="text-sm text-gray-400 dark:text-white/40">@{profile.username}</p>
              )}

              {profile.bio && (
                <p className="text-sm text-gray-500 dark:text-white/50 mt-2 leading-relaxed">{profile.bio}</p>
              )}

              {/* Stats */}
              <div className="flex items-center justify-center sm:justify-start gap-6 mt-4">
                <div className="text-center">
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.followers_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40">Kuzatuvchi</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.following_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40">Kuzatuv</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{posts.length}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40">Post</span>
                </div>
              </div>

              {/* Rank badge */}
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06]">
                <span>{rank.emoji}</span>
                <span className="text-xs font-medium text-gray-600 dark:text-white/60">{rank.title}</span>
                <span className="text-xs text-gray-400 dark:text-white/30">· Lvl {profile.level || 1}</span>
              </div>

              {/* Actions */}
              {!isOwnProfile && (
                <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                      profile.is_following
                        ? 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/60 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 border border-gray-200/60 dark:border-white/[0.08]'
                        : 'bg-sahifa-500 text-white hover:bg-sahifa-600'
                    }`}
                  >
                    {profile.is_following ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    {profile.is_following ? 'Kuzatishdan chiqish' : 'Kuzatish'}
                  </button>
                  <button
                    onClick={handleMessage}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-500 dark:text-white/60 bg-gray-100 dark:bg-white/[0.06] border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4" /> Xabar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Posts section */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-white/60">Postlar</h2>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'text-sahifa-400 bg-sahifa-500/10' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'text-sahifa-400 bg-sahifa-500/10' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
                <List className="w-8 h-8 text-gray-300 dark:text-white/10" />
              </div>
              <p className="text-gray-400 dark:text-white/30 text-sm font-medium">Hali postlar yo'q</p>
              <p className="text-gray-300 dark:text-white/15 text-xs mt-1">Bu foydalanuvchi hali hech narsa yozmagan</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-4">
              {posts.map(post => (
                <div key={post.id} id={`post-${post.id}`}>
                  <PostCard
                    post={post}
                    currentUserId={myId}
                    onLike={handleLike}
                    onUnlike={handleUnlike}
                    onDelete={isOwnProfile ? handleDelete : undefined}
                    onEdit={isOwnProfile ? handleEdit : undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
              {posts.filter(p => p.image_url).map(post => (
                <div
                  key={post.id}
                  className="aspect-square bg-gray-200 dark:bg-pitch-700 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => { setViewMode('list'); setTimeout(() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}
                >
                  <img src={post.image_url!} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {posts.filter(p => !p.image_url).map(post => (
                <div
                  key={post.id}
                  className="aspect-square bg-gray-100 dark:bg-white/[0.03] flex items-center justify-center p-3 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/[0.06] transition-colors"
                  onClick={() => { setViewMode('list'); setTimeout(() => document.getElementById(`post-${post.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}
                >
                  <p className="text-[10px] text-gray-500 dark:text-white/40 line-clamp-4 text-center leading-snug">
                    {post.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PublicProfile
