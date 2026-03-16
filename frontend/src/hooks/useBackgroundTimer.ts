/**
 * useBackgroundTimer — background-resilient Pomodoro timer.
 *
 * Survives ALL of:
 *  • Phone screen lock / app backgrounded  → RAF restarts on visibilitychange
 *  • Navigating to another page            → state persisted in sessionStorage,
 *                                            restored on re-mount
 *
 * Uses absolute Date.now() timestamps so the countdown stays accurate
 * even when the browser throttles or pauses timers in the background.
 */
import { useRef, useState, useCallback, useEffect } from 'react'

// ── sessionStorage persistence ────────────────────────────────────────────────
const STORAGE_KEY = 'sahifalab_pomodoro'

interface Snapshot {
  endTime:   number | null  // absolute ms when timer hits 0 (null when paused)
  remaining: number         // seconds, authoritative when paused
  isRunning: boolean
  isBreak:   boolean
  sessions:  number
}

const saveSnap = (s: Snapshot) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}
const loadSnap = (): Snapshot | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch { return null }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
interface UseBackgroundTimerOptions {
  onComplete?: () => void
  onTick?: (remaining: number) => void
}

export const useBackgroundTimer = (opts?: UseBackgroundTimerOptions) => {
  // Load snapshot once (lazy useState initializer — runs only on mount)
  const [snap] = useState<Snapshot | null>(loadSnap)

  // ── Derive initial values from snapshot ───────────────────────────────
  const initRemaining = () => {
    if (!snap) return 25 * 60
    if (snap.isRunning && snap.endTime) {
      return Math.max(0, Math.round((snap.endTime - Date.now()) / 1000))
    }
    return snap.remaining
  }
  const initRunning = () =>
    !!(snap?.isRunning && snap.endTime && snap.endTime > Date.now())

  // ── State + shadow refs (so callbacks never have stale values) ────────
  const [remaining,         _setRemaining] = useState(initRemaining)
  const [isRunning,         _setIsRunning] = useState(initRunning)
  const [isBreak,           _setIsBreak]   = useState(snap?.isBreak   ?? false)
  const [sessionsCompleted, _setSessions]  = useState(snap?.sessions  ?? 0)

  const remainingRef = useRef(remaining)
  const isRunningRef = useRef(isRunning)
  const isBreakRef   = useRef(isBreak)
  const sessionsRef  = useRef(sessionsCompleted)

  const setRemaining = useCallback((v: number) => {
    remainingRef.current = v; _setRemaining(v)
  }, [])
  const setIsRunning = useCallback((v: boolean) => {
    isRunningRef.current = v; _setIsRunning(v)
  }, [])
  const setIsBreak = useCallback((v: boolean) => {
    isBreakRef.current = v; _setIsBreak(v)
  }, [])
  const setSessions = useCallback((fn: (p: number) => number) => {
    const next = fn(sessionsRef.current)
    sessionsRef.current = next; _setSessions(next)
  }, [])

  // ── Refs ──────────────────────────────────────────────────────────────
  const endTimeRef  = useRef<number | null>(
    snap?.isRunning && snap.endTime && snap.endTime > Date.now() ? snap.endTime : null,
  )
  const rafRef      = useRef<number | null>(null)
  const wakeLockRef = useRef<any>(null)
  const onCompleteRef = useRef(opts?.onComplete)
  const onTickRef     = useRef(opts?.onTick)
  onCompleteRef.current = opts?.onComplete
  onTickRef.current     = opts?.onTick

  // ── Persist ───────────────────────────────────────────────────────────
  const doSave = useCallback(() => {
    saveSnap({
      endTime:   endTimeRef.current,
      remaining: remainingRef.current,
      isRunning: isRunningRef.current,
      isBreak:   isBreakRef.current,
      sessions:  sessionsRef.current,
    })
  }, [])

  // ── Wake Lock ──────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator)
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
    } catch {}
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  // ── RAF loop ───────────────────────────────────────────────────────────
  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    if (!endTimeRef.current) return
    const left = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
    setRemaining(left)
    onTickRef.current?.(left)

    if (left <= 0) {
      endTimeRef.current = null
      setIsRunning(false)
      releaseWakeLock()
      doSave()
      onCompleteRef.current?.()
      return
    }

    // ~200 ms polling: low CPU, still visually smooth
    rafRef.current = requestAnimationFrame(() => {
      setTimeout(() => {
        if (endTimeRef.current)
          rafRef.current = requestAnimationFrame(() => tick())
      }, 200)
    })
  }, [setRemaining, setIsRunning, releaseWakeLock, doSave])

  const startRaf = useCallback(() => {
    stopRaf()
    rafRef.current = requestAnimationFrame(() => tick())
  }, [stopRaf, tick])

  // ── Fix 1: restart RAF when user returns from lock/background ─────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && endTimeRef.current) {
        requestWakeLock()
        startRaf()  // ← RAF was paused; restart it so the display catches up
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [requestWakeLock, startRaf])

  // ── Fix 2: resume automatically when component remounts (page nav) ────
  useEffect(() => {
    if (endTimeRef.current) {
      requestWakeLock()
      startRaf()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // intentionally runs only once on mount

  // ── Fix 3: save state on unmount so page navigation preserves it ──────
  useEffect(() => {
    return () => {
      doSave()
      stopRaf()
      releaseWakeLock()
    }
  }, [doSave, stopRaf, releaseWakeLock])

  // ── Public actions ─────────────────────────────────────────────────────
  const pause = useCallback(() => {
    if (endTimeRef.current)
      setRemaining(Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000)))
    endTimeRef.current = null
    setIsRunning(false)
    stopRaf()
    releaseWakeLock()
    doSave()
  }, [setRemaining, setIsRunning, stopRaf, releaseWakeLock, doSave])

  const start = useCallback(() => {
    // Unlock AudioContext on iOS (needs a user-gesture call)
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      ctx.resume().then(() => ctx.close()).catch(() => {})
    } catch {}

    endTimeRef.current = Date.now() + remainingRef.current * 1000
    setIsRunning(true)
    requestWakeLock()
    doSave()
    startRaf()
  }, [setIsRunning, requestWakeLock, doSave, startRaf])

  const toggle = useCallback(() => {
    if (isRunningRef.current) pause()
    else start()
  }, [pause, start])

  const reset = useCallback((seconds?: number) => {
    pause()
    const secs = seconds ?? (isBreakRef.current ? 5 * 60 : 25 * 60)
    setRemaining(secs)
    doSave()
  }, [pause, setRemaining, doSave])

  const startFocus = useCallback((minutes = 25) => {
    stopRaf()
    setIsBreak(false)
    const secs = minutes * 60
    setRemaining(secs)
    endTimeRef.current = Date.now() + secs * 1000
    setIsRunning(true)
    requestWakeLock()
    doSave()
    startRaf()
  }, [stopRaf, setIsBreak, setRemaining, setIsRunning, requestWakeLock, doSave, startRaf])

  const startBreak = useCallback((minutes = 5) => {
    stopRaf()
    setIsBreak(true)
    const secs = minutes * 60
    setRemaining(secs)
    endTimeRef.current = Date.now() + secs * 1000
    setIsRunning(true)
    requestWakeLock()
    doSave()
    startRaf()
  }, [stopRaf, setIsBreak, setRemaining, setIsRunning, requestWakeLock, doSave, startRaf])

  const completeSession = useCallback(() => {
    setSessions(p => p + 1)
    doSave()
  }, [setSessions, doSave])

  const skip = useCallback(() => {
    pause()
    if (!isBreakRef.current) {
      completeSession()
      startBreak()
    } else {
      startFocus()
    }
  }, [pause, completeSession, startBreak, startFocus])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return {
    remaining,
    isRunning,
    isBreak,
    sessionsCompleted,
    formatted: formatTime(remaining),
    toggle,
    reset,
    skip,
    startFocus,
    startBreak,
    completeSession,
    setRemaining: (v: number) => { setRemaining(v); doSave() },
  }
}
