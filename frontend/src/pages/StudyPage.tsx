import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  GraduationCap,
  RefreshCw,
  Battery,
  AlertCircle,
  Flame,
  SkipForward,
  Lightbulb,
  Music,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Users,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBackgroundTimer } from '../hooks/useBackgroundTimer'
import { useAmbientSound, SoundType } from '../hooks/useAmbientSound'
import { fetchAmbientSounds } from '../lib/supabase'
import { useProgressStore } from '../context/progressStore'
import PageWrapper from '../components/PageWrapper'
import { API_BASE } from '../lib/apiUrl'

/* ------------------------------------------------------------------------------
   Sound data is loaded dynamically from the database.
   Admins manage sounds via the Admin Panel → Tovushlar tab.
   ------------------------------------------------------------------------------ */

interface SoundFromDB {
  id: number
  name: string
  emoji: string
  url: string
  display_order: number
  is_active: boolean
}

/**
 * Convert any Google Drive share/view URL to a direct streamable URL.
 * Non-Drive URLs are returned unchanged.
 */
function convertToDirectUrl(url: string): string {
  const patterns = [
    /drive\.google\.com\/file\/d\/([-\w]+)/,
    /drive\.google\.com\/open\?id=([-\w]+)/,
    /drive\.google\.com\/uc\?.*id=([-\w]+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`
  }
  return url
}

const FOCUS_PRESETS = [15, 25, 45, 60]

const MOTIV_MESSAGES = [
  { emoji: '🔥', title: "Barakalla! Birga o'qimoqdamiz!",   sub: "Siz yolg'iz emasiz — kuch birlashganda" },
  { emoji: '⭐', title: "Zo'r ketayapsiz!",                 sub: "Davom eting, muvaffaqiyat kutmoqda" },
  { emoji: '💪', title: "Kuch sizda!",                      sub: "Bugun yangi rekord qo'ying" },
  { emoji: '🚀', title: "Parvozda!",                        sub: "Bilim — eng yaxshi investitsiya" },
  { emoji: '🎯', title: "Maqsadga intiling!",               sub: "Har bir sessiya — bir qadam oldinga" },
  { emoji: '📚', title: "Ilm — nur!",                       sub: "Har bir daqiqa qadrlidir" },
]

const FLOAT_EMOJIS = ['⭐', '🔥', '✨', '💪', '📚', '🎯', '🚀', '💡', '❤️', '🌟', '⚡', '🏆']

/* -----------------------------------------------------------------------------
   MotivationBurst — full-screen overlay with floating emojis + central card
   Triggered when anyone sends a motivation ping (poll detects ts change).
----------------------------------------------------------------------------- */
interface MotivationBurstProps { onDone: () => void }

const MotivationBurst: React.FC<MotivationBurstProps> = ({ onDone }) => {
  const [msg]       = useState(() => MOTIV_MESSAGES[Math.floor(Math.random() * MOTIV_MESSAGES.length)])
  const [particles] = useState(() =>
    FLOAT_EMOJIS.map((emoji) => ({
      emoji,
      left:  `${8 + Math.random() * 84}%`,
      top:   `${8 + Math.random() * 84}%`,
      delay: Math.random() * 0.5,
      dur:   1.2 + Math.random() * 0.8,
    }))
  )

  // Auto-dismiss after 4 s
  useEffect(() => {
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [onDone])

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDone])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Clickable frosted backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] cursor-pointer"
        onClick={onDone}
      />

      {/* Floating emoji particles (pointer-events-none so backdrop stays clickable) */}
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute text-2xl select-none pointer-events-none"
          style={{ left: p.left, top: p.top }}
          initial={{ opacity: 0, y: 30, scale: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: -110, scale: [0, 1.3, 1] }}
          transition={{ delay: p.delay, duration: p.dur, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}

      {/* Central motivational card */}
      <motion.div
        className="relative bg-white dark:bg-[#1C1C2A] rounded-[28px] px-8 py-7 shadow-2xl text-center max-w-[300px] mx-4 z-10"
        initial={{ scale: 0.4, opacity: 0, y: 30 }}
        animate={{ scale: 1,   opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* X close button */}
        <button
          onClick={onDone}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors text-sm font-bold"
          aria-label="Yopish"
        >
          ✕
        </button>
        <div className="text-6xl mb-3 leading-none">{msg.emoji}</div>
        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">{msg.title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{msg.sub}</p>
        <button
          onClick={onDone}
          className="mt-4 px-5 py-2 rounded-2xl bg-sahifa-500 text-white text-xs font-bold hover:bg-sahifa-600 transition-colors"
        >
          Davom etish →
        </button>
        {/* Brand stripe */}
        <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-[28px] bg-gradient-to-r from-[#F15929] via-orange-400 to-[#F15929]" />
      </motion.div>
    </motion.div>
  )
}

/* -----------------------------------------------------------------------------
   LivePulseBanner — polls /profiles/pulse every 8 s, shows active-user count
   and a "Send Motivation" button (30 s cooldown per sender).
----------------------------------------------------------------------------- */
interface PulseData { active_count: number; last_motivation_ts: number }
interface LivePulseBannerProps { onMotivationReceived: () => void }

const LivePulseBanner: React.FC<LivePulseBannerProps> = ({ onMotivationReceived }) => {
  const [pulse,    setPulse]    = useState<PulseData | null>(null)
  const [sending,  setSending]  = useState(false)
  const [cooldown, setCooldown] = useState(0)      // seconds remaining
  const lastTsRef  = useRef<number>(0)
  const onMotivRef = useRef(onMotivationReceived)
  onMotivRef.current = onMotivationReceived        // always latest

  const fetchPulse = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/profiles/pulse`)
      if (!r.ok) return
      const data: PulseData = await r.json()
      // Detect incoming motivation from another user
      if (lastTsRef.current > 0 && data.last_motivation_ts > lastTsRef.current) {
        onMotivRef.current()
      }
      lastTsRef.current = data.last_motivation_ts ?? 0
      setPulse(data)
    } catch { /* network offline — fail silently */ }
  }, [])

  useEffect(() => {
    fetchPulse()
    const id = setInterval(fetchPulse, 8_000)
    return () => clearInterval(id)
  }, [fetchPulse])

  const sendMotivation = async () => {
    if (sending || cooldown > 0) return
    setSending(true)
    // Fire the burst + cooldown immediately — don't wait for the server.
    // This makes the button feel instant and works even when offline.
    onMotivRef.current()
    setCooldown(30)
    const tick = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(tick); return 0 }
        return c - 1
      })
    }, 1_000)
    try {
      await fetch(`${API_BASE}/api/profiles/motivation`, { method: 'POST' })
    } catch { /* fail silently — local burst already shown */ } finally {
      setSending(false)
    }
  }

  const count = pulse?.active_count ?? 0

  return (
    <motion.div
      className="flex items-center justify-between gap-3 bg-white dark:bg-[#1e1e2a] border border-[#F15929]/20 rounded-2xl px-4 py-3 shadow-sm"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Left — live count */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Pulsing dot */}
        <span className="relative flex-shrink-0">
          <span className="block w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
        </span>
        <Users className="w-4 h-4 flex-shrink-0 text-[#F15929]" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
          {count === 0
            ? "Birinchi bo'lib boshlang!"
            : count === 1
              ? "Siz yolg'iz o'qimoqdasiz"
              : `${count} kishi birga o'qimoqda`
          }
        </span>
      </div>

      {/* Right — motivation button */}
      <button
        onClick={sendMotivation}
        disabled={sending || cooldown > 0}
        className={
          `flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
            cooldown > 0
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-[#F15929] text-white shadow-md hover:bg-orange-600'
          }`
        }
      >
        <Flame className="w-3.5 h-3.5" />
        {cooldown > 0 ? `${cooldown}s` : 'Motivatsiya'}
      </button>
    </motion.div>
  )
}

/**
 * Plays a two-tone bell ("ting ting") using Web Audio API — no file needed.
 * Also triggers haptic vibration on supported devices.
 */
function playAlarm() {
  // -- Vibration ------------------------------------------------------------
  try {
    if (navigator.vibrate)
      navigator.vibrate([300, 150, 300, 150, 500])
  } catch {}

  // -- Bell synthesis -------------------------------------------------------
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    const ting = (startAt: number, freq: number) => {
      // Primary tone
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.7, startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 1.8)
      osc.start(startAt)
      osc.stop(startAt + 1.8)

      // Harmonic overtone (gives it a bell-like shimmer)
      const osc2  = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.type = 'sine'
      osc2.frequency.value = freq * 2.756   // bell partial
      gain2.gain.setValueAtTime(0.25, startAt)
      gain2.gain.exponentialRampToValueAtTime(0.001, startAt + 1.0)
      osc2.start(startAt)
      osc2.stop(startAt + 1.0)
    }

    const t = ctx.currentTime
    ting(t,        1047)  // first ting  — C6
    ting(t + 0.6,  1319)  // second ting — E6

    setTimeout(() => ctx.close().catch(() => {}), 3500)
  } catch {}
}

// ── Exported timer state type for mini-indicator in WorkspacePage ─────────────
export interface StudyTimerState {
  isRunning: boolean
  isBreak:   boolean
  formatted: string
  remaining: number
  sessionXP: number
}

/**
 * StudyTimer — the full-featured "Study with me" experience.
 *
 * Can run as a standalone page (embedded=false, default) or embedded inside
 * another page like WorkspacePage (embedded=true — skips page-level chrome).
 *
 * onTimerStateChange fires on every tick so the parent can show a mini-indicator.
 */
export interface StudyTimerProps {
  /** When true, renders without page header / PageWrapper */
  embedded?: boolean
  /** Callback with live timer state for mini-indicator in parent */
  onTimerStateChange?: (state: StudyTimerState) => void
}

export const StudyTimer: React.FC<StudyTimerProps> = ({
  embedded = false,
  onTimerStateChange,
}) => {
  const sound = useAmbientSound()

  const [sounds, setSounds]             = useState<SoundFromDB[]>([])
  const [soundsLoading, setSoundsLoading] = useState(true)

  useEffect(() => {
    fetchAmbientSounds()
      .then(data => setSounds(data as SoundFromDB[]))
      .catch(() => {})
      .finally(() => setSoundsLoading(false))
  }, [])

  const [resolvingId, setResolvingId] = useState<number | null>(null)

  const handleTimerComplete = useCallback(() => {
    playAlarm()
  }, [])

  const timer = useBackgroundTimer({ onComplete: handleTimerComplete })

  // -- Focus XP tracking ----------------------------------------------------
  const { addFocusSeconds, flushFocusSeconds, pingPresence } = useProgressStore()
  const [motivBurst, setMotivBurst]   = useState(false)

  // Session-local display counter (minutes of focus this session)
  const [sessionXP, setSessionXP]     = useState(0)

  // Focus time tracking via absolute timestamps — immune to browser throttling
  // in background tabs. Records the real wall-clock elapsed seconds when focus
  // pauses, ends, or transitions to a break, instead of counting 1-second ticks
  // (which browsers cap to ≤1/min when the tab is hidden).
  useEffect(() => {
    if (!timer.isRunning || timer.isBreak) return
    const startedAt = Date.now()
    return () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      if (elapsed > 0) addFocusSeconds(elapsed)
    }
  }, [timer.isRunning, timer.isBreak, addFocusSeconds])

  // Session XP display: +1 visible point per minute of focus
  useEffect(() => {
    if (!timer.isRunning || timer.isBreak) return
    const iv = setInterval(() => setSessionXP(p => p + 1), 60_000)
    return () => clearInterval(iv)
  }, [timer.isRunning, timer.isBreak])

  // Sync to server when focus pauses / timer completes / component unmounts.
  // Also catches focus→break transitions (skip): React batches pause()+startBreak()
  // into one render so isRunning never passes through false — catch via isBreak flip.
  const prevIsRunningRef = useRef(timer.isRunning)
  const prevIsBreakRef   = useRef(timer.isBreak)
  useEffect(() => {
    const wasRunning = prevIsRunningRef.current
    const wasBreak   = prevIsBreakRef.current
    prevIsRunningRef.current = timer.isRunning
    prevIsBreakRef.current   = timer.isBreak
    if (wasRunning && !wasBreak && (!timer.isRunning || timer.isBreak)) {
      flushFocusSeconds()
    }
  }, [timer.isRunning, timer.isBreak, flushFocusSeconds])

  // Flush on unmount (user navigates away while timer is running)
  useEffect(() => {
    return () => { flushFocusSeconds() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Notify parent of timer state changes (for mini-indicator)
  useEffect(() => {
    onTimerStateChange?.({
      isRunning:  timer.isRunning,
      isBreak:    timer.isBreak,
      formatted:  timer.formatted,
      remaining:  timer.remaining,
      sessionXP,
    })
  }, [timer.isRunning, timer.isBreak, timer.formatted, timer.remaining, sessionXP, onTimerStateChange])

  const handleComplete = useCallback(() => {
    if (!timer.isBreak) { timer.completeSession(); timer.startBreak() }
    else { timer.startFocus() }
  }, [timer])

  useEffect(() => {
    if (timer.remaining === 0 && !timer.isRunning) {
      const t = setTimeout(handleComplete, 1500)
      return () => clearTimeout(t)
    }
  }, [timer.remaining, timer.isRunning, handleComplete])

  useEffect(() => {
    if (!timer.isRunning || timer.isBreak) return
    const id = setInterval(() => pingPresence(), 60_000)
    return () => clearInterval(id)
  }, [timer.isRunning, timer.isBreak, pingPresence])

  // SVG ring math
  const totalSecs     = timer.isBreak ? 5 * 60 : 25 * 60
  const elapsed       = totalSecs - timer.remaining
  const progressPct   = Math.min(100, (elapsed / totalSecs) * 100)
  const R             = 88
  const CIRC          = 2 * Math.PI * R
  const strokeDash    = `${(progressPct / 100) * CIRC} ${CIRC}`
  const ringColor     = timer.isBreak ? '#22C55E' : '#F15929'
  const ringGlow      = timer.isBreak
    ? 'drop-shadow(0 0 10px rgba(34,197,94,0.7))'
    : 'drop-shadow(0 0 10px rgba(241,89,41,0.7))'

  const handleSoundSelect = useCallback((s: SoundFromDB) => {
    if (sound.activeSound === String(s.id) && sound.isPlaying) { sound.stop(); return }
    const audioUrl = s.url?.includes('supabase.co/storage') || s.url?.includes('.b-cdn.net')
      ? s.url
      : `${API_BASE}/api/audio/proxy/${s.id}`
    setResolvingId(s.id)
    sound.play(String(s.id) as SoundType, audioUrl)
  }, [sound])

  useEffect(() => { if (!sound.isLoading) setResolvingId(null) }, [sound.isLoading])
  const handleSilence = useCallback(() => { sound.stop() }, [sound])

  const activeSound = sound.isPlaying ? sounds.find(s => String(s.id) === sound.activeSound) : null

  // ── Inner content (shared between embedded & standalone modes) ──────────
  const timerContent = (
    <>
      {/* Motivation Burst overlay */}
      <AnimatePresence>
        {motivBurst && <MotivationBurst onDone={() => setMotivBurst(false)} />}
      </AnimatePresence>

      <div className={embedded ? '' : 'min-h-screen bg-slate-50 dark:bg-[#0A0A14] transition-colors'}>
        <div className={embedded ? 'space-y-5' : 'max-w-5xl mx-auto px-4 sm:px-8 pt-6 pb-10 space-y-5'}>

          {/* ── Page header (standalone mode only) ──────────────────────────────── */}
          {!embedded && (
            <div className="flex items-center justify-between p-8">
              <div>
                <h1 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
                  <GraduationCap className="w-5 h-5 text-[#F15929]" />
                  Study With Sahifalab
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {timer.isBreak ? '🌿 Dam olish vaqti — biroz nafas ol' : '🎯 Diqqatni jamlang — sen uddalaysan'}
                </p>
              </div>
              {timer.sessionsCompleted > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F15929]/10 border border-[#F15929]/25 text-[#F15929] text-xs font-bold"
                >
                  <Flame className="w-3 h-3" />
                  {timer.sessionsCompleted} sessiya
                </motion.div>
              )}
            </div>
          )}

          {/* ── Live Pulse banner ─────────────────────────────────────────────────────── */}
          <LivePulseBanner onMotivationReceived={() => { if (!motivBurst) setMotivBurst(true) }} />

          {/* ── Main grid: Timer (left) + Sidebar (right) ─────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

            {/* ══ TIMER CARD — Premium Focus Glass ═══════════════════════════════════════ */}
            <motion.div
              className="premium-focus-glass"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Status badge */}
              <div className="flex justify-center mb-6">
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase border ${
                  timer.isBreak
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-[#F15929]/15 border-[#F15929]/30 text-[#F15929]'
                }`}>
                  {timer.isBreak ? '🌿 Dam olish' : '⚡ Fokus sessiyasi'}
                </span>
              </div>

              {/* SVG Timer ring */}
              <div className="flex justify-center mb-4">
                <div className="relative w-52 h-52 sm:w-64 sm:h-64">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                    <defs>
                      <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor={ringColor} />
                        <stop offset="100%" stopColor={timer.isBreak ? '#86EFAC' : '#FF8C5A'} />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle cx="100" cy="100" r={R} fill="none" strokeWidth="6" className="timer-ring-track" />
                    {/* Progress fill */}
                    <circle
                      cx="100" cy="100" r={R}
                      fill="none"
                      stroke="url(#timerGrad)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={strokeDash}
                      style={{ transition: 'stroke-dasharray 0.5s linear', filter: ringGlow }}
                    />
                  </svg>

                  {/* Center: big orange numbers + progress */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    <span
                      className="font-mono font-extrabold text-[#F15929] tracking-tighter tabular-nums"
                      style={{
                        fontSize: 'clamp(2.6rem, 6vw, 3.5rem)',
                        textShadow: '0 0 32px rgba(241,89,41,0.55)',
                      }}
                    >
                      {timer.formatted}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {Math.round(progressPct)}% tamamlandi
                    </span>
                  </div>
                </div>
              </div>

              {/* Motivational context text */}
              <div className="text-center mb-5 space-y-0.5">
                <p className="text-sm font-semibold text-gray-700 dark:text-white/65">
                  {timer.isBreak ? 'Biroz nafas oling' : 'Diqqatni jamlang'}
                </p>
                <p className="text-xs text-slate-600">
                  {timer.isBreak ? "Keyingi sessiyaga tayyor bo'ling" : "Muvaffaqiyat sabr talab qiladi"}
                </p>
              </div>

              {/* Session completion dots */}
              <div className="flex justify-center items-center gap-2 mb-5">
                {[...Array(Math.max(4, timer.sessionsCompleted + 1))].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      i < timer.sessionsCompleted
                        ? 'bg-[#F15929] shadow-[0_0_8px_rgba(241,89,41,0.9)]'
                        : 'bg-black/10 dark:bg-white/10'
                    }`}
                  />
                ))}
                <span className="text-xs text-slate-600 ml-1">{timer.sessionsCompleted} sessiya</span>
              </div>

              {/* Focus duration presets */}
              {!timer.isRunning && !timer.isBreak && (
                <div className="flex justify-center gap-2 mb-5">
                  {FOCUS_PRESETS.map(min => (
                    <button
                      key={min}
                      onClick={() => timer.setRemaining(min * 60)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        timer.remaining === min * 60
                          ? 'bg-[#F15929] text-white shadow-[0_0_14px_rgba(241,89,41,0.55)]'
                          : 'bg-black/5 text-gray-500 border border-black/10 hover:bg-black/10 hover:text-gray-800 dark:bg-white/5 dark:text-white/50 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white/80'
                      }`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
              )}

              {/* Controls: Play/Pause · Reset · Skip */}
              <div className="flex gap-3">
                <button
                  onClick={timer.toggle}
                  className={`flex-1 py-4 rounded-[18px] font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    timer.isRunning
                      ? 'bg-black/[0.07] border border-black/10 text-gray-700 hover:bg-black/[0.11] dark:bg-white/10 dark:border-white/15 dark:text-white dark:hover:bg-white/15'
                      : 'bg-[#F15929] text-white shadow-[0_6px_28px_rgba(241,89,41,0.5)] hover:bg-[#e84e22] active:bg-[#d4451f]'
                  }`}
                >
                  {timer.isRunning
                    ? <><Pause className="w-4 h-4" /> Pauza</>
                    : <><Play  className="w-4 h-4" /> Boshlash</>
                  }
                </button>
                <button
                  onClick={() => timer.reset()}
                  className="w-12 h-12 rounded-[18px] flex items-center justify-center bg-black/[0.05] border border-black/[0.08] text-gray-400 hover:bg-black/[0.09] hover:text-gray-900 dark:bg-white/5 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white transition-all active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={timer.skip}
                  className="w-12 h-12 rounded-[18px] flex items-center justify-center bg-black/[0.05] border border-black/[0.08] text-gray-400 hover:bg-black/[0.09] hover:text-gray-900 dark:bg-white/5 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white transition-all active:scale-95"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* ══ SIDEBAR: Sound Mixer + Info Pills ═════════════════════════════════ */}
            <div className="space-y-4">

              {/* Ambient sound mixer */}
              <motion.div
                className="sound-mixer"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-gray-400 dark:text-white/60" />
                    <span className="text-sm font-bold text-gray-900 dark:text-white">Ambient tovushlar</span>
                  </div>
                  {sound.isPlaying && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/12 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ijro etilmoqda
                    </span>
                  )}
                </div>

                {/* Sound selection grid */}
                {soundsLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[16px] bg-black/5 dark:bg-white/5 animate-pulse" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {/* Silence option */}
                    <button
                      onClick={handleSilence}
                      className={`sound-mixer-btn ${!sound.isPlaying ? 'active' : ''}`}
                    >
                      <VolumeX className="w-5 h-5" />
                      <span className="text-[10px] font-medium">Jimjitlik</span>
                    </button>

                    {sounds.map(s => {
                      const isActive = sound.activeSound === String(s.id) && sound.isPlaying
                      return (
                        <button
                          key={s.id}
                          onClick={() => handleSoundSelect(s)}
                          disabled={resolvingId === s.id && sound.isLoading}
                          className={`sound-mixer-btn ${isActive ? 'active' : ''}`}
                        >
                          {resolvingId === s.id && sound.isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-gray-400 dark:text-white/70" />
                          ) : (
                            <span className="text-lg">{s.emoji || '🎵'}</span>
                          )}
                          <span className="text-[10px] font-medium line-clamp-1">{s.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Per-sound volume slider */}
                <AnimatePresence>
                  {sound.isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-black/[0.08] dark:border-white/8 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-white/50">
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>{activeSound?.name ?? 'Tovush'} ovozi</span>
                          </div>
                          <span className="text-xs font-bold text-[#F15929]">{Math.round(sound.volume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0} max={1} step={0.02}
                          value={sound.volume}
                          onChange={e => sound.changeVolume(parseFloat(e.target.value))}
                          className="vol-slider w-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sound error */}
                {sound.error && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/25 rounded-[14px] p-3">
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {sound.error}
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Info tip pills */}
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              >
                <div className="flex items-start gap-2.5 rounded-[16px] bg-black/[0.04] border border-black/[0.07] dark:bg-white/[0.04] dark:border-white/8 px-3.5 py-3">
                  <Battery className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-500 dark:text-white/45 leading-relaxed">
                    Fon rejimi: taymer va tovushlar telefon qulflanganda ham ishlaydi.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-[16px] bg-black/[0.04] border border-black/[0.07] dark:bg-white/[0.04] dark:border-white/8 px-3.5 py-3">
                  <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-500 dark:text-white/45 leading-relaxed">
                    Pomodoro: 25 daq fokus + 5 daq dam olish. Har 4 sessiyadan keyin uzunroq dam oling!
                  </p>
                </div>
              </motion.div>

            </div>
          </div>

          {/* ── Session XP counter — always visible ───────────────────────────── */}
          <AnimatePresence>
            {sessionXP > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex items-center justify-center"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-emerald-500 text-sm">⚡</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Ushbu sessiyada: +{sessionXP} XP
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </>
  )

  // ── Return: embedded mode skips PageWrapper chrome ─────────────────────
  if (embedded) return timerContent

  return (
    <PageWrapper topPadding="" className="!px-0">
      {timerContent}
    </PageWrapper>
  )
}

/** Page-level wrapper (legacy default export) — redirects /study to /workspace?tab=focus */
export const StudyWithMe: React.FC = () => <StudyTimer embedded={false} />

export default StudyWithMe
