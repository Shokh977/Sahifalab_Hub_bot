/**
 * mock_notifications.ts — Development-only fake notification injector.
 *
 * Purpose:
 *   Verifies unique sender-count logic and orange dot UI on localhost
 *   without needing a real Supabase backend.
 *
 * Usage:
 *   import '../lib/mock_notifications' — runs automatically in DEV.
 *   OR call injectMockNotifications() manually.
 *
 * Design:
 *   • 5 notifications from 4 distinct senders (including 1 system)
 *   • Two notifications from sender 100_001 → unique count should still be 4
 *   • Exposes mock data on window.__MOCK_NOTIFICATIONS__ for easy devtools inspection
 */

import type { NotificationItem } from '../utils/notificationDictionary'

// ── 5 fake notifications from 4 distinct senders ─────────────────────────────
// sender_id  | type        | purpose
// -----------|-------------|---------------------------------------------------
// 0          | welcome     | System (SAHIFALAB) — sender_id = 0
// 100_001    | follow      | Real user A — first notif
// 100_001    | like        | Real user A — second notif (same sender, still 1 unique)
// 100_002    | comment     | Real user B
// 100_003    | achievement | Real user C (or system growth event)
// ─────────────────────────────────────────────────────────────────────────────
// Expected unique sender count = 4  (0, 100_001, 100_002, 100_003)

const now = new Date()
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 9001,
    type: 'welcome',
    category: 'GROWTH',
    meta: {
      actor_id: 0,
      actor_name: 'Sahifalab',
      actor_photo: '/sahifalab-logo.png',
      user_name: 'Test foydalanuvchi',
      xp_reward: 100,
    },
    is_read: false,
    created_at: ago(2),
    sender_id: 0,
  },
  {
    id: 9002,
    type: 'follow',
    category: 'SOCIAL',
    meta: {
      actor_id: 100_001,
      actor_name: 'Dilnoza Yusupova',
      actor_photo: 'https://i.pravatar.cc/150?img=47',
    },
    is_read: false,
    created_at: ago(5),
    sender_id: 100_001,
  },
  {
    id: 9003,
    type: 'like',
    category: 'SOCIAL',
    meta: {
      actor_id: 100_001,
      actor_name: 'Dilnoza Yusupova',
      actor_photo: 'https://i.pravatar.cc/150?img=47',
      post_id: 42,
    },
    is_read: false,
    created_at: ago(12),
    sender_id: 100_001,   // ← same sender as above → unique count stays the same
  },
  {
    id: 9004,
    type: 'comment',
    category: 'SOCIAL',
    meta: {
      actor_id: 100_002,
      actor_name: 'Jasur Toshmatov',
      actor_photo: 'https://i.pravatar.cc/150?img=12',
      post_id: 42,
    },
    is_read: false,
    created_at: ago(30),
    sender_id: 100_002,
  },
  {
    id: 9005,
    type: 'achievement',
    category: 'GROWTH',
    meta: {
      achievement_name: 'Birinchi qadam',
      actor_id: 100_003,
      actor_name: 'Kamola Nazarova',
      actor_photo: 'https://i.pravatar.cc/150?img=5',
    },
    is_read: false,
    created_at: ago(60),
    sender_id: 100_003,
  },
]

// ── Unique sender count (should equal 4) ──────────────────────────────────────
export function computeUniqueSenderCount(items: NotificationItem[]): number {
  const unread = items.filter(n => !n.is_read)
  const senderSet = new Set(unread.map(n => n.sender_id ?? 0))
  return senderSet.size
}

// ── Auto-inject into window for devtools access ───────────────────────────────
if (import.meta.env.DEV) {
  const uniqueCount = computeUniqueSenderCount(MOCK_NOTIFICATIONS)
  ;(window as any).__MOCK_NOTIFICATIONS__ = MOCK_NOTIFICATIONS
  ;(window as any).__MOCK_UNIQUE_SENDER_COUNT__ = uniqueCount

  console.groupCollapsed(
    '%c[SAHIFALAB DEV] Mock Notifications loaded',
    'color: #F15929; font-weight: bold',
  )
  console.log('Total notifications:', MOCK_NOTIFICATIONS.length)
  console.log('Unread:', MOCK_NOTIFICATIONS.filter(n => !n.is_read).length)
  console.log('Expected badge count (unique senders):', uniqueCount)
  console.table(
    MOCK_NOTIFICATIONS.map(n => ({
      id: n.id,
      type: n.type,
      sender_id: n.sender_id ?? 0,
      sender_name: n.meta.actor_name,
      is_read: n.is_read,
    })),
  )
  console.log(
    '%cExpected badge: 4 (not 5 — sender 100001 sent 2 messages)',
    'color: #F15929',
  )
  console.groupEnd()
}
