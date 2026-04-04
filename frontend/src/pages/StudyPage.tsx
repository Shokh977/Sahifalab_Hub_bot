import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AcademicCapIcon, PauseIcon, PlayIcon, ArrowPathIcon, ForwardIcon, SpeakerXMarkIcon, ExclamationCircleIcon, SpeakerWaveIcon, LightBulbIcon, Battery100Icon, MusicalNoteIcon, UserGroupIcon, FireIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { useBackgroundTimer } from '../hooks/useBackgroundTimer'
import { useAmbientSound, SoundType } from '../hooks/useAmbientSound'
import { fetchAmbientSounds } from '../lib/supabase'
import { useProgressStore } from '../context/progressStore'
import PageWrapper from '../components/PageWrapper'

/* ──────────────────────────────────────────────────────────────────────────────
   Sound data is loaded dynamically from the database.
   Admins manage sounds via the Admin Panel → Tovushlar tab.
   ────────────────────────────────────────────────────────────────────────────── */

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

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

const MOTIV_MESSAGES = [
  { emoji: '🔥', title: "Barakalla! Birga o'qimoqdamiz!",   sub: "Siz yolg'iz emasiz — kuch birlashganda" },
  { emoji: '⭐', title: "Zo'r ketayapsiz!",                 sub: "Davom eting, muvaffaqiyat kutmoqda" },
  { emoji: '💪', title: "Kuch sizda!",                      sub: "Bugun yangi rekord qo'ying" },
  { emoji: '🚀', title: "Parvozda!",                        sub: "Bilim — eng yaxshi investitsiya" },
  { emoji: '🎯', title: "Maqsadga intiling!",               sub: "Har bir sessiya — bir qadam oldinga" },
  { emoji: '📚', title: "Ilm — nur!",                       sub: "Har bir daqiqa qadrlidir" },
]

const FLOAT_EMOJIS = ['⭐', '🔥', '✨', '💪', '📚', '🎯', '🚀', '💡', '❤️', '🌟', '⚡', '🏆']

/* ─────────────────────────────────────────────────────────────────────────────
   MotivationBurst — full-screen overlay with floating emojis + central card
   Triggered when anyone sends a motivation ping (poll detects ts change).
───────────────────────────────────────────────────────────────────────────── */
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

  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Frosted backdrop */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" />

      {/* Floating emoji particles */}
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute text-2xl select-none"
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
        className="relative bg-white dark:bg-[#222230] rounded-[28px] px-8 py-7 shadow-2xl text-center max-w-[280px] mx-4"
        initial={{ scale: 0.4, opacity: 0, y: 30 }}
        animate={{ scale: 1,   opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <div className="text-6xl mb-3 leading-none">{msg.emoji}</div>
        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">{msg.title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{msg.sub}</p>
        {/* Sahifa brand stripe */}
        <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-[28px] bg-gradient-to-r from-[#F15929] via-orange-400 to-[#F15929]" />
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LivePulseBanner — polls /profiles/pulse every 8 s, shows active-user count
   and a "Send Motivation" button (30 s cooldown per sender).
───────────────────────────────────────────────────────────────────────────── */
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
    try {
      await fetch(`${API_BASE}/api/profiles/motivation`, { method: 'POST' })
      onMotivRef.current()          // trigger locally right away
      // Start 30-second cooldown
      setCooldown(30)
      const tick = setInterval(() => {
        setCooldown(c => {
          if (c <= 1) { clearInterval(tick); return 0 }
          return c - 1
        })
      }, 1_000)
    } catch { /* fail silently */ } finally {
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
        <UserGroupIcon className="w-4 h-4 flex-shrink-0 text-[#F15929]" />
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
        <FireIcon className="w-3.5 h-3.5" />
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
  // ── Vibration ────────────────────────────────────────────────────────────
  try {
    if (navigator.vibrate)
      navigator.vibrate([300, 150, 300, 150, 500])
  } catch {}

  // ── Bell synthesis ───────────────────────────────────────────────────────
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

export const StudyWithMe: React.FC = () => {
  const sound = useAmbientSound()

  // Sounds fetched from API
  const [sounds, setSounds] = useState<SoundFromDB[]>([])
  const [soundsLoading, setSoundsLoading] = useState(true)

  // Fetch ambient sounds on mount (direct Supabase — fast)
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

  // ── Focus XP tracking ────────────────────────────────────────────────────
  const { addFocusSeconds, syncToSupabase, pingPresence } = useProgressStore()
  const [motivBurst, setMotivBurst] = useState(false)
  const focusStartRef      = useRef<number | null>(null)
  const prevIsRunningRef   = useRef(timer.isRunning)
  const prevIsBreakRef     = useRef(timer.isBreak)

  useEffect(() => {
    const wasRunning = prevIsRunningRef.current
    const wasBreak   = prevIsBreakRef.current
    prevIsRunningRef.current = timer.isRunning
    prevIsBreakRef.current   = timer.isBreak

    // Focus timer started
    if (!wasRunning && timer.isRunning && !timer.isBreak) {
      focusStartRef.current = Date.now()
    }

    // Focus timer stopped/paused (not a break transition)
    if (wasRunning && !timer.isRunning && !wasBreak) {
      if (focusStartRef.current) {
        const elapsed = Math.floor((Date.now() - focusStartRef.current) / 1000)
        if (elapsed > 0) {
          addFocusSeconds(elapsed)
          syncToSupabase()
        }
        focusStartRef.current = null
      }
    }
  }, [timer.isRunning, timer.isBreak, addFocusSeconds, syncToSupabase])

  const handleComplete = useCallback(() => {
    if (!timer.isBreak) {
      timer.completeSession()
      timer.startBreak()
    } else {
      timer.startFocus()
    }
  }, [timer])

  // Auto-transition when timer reaches 0
  useEffect(() => {
    if (timer.remaining === 0 && !timer.isRunning) {
      const t = setTimeout(handleComplete, 1500)
      return () => clearTimeout(t)
    }
  }, [timer.remaining, timer.isRunning, handleComplete])

  // ── Presence ping every 60 s while a focus session is active ────────────
  useEffect(() => {
    if (!timer.isRunning || timer.isBreak) return
    const id = setInterval(() => pingPresence(), 60_000)
    return () => clearInterval(id)
  }, [timer.isRunning, timer.isBreak, pingPresence])

  const progressPercent = timer.isBreak
    ? ((5 * 60 - timer.remaining) / (5 * 60)) * 100
    : ((25 * 60 - timer.remaining) / (25 * 60)) * 100

  /**
   * Resolve file_id → URL (cached), then play.
   */
  const handleSoundSelect = useCallback((s: SoundFromDB) => {
    // Toggle off if same sound playing
    if (sound.activeSound === String(s.id) && sound.isPlaying) {
      sound.stop()
      return
    }

    // Supabase Storage URLs have proper CORS + MIME headers — play directly.
    // Legacy Google Drive URLs still go through the backend proxy (302 redirect).
    const audioUrl = s.url?.includes('supabase.co/storage')
      ? s.url
      : `${import.meta.env.VITE_API_URL || ''}/api/audio/proxy/${s.id}`
    console.log('[StudyPage] Playing:', s.name, audioUrl)
    setResolvingId(s.id)
    sound.play(String(s.id) as SoundType, audioUrl)
  }, [sound])

  // Clear the per-button spinner once the hook reports loading finished
  useEffect(() => {
    if (!sound.isLoading) setResolvingId(null)
  }, [sound.isLoading])

  const handleSilence = useCallback(() => {
    sound.stop()
  }, [sound])

  return (
    <PageWrapper className="space-y-5">
      {/* Motivation Burst overlay */}
      <AnimatePresence>
        {motivBurst && (
          <MotivationBurst onDone={() => setMotivBurst(false)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <AcademicCapIcon className="w-7 h-7" /> Study With Sahifalab
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {timer.isBreak ? "Dam olish vaqti — biroz nafas ol" : "Diqqatni jamla — sen uddalaysan"}
        </p>
      </div>

      {/* Live Pulse — active session count + Send Motivation */}
      <LivePulseBanner onMotivationReceived={() => { if (!motivBurst) setMotivBurst(true) }} />

      {/* Timer Card */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-2xl p-5 shadow-sm border border-blue-100 dark:border-blue-800/40 space-y-4">
        {/* Progress Ring */}
        <div className="flex justify-center">
          <div className="relative w-48 h-48">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              <circle
                cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="4"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="5"
                strokeDasharray={`${(Math.PI * 180 * progressPercent) / 100} ${Math.PI * 180}`}
                className={timer.isBreak ? 'text-green-500' : 'text-blue-500'}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.5s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-gray-900 dark:text-white font-mono tracking-tight">
                {timer.formatted}
              </div>
              <div className={`text-xs font-semibold mt-2 px-3 py-0.5 rounded-full ${
                timer.isBreak
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}>
                {timer.isBreak ? 'Dam olish' : 'Fokus'}
              </div>
            </div>
          </div>
        </div>

        {/* Session counter */}
        <div className="flex justify-center gap-1.5">
          {[...Array(Math.max(4, timer.sessionsCompleted + 1))].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < timer.sessionsCompleted
                  ? 'bg-blue-500 dark:bg-blue-400'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 self-center">
            {timer.sessionsCompleted} sessiya
          </span>
        </div>
      </div>

      {/* Focus Presets */}
      {!timer.isRunning && !timer.isBreak && (
        <div className="flex gap-2 justify-center">
          {FOCUS_PRESETS.map((min) => (
            <button
              key={min}
              onClick={() => timer.setRemaining(min * 60)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                timer.remaining === min * 60
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {min} min
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={timer.toggle}
          className={`flex-1 py-3 rounded-xl font-semibold text-white shadow-md transition-all active:scale-95 ${
            timer.isRunning
              ? 'bg-orange-500 hover:bg-orange-600'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          <span className="inline-flex items-center gap-1 justify-center">{timer.isRunning ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}{timer.isRunning ? 'Pauza' : 'Boshlash'}</span>
        </button>
        <button
          onClick={() => timer.reset()}
          className="px-4 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
        >
          <ArrowPathIcon className="w-5 h-5" />
        </button>
        <button
          onClick={timer.skip}
          className="px-4 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
        >
          <ForwardIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Ambient Sounds */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm inline-flex items-center gap-1"><MusicalNoteIcon className="w-4 h-4" />Ambient tovushlar</h3>
          {sound.isPlaying && (
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full animate-pulse">
              Ijro etilmoqda
            </span>
          )}
        </div>

        {soundsLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700 h-16 animate-pulse" />
            ))}
          </div>
        ) : sounds.length === 0 ? (
          <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-4">
            Hali tovushlar yuklanmagan. Admin paneldan qo'shing.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* Silence button — always first */}
            <button
              onClick={handleSilence}
              className={`p-3 rounded-xl font-medium transition-all active:scale-95 ${
                !sound.isPlaying
                  ? 'bg-blue-500 text-white ring-2 ring-blue-400 shadow-md'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              <div className="flex justify-center"><SpeakerXMarkIcon className="w-6 h-6" /></div>
              <div className="text-xs mt-1">Jimjitlik</div>
            </button>

            {/* Sounds from database */}
            {sounds.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSoundSelect(s)}
                disabled={resolvingId === s.id || sound.isLoading}
                className={`p-3 rounded-xl font-medium transition-all active:scale-95 relative ${
                  sound.activeSound === String(s.id) && sound.isPlaying
                    ? 'bg-blue-500 text-white ring-2 ring-blue-400 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                {resolvingId === s.id ? (
                  <div className="text-2xl animate-spin">...</div>
                ) : (
                  <div className="flex justify-center"><MusicalNoteIcon className="w-6 h-6" /></div>
                )}
                <div className="text-xs mt-1">{s.name}</div>
              </button>
            ))}
          </div>
        )}

        {/* Error feedback (visible even in Telegram WebView without DevTools) */}
        {sound.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-red-800 dark:text-red-300">
              <span className="inline-flex items-center gap-1"><ExclamationCircleIcon className="w-4 h-4" />{sound.error}</span>
            </p>
            {sound.error.includes('SRC_NOT_SUPPORTED') && (
              <p className="text-xs text-red-700 dark:text-red-400">
                Google Drive havolasi ochiq emasdir — «Havola orqali har kim» qilib ulashing.
              </p>
            )}
            {sound.error.includes('NETWORK') && (
              <p className="text-xs text-red-700 dark:text-red-400">
                Tarmoq xatosi — internet aloqasini tekshiring.
              </p>
            )}
          </div>
        )}

        {/* Volume Control */}
        {sound.isPlaying && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm"><SpeakerWaveIcon className="w-4 h-4" /></span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              onChange={(e) => sound.changeVolume(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-sm"><SpeakerWaveIcon className="w-4 h-4" /></span>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">
              {Math.round(sound.volume * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Background playback info */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
        <p className="text-xs text-emerald-800 dark:text-emerald-300">
          <span className="inline-flex items-center gap-1"><Battery100Icon className="w-4 h-4" /><strong>Fon rejimi:</strong></span> Taymer va tovushlar telefon qulflanganda ham ishlaydi.
          Ilovadan chiqmang — fonga o'tkazing.
        </p>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
        <p className="text-xs text-yellow-900 dark:text-yellow-200">
          <span className="inline-flex items-center gap-1"><LightBulbIcon className="w-4 h-4" /><strong>Maslahat:</strong></span> Pomodoro usuli — 25 daqiqa fokus + 5 daqiqa dam olish.
          Har 4 sessiyadan so'ng uzunroq dam oling!
        </p>
      </div>
    </PageWrapper>
  )
}

export default StudyWithMe
