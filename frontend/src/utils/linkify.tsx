/**
 * linkify — Converts URLs in text to clickable <a> tags.
 *
 * Returns an array of React nodes: plain text strings and <a> elements.
 * Links are styled with sahifa-500 orange color.
 */
import React from 'react'

const URL_REGEX = /https?:\/\/[^\s<>'")\]]+/gi

export function linkify(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = new RegExp(URL_REGEX)
  while ((match = regex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    // Add the URL as a link
    const url = match[0]
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sahifa-500 hover:text-sahifa-400 hover:underline break-all transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    )
    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}
