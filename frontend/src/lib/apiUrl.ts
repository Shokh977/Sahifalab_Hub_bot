/**
 * apiUrl.ts — single source of truth for the backend API base URL.
 *
 * Every file that needs API_BASE should import from here instead of
 * constructing its own copy from VITE_API_URL.
 *
 * Safety features:
 *  • Strips trailing slash
 *  • Auto-upgrades http → https on non-localhost URLs (prevents mixed-content)
 */
const envUrl = import.meta.env.VITE_API_URL as string | undefined

// A production build missing VITE_API_URL must fail loudly at load time —
// silently falling back to localhost:8000 would point every real user's API
// traffic at their own machine, producing total, unexplained API failures.
if (!envUrl && import.meta.env.PROD) {
  throw new Error('VITE_API_URL is not set — refusing to fall back to localhost in a production build.')
}

const raw = (envUrl || 'http://localhost:8000')
  .replace(/\/+$/, '')                                              // strip trailing /
  .replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://')      // force HTTPS in production

export const API_BASE = raw
export default API_BASE
