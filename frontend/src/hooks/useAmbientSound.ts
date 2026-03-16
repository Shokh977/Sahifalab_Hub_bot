import { useRef, useCallback, useState, useEffect } from 'react'

export type SoundType = string

export const useAmbientSound = () => {
  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const [activeSound, setActiveSound] = useState<SoundType>('silence')
  const [volume,      setVolume]      = useState(0.5)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [isLoading,   setIsLoading]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio()
      el.loop    = true
      el.preload = 'none'   // don't preload until explicitly played
      el.volume  = 0.5
      audioRef.current = el
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Ambient Sound', artist: 'SAHIFALAB Study', album: 'Focus Music',
        })
      }
    }
    return audioRef.current
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    setActiveSound('silence')
    setIsPlaying(false)
    setIsLoading(false)
    setError(null)
  }, [])

  const play = useCallback((soundType: SoundType, url?: string) => {
    if (soundType === 'silence') { stop(); return }
    if (!url) { console.error('[Sound] play() called with no URL'); return }

    const audio = getAudio()
    console.log('[Sound] play() →', soundType, url)

    setIsLoading(true)
    setIsPlaying(false)
    setError(null)
    setActiveSound(soundType)

    // ── Wire up event listeners before touching src ─────────────────────────────────
    const onPlaying = () => {
      console.log('[Sound] ▶ playing started')
      setIsLoading(false)
      setIsPlaying(true)
      setError(null)
    }
    const onCanPlay = () => {
      console.log('[Sound] canplay — triggering play()')
      audio.play().catch(err => {
        console.error('[Sound] play() rejected after canplay:', err.name, err.message)
        setIsLoading(false)
        setIsPlaying(false)
        setError(err.message)
      })
    }
    const onError = () => {
      const codes: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      }
      const code = audio.error?.code ?? 0
      const msg  = codes[code] ?? `Unknown error (${code})`
      console.error('[Sound] ❌ audio element error:', msg, audio.error)
      setIsLoading(false)
      setIsPlaying(false)
      setActiveSound('silence')
      setError(msg)
    }
    const onStalled  = () => console.warn('[Sound] ⏸ stalled  — waiting for data...')
    const onWaiting  = () => console.warn('[Sound] ⏳ waiting  — buffering...')
    const onSuspend  = () => console.warn('[Sound] 🛌 suspend  — browser paused download')

    audio.addEventListener('canplay',  onCanPlay,  { once: true })
    audio.addEventListener('playing',  onPlaying,  { once: true })
    audio.addEventListener('error',    onError,    { once: true })
    audio.addEventListener('stalled',  onStalled)
    audio.addEventListener('waiting',  onWaiting)
    audio.addEventListener('suspend',  onSuspend)

    // ── Load new source ────────────────────────────────────────────────────────────
    if (audio.src !== url) {
      audio.src = url
    }
    audio.load()  // always call load() to reset the element

    // Cleanup stalled/waiting/suspend listeners once we know the outcome
    const cleanupExtra = () => {
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('suspend', onSuspend)
    }
    audio.addEventListener('playing', cleanupExtra, { once: true })
    audio.addEventListener('error',   cleanupExtra, { once: true })
  }, [getAudio, stop])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  return { activeSound, volume, isPlaying, isLoading, error, play, stop, changeVolume }
}
