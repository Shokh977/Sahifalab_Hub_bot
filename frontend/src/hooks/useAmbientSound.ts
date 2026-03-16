import { useCallback, useState, useEffect } from 'react'

export type SoundType = string

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton — lives OUTSIDE React.
// The Audio element is created once and never destroyed, so it keeps playing
// when the user navigates to another section or locks their phone.
// ─────────────────────────────────────────────────────────────────────────────

let _audio: HTMLAudioElement | null = null
let _activeSound: SoundType = 'silence'
let _isPlaying  = false
let _volume     = 0.5
let _src        = ''

const STORAGE_KEY = 'sahifalab_ambient'

function _getOrCreate(): HTMLAudioElement {
  if (!_audio) {
    _audio         = new Audio()
    _audio.loop    = true
    _audio.preload = 'none'
    _audio.volume  = _volume
    // Keep module flags in sync with native events (fire even without React mounted)
    _audio.addEventListener('pause', () => { _isPlaying = false })
    _audio.addEventListener('ended', () => { _isPlaying = false; _activeSound = 'silence' })
  }
  return _audio
}

function _persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeSound: _activeSound,
      src:         _src,
      volume:      _volume,
    }))
  } catch { /* storage unavailable */ }
}

function _setupMediaSession(onStop: () => void) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Ambient Sound', artist: 'SAHIFALAB Study', album: 'Focus Music',
  })
  navigator.mediaSession.setActionHandler('play',  () => { _audio?.play() })
  navigator.mediaSession.setActionHandler('pause', onStop)
  navigator.mediaSession.setActionHandler('stop',  onStop)
}

// ─────────────────────────────────────────────────────────────────────────────
export const useAmbientSound = () => {
  // Initialise React state from the current singleton state so the UI is
  // correct immediately when navigating back to StudyPage.
  const [activeSound, setActiveSound] = useState<SoundType>(_activeSound)
  const [volume,      setVolume]      = useState(_volume)
  const [isPlaying,   setIsPlaying]   = useState(_isPlaying)
  const [isLoading,   setIsLoading]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // On mount: attach listeners that keep React state in sync with the singleton.
  // On unmount: detach those listeners but DO NOT pause or destroy the audio.
  useEffect(() => {
    const audio = _getOrCreate()

    // Immediately sync UI (handles navigating back to the page)
    setActiveSound(_activeSound)
    setVolume(_volume)
    setIsPlaying(!audio.paused && _isPlaying)

    const onPlaying = () => { _isPlaying = true;  setIsPlaying(true);  setIsLoading(false) }
    const onPause   = () => { _isPlaying = false; setIsPlaying(false) }
    const onEnded   = () => { _isPlaying = false; setIsPlaying(false); setActiveSound('silence') }

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause',   onPause)
    audio.addEventListener('ended',   onEnded)

    return () => {
      // Detach React listeners but leave audio running
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause',   onPause)
      audio.removeEventListener('ended',   onEnded)
      _persist()
    }
  }, [])

  const stop = useCallback(() => {
    const audio = _getOrCreate()
    audio.pause()
    audio.currentTime = 0
    _activeSound = 'silence'
    _isPlaying   = false
    _src         = ''
    setActiveSound('silence')
    setIsPlaying(false)
    setIsLoading(false)
    setError(null)
    _persist()
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none'
    }
  }, [])

  const play = useCallback((soundType: SoundType, url?: string) => {
    if (soundType === 'silence') { stop(); return }
    if (!url) { console.error('[Sound] play() called with no URL'); return }

    const audio = _getOrCreate()
    console.log('[Sound] play() →', soundType, url)

    setIsLoading(true)
    setIsPlaying(false)
    setError(null)
    setActiveSound(soundType)
    _activeSound = soundType

    const onCanPlay = () => {
      console.log('[Sound] canplay — triggering play()')
      audio.play().catch(err => {
        console.error('[Sound] play() rejected after canplay:', err.name, err.message)
        setIsLoading(false)
        setIsPlaying(false)
        setError(err.message)
      })
    }
    const onPlaying = () => {
      console.log('[Sound] ▶ playing started')
      _isPlaying = true
      _src       = url
      setIsLoading(false)
      setIsPlaying(true)
      setError(null)
      _persist()
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing'
      }
    }
    const onError = () => {
      const codes: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      }
      const code = audio.error?.code ?? 0
      const msg  = codes[code] ?? `Unknown error (${code})`
      console.error('[Sound] ❌ audio element error:', msg, audio.error)
      _isPlaying   = false
      _activeSound = 'silence'
      setIsLoading(false)
      setIsPlaying(false)
      setActiveSound('silence')
      setError(msg)
      _persist()
    }
    const onStalled = () => console.warn('[Sound] ⏸ stalled')
    const onWaiting = () => console.warn('[Sound] ⏳ waiting')
    const onSuspend = () => console.warn('[Sound] 🛌 suspend')

    audio.addEventListener('canplay',  onCanPlay,  { once: true })
    audio.addEventListener('playing',  onPlaying,  { once: true })
    audio.addEventListener('error',    onError,    { once: true })
    audio.addEventListener('stalled',  onStalled)
    audio.addEventListener('waiting',  onWaiting)
    audio.addEventListener('suspend',  onSuspend)

    const cleanupExtra = () => {
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('suspend', onSuspend)
    }
    audio.addEventListener('playing', cleanupExtra, { once: true })
    audio.addEventListener('error',   cleanupExtra, { once: true })

    if (audio.src !== url) audio.src = url
    audio.load()

    _setupMediaSession(stop)
  }, [stop])

  const changeVolume = useCallback((v: number) => {
    _volume = v
    setVolume(v)
    _getOrCreate().volume = v
    _persist()
  }, [])

  return { activeSound, volume, isPlaying, isLoading, error, play, stop, changeVolume }
}
