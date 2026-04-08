/**
 * impressionBuffer — client-side batching for analytics impression events.
 *
 * Strategy:
 *  • Deduplication: sessionStorage key prevents re-counting items already
 *    seen in the current browser session.
 *  • Batching: collected events are flushed to the backend via
 *    POST /api/analytics/track:
 *      - every 12 seconds (interval)
 *      - immediately when the buffer hits 15 pending events
 *      - on page unload (beforeunload)
 *  • Fire-and-forget: failures are silently swallowed.
 *
 * Usage:
 *   import { trackImpression } from '../utils/impressionBuffer'
 *   trackImpression('course_impression', course.id, course.teacher_id, 'lenta')
 */

import apiService from '../services/apiService'

const SESSION_KEY = 'sahifa_impressions_v1'

// ── Persistent dedup set (sessionStorage-backed) ──────────────────────────────
function _loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* start fresh */ }
  return new Set<string>()
}

function _persistSeen(seen: Set<string>): void {
  try {
    // Keep set bounded (max 500 entries) to avoid storage issues
    const arr = [...seen]
    if (arr.length > 500) arr.splice(0, arr.length - 500)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr))
  } catch { /* quota — ignore */ }
}

const _seenKeys = _loadSeen()

// ── Pending queue ─────────────────────────────────────────────────────────────
interface PendingEvent {
  event_type: string
  target_id: number
  teacher_id: number
  source: string
}

const _pending: PendingEvent[] = []
let _flushTimer: ReturnType<typeof setInterval> | null = null

function _flush(): void {
  if (_pending.length === 0) return
  const events = _pending.splice(0)
  apiService.trackAnalyticsEvents(events).catch(() => {})
}

function _ensureTimer(): void {
  if (_flushTimer !== null) return
  _flushTimer = setInterval(_flush, 12_000)
  window.addEventListener('beforeunload', _flush, { once: true })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Track an impression event (course_impression, post_impression, etc.)
 * Deduplicated per session by `eventType:targetId`.
 */
export function trackImpression(
  eventType: string,
  targetId: number,
  teacherId: number,
  source: string = 'direct',
): void {
  const key = `${eventType}:${targetId}`
  if (_seenKeys.has(key)) return

  _seenKeys.add(key)
  _persistSeen(_seenKeys)

  _pending.push({ event_type: eventType, target_id: targetId, teacher_id: teacherId, source })
  _ensureTimer()

  if (_pending.length >= 15) _flush()
}
