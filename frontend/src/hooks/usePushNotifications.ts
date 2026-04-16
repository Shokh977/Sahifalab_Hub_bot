/**
 * usePushNotifications — Web Push subscription lifecycle manager.
 *
 * Flow:
 *   1. On mount (authenticated): register service worker
 *   2. Check existing push subscription
 *   3. If none: wait for explicit user consent (call `subscribe()`)
 *   4. On subscribe: request Notification permission → subscribe PushManager
 *      → POST subscription to backend
 *   5. On unsubscribe: unsubscribe PushManager → DELETE from backend
 *
 * The hook is designed to be called once per session from a top-level component.
 * It is a no-op in Telegram WebApp (no SW support) and in unsupported browsers.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import apiService from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export interface PushNotificationState {
  /** Whether the browser supports Web Push at all */
  isSupported:   boolean
  /** Current Notification.permission value */
  permission:    PushPermission
  /** True while registering SW or subscribing */
  loading:       boolean
  /** True when the user has an active push subscription */
  isSubscribed:  boolean
  /** Subscribe (asks for permission + registers with backend) */
  subscribe:     () => Promise<void>
  /** Unsubscribe (removes from browser + backend) */
  unsubscribe:   () => Promise<void>
}

// ── Helper: convert VAPID public key (base64url) to Uint8Array ───────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(userId: number | null): PushNotificationState {
  const isSupported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager'   in window &&
    'Notification'  in window

  const [permission,   setPermission]   = useState<PushPermission>(
    isSupported ? (Notification.permission as PushPermission) : 'unsupported'
  )
  const [loading,      setLoading]      = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const swRegRef  = useRef<ServiceWorkerRegistration | null>(null)
  const vapidKey  = useRef<string>('')

  // ── Register SW and sync current subscription state ────────────────────────
  useEffect(() => {
    if (!isSupported || !userId) return

    let cancelled = false

    const init = async () => {
      try {
        // 1. Register (or get existing) service worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        if (cancelled) return
        swRegRef.current = reg

        // 2. Fetch VAPID public key from backend (cached after first call)
        if (!vapidKey.current) {
          try {
            const res = await apiService.client.get('/api/notifications/push-vapid-key')
            vapidKey.current = res.data?.vapid_public_key ?? ''
          } catch {
            // VAPID not configured on backend yet — push will be silently skipped
          }
        }

        // 3. Check existing subscription
        await reg.update()
        const existing = await reg.pushManager.getSubscription()
        if (cancelled) return
        setIsSubscribed(!!existing)
        setPermission(Notification.permission as PushPermission)
      } catch (err) {
        console.warn('[Push] SW registration failed:', err)
      }
    }

    init()
    return () => { cancelled = true }
  }, [userId, isSupported])

  // ── subscribe ────────────────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return
    setLoading(true)
    try {
      // 1. Ask for notification permission
      const perm = await Notification.requestPermission()
      setPermission(perm as PushPermission)
      if (perm !== 'granted') return

      // 2. Ensure SW is ready
      const reg = swRegRef.current ?? await navigator.serviceWorker.ready
      swRegRef.current = reg

      // 3. Fetch VAPID key if not cached
      if (!vapidKey.current) {
        const res = await apiService.client.get('/api/notifications/push-vapid-key')
        vapidKey.current = res.data?.vapid_public_key ?? ''
      }
      if (!vapidKey.current) throw new Error('VAPID key not available')

      // 4. Subscribe via PushManager
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.current),
      })

      // 5. Send subscription to backend
      const subJson = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }
      await apiService.client.post('/api/notifications/push-subscribe', {
        endpoint:   subJson.endpoint,
        p256dh:     subJson.keys.p256dh,
        auth:       subJson.keys.auth,
        user_agent: navigator.userAgent,
      })

      setIsSubscribed(true)
    } catch (err) {
      console.warn('[Push] subscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }, [isSupported, userId])

  // ── unsubscribe ──────────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!isSupported || !userId) return
    setLoading(true)
    try {
      const reg = swRegRef.current ?? await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        // Remove from backend
        await apiService.client.delete('/api/notifications/push-subscribe', {
          data: { endpoint },
        })
      }
      setIsSubscribed(false)
    } catch (err) {
      console.warn('[Push] unsubscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }, [isSupported, userId])

  return { isSupported, permission, loading, isSubscribed, subscribe, unsubscribe }
}
