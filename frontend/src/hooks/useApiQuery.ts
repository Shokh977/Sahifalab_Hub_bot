/**
 * useApiQuery — lightweight React Query wrappers around existing data sources.
 *
 * These hooks replace the manual useEffect + useState + loading/error pattern
 * with declarative React Query primitives. They call the SAME backend endpoints
 * already used in supabase.ts / apiService.ts, so no backend changes needed.
 *
 * Migration guide:
 *   BEFORE:
 *     const [data, setData] = useState([])
 *     const [loading, setLoading] = useState(true)
 *     useEffect(() => { fetchBooks().then(setData).finally(() => setLoading(false)) }, [])
 *
 *   AFTER:
 *     const { data = [], isLoading } = useBooks()
 */
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'

import { API_BASE as API } from '../lib/apiUrl'

/** Helper — JSON GET with auth header if available */
async function authFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('auth_token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ── Static / semi-static content (long staleTime) ────────────────────────────

const STATIC = { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 }   // 30 min / 1 hr
const LIVE   = { staleTime: 2 * 60 * 1000,  gcTime: 10 * 60 * 1000 }   //  2 min / 10 min

/** All books (list view — no file_url) */
export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: () => authFetch<any[]>('/api/books'),
    ...STATIC,
  })
}

/** Single book by ID */
export function useBook(bookId: number | undefined) {
  return useQuery({
    queryKey: ['book', bookId],
    queryFn: () => authFetch<any>(`/api/books/${bookId}`),
    enabled: !!bookId,
    ...STATIC,
  })
}

/** All quizzes */
export function useQuizzes() {
  return useQuery({
    queryKey: ['quizzes'],
    queryFn: () => authFetch<any[]>('/api/quizzes?limit=100'),
    ...STATIC,
  })
}

/** Single quiz with questions */
export function useQuiz(quizId: number | undefined) {
  return useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => authFetch<any>(`/api/quizzes/${quizId}`),
    enabled: !!quizId,
    ...STATIC,
  })
}

/** All resources */
export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: () => authFetch<any[]>('/api/resources'),
    ...STATIC,
  })
}

/** Active ambient sounds */
export function useAmbientSounds() {
  return useQuery({
    queryKey: ['ambient_sounds'],
    queryFn: () => authFetch<any[]>('/api/audio/ambient-sounds'),
    ...STATIC,
  })
}

/** Hero content (banners) */
export function useHeroContent() {
  return useQuery({
    queryKey: ['hero_content'],
    queryFn: async () => {
      const items = await authFetch<any[]>('/api/hero/all')
      const active = items.filter(i => i.is_active)
      if (!active.length) return null
      const item = active[Math.floor(Math.random() * active.length)]
      return {
        ...item,
        text: item.title || item.description || '',
        author: item.subtitle || 'SAHIFALAB',
        quote_type: item.cta_link ? 'announcement' : 'quote',
      }
    },
    ...STATIC,
  })
}

/** Course categories */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => authFetch<any[]>('/api/courses/categories'),
    ...STATIC,
  })
}

// ── Live / frequently-changing content ───────────────────────────────────────

/** Leaderboard — top N */
export function useLeaderboard(limit = 100) {
  return useQuery({
    queryKey: ['leaderboard', limit],
    queryFn: () => authFetch<any[]>(`/api/profiles/leaderboard?limit=${limit}`),
    ...LIVE,
  })
}

/** Dashboard stats */
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: () => authFetch<any>('/api/profiles/dashboard-stats'),
    ...LIVE,
  })
}

// ── User-specific (personal data) ────────────────────────────────────────────

/** User's completed quizzes */
export function useMyCompletions(telegramId: number | undefined) {
  return useQuery({
    queryKey: ['completions', telegramId],
    queryFn: () => authFetch<any[]>(`/api/profiles/${telegramId}/completions`),
    enabled: !!telegramId,
    ...LIVE,
  })
}

/** User's purchased books */
export function useMyPurchases(telegramId: number | undefined) {
  return useQuery({
    queryKey: ['purchases', telegramId],
    queryFn: () => authFetch<any[]>(`/api/profiles/${telegramId}/purchases`),
    enabled: !!telegramId,
    ...LIVE,
  })
}

// ── Infinite / paginated queries ─────────────────────────────────────────────

interface CoursesPageParams {
  category?: string
  search?: string
  level?: string
  sort?: string
}

/** Paginated courses with filters — for CoursesPage "Load More" */
export function useInfiniteCourses(filters: CoursesPageParams) {
  return useInfiniteQuery({
    queryKey: ['courses', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams()
      params.set('skip', String(pageParam))
      params.set('limit', '12')
      if (filters.category) params.set('category', filters.category)
      if (filters.search) params.set('search', filters.search)
      if (filters.level) params.set('level', filters.level)
      if (filters.sort) params.set('sort', filters.sort)
      return authFetch<any[]>(`/api/courses?${params.toString()}`)
    },
    getNextPageParam: (lastPage, allPages) => {
      // If last page had < 12 items, no more pages
      if (lastPage.length < 12) return undefined
      return allPages.reduce((sum, p) => sum + p.length, 0)
    },
    initialPageParam: 0,
    ...LIVE,
  })
}

/** Paginated social feed — for SocialFeed "Load More" */
export function useInfiniteFeed(tab: string) {
  return useInfiniteQuery({
    queryKey: ['social_feed', tab],
    queryFn: async ({ pageParam = 1 }) => {
      const endpoint = tab === 'following' ? '/api/social/feed/following' : '/api/social/feed'
      return authFetch<any[]>(`${endpoint}?page=${pageParam}&limit=10`)
    },
    getNextPageParam: (lastPage, _all, lastPageParam) => {
      if (lastPage.length < 10) return undefined
      return (lastPageParam as number) + 1
    },
    initialPageParam: 1,
    ...LIVE,
  })
}
