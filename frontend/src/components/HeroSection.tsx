import React, { useEffect, useState } from 'react'
import apiService from '@services/apiService'

interface Quote {
  id: number
  text: string
  author: string
  type: 'quote' | 'announcement'
}

export const HeroSection: React.FC = () => {
  const [hero, setHero] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHero = async () => {
      try {
        const response = await apiService.getHeroContent()
        setHero(response.data)
      } catch (error) {
        console.error('Failed to fetch hero content:', error)
      } finally {
        setLoading(false)
      }
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
    return (
      <div className="bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white py-8 px-4 rounded-lg mb-6">
        <p className="text-center text-sm opacity-80">Loading inspiration...</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white py-8 px-4 rounded-lg mb-6 shadow-lg">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest opacity-75">
          {hero.type === 'quote' ? '💡 Quote of the Day' : '📢 Latest Announcement'}
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
