import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchHeroContent } from '../lib/supabase'
import { MegaphoneIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline'

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
      <div className="surface-card p-6 mb-8 animate-pulse">
        <div className="h-4 bg-gray-100 dark:bg-[#202020] rounded w-1/3 mb-4" />
        <div className="h-5 bg-gray-100 dark:bg-[#202020] rounded w-full mb-2" />
        <div className="h-5 bg-gray-100 dark:bg-[#202020] rounded w-3/4" />
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
      className="surface-card relative mb-8 overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sahifa-500/50 to-transparent" />

      <div className="relative p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-sahifa-500/10 text-sahifa-600 dark:text-sahifa-400 flex items-center justify-center">
            {isAnnouncement ? <MegaphoneIcon className="w-[18px] h-[18px]" /> : <ChatBubbleBottomCenterTextIcon className="w-[18px] h-[18px]" />}
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400 font-semibold">
            {isAnnouncement ? 'E\'lon' : 'Kun iqtibosi'}
          </p>
        </div>

        <blockquote className="text-[20px] sm:text-[22px] font-semibold leading-[1.45] text-gray-900 dark:text-white tracking-[-0.02em]">
          {hero.text}
        </blockquote>

        <div className="flex items-center gap-2 pt-1">
          <div className="w-8 h-px bg-sahifa-500/40" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {hero.author}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export default HeroSection
