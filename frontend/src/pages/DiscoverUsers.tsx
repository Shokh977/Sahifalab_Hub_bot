/**
 * DiscoverUsers — Search and discover users by rank.
 *
 * Shows suggested users (not yet followed), search bar,
 * rank filters, and follow buttons.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import UserIdentity, { getRankInfo } from '../components/social/UserIdentity'
import type { UserIdentityUser } from '../components/social/UserIdentity'

const DiscoverUsers: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserIdentityUser[]>([])
  const [loading, setLoading] = useState(true)
  const [followedSet, setFollowedSet] = useState<Set<number>>(new Set())

  const fetchDiscover = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.client.get('/api/v1/social/discover', { params: { page: 1 } })
      setUsers(res.data.users || [])
    } catch {}
    setLoading(false)
  }, [])

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) return fetchDiscover()
    setLoading(true)
    try {
      const res = await api.client.get('/api/v1/social/search', { params: { q } })
      setUsers(res.data.users || [])
    } catch {}
    setLoading(false)
  }, [fetchDiscover])

  useEffect(() => { fetchDiscover() }, [fetchDiscover])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) searchUsers(query)
      else fetchDiscover()
    }, 400)
    return () => clearTimeout(timer)
  }, [query, searchUsers, fetchDiscover])

  const handleFollow = async (targetId: number) => {
    try {
      await api.client.post(`/api/v1/social/users/${targetId}/follow`)
      setFollowedSet(prev => new Set(prev).add(targetId))
    } catch {}
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-pitch/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Kashfiyot</h1>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Foydalanuvchi qidirish..."
              className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-white/70 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06] text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-sahifa-500/30 focus:bg-white dark:focus:bg-white/[0.06] transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Users list */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/30" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 dark:text-white/30 text-sm">
              {query ? "Natija topilmadi" : "Hech kim topilmadi"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const isFollowed = followedSet.has(u.telegram_id)
              const rank = getRankInfo(u.level || 1)
              return (
                <div
                  key={u.telegram_id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200/60 dark:border-white/[0.04] bg-white/70 dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                    onClick={() => navigate(`/profile/${u.telegram_id}`)}
                  >
                    <UserIdentity user={u} size="md" showRank showBadge />
                  </div>
                  {!isFollowed ? (
                    <button
                      onClick={() => handleFollow(u.telegram_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sahifa-500 hover:bg-sahifa-600 transition-colors active:scale-95 flex-shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Kuzatish
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-white/30 px-3 flex-shrink-0">Kuzatilmoqda</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default DiscoverUsers
