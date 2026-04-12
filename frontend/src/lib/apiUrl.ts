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
const raw = (
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'
)
  .replace(/\/+$/, '')                                              // strip trailing /
  .replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://')      // force HTTPS in production

export const API_BASE = raw
export default API_BASE
