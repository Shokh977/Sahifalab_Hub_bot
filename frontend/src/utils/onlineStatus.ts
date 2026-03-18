const ONLINE_WINDOW_MS = 7 * 60 * 1000

export function isUserOnline(updatedAt?: string | null): boolean {
  if (!updatedAt) return false

  const ts = new Date(updatedAt).getTime()
  if (Number.isNaN(ts)) return false

  return Date.now() - ts <= ONLINE_WINDOW_MS
}
