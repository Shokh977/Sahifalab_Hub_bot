import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Users, UserPlus, UserMinus } from 'lucide-react'
import api from '../../services/apiService'
import UserIdentity from './UserIdentity'
import type { UserIdentityUser } from './UserIdentity'

interface FollowEntry {
  user: UserIdentityUser
  created_at: string
}

interface FollowListModalProps {
  isOpen: boolean
  onClose: () => void
  userId: number
  type: 'followers' | 'following'
  count: number
  currentUserId?: number
}

const FollowListModal: React.FC<FollowListModalProps> = ({
  isOpen,
  onClose,
  userId,
  type,
  count,
  currentUserId,
}) => {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserIdentityUser[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [followStates, setFollowStates] = useState<Record<number, boolean>>({})
  const [followLoading, setFollowLoading] = useState<Record<number, boolean>>({})

  const title = type === 'followers' ? 'Kuzatuvchilar' : 'Kuzatishlar'

  const fetchPage = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true)
    try {
      const res = await api.client.get(`/api/v1/social/users/${userId}/${type}`, {
        params: { page: pageNum },
      })
      const entries: FollowEntry[] = res.data || []
      const items = entries.map(e => e.user ?? e)
      if (reset) setUsers(items)
      else setUsers(prev => [...prev, ...items])
      setHasMore(items.length === 50)
    } catch {}
    setLoading(false)
  }, [userId, type])

  useEffect(() => {
    if (!isOpen) return
    setPage(1)
    setUsers([])
    setFollowStates({})
    fetchPage(1, true)
  }, [isOpen, userId, type])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPage(next)
  }

  const handleFollow = async (targetId: number) => {
    const currently = followStates[targetId] ?? false
    setFollowLoading(prev => ({ ...prev, [targetId]: true }))
    try {
      if (currently) {
        await api.client.delete(`/api/v1/social/users/${targetId}/follow`)
        setFollowStates(prev => ({ ...prev, [targetId]: false }))
      } else {
        await api.client.post(`/api/v1/social/users/${targetId}/follow`)
        setFollowStates(prev => ({ ...prev, [targetId]: true }))
      }
    } catch {}
    setFollowLoading(prev => ({ ...prev, [targetId]: false }))
  }

  const goToProfile = (targetId: number) => {
    onClose()
    navigate(`/profile/${targetId}`)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <motion.div
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full sm:max-w-sm bg-white dark:bg-[#1C1C22] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200/60 dark:border-white/[0.08] flex flex-col max-h-[85vh]"
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/10" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
                <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{count} ta</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {users.length === 0 && loading ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/20" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-300 dark:text-white/10" />
                  </div>
                  <p className="text-sm text-gray-400 dark:text-white/30 font-medium">
                    {type === 'followers' ? "Hali kuzatuvchilar yo'q" : "Hali kuzatishlar yo'q"}
                  </p>
                </div>
              ) : (
                <>
                  {users.map(u => {
                    const isMe = u.telegram_id === currentUserId
                    const isFollowing = followStates[u.telegram_id] ?? false
                    const busy = followLoading[u.telegram_id] ?? false
                    const displayName = u.full_name || u.first_name || u.username || 'Foydalanuvchi'

                    return (
                      <div
                        key={u.telegram_id}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        {/* Avatar + name → navigates to profile */}
                        <button
                          onClick={() => goToProfile(u.telegram_id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <UserIdentity user={u} size="sm" showName={false} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {displayName}
                            </p>
                            {u.username && (
                              <p className="text-xs text-gray-400 dark:text-white/40 truncate">
                                @{u.username}
                              </p>
                            )}
                          </div>
                        </button>

                        {/* Follow/unfollow button — only for logged-in viewers, not self */}
                        {currentUserId && !isMe && (
                          <button
                            onClick={() => handleFollow(u.telegram_id)}
                            disabled={busy}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                              isFollowing
                                ? 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/50 border border-gray-200/60 dark:border-white/[0.08] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400'
                                : 'bg-sahifa-500 text-white hover:bg-sahifa-600'
                            }`}
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isFollowing ? (
                              <><UserMinus className="w-3.5 h-3.5" /> Chiqish</>
                            ) : (
                              <><UserPlus className="w-3.5 h-3.5" /> Kuzatish</>
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="w-full py-3 mt-1 text-sm text-sahifa-500 hover:text-sahifa-600 font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {loading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : "Ko'proq yuklash"}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default FollowListModal
