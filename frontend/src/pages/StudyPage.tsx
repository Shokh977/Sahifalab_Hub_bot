import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useBackgroundTimer } from '../hooks/useBackgroundTimer'
import { useAmbientSound, SoundType } from '../hooks/useAmbientSound'
import apiService from '../services/apiService'

/* ──────────────────────────────────────────────────────────────────────────────
   SOUND CONFIGURATION
   ──────────────────────────────────────────────────────────────────────────────
   Replace the `fileId` values below with the Telegram file_ids you get after
   sending audio files to your bot.

   How to get file_ids:
   1. Send an audio file (.mp3/.ogg) to @sahifalab_bot in Telegram.
   2. Use the bot's /getfileid command, or check the webhook/log for the
      `file_id` field in the incoming message.
   3. Paste the file_id string below.
   ────────────────────────────────────────────────────────────────────────────── */

interface SoundConfig {
  id: SoundType
  emoji: string
  label: string
  fileId: string  // Telegram file_id — fill these in!
}

const AMBIENT_SOUNDS: SoundConfig[] = [
  { id: 'rain',      emoji: '🌧️', label: "Yomg'ir",    fileId: '' },
  { id: 'ocean',     emoji: '🌊', label: 'Okean',       fileId: '' },
  { id: 'forest',    emoji: '🌲', label: "O'rmon",      fileId: '' },
  { id: 'coffee',    emoji: '☕', label: 'Kafe',         fileId: '' },
  { id: 'fireplace', emoji: '🔥', label: 'Kamin',       fileId: '' },
  { id: 'silence',   emoji: '🔇', label: 'Jimjitlik',   fileId: '' },
]

const FOCUS_PRESETS = [15, 25, 45, 60]

export const StudyWithMe: React.FC = () => {
  const sound = useAmbientSound()

  // Cache of resolved audio URLs: { fileId → url }
  const urlCacheRef = useRef<Record<string, string>>({})
  const [resolvingSound, setResolvingSound] = useState<SoundType | null>(null)

  const handleTimerComplete = useCallback(() => {
    // Vibrate if available
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  }, [])

  const timer = useBackgroundTimer({ onComplete: handleTimerComplete })

  const handleComplete = useCallback(() => {
    if (!timer.isBreak) {
      timer.completeSession()
      timer.startBreak()
    } else {
      timer.startFocus()
    }
  }, [timer])

  // Auto-transition when timer reaches 0
  React.useEffect(() => {
    if (timer.remaining === 0 && !timer.isRunning) {
      const t = setTimeout(handleComplete, 1500)
      return () => clearTimeout(t)
    }
  }, [timer.remaining, timer.isRunning, handleComplete])

  const progressPercent = timer.isBreak
    ? ((5 * 60 - timer.remaining) / (5 * 60)) * 100
    : ((25 * 60 - timer.remaining) / (25 * 60)) * 100

  /**
   * Resolve file_id → URL (cached), then play.
   */
  const handleSoundSelect = useCallback(async (cfg: SoundConfig) => {
    // Toggle off
    if (cfg.id === sound.activeSound && sound.isPlaying) {
      sound.stop()
      return
    }
    // Silence = just stop
    if (cfg.id === 'silence') {
      sound.stop()
      return
    }
    // No file_id configured yet
    if (!cfg.fileId) {
      alert(`"${cfg.label}" tovushi hali yuklanmagan. Admin file_id ni sozlashi kerak.`)
      return
    }

    setResolvingSound(cfg.id)
    try {
      let url = urlCacheRef.current[cfg.fileId]
      if (!url) {
        url = await apiService.getAudioLink(cfg.fileId)
        urlCacheRef.current[cfg.fileId] = url
      }
      sound.play(cfg.id, url)
    } catch (err) {
      console.error('Failed to resolve audio link:', err)
      alert("Audio yuklashda xatolik yuz berdi")
    } finally {
      setResolvingSound(null)
    }
  }, [sound])

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-5 pb-20">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          🎯 Study With Me
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {timer.isBreak ? "Dam olish vaqti — biroz nafas ol ☕" : "Diqqatni jamla — sen uddalaysan! 💪"}
        </p>
      </div>

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
                {timer.isBreak ? '☕ Dam olish' : '🎯 Fokus'}
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
          {timer.isRunning ? '⏸ Pauza' : '▶️ Boshlash'}
        </button>
        <button
          onClick={() => timer.reset()}
          className="px-4 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
        >
          🔄
        </button>
        <button
          onClick={timer.skip}
          className="px-4 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
        >
          ⏭
        </button>
      </div>

      {/* Ambient Sounds */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">🎵 Ambient tovushlar</h3>
          {sound.isPlaying && (
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full animate-pulse">
              ♪ Ijro etilmoqda
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {AMBIENT_SOUNDS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSoundSelect(s)}
              disabled={resolvingSound === s.id || sound.isLoading}
              className={`p-3 rounded-xl font-medium transition-all active:scale-95 relative ${
                sound.activeSound === s.id && sound.isPlaying
                  ? 'bg-blue-500 text-white ring-2 ring-blue-400 shadow-md'
                  : !s.fileId && s.id !== 'silence'
                    ? 'bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 opacity-60'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              {resolvingSound === s.id ? (
                <div className="text-2xl animate-spin">⏳</div>
              ) : (
                <div className="text-2xl">{s.emoji}</div>
              )}
              <div className="text-xs mt-1">{s.label}</div>
              {!s.fileId && s.id !== 'silence' && (
                <div className="absolute top-1 right-1 text-[8px] bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-1 rounded">
                  soon
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Volume Control */}
        {sound.isPlaying && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm">🔈</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              onChange={(e) => sound.changeVolume(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-sm">🔊</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">
              {Math.round(sound.volume * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Background playback info */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
        <p className="text-xs text-emerald-800 dark:text-emerald-300">
          🔋 <strong>Fon rejimi:</strong> Taymer va tovushlar telefon qulflanganda ham ishlaydi.
          Ilovadan chiqmang — fonga o'tkazing.
        </p>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
        <p className="text-xs text-yellow-900 dark:text-yellow-200">
          💡 <strong>Maslahat:</strong> Pomodoro usuli — 25 daqiqa fokus + 5 daqiqa dam olish.
          Har 4 sessiyadan so'ng uzunroq dam oling!
        </p>
      </div>
    </div>
  )
}

export default StudyWithMe
