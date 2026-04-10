/**
 * React Query — shared QueryClient configuration.
 *
 * Wrap your root <App /> with <QueryClientProvider client={queryClient}>
 * to enable useQuery / useMutation across the app.
 *
 * Default stale times are conservative so existing localStorage-based
 * cache in supabase.ts can be phased out gradually.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 2 minutes — no refetch during this window.
      staleTime: 2 * 60 * 1000,
      // Keep inactive data in memory for 10 minutes before GC.
      gcTime: 10 * 60 * 1000,
      // Retry once on failure, then surface error.
      retry: 1,
      // Don't spam refetches every time the browser tab regains focus.
      refetchOnWindowFocus: false,
    },
  },
})
