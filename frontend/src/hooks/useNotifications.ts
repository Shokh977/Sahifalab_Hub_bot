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
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('sahifa:notif_count') || '0', 10) }
    catch { return 0 }
  })
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const listFetchedRef = useRef(false)

  // ── Fetch just unread count (lightweight — single integer) ────────────────
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return
    console.time('⏱️ NotifCount_Fetch')
    try {
      const res = await apiService.client.get('/api/notifications/unread-count')
      const count: number = res.data?.count ?? 0
      setUnreadCount(count)
      localStorage.setItem('sahifa:notif_count', String(count))
    } catch (err) {
      console.warn('[Notifications] count fetch error:', err)
    }
    console.timeEnd('⏱️ NotifCount_Fetch')
  }, [userId])

  // ── Fetch full notification list (on demand — called when dropdown opens) ─
  const fetchNotifications = useCallback(async (force = false) => {
    if (!userId || (listFetchedRef.current && !force)) return
    listFetchedRef.current = true
    setLoading(true)
    console.time('⏱️ NotifList_Fetch')
    try {
      const res = await apiService.client.get('/api/notifications', { params: { limit: 30 } })
      const items: NotificationItem[] = res.data?.notifications ?? []
      items.forEach(n => _cache.set(n.id, n))
      setNotifications(items)
    } catch (err) {
      console.warn('[Notifications] list fetch error:', err)
      listFetchedRef.current = false
    }
    setLoading(false)
    console.timeEnd('⏱️ NotifList_Fetch')
  }, [userId])

  // ── Reset fetch gate when userId changes (logout → login) ────────────────
  useEffect(() => {
    listFetchedRef.current = false
    _cache.clear()
    setNotifications([])
  }, [userId])

  // ── Fetch single notification by id (uses dedicated backend endpoint) ─────
  const fetchById = useCallback(async (id: number): Promise<NotificationItem | null> => {
    if (_cache.has(id)) return _cache.get(id)!
    try {
      // Use the dedicated single-item endpoint (GET /api/notifications/:id)
      const res = await apiService.client.get(`/api/notifications/${id}`)
      const item: NotificationItem = res.data
      if (item?.id) {
        _cache.set(item.id, item)
        return item
      }
      return null
    } catch {
      // Fallback: scan the latest page in case the endpoint doesn't exist yet
      try {
        const res = await apiService.client.get('/api/notifications', { params: { limit: 20 } })
        const items: NotificationItem[] = res.data?.notifications ?? []
        items.forEach(n => _cache.set(n.id, n))
        return items.find(n => n.id === id) ?? null
      } catch {
        return null
      }
    }
  }, [])

  // ── On mount: fetch count + subscribe to Realtime ─────────────────────────
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return
    console.time('⏱️ StatusBar_Fetch')
    fetchUnreadCount().then(() => console.timeEnd('⏱️ StatusBar_Fetch'))

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
            sender_id: row.sender_id ?? (row.meta?.actor_id ?? null),
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

          // Re-fetch the authoritative unique-sender count from the server.
          // (We can't reliably compute DISTINCT sender_id locally when we only
          //  have a partial payload, so let the RPC do the math.)
          fetchUnreadCount()

          // Fire toast callback
          if (_toastCallback) _toastCallback([item])
        },
      )
      // ── Realtime UPDATE: notification marked as read elsewhere ──────────
      // E.g. user reads on mobile → badge decrements on desktop instantly.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as any
          if (!row?.id) return

          // Optimistic local update
          setNotifications(prev =>
            prev.map(n => n.id === row.id ? { ...n, is_read: row.is_read } : n),
          )

          // Re-fetch unique-sender count so the badge is authoritative
          if (row.is_read === true) {
            fetchUnreadCount()
          }
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [userId, fetchUnreadCount, fetchById])

  // ── Mark as read ──────────────────────────────────────────────────────────
  const markRead = useCallback(async (ids?: number[]) => {
    if (!userId) return
    try {
      // Optimistic local update (UI feels instant)
      setNotifications(prev =>
        prev.map(n =>
          (!ids || ids.includes(n.id)) ? { ...n, is_read: true } : n,
        ),
      )

      const idsToMark = ids ?? null

      if (!idsToMark) {
        // Mark ALL: we know for certain the new count is 0 — no need to re-fetch.
        setUnreadCount(0)
        localStorage.setItem('sahifa:notif_count', '0')
      }

      await apiService.client.post('/api/notifications/read', {
        notification_ids: idsToMark,
      })

      // For partial mark-read: re-fetch the authoritative unique-sender count
      // (we can't compute DISTINCT sender_id locally for a subset of ids)
      if (idsToMark) {
        await fetchUnreadCount()
      }
    } catch (err) {
      console.warn('[Notifications] mark-read error:', err)
      fetchUnreadCount()
    }
  }, [userId, fetchUnreadCount])

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
    fetchNotifications,
    refetch: fetchUnreadCount,
  }
}
