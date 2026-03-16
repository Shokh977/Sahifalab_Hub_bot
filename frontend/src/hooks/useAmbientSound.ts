import { useRef, useCallback, useState, useEffect } from 'react'

export type SoundType = string  // dynamic — can be DB sound id or any identifier

/**
 * Ambient sound player that streams real audio files via HTML5 Audio.
 *
 * How it works:
 *  1. Caller provides a URL (resolved from Telegram file_id via backend).
 *  2. An <audio> element plays + loops the file.
 *  3. Volume is adjustable in real time.
 *  4. Audio keeps playing in the background / with phone locked (the browser
 *     keeps the media session alive as long as we don't suspend the element).
 */
export const useAmbientSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeSound, setActiveSound] = useState<SoundType>('silence')
  const [volume, setVolume] = useState(0.5)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Create a singleton Audio element
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio()
      el.loop = true
      el.preload = 'auto'
      el.volume = 0.5
      audioRef.current = el

      // Media Session API — keeps audio alive on lock screen
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Ambient Sound',
          artist: 'SAHIFALAB Study',
          album: 'Focus Music',
        })
      }
    }
    return audioRef.current
  }, [])

  /**
   * Play a sound from a direct URL.
   * @param soundType  – which category (for UI state)
   * @param url        – direct audio URL (from Telegram or any CDN)
   */
  const play = useCallback(
    async (soundType: SoundType, url?: string) => {
      if (soundType === 'silence') {
        stop()
        return
      }
      if (!url) return

      const audio = getAudio()
      setIsLoading(true)

      try {
        // If it's a different source, switch
        if (audio.src !== url) {
          audio.src = url
          audio.load()
        }
        await audio.play()
        setActiveSound(soundType)
        setIsPlaying(true)
      } catch (err) {
        console.warn('Audio play failed:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [getAudio],
  )

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setActiveSound('silence')
    setIsPlaying(false)
  }, [])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    if (audioRef.current) {
      audioRef.current.volume = v
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  return { activeSound, volume, isPlaying, isLoading, play, stop, changeVolume }
}
