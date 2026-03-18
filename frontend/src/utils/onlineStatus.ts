const ONLINE_WINDOW_MS = 90 * 1000

export function isUserOnline(appOnlineAt?: string | null): boolean {
  if (!appOnlineAt) return false

  const ts = new Date(appOnlineAt).getTime()
  if (Number.isNaN(ts)) return false

  return Date.now() - ts <= ONLINE_WINDOW_MS
}
