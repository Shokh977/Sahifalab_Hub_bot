/**
 * DashboardHome — $100K Bento-grid premium dashboard.
 *
 * Bento cells:
 *   â€¢ Hero glassmorphism banner (full-width)
 *   â€¢ Continue Learning widget
 *   â€¢ Circular XP progress ring + level
 *   â€¢ GitHub-style focus heatmap (52 weeks Ã— 7 days)
 *   â€¢ Focus Goal widget (dual rings + weekly bar sparkline)
 *   â€¢ Courses horizontal scroll
 *   â€¢ Daily quote (HeroSection)
 *
 * âš ï¸  Never rendered inside Telegram Mini App (App.tsx guards this).
 */
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  BookOpen,
  ChevronRight,
  Clock,
  Cpu,
  Play,
  LayoutList,
  Star,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  formatFocusTime,
  levelBounds,
  useProgressStore,
} from '../context/progressStore'
import HeroSection from './HeroSection'

const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'
).replace(/\/$/, '')

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CourseItem {
  id:             number
  title:          string
  description?:   string | null
  thumbnail_url?: string | null
  price:          number
  is_paid:        boolean
  level:          string
  rating:         number
  enrolled_count: number
  total_lessons:  number
  teacher_id:     number
  teacher_name?:  string | null
  teacher_photo?: string | null
  categories?:    { name: string; icon: string } | null
  progress?:      number
}

interface LastLesson {
  course_title:   string
  lesson_title:   string
  course_id:      number
  lesson_id:      number
  thumbnail_url?: string | null
  progress:       number
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LEVEL_LABELS: Record<string, string> = {
  beginner:     "Boshlang'ich",
  intermediate: "O'rta",
  advanced:     'Yuqori',
}
const ll = (l: string) => LEVEL_LABELS[l] ?? l

const DAILY_FOCUS_GOAL_MINS = 30
const DAILY_QUIZ_GOAL       = 3

// â”€â”€ Fade-in entrance variant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 18 },
  animate:    { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
})

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BENTO CELL 1: Hero glassmorphism banner
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const HeroBanner: React.FC<{
  user: { first_name: string; photo_url?: string | null }
  totalXP:    number
  level:      number
  focusSeconds: number
  xpPct:      number
  xpInLevel:  number
  xpForLevel: number
}> = ({ user, totalXP, level, focusSeconds, xpPct, xpInLevel, xpForLevel }) => {
  const navigate = useNavigate()

  const PILLS = [
    { icon: Clock,          label: "O'qish",   path: '/workspace?tab=focus', },
    { icon: LayoutList, label: 'Test',     path: '/quiz',         },
    { icon: Cpu,        label: 'AI',       path: '/ai-companion', },
    { icon: BookOpen,       label: 'Kitoblar', path: '/kitoblar',     },
  ]

  return (
    <motion.div {...fadeUp(0)} className="hero-glass col-span-12">
      
      <div className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-black/15 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)' }}
      />

      <div className="relative p-6 sm:p-8">
        {/* Row: avatar + name + pills */}
        <div className="flex flex-wrap items-start gap-5">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name}
              className="w-16 h-16 rounded-[20px] object-cover border-2 border-white/25 shadow-xl flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-[20px] bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-extrabold text-white">
                {user.first_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-white/60 text-sm">Assalomu alaykum 👋</p>
              <h1 className="text-2xl font-extrabold text-white tracking-tight truncate mt-0.5">
                {user.first_name}
              </h1>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {[
                { icon: Star,        val: totalXP.toLocaleString(), lbl: 'XP'     },
                { icon: GraduationCap, val: `L${level}`,              lbl: 'Daraja' },
                { icon: Clock,       val: formatFocusTime(focusSeconds), lbl: 'Fokus' },
              ].map(c => (
                <div key={c.lbl} className="stat-chip text-white">
                  <c.icon className="w-3.5 h-3.5 text-white/70" />
                  <span className="font-bold">{c.val}</span>
                  <span className="text-white/55 font-normal">{c.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {PILLS.map(p => {
              const Icon = p.icon
              return (
                <button
                  key={p.path}
                  onClick={() => navigate(p.path)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[14px] bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 text-white text-xs font-semibold transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        
        <div className="mt-5">
          <div className="flex justify-between text-white/55 text-[11px] mb-1.5 font-medium">
            <span>Daraja {level} → {level + 1}</span>
            <span>{xpInLevel.toLocaleString()} / {xpForLevel.toLocaleString()} XP</span>
          </div>
          <div className="h-2 bg-white/12 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-white/90 to-white/55"
              initial={{ width: 0 }}
              animate={{ width: `${xpPct}%` }}
              transition={{ duration: 1.4, ease: [0.34, 1.56, 0.64, 1] }}
            />
          </div>
        </div>
      </div>

      
      <div className="lg:hidden flex gap-2.5 px-6 pb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {PILLS.map(p => {
          const Icon = p.icon
          return (
            <button
              key={p.path}
              onClick={() => navigate(p.path)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl flex-shrink-0 bg-white/10 border border-white/12 text-white text-xs font-semibold hover:bg-white/18 transition-all"
            >
              <Icon className="w-3.5 h-3.5" />
              {p.label}
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BENTO CELL 2: Continue Learning
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const ContinueLearningCell: React.FC = () => {
  const navigate = useNavigate()
  const [lesson, setLesson] = useState<LastLesson | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('last_lesson')
    if (!raw) return
    try { setLesson(JSON.parse(raw) as LastLesson) } catch { /* ignore */ }
  }, [])

  if (!lesson) return null

  return (
    <motion.div {...fadeUp(0.08)} className="bento-cell col-span-12 lg:col-span-7">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="section-heading">O'qishni davom ettiring</h2>
          <p className="section-sub">Qolgan joydan boshlang</p>
        </div>
      </div>
      <button
        onClick={() => navigate(`/courses/${lesson.course_id}/lessons/${lesson.lesson_id}`)}
        className="continue-card w-full text-left group hover:border-sahifa-300 dark:hover:border-sahifa-700 transition-all duration-200"
      >
        <div className="relative w-20 h-16 rounded-[14px] overflow-hidden bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-[#2A2A38] dark:to-[#1C1C2A] flex-shrink-0">
          {lesson.thumbnail_url ? (
            <img src={lesson.thumbnail_url} alt={lesson.course_title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-sahifa-400" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[10px] font-bold text-sahifa-500 uppercase tracking-widest truncate">{lesson.course_title}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white line-clamp-1">{lesson.lesson_title}</p>
          <div className="space-y-1">
            <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${lesson.progress}%` }} /></div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{lesson.progress}% bajarildi</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0 group-hover:text-sahifa-500 transition-colors" />
      </button>
    </motion.div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BENTO CELL 3: Circular XP progress ring
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const XPRingCell: React.FC<{
  level: number; totalXP: number; xpPct: number; xpInLevel: number; xpForLevel: number
}> = ({ level, totalXP, xpPct, xpInLevel, xpForLevel }) => {
  const R    = 52
  const CIRC = 2 * Math.PI * R
  const dash = (xpPct / 100) * CIRC

  return (
    <motion.div {...fadeUp(0.12)} className="bento-cell col-span-12 sm:col-span-6 lg:col-span-5 flex flex-col items-center justify-center gap-3 text-center py-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-sahifa-500">XP Darajasi</p>
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="xpGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#F15929" />
              <stop offset="100%" stopColor="#FF8C5A" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={R} strokeWidth="7" className="xp-ring-track" />
          <motion.circle
            cx="60" cy="60" r={R}
            strokeWidth="7"
            className="xp-ring-fill"
            strokeDasharray={`${dash} ${CIRC}`}
            initial={{ strokeDasharray: `0 ${CIRC}` }}
            animate={{ strokeDasharray: `${dash} ${CIRC}` }}
            transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-3xl font-extrabold text-slate-800 dark:text-white">{level}</span>
          <span className="text-[10px] font-semibold text-sahifa-500 uppercase tracking-wider">Daraja</span>
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{totalXP.toLocaleString()} XP</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {xpInLevel.toLocaleString()} / {xpForLevel.toLocaleString()} Â· {xpPct}%
        </p>
      </div>
    </motion.div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BENTO CELL 5: Focus Goal widget
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const FocusGoalCell: React.FC<{
  focusSeconds: number; quizzesCompleted: number
}> = ({ focusSeconds, quizzesCompleted }) => {
  const navigate  = useNavigate()
  const focusMins = Math.round(focusSeconds / 60)
  const focusPct  = Math.min(100, Math.round((focusMins / DAILY_FOCUS_GOAL_MINS) * 100))
  const quizPct   = Math.min(100, Math.round((quizzesCompleted / DAILY_QUIZ_GOAL) * 100))

  const R_F    = 36
  const CIRC_F = 2 * Math.PI * R_F

  const today      = new Date()
  const dayLabels  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    return d.toLocaleDateString('uz-UZ', { weekday: 'short' }).slice(0, 2)
  })
  const storedWeek: number[] = (() => {
    try { return JSON.parse(localStorage.getItem('focus_week') ?? '[]') as number[] } catch { return [] }
  })()
  const weekMins = [...storedWeek.slice(-6), focusMins]
  const maxMins  = Math.max(DAILY_FOCUS_GOAL_MINS, ...weekMins, 1)

  return (
    <motion.div {...fadeUp(0.2)} className="bento-cell col-span-12 sm:col-span-6 lg:col-span-5">
      <h2 className="section-heading mb-1">Kunlik maqsad</h2>
      <p className="section-sub mb-4">Bugungi natijalar</p>

      
      <div className="grid grid-cols-2 gap-4 mb-5">
        
        <button
          onClick={() => navigate('/workspace?tab=focus')}
          className="flex flex-col items-center gap-2 p-3 rounded-[16px] bg-slate-50 dark:bg-[#1A1A28] border border-slate-100 dark:border-[#2E2E3A] hover:border-sahifa-300 dark:hover:border-sahifa-800 transition-all"
        >
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <defs>
                <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r={R_F} strokeWidth="5" fill="none" stroke="rgba(59,130,246,0.15)" />
              <motion.circle
                cx="40" cy="40" r={R_F} strokeWidth="5" fill="none"
                stroke="url(#focusGrad)" strokeLinecap="round"
                strokeDasharray={`${(focusPct / 100) * CIRC_F} ${CIRC_F}`}
                initial={{ strokeDasharray: `0 ${CIRC_F}` }}
                animate={{ strokeDasharray: `${(focusPct / 100) * CIRC_F} ${CIRC_F}` }}
                transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ filter: 'drop-shadow(0 0 5px rgba(59,130,246,0.55))' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-extrabold text-slate-800 dark:text-white">{focusPct}%</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Fokus</p>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{focusMins} / {DAILY_FOCUS_GOAL_MINS} daq</p>
          </div>
        </button>

        
        <button
          onClick={() => navigate('/quiz')}
          className="flex flex-col items-center gap-2 p-3 rounded-[16px] bg-slate-50 dark:bg-[#1A1A28] border border-slate-100 dark:border-[#2E2E3A] hover:border-sahifa-300 dark:hover:border-sahifa-800 transition-all"
        >
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <defs>
                <linearGradient id="quizGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#A78BFA" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r={R_F} strokeWidth="5" fill="none" stroke="rgba(139,92,246,0.15)" />
              <motion.circle
                cx="40" cy="40" r={R_F} strokeWidth="5" fill="none"
                stroke="url(#quizGrad)" strokeLinecap="round"
                strokeDasharray={`${(quizPct / 100) * CIRC_F} ${CIRC_F}`}
                initial={{ strokeDasharray: `0 ${CIRC_F}` }}
                animate={{ strokeDasharray: `${(quizPct / 100) * CIRC_F} ${CIRC_F}` }}
                transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
                style={{ filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.55))' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-extrabold text-slate-800 dark:text-white">{quizPct}%</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Testlar</p>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{quizzesCompleted} / {DAILY_QUIZ_GOAL} ta</p>
          </div>
        </button>
      </div>

      
      <div>
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2">Haftalik fokus</p>
        <div className="flex items-end gap-1.5 h-12">
          {weekMins.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: '36px' }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, (m / maxMins) * 100)}%` }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
                  className={`w-full rounded-t-[4px] ${
                    i === 6
                      ? 'bg-gradient-to-t from-sahifa-600 to-sahifa-400'
                      : 'bg-slate-200 dark:bg-[#2E2E3A]'
                  }`}
                  style={{ minHeight: 3 }}
                />
              </div>
              <span className={`text-[9px] font-medium ${i === 6 ? 'text-sahifa-500' : 'text-slate-400 dark:text-slate-600'}`}>
                {dayLabels[i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BENTO CELL 6: Course card (horizontal scroll)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CourseCard: React.FC<{ course: CourseItem; index: number }> = ({ course, index }) => {
  const navigate = useNavigate()
  const progress = course.progress ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 + index * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
      onClick={() => navigate(`/courses/${course.id}?ref=lenta`)}
      className="course-card group"
    >
      <div className="relative h-44 bg-gradient-to-br from-sahifa-100 to-orange-50 dark:from-[#2A2A38] dark:to-[#1C1C2A] overflow-hidden">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <GraduationCap className="w-14 h-14 text-sahifa-300/60 dark:text-sahifa-700/60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3">
          {course.is_paid ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sahifa-500/90 backdrop-blur-sm text-white text-[10px] font-bold shadow-glow-sm">
              <Star className="w-2.5 h-2.5 fill-current" /> Premium
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold">Bepul</span>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-lg bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10">{ll(course.level)}</span>
        </div>
        <div className="absolute bottom-3 right-3">
          {course.teacher_photo ? (
            <img src={course.teacher_photo} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white/60 shadow" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 border-2 border-white/60 flex items-center justify-center shadow">
              <span className="text-white text-xs font-bold">{(course.teacher_name ?? 'T').charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
        </div>
      </div>
      <div className="p-4 space-y-2.5">
        {course.categories && (
          <p className="text-[10px] font-semibold text-sahifa-500 uppercase tracking-widest">
            {course.categories.icon} {course.categories.name}
          </p>
        )}
        <p className="text-sm font-bold text-slate-800 dark:text-white line-clamp-2 leading-snug">{course.title}</p>
        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span className="font-medium truncate max-w-[120px]">{course.teacher_name ?? "O'qituvchi"}</span>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {course.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-amber-400 fill-current" />{course.rating.toFixed(1)}
              </span>
            )}
            {course.enrolled_count > 0 && (
              <span className="flex items-center gap-0.5">
                <Users className="w-3 h-3" />{course.enrolled_count}
              </span>
            )}
          </div>
        </div>
        {progress > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 dark:text-slate-500">Bajarildi</span>
              <span className="font-semibold text-sahifa-500">{progress}%</span>
            </div>
            <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{course.total_lessons} ta dars</p>
        )}
      </div>
    </motion.div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN DASHBOARD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const DashboardHome: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    totalXP, level, focusSeconds,
    quizzesCompleted, isInitialized,
  } = useProgressStore()

  const [courses,        setCourses]        = useState<CourseItem[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/courses?limit=8`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setCourses((Array.isArray(data) ? data : data?.courses ?? []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setCoursesLoading(false))
  }, [])

  const { start, end } = levelBounds(level)
  const xpInLevel  = totalXP - start
  const xpForLevel = end - start
  const xpPct      = Math.min(100, Math.round((xpInLevel / Math.max(xpForLevel, 1)) * 100))
  const focusMins  = Math.round(focusSeconds / 60)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-8 pb-20 space-y-5">

      
      
      {user && (
        <HeroBanner
          user={{ first_name: user.first_name, photo_url: user.photo_url }}
          totalXP={totalXP} level={level} focusSeconds={focusSeconds}
          xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}
        />
      )}


      
      {/* Courses — directly under hero */}
      <motion.section {...fadeUp(0.12)}>
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="section-heading">Kurslar</h2>
            <p className="section-sub">Professional ta'lim dasturlari</p>
          </div>
          <Link to="/courses" className="flex items-center gap-1 text-sm font-semibold text-sahifa-500 hover:text-sahifa-600 transition-colors">
            Barchasi <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {coursesLoading ? (
          <div className="courses-scroll">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-shrink-0 rounded-[24px] bg-slate-100 dark:bg-[#222230] animate-pulse" style={{ width: 280, height: 320 }} />
            ))}
          </div>
        ) : courses.length > 0 ? (
          <div className="courses-scroll">
            {courses.map((c, i) => <CourseCard key={c.id} course={c} index={i} />)}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              onClick={() => navigate('/courses')}
              className="course-card flex flex-col items-center justify-center gap-3 text-center p-6 cursor-pointer group"
              style={{ minHeight: 200 }}
            >
              <div className="w-12 h-12 rounded-2xl bg-sahifa-50 dark:bg-sahifa-500/10 flex items-center justify-center group-hover:bg-sahifa-500 transition-colors">
                <ChevronRight className="w-5 h-5 text-sahifa-500 group-hover:text-white transition-colors" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-white">Barchasi</p>
            </motion.div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 dark:border-[#2E2E3A] py-12 text-center">
            <GraduationCap className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Kurslar yuklanmoqda…</p>
            <button onClick={() => navigate('/courses')} className="mt-4 px-5 py-2 rounded-xl bg-sahifa-500 text-white text-xs font-semibold hover:bg-sahifa-600 transition-colors">
              Kurslarni ko'rish
            </button>
          </div>
        )}
      </motion.section>

      {/* Bento grid — progress & learning stats */}
      <div className="bento-grid">
        <ContinueLearningCell />
        {isInitialized && (
          <XPRingCell
            level={level} totalXP={totalXP}
            xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}
          />
        )}
        {isInitialized && (
          <FocusGoalCell focusSeconds={focusSeconds} quizzesCompleted={quizzesCompleted ?? 0} />
        )}
      </div>

      
      <HeroSection />

      
      <footer className="text-center space-y-1.5 pb-2">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">@Sahifalab_hub_bot</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-600">Powered by SAHIFALAB Â· 2026</p>
      </footer>
    </div>
  )
}

export default DashboardHome
