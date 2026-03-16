import React, { useEffect, useState } from 'react'
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
      <div className="bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white py-8 px-4 rounded-lg mb-6 animate-pulse">
        <div className="h-12 bg-white/20 rounded w-3/4 mx-auto"></div>
      </div>
    )
  }

  if (!hero) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white py-8 px-4 rounded-lg mb-6 shadow-lg">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest opacity-75">
          {(hero.type || hero.quote_type) === 'announcement' ? '📢 Latest Announcement' : '💡 Quote of the Day'}
        </p>
        <blockquote className="text-lg font-semibold leading-relaxed">
          "{hero.text}"
        </blockquote>
        <p className="text-sm opacity-90 text-right">
          — {hero.author}
        </p>
      </div>
    </div>
  )
}

export default HeroSection
