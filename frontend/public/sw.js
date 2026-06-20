/**
 * SAHIFALAB Service Worker — Web Push Notifications
 *
 * Handles:
 *   1. push  — shows a notification when the app tab is closed / background
 *   2. notificationclick — focuses/opens the app and navigates to the target URL
 *   3. pushsubscriptionchange — re-subscribes and syncs new endpoint to backend
 *
 * This SW does NOT cache any resources (that's handled by Vite build).
 */

const APP_ORIGIN = self.location.origin

// ── push ─────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'SAHIFALAB', body: event.data.text() }
  }

  const title   = data.title  || 'SAHIFALAB'
  const options = {
    body:    data.body  || 'Yangi bildirishnoma',
    icon:    data.icon  || '/sahifalab.jpg',
    badge:   data.badge || '/sahifalab.jpg',
    tag:     data.tag   || 'sahifalab-notif',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/',
    },
    // Vibrate pattern: short-long-short
    vibrate: [100, 50, 100],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── notificationclick ─────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? new URL(event.notification.data.url, APP_ORIGIN).href
    : APP_ORIGIN

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If an app window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.startsWith(APP_ORIGIN) && 'focus' in client) {
            client.focus()
            if ('navigate' in client) client.navigate(targetUrl)
            return
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
  )
})

// ── pushsubscriptionchange ────────────────────────────────────────────────────
// Fired by the browser when a push subscription expires or rotates.
// Re-subscribe with the same VAPID key and POST the new endpoint to backend.

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then((newSub) => {
        const subJson = newSub.toJSON()
        // Post directly from SW — no access to auth token here,
        // so we use a dedicated unauthenticated renewal path.
        // The backend matches on endpoint to identify the user.
        return fetch('/api/notifications/push-subscribe-renew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            old_endpoint: event.oldSubscription.endpoint,
            endpoint:     subJson.endpoint,
            p256dh:       subJson.keys.p256dh,
            auth:         subJson.keys.auth,
          }),
        })
      })
      .catch((err) => console.warn('[SW] pushsubscriptionchange failed:', err))
  )
})

// ── install / activate (no-op — no caching strategy) ─────────────────────────

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()))
