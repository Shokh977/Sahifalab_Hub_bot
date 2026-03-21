import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchHeroContent } from '../lib/supabase'

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
  { id: 4, text: "Success is the product of daily habits—not once-in-a-lifetime transformations.", author: "James Clear", type: 'quote' },
  { id: 5, text: "Bilim va odob — insonning eng katta boyligidir.", author: "Alisher Navoiy", type: 'quote' },
  { id: 6, text: "Deep work is the superpower of the 21st century.", author: "Cal Newport", type: 'quote' },
  { id: 7, text: "Vaqt — bu sarflash uchun emas, investitsiya qilish uchun berilgan ne'mat.", author: "SAHIFALAB", type: 'quote' },
  { id: 8, text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin", type: 'quote' },
  { id: 9, text: "Ilm o'rganishda charchoq yo'q, faqat lazzat bor.", author: "Imom Buxoriy", type: 'quote' },
  { id: 10, text: "Quality over quantity: One hour of deep focus is better than eight hours of distraction.", author: "SAHIFALAB", type: 'quote' },
  { id: 11, text: "The secret of change is to focus all of your energy, not on fighting the old, but on building the new.", author: "Socrates", type: 'quote' },
  { id: 12, text: "Haqiqiy bilim — bu amaliyotda qo'llanilgan bilimdir.", author: "SAHIFALAB", type: 'quote' },
  { id: 13, text: "Learn to be lonely, learn to be focused, learn to be great.", author: "Naval Ravikant", type: 'quote' }
]

export const HeroSection: React.FC = () => {
  const [hero, setHero] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHero = async () => {
      try {
        const content = await fetchHeroContent()
        if (content) {
          setHero(content as Quote)
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
      {/* Gradient background — light: subtle warm, dark: deep orange-red */}
      <div className="absolute inset-0 bg-gradient-to-br from-sahifa-100/80 via-sahifa-50 to-orange-50 dark:from-sahifa-600/90 dark:via-sahifa-700/80 dark:to-red-900/70" />

      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 backdrop-blur-sm bg-white/30 dark:bg-white/[0.03]" />

      {/* Decorative elements */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-sahifa-300/20 dark:bg-sahifa-400/20 rounded-full blur-2xl" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-orange-200/25 dark:bg-orange-300/15 rounded-full blur-xl" />

      {/* Content */}
      <div className="relative p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl animate-float">
            {isAnnouncement ? '📢' : '✦'}
          </span>
          <p className="text-[11px] uppercase tracking-[0.2em] text-sahifa-700/80 dark:text-sahifa-200/80 font-semibold">
            {isAnnouncement ? 'E\'lon' : 'Kun iqtibosi'}
          </p>
        </div>

        {/* Quote */}
        <blockquote className="text-lg font-semibold leading-relaxed text-gray-900/90 dark:text-white/95 tracking-wide">
          <span className="text-sahifa-400/60 dark:text-sahifa-300/60 text-2xl leading-none mr-1">"</span>
          {hero.text}
          <span className="text-sahifa-400/60 dark:text-sahifa-300/60 text-2xl leading-none ml-1">"</span>
        </blockquote>

        {/* Author */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-6 h-px bg-gradient-to-r from-sahifa-400/50 to-transparent" />
          <p className="text-sm font-medium text-sahifa-700/70 dark:text-sahifa-200/70 italic">
            {hero.author}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default HeroSection
