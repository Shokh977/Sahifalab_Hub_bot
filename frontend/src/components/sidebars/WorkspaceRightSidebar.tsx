/**
 * WorkspaceRightSidebar — right sidebar for /workspace page.
 *
 * Cards:
 *   1. Bugungi statistika — XP earned today, task counts, streak
 *   2. Kunlik maqsad     — daily goal progress ring
 *   3. O'qish tavsiyasi  — rotating motivational quote
 *   4. O'qituvchi bo'lish — CTA for non-teacher users
 */

import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Zap, CheckSquare, GraduationCap, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useProgressStore } from '../../context/progressStore'
import SidebarCard from './SidebarCard'

// ── Motivational quotes ───────────────────────────────────────────────────────

const QUOTES = [
  { text: "Bilim — eng yaxshi investitsiya.", author: "Benjamin Franklin" },
  { text: "Har kuni bir qadam oldinga — bu muvaffaqiyat yo'li.", author: "Sahifalab" },
  { text: "O'qigan odam — o'zgargan odam.", author: "Konfutsiy" },
  { text: "Kecha yaxshi bo'ldi. Bugun undan yaxshiroq bo'l.", author: "Sahifalab" },
  { text: "Ilm — qorong'uni yorituvchi nur.", author: "Alisher Navoiy" },
  { text: "Kitob o'qigan odam — dunyoni ko'rgan odam.", author: "Sahifalab" },
  { text: "Har bir fokus sessiyasi — kelajakka qo'yilgan g'isht.", author: "Sahifalab" },
  { text: "Muvaffaqiyat — har kuni kichik harakatlarning yig'indisi.", author: "Robert Collier" },
]

// ── Circular progress ring component ─────────────────────────────────────────

const ProgressRing: React.FC<{ percent: number; size?: number; stroke?: number; color?: string }> = ({
  percent, size = 72, stroke = 7, color = '#e8792f',
}) => {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="var(--border-default)" strokeWidth={stroke} fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

// ── Main sidebar component ────────────────────────────────────────────────────

const WorkspaceRightSidebar: React.FC = () => {
  const { user } = useAuth()
  const { totalXP, level, totalFocusMinutes } = useProgressStore()

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  // Pick a random quote (stable per session via useMemo)
  const quote = useMemo(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Daily goal progress (mock: target 3h focus / 5 tasks per day)
  // In production this would come from an API call
  const goalFocus  = 3   // hours target
  const goalTasks  = 5   // tasks target
  const focusDone  = Math.min((user as any)?.focus_hours ?? 0, goalFocus)
  const tasksDone  = 0   // planner tasks completed today — placeholder
  const overallPct = Math.round(
    ((focusDone / goalFocus) * 50 + (tasksDone / goalTasks) * 50)
  )

  return (
    <>
      {/* ── Card 1: Bugungi statistika ───────────────────────────────── */}
      <SidebarCard title="Bugungi statistika">
        <div className="space-y-2.5">
          {/* XP */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: 'rgba(232,121,47,0.12)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#e8792f' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {totalXP.toLocaleString()} XP
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Jami ball · Daraja {level}</p>
            </div>
          </div>

          {/* Focus time */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: 'rgba(239,68,68,0.10)' }}>
              <Flame className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {Math.floor((totalFocusMinutes ?? 0) / 60)}h {(totalFocusMinutes ?? 0) % 60}m
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Jami fokus vaqti</p>
            </div>
          </div>

          {/* Tasks placeholder */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: 'rgba(34,197,94,0.10)' }}>
              <CheckSquare className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Rejadagi vazifalar
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Kanban'dan kuzating</p>
            </div>
          </div>
        </div>
      </SidebarCard>

      {/* ── Card 2: Kunlik maqsad ────────────────────────────────────── */}
      <SidebarCard title="Kunlik maqsad">
        <div className="flex items-center gap-3">
          {/* Ring */}
          <div className="relative flex-shrink-0">
            <ProgressRing percent={overallPct} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                {overallPct}%
              </span>
            </div>
          </div>
          {/* Labels */}
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Fokus vaqt</p>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {focusDone.toFixed(1)} / {goalFocus}h
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Vazifalar</p>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {tasksDone} / {goalTasks}
              </p>
            </div>
          </div>
        </div>
        {overallPct >= 100 && (
          <p className="mt-3 text-center text-xs font-bold text-green-400">
            Kunlik reja bajarildi! 🎉
          </p>
        )}
      </SidebarCard>

      {/* ── Card 3: O'qish tavsiyasi ─────────────────────────────────── */}
      <SidebarCard title="O'qish tavsiyasi">
        <div className="space-y-2">
          <div className="pl-3 border-l-2" style={{ borderColor: '#e8792f' }}>
            <p className="text-xs leading-relaxed italic" style={{ color: 'var(--text-secondary)' }}>
              "{quote.text}"
            </p>
          </div>
          <p className="text-[10px] text-right" style={{ color: 'var(--text-muted)' }}>
            — {quote.author}
          </p>
        </div>
      </SidebarCard>

      {/* ── Card 4: O'qituvchi bo'lish (non-teacher only) ─────────────── */}
      {!isTeacher && (
        <div className="rounded-2xl p-4 border"
             style={{
               background: 'linear-gradient(135deg, rgba(232,121,47,0.12), rgba(196,74,26,0.06))',
               borderColor: 'rgba(232,121,47,0.20)',
             }}>
          <div className="flex items-start gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: '#e8792f' }}>
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                O'qituvchi bo'lish
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Bilimingizni ulashing · 70% komissiya
              </p>
            </div>
          </div>
          <Link
            to="/become-teacher"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#e8792f' }}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Ariza topshirish
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </>
  )
}

export default WorkspaceRightSidebar
