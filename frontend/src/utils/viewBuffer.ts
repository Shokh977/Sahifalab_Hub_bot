/**
 * viewBuffer — client-side batching for post view tracking.
 *
 * Strategy:
 *  • Deduplication: sessionStorage key prevents re-counting posts already
 *    seen in the current browser session (survives SPA navigations, resets on
 *    tab close / hard refresh — good enough for "organic" view counting).
 *  • Batching: collected IDs are flushed to the backend in a single POST:
 *      - every 10 seconds (interval)
 *      - immediately when the buffer hits 10 pending IDs
 *      - on page unload (beforeunload)
 *  • Fire-and-forget: failures are silently swallowed — never blocks the UI.
 *
 * Usage (from PostCard):
 *   import { markViewed } from '../../utils/viewBuffer'
 *   markViewed(post.id)   // call inside IntersectionObserver dwell callback
 */

import api from '../services/apiService'

const SESSION_KEY = 'sahifa_viewed_posts_v1'

// ── Persistent dedup set (sessionStorage-backed) ──────────────────────────────
function _loadSeen(): Set<number> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch { /* quota / parse error — start fresh */ }
  return new Set<number>()
}

function _persistSeen(seen: Set<number>): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...seen]))
  } catch { /* storage quota — ignore */ }
}

const _seenIds = _loadSeen()

// ── Pending queue (in-memory) ─────────────────────────────────────────────────
const _pending: number[] = []
let _flushTimer: ReturnType<typeof setInterval> | null = null

function _flush(): void {
  if (_pending.length === 0) return
  const ids = _pending.splice(0)               // drain in-place
  api.client
    .post('/api/v1/social/posts/views/bulk', { post_ids: ids }, {
      headers: { 'X-Show-Error-Toast': 'false' },
    })
    .catch(() => {})                           // fire-and-forget
}

function _ensureTimer(): void {
  if (_flushTimer !== null) return
  _flushTimer = setInterval(_flush, 10_000)   // flush every 10 s
  // Also flush when user navigates away / closes tab
  window.addEventListener('beforeunload', _flush, { once: true })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mark a post as viewed in the current session.
 * - If already seen this session: no-op.
 * - Otherwise: optimistic UI should already be updated by PostCard;
 *   this function queues the post ID for the next bulk backend flush.
 */
export function markViewed(postId: number): void {
  if (_seenIds.has(postId)) return

  _seenIds.add(postId)
  _persistSeen(_seenIds)

  _pending.push(postId)
  _ensureTimer()

  // Eager flush when buffer is full
  if (_pending.length >= 10) _flush()
}
