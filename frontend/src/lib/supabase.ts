import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** FastAPI backend base URL — same var used by apiService.ts */
import { API_BASE } from './apiUrl'

// ═══════════════════════════════════════════════════════════════════════════
// TWO-LEVEL TTL CACHE — drastically reduces Supabase egress.
//
// L1: in-memory Map  — instant, survives the current JS session only.
// L2: localStorage   — survives page reloads and app re-opens (Telegram).
//
// TTL per category:
//   static content (books, quizzes, resources, sounds) → 24 hours
//     (these change rarely; admins can call invalidateCache() after edits)
//   live data (leaderboard, profiles)                  → 10 minutes
//   user-specific (completions, purchases, ratings)    → 5 minutes
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> { data: T; expiresAt: number }
const _cache = new Map<string, CacheEntry<unknown>>()
const LS_PREFIX = 'sc:'  // short prefix keeps localStorage keys small

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now()

  // ── L1: in-memory ───────────────────────────────────────────────────────
  const l1 = _cache.get(key)
  if (l1 && l1.expiresAt > now) return l1.data as T

  // ── L2: localStorage ────────────────────────────────────────────────────
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>
      if (entry.expiresAt > now) {
        _cache.set(key, entry)      // repopulate L1
        return entry.data
      }
    }
  } catch { /* localStorage unavailable (e.g. private mode) — ignore */ }

  // ── Miss: fetch from network ──────────────────────────────────────────────
  try {
    const data = await fetcher()
    const entry: CacheEntry<T> = { data, expiresAt: now + ttlMs }
    _cache.set(key, entry)
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry)) } catch { /* quota full */ }
    return data
  } catch (err) {
    // Network/402 failure — serve stale localStorage data rather than crashing
    try {
      const raw = localStorage.getItem(LS_PREFIX + key)
      if (raw) {
        const stale = JSON.parse(raw) as CacheEntry<T>
        console.warn(`[SupaCache] STALE fallback for "${key}" (fetch failed):`, err)
        return stale.data
      }
    } catch { /* ignore */ }
    throw err  // nothing in cache at all — re-throw so callers can show an error
  }
}

/** Invalidate one cache key in both layers (call after admin writes). */
export function invalidateCache(key: string) {
  _cache.delete(key)
  try { localStorage.removeItem(LS_PREFIX + key) } catch { /* ignore */ }
}

const TTL = {
  STATIC:  24 * 60 * 60 * 1000,  // 24 h — quizzes, books, resources, sounds
  LIVE:    10 * 60 * 1000,        // 10 min — leaderboard, profiles
  PERSONAL: 5 * 60 * 1000,        //  5 min — user completions, purchases, ratings
}

/** True only when both env vars are present, not placeholders, and not in mock dev mode */
const DEV_MOCK = import.meta.env.VITE_DEV_MOCK === 'true'
export const isSupabaseConfigured =
  !DEV_MOCK &&
  !!(SUPABASE_URL && SUPABASE_ANON &&
     !SUPABASE_URL.includes('placeholder') &&
     SUPABASE_ANON !== 'placeholder')

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
    'Progress will not be persisted. Add both vars to your .env / Vercel env settings.',
  )
}

/** Shared Supabase browser client (singleton). */
export const supabase = createClient(
  SUPABASE_URL  ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON ?? 'placeholder',
  {
    auth: { persistSession: false },  // no Supabase Auth — Telegram handles identity
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT SUPABASE READ QUERIES
// All public reads go straight to Supabase (~100ms) instead of through
// the Vercel backend (~3-5s cold start). Writes still go through backend.
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch all quizzes — routed through FastAPI backend (direct Postgres, no Supabase egress) */
export async function fetchQuizzes() {
  return cached('quizzes', TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/quizzes?limit=100`)
    if (!res.ok) throw new Error(`quizzes fetch failed: ${res.status}`)
    return res.json()
  })
}

/**
 * Fetch a single quiz with its questions.
 * SECURITY: correct_answer is deliberately excluded — scoring is server-side only.
 * Routed through FastAPI backend (direct Postgres, no Supabase egress).
 */
export async function fetchQuiz(quizId: number) {
  return cached(`quiz:${quizId}`, TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/quizzes/${quizId}`)
    if (!res.ok) throw new Error(`quiz fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch all books — routed through FastAPI backend */
export async function fetchBooks() {
  return cached('books', TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/books`)
    if (!res.ok) throw new Error(`books fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch a single book by ID — routed through FastAPI backend */
export async function fetchBook(bookId: number) {
  return cached(`book:${bookId}`, TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`)
    if (!res.ok) throw new Error(`book fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch random active hero content — routed through FastAPI backend */
export async function fetchHeroContent() {
  const data = await cached('hero_content', TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/hero/all`)
    if (!res.ok) throw new Error(`hero fetch failed: ${res.status}`)
    const items = await res.json()
    return (items as any[]).filter((i: any) => i.is_active)
  })
  if (!data || data.length === 0) return null
  const item = (data as any[])[Math.floor(Math.random() * data.length)]
  return {
    ...item,
    text: item.title || item.description || '',
    author: item.subtitle || 'SAHIFALAB',
    quote_type: item.cta_link ? 'announcement' : 'quote',
  }
}

/** Fetch all resources — routed through FastAPI backend */
export async function fetchResources() {
  return cached('resources', TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/resources`)
    if (!res.ok) throw new Error(`resources fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch active ambient sounds — routed through FastAPI backend */
export async function fetchAmbientSounds() {
  return cached('ambient_sounds', TTL.STATIC, async () => {
    const res = await fetch(`${API_BASE}/api/audio/ambient-sounds`)
    if (!res.ok) throw new Error(`ambient sounds fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch user's rating for a specific book — routed through FastAPI backend */
export async function fetchMyRating(bookId: number, telegramId: number) {
  return cached(`rating:${bookId}:${telegramId}`, TTL.PERSONAL, async () => {
    const res = await fetch(`${API_BASE}/api/profiles/${telegramId}/rating/${bookId}`)
    if (!res.ok) throw new Error(`rating fetch failed: ${res.status}`)
    const data = await res.json()
    return data?.rating ?? 0
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// CABINET PAGE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch user's completed quizzes (for certificates) — routed through FastAPI backend */
export async function fetchMyCompletedQuizzes(telegramId: number) {
  return cached(`completions:${telegramId}`, TTL.PERSONAL, async () => {
    const res = await fetch(`${API_BASE}/api/profiles/${telegramId}/completions`)
    if (!res.ok) throw new Error(`completions fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch quiz titles for a list of quiz IDs — uses the cached quiz list (no extra request) */
export async function fetchQuizTitles(quizIds: number[]) {
  if (quizIds.length === 0) return []
  const all = await fetchQuizzes()   // already cached in localStorage
  const set = new Set(quizIds)
  return (all as any[]).filter(q => set.has(q.id)).map(q => ({ id: q.id, title: q.title, book_title: q.book_title }))
}

/** Fetch user's purchased books (completed purchases only) — routed through FastAPI backend */
export async function fetchMyPurchasedBooks(telegramId: number) {
  return cached(`purchases:${telegramId}`, TTL.PERSONAL, async () => {
    const res = await fetch(`${API_BASE}/api/profiles/${telegramId}/purchases`)
    if (!res.ok) throw new Error(`purchases fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Fetch book details for a list of book IDs — uses the cached book list (no extra request) */
export async function fetchBooksByIds(bookIds: number[]) {
  if (bookIds.length === 0) return []
  const all = await fetchBooks()   // already cached in localStorage
  const set = new Set(bookIds)
  return (all as any[]).filter(b => set.has(b.id))
}

// ═══════════════════════════════════════════════════════════════════════════
// TEACHER DASHBOARD QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/** Dashboard stats: total students, active today, avg XP, total quizzes — routed through FastAPI backend */
export async function fetchDashboardStats() {
  return cached('dashboard_stats', TTL.LIVE, async () => {
    const res = await fetch(`${API_BASE}/api/profiles/dashboard-stats`)
    if (!res.ok) throw new Error(`dashboard stats fetch failed: ${res.status}`)
    return res.json()
  })
}

/** Top-5 students by XP — routed through FastAPI backend */
export async function fetchTop5Students() {
  return cached('top5_students', TTL.LIVE, async () => {
    const res = await fetch(`${API_BASE}/api/profiles/leaderboard?limit=5`)
    if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`)
    return res.json()
  })
}
