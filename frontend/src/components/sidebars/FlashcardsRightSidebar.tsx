/**
 * FlashcardsRightSidebar — right sidebar for /flashcards (desktop only, xl+).
 *
 * Cards:
 *   1. "Kartalar haqida" — static info on spaced repetition (SM-2)
 *   2. "Bugungi holat" — live stats (due/mastered/reviewed today),
 *      fetched independently of FlashcardsPage — same self-contained-
 *      sidebar pattern as every other *RightSidebar in this folder.
 */
import React, { useEffect, useState } from 'react'
import { Brain, Flame, CheckCircle2 } from 'lucide-react'
import apiService from '../../services/apiService'
import SidebarCard from './SidebarCard'
import type { FlashcardStats } from '../../types/flashcards'

const FlashcardsRightSidebar: React.FC = () => {
  const [stats, setStats] = useState<FlashcardStats | null>(null)

  useEffect(() => {
    let cancelled = false
    apiService.getFlashcardStats()
      .then(({ data }) => { if (!cancelled) setStats(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <SidebarCard title="Kartalar haqida">
        <div className="space-y-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="flex items-start gap-2">
            <Brain className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            Aralashib takrorlash (spaced repetition) — unutish arafasida qayta ko'rish orqali eslab qolish samaraliroq bo'ladi.
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            Har bir javobingizga qarab keyingi takrorlash vaqti avtomatik hisoblanadi.
          </p>
        </div>
      </SidebarCard>

      <SidebarCard title="Bugungi holat">
        {stats ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-tertiary)' }}>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats.total_due}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Bugun kerak</p>
            </div>
            <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-tertiary)' }}>
              <p className="text-lg font-bold inline-flex items-center justify-center gap-1" style={{ color: 'var(--text-primary)' }}>
                <Flame className="h-3.5 w-3.5 text-orange-500" />{stats.today_reviewed}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Bugun ko'rildi</p>
            </div>
          </div>
        ) : (
          <div className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
        )}
      </SidebarCard>
    </>
  )
}

export default FlashcardsRightSidebar
