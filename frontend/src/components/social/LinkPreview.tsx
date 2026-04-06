/**
 * LinkPreview — Beautiful link preview card for the Slooth Messenger.
 * Fetches og:title, og:description, og:image from URLs using a CORS proxy.
 */

import React, { useEffect, useState } from 'react'
import { ExternalLink, Globe } from 'lucide-react'

interface LinkMeta {
  title?: string
  description?: string
  image?: string
  siteName?: string
  url: string
}

interface Props {
  url: string
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi

export function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) || []
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

const LinkPreview: React.FC<Props> = ({ url }) => {
  const [meta, setMeta] = useState<LinkMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    // Use a lightweight CORS proxy or just show domain fallback
    const fetchMeta = async () => {
      try {
        // Try fetching with a CORS proxy (allorigins)
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) })
        const html = await resp.text()

        const doc = new DOMParser().parseFromString(html, 'text/html')
        const og = (prop: string) =>
          doc.querySelector(`meta[property="og:${prop}"]`)?.getAttribute('content') ||
          doc.querySelector(`meta[name="og:${prop}"]`)?.getAttribute('content')

        if (!cancelled) {
          setMeta({
            title: og('title') || doc.querySelector('title')?.textContent || getDomain(url),
            description: og('description') || doc.querySelector('meta[name="description"]')?.getAttribute('content') || '',
            image: og('image') || undefined,
            siteName: og('site_name') || getDomain(url),
            url,
          })
        }
      } catch {
        if (!cancelled) {
          // Fallback: just show domain
          setMeta({ title: getDomain(url), url, siteName: getDomain(url) })
        }
      }
      if (!cancelled) setLoading(false)
    }

    fetchMeta()
    return () => { cancelled = true }
  }, [url])

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 animate-pulse">
        <div className="h-3 bg-white/[0.06] rounded w-3/4 mb-2" />
        <div className="h-2 bg-white/[0.04] rounded w-1/2" />
      </div>
    )
  }

  if (!meta) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden hover:bg-white/[0.06] transition-colors group"
    >
      {meta.image && (
        <div className="w-full h-32 bg-pitch-700 overflow-hidden">
          <img
            src={meta.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Globe className="w-3 h-3 text-white/30 flex-shrink-0" />
          <span className="text-[11px] text-white/30 truncate">{meta.siteName || getDomain(url)}</span>
          <ExternalLink className="w-2.5 h-2.5 text-white/20 ml-auto flex-shrink-0" />
        </div>
        {meta.title && (
          <p className="text-sm font-medium text-white/80 line-clamp-2 leading-snug">
            {meta.title}
          </p>
        )}
        {meta.description && (
          <p className="text-xs text-white/40 line-clamp-2 mt-1 leading-relaxed">
            {meta.description}
          </p>
        )}
      </div>
    </a>
  )
}

export default LinkPreview
