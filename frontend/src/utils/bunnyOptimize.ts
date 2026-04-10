/**
 * Bunny CDN Image Optimization
 *
 * Appends Bunny Optimizer query parameters to CDN-hosted image URLs.
 * Only applies to URLs matching the configured Bunny CDN hostname.
 * Non-Bunny URLs are returned unchanged.
 *
 * Bunny Optimizer docs:
 *   https://docs.bunny.net/docs/stream-image-processing
 *
 * Supported params: width, height, aspect_ratio, quality, format (webp/avif)
 */

const BUNNY_HOST = import.meta.env.VITE_BUNNY_CDN_HOST as string | undefined

/**
 * Optimized image URL with Bunny CDN query params.
 *
 * @param url       Original image URL (Bunny CDN or other)
 * @param width     Desired width in px
 * @param height    Optional height in px (auto-calculated if omitted)
 * @param quality   Quality 1-100 (default 85 — good balance)
 */
export function bunnyImg(
  url: string | null | undefined,
  width: number,
  height?: number,
  quality = 85,
): string {
  if (!url) return ''

  // Only optimize Bunny CDN URLs
  const isBunny = BUNNY_HOST
    ? url.includes(BUNNY_HOST)
    : url.includes('.b-cdn.net')

  if (!isBunny) return url

  // Strip any existing optimizer params to avoid double-applying
  const base = url.split('?')[0]
  const params = new URLSearchParams()
  params.set('width', String(width))
  if (height) params.set('height', String(height))
  params.set('quality', String(quality))
  params.set('format', 'webp')

  return `${base}?${params.toString()}`
}

/**
 * Preset sizes for common UI slots — call these instead of raw bunnyImg()
 * to keep thumbnail dimensions consistent across the app.
 */
export const thumb = {
  /** Course card thumbnail — 400×225 (16:9) */
  course: (url: string | null | undefined) => bunnyImg(url, 400, 225),
  /** Small course card / continue-learning — 160×90 */
  courseSmall: (url: string | null | undefined) => bunnyImg(url, 160, 90),
  /** Teacher/user avatar — 80×80 */
  avatar: (url: string | null | undefined) => bunnyImg(url, 80, 80, 90),
  /** Small avatar (inline) — 40×40 */
  avatarSmall: (url: string | null | undefined) => bunnyImg(url, 40, 40, 90),
  /** Book cover — 300×420 */
  book: (url: string | null | undefined) => bunnyImg(url, 300, 420),
  /** Hero banner — full width, 800px */
  hero: (url: string | null | undefined) => bunnyImg(url, 800),
}
