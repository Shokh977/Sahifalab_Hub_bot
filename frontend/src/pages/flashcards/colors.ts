export function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex
}

function shade(hex: string, percent: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const num = parseInt(hex.slice(1), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp(((num >> 16) & 0xff) + Math.round(255 * percent))
  const g = clamp(((num >> 8) & 0xff) + Math.round(255 * percent))
  const b = clamp((num & 0xff) + Math.round(255 * percent))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/** A 2-stop gradient derived from one deck color — lighter → darker. */
export function gradientFromColor(hex: string): [string, string] {
  return [shade(hex, 0.18), shade(hex, -0.22)]
}

export function deckCode(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? '?').slice(0, 3).toUpperCase()
}
