import { useRef, useState, useCallback, useEffect } from 'react'

interface UseBackgroundTimerOptions {
  /** Called when timer reaches 0 */
  onComplete?: () => void
  /** Called every ~1 s with remaining seconds */
  onTick?: (remaining: number) => void
}

/**
 * A background-resilient Pomodoro timer.
 *
 * Uses `Date.now()` timestamps instead of `setInterval` counting.
 * When the phone is locked or the app is backgrounded, setInterval is throttled
 * or paused by the OS — but the target timestamp stays correct.
 * On the next tick (or when the user returns), the timer "catches up" instantly.
 *
 * Also requests a Wake Lock (where supported) to keep the screen alive during focus.
 */
export const useBackgroundTimer = (opts?: UseBackgroundTimerOptions) => {
  const [remaining, setRemaining] = useState(25 * 60) // seconds
  const [isRunning, setIsRunning] = useState(false)
  const [isBreak, setIsBreak] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)

  const endTimeRef = useRef<number | null>(null) // Date.now() when timer will hit 0
  const rafRef = useRef<number | null>(null)
  const wakeLockRef = useRef<any>(null)
  const onCompleteRef = useRef(opts?.onComplete)
  const onTickRef = useRef(opts?.onTick)
  onCompleteRef.current = opts?.onComplete
  onTickRef.current = opts?.onTick

  // ── Wake Lock ──────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      }
    } catch { /* not supported or denied */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  // Re-acquire Wake Lock when returning from background
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isRunning, requestWakeLock])

  // ── Tick Loop ──────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!endTimeRef.current) return

    const now = Date.now()
    const left = Math.max(0, Math.round((endTimeRef.current - now) / 1000))
    setRemaining(left)
    onTickRef.current?.(left)

    if (left <= 0) {
      // Timer done
      endTimeRef.current = null
      setIsRunning(false)
      releaseWakeLock()
      onCompleteRef.current?.()
      return
    }

    rafRef.current = requestAnimationFrame(() => {
      // Use setTimeout 200ms to avoid burning CPU but stay responsive
      setTimeout(() => {
        rafRef.current = requestAnimationFrame(() => tick())
      }, 200)
    })
  }, [releaseWakeLock])

  // ── Start / Pause / Reset ──────────────────────────────────────────────
  const start = useCallback(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    ctx.resume().then(() => ctx.close()).catch(() => {})

    endTimeRef.current = Date.now() + remaining * 1000
    setIsRunning(true)
    requestWakeLock()
    rafRef.current = requestAnimationFrame(() => tick())
  }, [remaining, tick, requestWakeLock])

  const pause = useCallback(() => {
    // Save remaining time
    if (endTimeRef.current) {
      const left = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
      setRemaining(left)
    }
    endTimeRef.current = null
    setIsRunning(false)
    releaseWakeLock()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [releaseWakeLock])

  const toggle = useCallback(() => {
    if (isRunning) pause()
    else start()
  }, [isRunning, pause, start])

  const reset = useCallback((seconds?: number) => {
    pause()
    setRemaining(seconds ?? (isBreak ? 5 * 60 : 25 * 60))
  }, [pause, isBreak])

  const startFocus = useCallback((minutes = 25) => {
    setIsBreak(false)
    setRemaining(minutes * 60)
    endTimeRef.current = Date.now() + minutes * 60 * 1000
    setIsRunning(true)
    requestWakeLock()
    rafRef.current = requestAnimationFrame(() => tick())
  }, [tick, requestWakeLock])

  const startBreak = useCallback((minutes = 5) => {
    setIsBreak(true)
    setRemaining(minutes * 60)
    endTimeRef.current = Date.now() + minutes * 60 * 1000
    setIsRunning(true)
    requestWakeLock()
    rafRef.current = requestAnimationFrame(() => tick())
  }, [tick, requestWakeLock])

  const completeSession = useCallback(() => {
    setSessionsCompleted((prev) => prev + 1)
  }, [])

  const skip = useCallback(() => {
    pause()
    if (!isBreak) {
      completeSession()
      startBreak()
    } else {
      startFocus()
    }
  }, [pause, isBreak, completeSession, startBreak, startFocus])

  // Cleanup
  useEffect(() => {
    return () => {
      releaseWakeLock()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [releaseWakeLock])

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
    setRemaining,
  }
}
