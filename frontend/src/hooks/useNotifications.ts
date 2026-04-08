/**
 * useNotifications — real-time notification store.
 *
 * Architecture:
 *   1. On mount: fetch unread count + first page from backend REST API
 *   2. Subscribe to Supabase Realtime Postgres Changes on `notifications` table
 *      filtered by user_id (low egress — broadcast only delivers new row id + type)
 *   3. On INSERT event: add to local cache; if not in cache, fetch full row
 *   4. Toast queue: emits new notifications to the toast system
 *   5. Mark-read: single RPC call, optimistic local update
 *
 * Constraint: never SELECT * — always targeted columns via RPC.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import apiService from '../services/apiService'
import type { NotificationItem } from '../utils/notificationDictionary'

// ── Local cache (in-memory, keyed by id) ──────────────────────────────────────
const _cache = new Map<number, NotificationItem>()

// ── Toast callback type ───────────────────────────────────────────────────────
type ToastCallback = (items: NotificationItem[]) => void
let _toastCallback: ToastCallback | null = null

export function onNewNotifications(cb: ToastCallback) {
  _toastCallback = cb
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications(userId: number | null) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Fetch initial data ────────────────────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [notifRes, countRes] = await Promise.all([
        apiService.client.get('/api/notifications', { params: { limit: 30 } }),
        apiService.client.get('/api/notifications/unread-count'),
      ])
      const items: NotificationItem[] = notifRes.data?.notifications ?? []
      items.forEach(n => _cache.set(n.id, n))
      setNotifications(items)
      setUnreadCount(countRes.data?.count ?? 0)
    } catch (err) {
      console.warn('[Notifications] fetch error:', err)
    }
    setLoading(false)
  }, [userId])

  // ── Fetch single notification by id (post-fetch for Realtime INSERT) ──────
  const fetchById = useCallback(async (id: number): Promise<NotificationItem | null> => {
    if (_cache.has(id)) return _cache.get(id)!
    try {
      // Fetch page with cursor set so we get this specific item
      // Since we can't query by id directly, fetch latest and find it
      const res = await apiService.client.get('/api/notifications', { params: { limit: 5 } })
      const items: NotificationItem[] = res.data?.notifications ?? []
      items.forEach(n => _cache.set(n.id, n))
      return items.find(n => n.id === id) ?? null
    } catch {
      return null
    }
  }, [])

  // ── Subscribe to Supabase Realtime ────────────────────────────────────────
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return
    fetchInitial()

    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as any
          if (!row?.id) return

          // Build a lightweight item from the broadcast payload
          const item: NotificationItem = {
            id: row.id,
            type: row.type ?? 'unknown',
            category: row.category ?? 'SOCIAL',
            meta: row.meta ?? {},
            is_read: false,
            created_at: row.created_at ?? new Date().toISOString(),
          }

          // If payload is partial (Realtime might only send id + type),
          // fetch full details if not in cache
          if (!row.meta && !_cache.has(row.id)) {
            const fetched = await fetchById(row.id)
            if (fetched) Object.assign(item, fetched)
          }

          _cache.set(item.id, item)

          setNotifications(prev => {
            // Deduplicate
            if (prev.some(n => n.id === item.id)) return prev
            return [item, ...prev]
          })
          setUnreadCount(prev => prev + 1)

          // Fire toast callback
          if (_toastCallback) _toastCallback([item])
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [userId, fetchInitial, fetchById])

  // ── Mark as read ──────────────────────────────────────────────────────────
  const markRead = useCallback(async (ids?: number[]) => {
    if (!userId) return
    try {
      // Optimistic update
      setNotifications(prev =>
        prev.map(n =>
          (!ids || ids.includes(n.id)) ? { ...n, is_read: true } : n,
        ),
      )
      const idsToMark = ids ?? null
      if (!idsToMark) {
        setUnreadCount(0)
      } else {
        setUnreadCount(prev => Math.max(0, prev - idsToMark.length))
      }

      await apiService.client.post('/api/notifications/read', {
        notification_ids: idsToMark,
      })
    } catch (err) {
      console.warn('[Notifications] mark-read error:', err)
      // Revert on failure
      fetchInitial()
    }
  }, [userId, fetchInitial])

  // ── Load more (keyset pagination) ─────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!userId || notifications.length === 0) return
    const lastId = notifications[notifications.length - 1]?.id
    try {
      const res = await apiService.client.get('/api/notifications', {
        params: { limit: 30, cursor: lastId },
      })
      const items: NotificationItem[] = res.data?.notifications ?? []
      items.forEach(n => _cache.set(n.id, n))
      setNotifications(prev => [...prev, ...items.filter(n => !prev.some(p => p.id === n.id))])
    } catch {}
  }, [userId, notifications])

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    loadMore,
    refetch: fetchInitial,
  }
}
