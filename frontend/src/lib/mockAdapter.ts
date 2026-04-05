/**
 * mockAdapter.ts — Custom axios adapter for offline / rate-limited development.
 *
 * When VITE_DEV_MOCK=true this module:
 *   1. Exports `mockAxiosAdapter` — replaces the HTTP adapter so every axios
 *      request is resolved locally from mockData.ts (no network call made).
 *   2. Exports `initMockAuth()` — pre-injects a fake auth_token into
 *      localStorage so AuthContext sees a valid session on mount.
 *   3. Seeds the Supabase localStorage cache with mock leaderboard data so
 *      LeaderboardPage renders the list instead of the "offline" placeholder.
 *
 * Nothing in this file runs in production (VITE_DEV_MOCK is undefined).
 */
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import {
  MOCK_USER, MOCK_CATEGORIES, MOCK_COURSES, MOCK_LESSONS, MOCK_REVIEWS,
  MOCK_ENROLLMENTS, MOCK_BOOKS, MOCK_QUIZZES, MOCK_QUIZ_DETAIL,
  MOCK_QUIZ_DETAILS, MOCK_COURSE_REVIEWS,
  MOCK_RESOURCES, MOCK_AMBIENT_SOUNDS, MOCK_HEATMAP, MOCK_TEACHERS,
  MOCK_TEACHER_PROFILE, MOCK_TEACHER_ANALYTICS, MOCK_ADMIN_STATS,
  MOCK_PLATFORM_ANALYTICS, MOCK_HERO, MOCK_PAYMENT_ORDER, MOCK_LEADERBOARD,
} from './mockData'

export const DEV_MOCK = import.meta.env.VITE_DEV_MOCK === 'true'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake AxiosResponse */
function ok<T>(data: T, config: InternalAxiosRequestConfig, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: { 'content-type': 'application/json' }, config, request: {} }
}

/** Extract the numeric id segment from a URL path like /api/courses/3/reviews */
function seg(url: string, after: string): number | null {
  const re = new RegExp(`${after}/(\\d+)`)
  const m = url.match(re)
  return m ? parseInt(m[1], 10) : null
}

// ── Main router ───────────────────────────────────────────────────────────────

function route(url: string, method: string, config: InternalAxiosRequestConfig): AxiosResponse {
  const u = url.replace(/\?.*$/, '') // strip query string for matching
  const m = method.toLowerCase()

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (m === 'get'  && u === '/api/auth/me')                      return ok(MOCK_USER, config)
  if (m === 'post' && (u === '/api/auth/email-login'   ||
                       u === '/api/auth/email-register' ||
                       u === '/api/auth/telegram'       ||
                       u === '/api/auth/verify-code'))           return ok({ ...MOCK_USER, access_token: 'dev_mock_token' }, config)
  if (m === 'patch' && u === '/api/auth/me')                     return ok(MOCK_USER, config)
  if (m === 'patch' && u === '/api/auth/me/photo')               return ok({ success: true }, config)
  if (m === 'post'  && u === '/api/auth/me/photo/upload')        return ok({ photo_url: MOCK_USER.photo_url }, config)
  if (m === 'post'  && u === '/api/auth/apply-teacher')          return ok({ success: true, message: 'Arizangiz qabul qilindi!' }, config)

  // Admin – users & teacher approvals
  if (m === 'get'   && u === '/api/auth/admin/teacher-requests') return ok([], config)
  if (m === 'get'   && u.startsWith('/api/auth/admin/users'))    return ok({ users: [MOCK_USER], total: 1 }, config)
  if (m === 'post'  && u.startsWith('/api/auth/admin/approve-teacher')) return ok({ success: true }, config)
  if (m === 'post'  && u.startsWith('/api/auth/admin/reject-teacher'))  return ok({ success: true }, config)
  if (m === 'patch' && u.match(/\/api\/auth\/admin\/users\/\d+\/role/)) return ok({ success: true }, config)

  // ── Hero ──────────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/hero')            return ok(MOCK_HERO, config)
  if (m === 'get' && u === '/api/admin/hero')      return ok(MOCK_HERO, config)
  if (m === 'post' && u === '/api/admin/hero')     return ok({ ...MOCK_HERO[0], id: 99 }, config)
  if (m === 'put'  && u.startsWith('/api/admin/hero/')) return ok(MOCK_HERO[0], config)
  if (m === 'delete' && u.startsWith('/api/admin/hero/')) return ok({ success: true }, config)

  // ── Categories ────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/courses/categories') return ok(MOCK_CATEGORIES, config)

  // ── Courses ───────────────────────────────────────────────────────────────
  if (m === 'get'  && u === '/api/courses')           return ok({ courses: MOCK_COURSES, total: MOCK_COURSES.length }, config)
  if (m === 'get'  && u === '/api/courses/mine')      return ok(MOCK_COURSES.slice(0, 2), config)
  if (m === 'post' && u === '/api/courses')           return ok({ ...MOCK_COURSES[0], id: 99, title: 'Yangi kurs' }, config)
  if (m === 'get'  && u.match(/^\/api\/courses\/\d+\/reviews/)) {
    const courseId = seg(url, '/api/courses')
    const reviews = (courseId !== null && MOCK_COURSE_REVIEWS[courseId]) ? MOCK_COURSE_REVIEWS[courseId] : MOCK_REVIEWS
    return ok(reviews, config)
  }
  if (m === 'get'  && u.match(/^\/api\/courses\/\d+\/my-rating/)) {
    return ok({ rating: 0, review: '' }, config)
  }
  if (m === 'post' && u.match(/^\/api\/courses\/\d+\/rate/))  return ok({ success: true }, config)
  if (m === 'get'  && u.match(/^\/api\/courses\/\d+$/)) {
    const id = seg(url, '/api/courses')
    const course = MOCK_COURSES.find(c => c.id === id) ?? MOCK_COURSES[0]
    return ok(course, config)
  }
  if (m === 'patch'  && u.match(/^\/api\/courses\/\d+$/)) return ok(MOCK_COURSES[0], config)
  if (m === 'delete' && u.match(/^\/api\/courses\/\d+$/)) return ok({ success: true }, config)

  // Admin courses
  if (m === 'get'   && u === '/api/admin/courses')   return ok({ courses: MOCK_COURSES, total: MOCK_COURSES.length }, config)
  if (m === 'patch' && u.match(/\/api\/admin\/courses\/\d+\/publish/)) return ok({ success: true }, config)
  if (m === 'delete' && u.match(/\/api\/admin\/courses\/\d+/))         return ok({ success: true }, config)

  // ── Enrollments ───────────────────────────────────────────────────────────
  if (m === 'get'  && u === '/api/enrollments/mine')   return ok(MOCK_ENROLLMENTS, config)
  if (m === 'get'  && u === '/api/enrollments/check')  return ok({ enrolled: true, enrollment: MOCK_ENROLLMENTS[0] }, config)
  if (m === 'post' && u === '/api/enrollments/enroll') return ok({ success: true, enrollment: MOCK_ENROLLMENTS[0] }, config)
  if (m === 'delete' && u === '/api/enrollments/enroll') return ok({ success: true }, config)
  if (m === 'post' && u === '/api/enrollments/create-invoice-link') return ok({ invoice_link: '#mock-invoice', order_id: 'MOCK_ENR_001' }, config)
  if (m === 'post' && u === '/api/enrollments/confirm-payment')     return ok({ success: true, status: 'paid' }, config)
  if (m === 'get'  && u.match(/^\/api\/enrollments\/order\//))      return ok({ status: 'paid', order_id: 'MOCK_ENR_001' }, config)

  // ── Lessons ───────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/lessons/my-progress')             return ok({ completed_lesson_ids: [1, 2] }, config)
  if (m === 'get' && u === '/api/lessons/my-course-certificates')  return ok([], config)
  if (m === 'get' && u === '/api/lessons')                         return ok(MOCK_LESSONS, config)
  if (m === 'post' && u === '/api/lessons')                        return ok({ ...MOCK_LESSONS[0], id: 99 }, config)
  if (m === 'patch' && u === '/api/lessons/reorder')               return ok({ success: true }, config)
  if (m === 'post' && u.match(/^\/api\/lessons\/\d+\/complete/))   return ok({ success: true, xp_gained: 10 }, config)
  if (m === 'get' && u.match(/^\/api\/lessons\/\d+$/)) {
    const id = seg(url, '/api/lessons')
    const lesson = MOCK_LESSONS.find(l => l.id === id) ?? MOCK_LESSONS[0]
    return ok(lesson, config)
  }
  if (m === 'patch'  && u.match(/^\/api\/lessons\/\d+$/)) return ok(MOCK_LESSONS[0], config)
  if (m === 'delete' && u.match(/^\/api\/lessons\/\d+$/)) return ok({ success: true }, config)

  // ── Books ─────────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/books')                         return ok({ books: MOCK_BOOKS, total: MOCK_BOOKS.length }, config)
  if (m === 'get' && u === '/api/admin/books')                   return ok({ books: MOCK_BOOKS, total: MOCK_BOOKS.length }, config)
  if (m === 'get' && u.match(/^\/api\/books\/\d+\/my-rating/))   return ok({ rating: 4 }, config)
  if (m === 'get' && u.match(/^\/api\/books\/\d+\/download/))    return ok({ download_url: '#mock-download' }, config)
  if (m === 'post' && u.match(/^\/api\/books\/\d+\/rate/))       return ok({ success: true }, config)
  if (m === 'get' && u.match(/^\/api\/books\/\d+$/)) {
    const id = seg(url, '/api/books')
    const book = MOCK_BOOKS.find(b => b.id === id) ?? MOCK_BOOKS[0]
    return ok(book, config)
  }
  if (m === 'post'   && u === '/api/admin/books')                  return ok({ ...MOCK_BOOKS[0], id: 99 }, config)
  if (m === 'put'    && u.match(/\/api\/admin\/books\/\d+/))       return ok(MOCK_BOOKS[0], config)
  if (m === 'delete' && u.match(/\/api\/admin\/books\/\d+/))       return ok({ success: true }, config)

  // ── Quizzes ───────────────────────────────────────────────────────────────
  if (m === 'get'  && u === '/api/quizzes')                return ok(MOCK_QUIZZES, config)
  if (m === 'get'  && u === '/api/admin/quizzes')          return ok(MOCK_QUIZZES, config)
  if (m === 'post' && u === '/api/admin/quizzes/upload')   return ok({ success: true, quiz_id: 99 }, config)
  if (m === 'delete' && u.match(/\/api\/admin\/quizzes\/\d+/)) return ok({ success: true }, config)
  if (m === 'post' && u.match(/^\/api\/quizzes\/\d+\/verify/)) {
    return ok({ score: 4, total: 5, percentage: 80, passed: true, certificate_eligible: true, result_token: 'MOCK_CERT_TOKEN', xp_gained: 50 }, config)
  }
  if (m === 'get' && u.match(/^\/api\/quizzes\/\d+$/)) {
    const id = seg(url, '/api/quizzes')
    const quiz = (id !== null && MOCK_QUIZ_DETAILS[id]) ? MOCK_QUIZ_DETAILS[id] : MOCK_QUIZ_DETAIL
    return ok(quiz, config)
  }

  // ── Resources ─────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/resources') return ok(MOCK_RESOURCES, config)

  // ── Audio / Ambient Sounds ────────────────────────────────────────────────
  if (m === 'get'    && u === '/api/audio/ambient-sounds')             return ok(MOCK_AMBIENT_SOUNDS, config)
  if (m === 'post'   && u.includes('/api/audio/admin/ambient-sounds')) return ok({ ...MOCK_AMBIENT_SOUNDS[0], id: 99 }, config)
  if (m === 'delete' && u.includes('/api/audio/admin/ambient-sounds')) return ok({ success: true }, config)

  // ── Profiles ──────────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/profiles/teachers') return ok(MOCK_TEACHERS, config)
  if (m === 'get' && u === '/api/profiles/heatmap')  return ok(MOCK_HEATMAP, config)

  // ── Teacher profile ───────────────────────────────────────────────────────
  if (m === 'get'   && u === '/api/teacher/profile')             return ok(MOCK_TEACHER_PROFILE, config)
  if (m === 'patch' && u === '/api/teacher/profile')             return ok(MOCK_TEACHER_PROFILE, config)
  if (m === 'get'   && u === '/api/teacher/analytics')           return ok(MOCK_TEACHER_ANALYTICS, config)
  if (m === 'get'   && u.match(/^\/api\/teacher\/profile\/\d+/)) return ok(MOCK_TEACHERS[0], config)

  // ── Admin stats ───────────────────────────────────────────────────────────
  if (m === 'get' && u === '/api/admin/dashboard/stats')    return ok(MOCK_ADMIN_STATS, config)
  if (m === 'get' && u === '/api/admin/platform-analytics') return ok(MOCK_PLATFORM_ANALYTICS, config)
  if (m === 'get' && u === '/api/admin/debug')              return ok({ db: 'ok', tables: ['user', 'quiz', 'book'] }, config)

  // ── Payments — unified /api/pay ───────────────────────────────────────────
  if (m === 'post' && u === '/api/pay/init')      return ok(MOCK_PAYMENT_ORDER, config)
  if (m === 'post' && u === '/api/pay/confirm')   return ok({ success: true, status: 'paid', order_id: MOCK_PAYMENT_ORDER.order_id }, config)
  if (m === 'get'  && u.match(/^\/api\/pay\//))   return ok({ ...MOCK_PAYMENT_ORDER, status: 'paid' }, config)

  // ── Payments — legacy /api/payments ──────────────────────────────────────
  if (m === 'get'  && u === '/api/payments/check-purchase')        return ok({ purchased: false }, config)
  if (m === 'post' && u === '/api/payments/create-order')          return ok(MOCK_PAYMENT_ORDER, config)
  if (m === 'post' && u === '/api/payments/create-invoice-link')   return ok({ invoice_link: '#mock-invoice' }, config)
  if (m === 'post' && u === '/api/payments/confirm-payment')       return ok({ success: true }, config)
  if (m === 'get'  && u.match(/^\/api\/payments\/order\//))        return ok({ ...MOCK_PAYMENT_ORDER, status: 'paid' }, config)
  if (m === 'get'  && u === '/api/payments/debug-config')          return ok({ click: 'configured', payme: 'configured', stars: 'configured' }, config)

  // ── Products / Cart (legacy) ──────────────────────────────────────────────
  if (m === 'get' && u.startsWith('/api/products')) return ok({ items: [], total: 0 }, config)
  if (m === 'get' && u.startsWith('/api/cart'))     return ok({ items: [], total: 0 }, config)
  if (m === 'get' && u.startsWith('/api/users'))    return ok(MOCK_USER, config)

  // ── Fallback ──────────────────────────────────────────────────────────────
  console.warn(`[mockAdapter] ⚠️  Unmatched ${m.toUpperCase()} ${url} — returning {}`)
  return ok({}, config)
}

// ── Exported axios adapter ────────────────────────────────────────────────────

export function mockAxiosAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url    = config.url ?? ''
  const method = config.method ?? 'get'
  console.debug(`[mockAdapter] → ${method.toUpperCase()} ${url}`)
  // 120 ms simulated latency so loading states are visible
  return new Promise(resolve => setTimeout(() => resolve(route(url, method, config)), 120))
}

// ── Auth seed ────────────────────────────────────────────────────────────────

/** Call once at app startup (main.tsx) when VITE_DEV_MOCK=true. */
export function initMockAuth() {
  if (!DEV_MOCK) return
  localStorage.setItem('auth_token', 'dev_mock_token')
  console.info(
    '%c[DEV MOCK] 🟠 Mock mode active — no real network calls will be made.',
    'background:#F15929;color:#fff;padding:3px 8px;border-radius:4px;font-weight:bold',
  )
}

// ── Supabase leaderboard cache seed ──────────────────────────────────────────

/**
 * Seeds the Supabase TTL-cache in localStorage so the LeaderboardPage renders
 * mock data instead of the "Supabase not configured" placeholder.
 *
 * Cache key format mirrors supabase.ts: `sc:<key>`.
 * The leaderboard queries supabase directly (no cache key from supabase.ts),
 * so we short-circuit via isSupabaseConfigured=false instead, and the page
 * will handle it gracefully.  This function is kept for future use.
 */
export function seedSupabaseCache() {
  if (!DEV_MOCK) return
  const far = Date.now() + 365 * 24 * 60 * 60 * 1000
  const write = (key: string, data: unknown) => {
    try {
      localStorage.setItem(`sc:${key}`, JSON.stringify({ data, expiresAt: far }))
    } catch { /* quota */ }
  }
  write('leaderboard:top', MOCK_LEADERBOARD)
  write('ambient_sounds', MOCK_AMBIENT_SOUNDS)
  // Seed books + quizzes so supabase.ts fetchBooks() / fetchQuizzes() / fetchQuiz(id)
  // return mock data without hitting the (offline in dev) FastAPI backend.
  write('books', MOCK_BOOKS)
  write('quizzes', MOCK_QUIZZES)
  MOCK_BOOKS.forEach(b  => write(`book:${b.id}`, b))
  Object.entries(MOCK_QUIZ_DETAILS).forEach(([id, detail]) => write(`quiz:${id}`, detail))
}
