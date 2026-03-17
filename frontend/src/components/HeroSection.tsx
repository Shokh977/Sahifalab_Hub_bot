import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import apiService from '@services/apiService'

interface Quote {
  id: number
  text: string
  author: string
  type?: 'quote' | 'announcement'
  quote_type?: string
}

const FALLBACK_QUOTES: Quote[] = [
  { id: 0, text: "Bilim olish har bir inson uchun farzdir.", author: "Hadis", type: 'quote' },
  { id: 1, text: "The only way to do great work is to love what you do.", author: "Steve Jobs", type: 'quote' },
  { id: 2, text: "O'qish — eng yaxshi sarmoya.", author: "SAHIFALAB", type: 'quote' },
  { id: 3, text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs", type: 'quote' },
]

export const HeroSection: React.FC = () => {
  const [hero, setHero] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHero = async () => {
      try {
        const response = await apiService.getHeroContent()
        if (response.data) {
          setHero(response.data)
          return
        }
      } catch (error) {
        console.error('Failed to fetch hero content:', error)
      } finally {
        setLoading(false)
      }
      // Fallback: pick a random local quote
      setHero(FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)])
    }

    fetchHero()
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-3xl p-6 mb-8 animate-pulse">
        <div className="h-4 bg-sahifa-500/10 rounded w-1/3 mb-4" />
        <div className="h-5 bg-sahifa-500/10 rounded w-full mb-2" />
        <div className="h-5 bg-sahifa-500/10 rounded w-3/4" />
      </div>
    )
  }

  if (!hero) {
    return null
  }

  const isAnnouncement = (hero.type || hero.quote_type) === 'announcement'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative rounded-3xl mb-8 overflow-hidden"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-sahifa-600/90 via-sahifa-700/80 to-red-900/70" />

      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 backdrop-blur-sm bg-white/[0.03]" />

      {/* Decorative elements */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-sahifa-400/20 rounded-full blur-2xl" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-orange-300/15 rounded-full blur-xl" />

      {/* Content */}
      <div className="relative p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl animate-float">
            {isAnnouncement ? '📢' : '✦'}
          </span>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sahifa-200/80 font-semibold">
            {isAnnouncement ? 'E\'lon' : 'Kun iqtibosi'}
          </p>
        </div>

        {/* Quote */}
        <blockquote className="text-lg font-semibold leading-relaxed text-white/95 tracking-wide">
          <span className="text-sahifa-300/60 text-2xl leading-none mr-1">"</span>
          {hero.text}
          <span className="text-sahifa-300/60 text-2xl leading-none ml-1">"</span>
        </blockquote>

        {/* Author */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-6 h-px bg-gradient-to-r from-sahifa-400/50 to-transparent" />
          <p className="text-sm font-medium text-sahifa-200/70 italic">
            {hero.author}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default HeroSection
