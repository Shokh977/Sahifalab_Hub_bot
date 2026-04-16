/**
 * WorkspacePage — "Ish joyi" (Workspace)
 *
 * 4-tab layout:
 *   📊 Reja     — Kanban planner (default)
 *   📖 O'qish   — Quick-access courses
 *   ⏱  Fokus    — Full "Study with me" timer (ambient sound, motivation, XP)
 *   📝 Qaydlar  — Notes
 *
 * Key design decisions:
 *   • The Fokus tab embeds the REAL StudyTimer from StudyPage.tsx
 *     (no duplicate timer code — ambient sounds, motivation, XP all preserved).
 *   • StudyTimer is ALWAYS mounted (hidden when not on Fokus tab) so the timer,
 *     ambient audio, and XP tracking continue running in the background.
 *   • A mini-timer indicator appears in the header when the user is not on the
 *     Fokus tab and the timer is running.
 *   • ?tab=focus URL param support (for /study → /workspace?tab=focus redirect).
 *   • Framer Motion horizontal slide transitions between other tabs.
 */
import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, BookOpen, Timer, StickyNote, BookCheck, Pause, Zap } from 'lucide-react'
import KanbanBoard, { type PlannerTask } from '../components/workspace/KanbanBoard'
import { StudyTimer, type StudyTimerState } from './StudyPage'
import NotesTab from '../components/workspace/NotesTab'
import CoursesTab from '../components/workspace/CoursesTab'

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'kanban',  label: 'Reja',     icon: LayoutGrid, emoji: '📊' },
  { key: 'courses', label: "O'qish",   icon: BookOpen,   emoji: '📖' },
  { key: 'focus',   label: 'Fokus',    icon: Timer,      emoji: '⏱' },
  { key: 'notes',   label: 'Qaydlar',  icon: StickyNote,  emoji: '📝' },
] as const

type TabKey = typeof TABS[number]['key']

// ── Page ──────────────────────────────────────────────────────────────────────

const WorkspacePage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Resolve initial tab from URL ?tab=focus
  const initialTab = (): TabKey => {
    const param = searchParams.get('tab')
    if (param && TABS.some(t => t.key === param)) return param as TabKey
    return 'kanban'
  }

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  // Tracks which tabs have ever been opened — they stay mounted once visited
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set([initialTab()]))

  // Live timer state from StudyTimer (for mini-indicator)
  const [timerState, setTimerState] = useState<StudyTimerState>({
    isRunning: false, isBreak: false, formatted: '25:00', remaining: 1500, sessionXP: 0,
  })

  const switchTab = useCallback((key: TabKey) => {
    setActiveTab(key)
    setMountedTabs(prev => { const s = new Set(prev); s.add(key); return s })
  }, [])

  // Sync ?tab= URL param on tab switch (replaceState, no re-render)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeTab !== 'kanban') {
      url.searchParams.set('tab', activeTab)
    } else {
      url.searchParams.delete('tab')
    }
    window.history.replaceState({}, '', url.toString())
  }, [activeTab])

  // ── Play button handler from Kanban ────────────────────────────────────
  const handlePlayTask = useCallback((task: PlannerTask) => {
    if (task.linked_course_id) {
      navigate(`/courses/${task.linked_course_id}`)
    } else {
      switchTab('focus')
    }
  }, [navigate, switchTab])

  // ── Timer state callback ───────────────────────────────────────────────
  const handleTimerStateChange = useCallback((state: StudyTimerState) => {
    setTimerState(state)
  }, [])

  const showMiniTimer = timerState.isRunning && activeTab !== 'focus'

  return (
    <div className="pb-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center shadow-glow-sm">
            <BookCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              O'qish maydoni
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Reja, fokus va qaydlar — bitta joyda
            </p>
          </div>

          {/* ── Mini-timer indicator (visible when timer runs & not on Fokus tab) ── */}
          <AnimatePresence>
            {showMiniTimer && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                onClick={() => switchTab('focus')}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#F15929]/10 border border-[#F15929]/25 hover:bg-[#F15929]/20 transition-colors cursor-pointer group flex-shrink-0"
                title="Fokus tabiga o'tish"
              >
                <span className="relative flex-shrink-0">
                  <span className="block w-2 h-2 rounded-full bg-[#F15929]" />
                  <span className="absolute inset-0 rounded-full bg-[#F15929] animate-ping opacity-50" />
                </span>
                {timerState.isBreak ? (
                  <Pause className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Zap className="w-3 h-3 text-[#F15929]" />
                )}
                <span className="text-xs font-bold tabular-nums text-[#F15929] group-hover:text-[#e84e22]">
                  {timerState.formatted}
                </span>
                {timerState.sessionXP > 0 && (
                  <span className="text-[10px] font-bold text-emerald-500 ml-0.5">
                    +{timerState.sessionXP}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="mb-5 -mx-1">
        <div className="flex gap-1 p-1 rounded-2xl bg-slate-100/80 dark:bg-white/5 backdrop-blur-sm border border-slate-200/50 dark:border-white/5 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            // Show a pulsing dot on the Fokus tab when timer is running and user is elsewhere
            const showPulse = tab.key === 'focus' && timerState.isRunning && !isActive
            return (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                className={`
                  relative flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold
                  transition-all duration-200 whitespace-nowrap flex-1 justify-center
                  ${isActive
                    ? 'text-sahifa-600 dark:text-sahifa-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="workspace-tab-bg"
                    className="absolute inset-0 rounded-xl bg-white dark:bg-[#222230] shadow-sm border border-slate-200/60 dark:border-white/5"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span className="text-sm hidden sm:inline">{tab.emoji}</span>
                  <Icon className="w-3.5 h-3.5 sm:hidden" />
                  <span>{tab.label}</span>
                  {showPulse && (
                    <span className="relative flex-shrink-0 ml-0.5">
                      <span className="block w-1.5 h-1.5 rounded-full bg-[#F15929]" />
                      <span className="absolute inset-0 rounded-full bg-[#F15929] animate-ping opacity-60" />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      {/*
        All tabs are lazy-mounted (mounted on first visit, never unmounted).
        CSS 'hidden' keeps components alive — data, scroll and timer persist
        across tab switches with 0 ms delay. No AnimatePresence needed.
      */}
      <div className="relative mt-6">
        {/* Focus — always mounted so the timer + audio never stop */}
        <div className={activeTab === 'focus' ? '' : 'hidden'}>
          <StudyTimer embedded onTimerStateChange={handleTimerStateChange} />
        </div>

        {/* Kanban — mounted on first visit, kept alive thereafter */}
        {mountedTabs.has('kanban') && (
          <div className={activeTab === 'kanban' ? '' : 'hidden'}>
            <KanbanBoard onPlayTask={handlePlayTask} />
          </div>
        )}

        {/* Courses — mounted on first visit, kept alive thereafter */}
        {mountedTabs.has('courses') && (
          <div className={activeTab === 'courses' ? '' : 'hidden'}>
            <CoursesTab onFocusClick={() => switchTab('focus')} />
          </div>
        )}

        {/* Notes — mounted on first visit, kept alive thereafter */}
        {mountedTabs.has('notes') && (
          <div className={activeTab === 'notes' ? '' : 'hidden'}>
            <NotesTab />
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspacePage
