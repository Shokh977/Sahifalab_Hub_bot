import React, { useState, useEffect } from 'react'

interface PomodoroSession {
  focusTime: number
  breakTime: number
  sessionsCompleted: number
}

const AMBIENT_SOUNDS = [
  { id: 'rain', name: '🌧️ Rain', emoji: '🌧️' },
  { id: 'forest', name: '🌲 Forest', emoji: '🌲' },
  { id: 'coffee', name: '☕ Coffee Shop', emoji: '☕' },
  { id: 'ocean', name: '🌊 Ocean', emoji: '🌊' },
  { id: 'fireplace', name: '🔥 Fireplace', emoji: '🔥' },
  { id: 'silence', name: '🔇 Silence', emoji: '🔇' },
]

export const StudyWithMe: React.FC = () => {
  const [time, setTime] = useState<number>(25 * 60) // 25 minutes
  const [isRunning, setIsRunning] = useState(false)
  const [isBreak, setIsBreak] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [selectedSound, setSelectedSound] = useState('silence')

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (isRunning && time > 0) {
      interval = setInterval(() => {
        setTime((prev) => prev - 1)
      }, 1000)
    } else if (time === 0 && isRunning) {
      // Session ended
      if (!isBreak) {
        setSessionsCompleted((prev) => prev + 1)
        setIsBreak(true)
        setTime(5 * 60) // 5 minute break
      } else {
        setIsBreak(false)
        setTime(25 * 60) // Back to focus
      }
    }

    return () => {
      if (interval !== null) {
        clearInterval(interval)
      }
    }
  }, [isRunning, time, isBreak])

  const toggleTimer = () => {
    setIsRunning(!isRunning)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setIsBreak(false)
    setTime(25 * 60)
  }

  const skipSession = () => {
    if (!isBreak) {
      setSessionsCompleted((prev) => prev + 1)
    }
    setIsBreak(!isBreak)
    setTime(isBreak ? 25 * 60 : 5 * 60)
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const progressPercent = isBreak
    ? ((5 * 60 - time) / (5 * 60)) * 100
    : ((25 * 60 - time) / (25 * 60)) * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          🎯 Study With Me
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {isBreak ? 'Time to take a break!' : 'Focus time - Stay concentrated!'}
        </p>
      </div>

      {/* Timer Display */}
      <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 space-y-4">
        {/* Progress Ring */}
        <div className="flex justify-center">
          <div className="relative w-48 h-48">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              {/* Background circle */}
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-gray-200 dark:text-gray-700"
              />
              {/* Progress circle */}
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${(Math.PI * 180 * progressPercent) / 100} ${Math.PI * 180}`}
                className={isBreak ? 'text-green-500' : 'text-blue-500'}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s linear' }}
              />
            </svg>
            {/* Time Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-gray-900 dark:text-white">
                {formatTime(time)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {isBreak ? 'Break' : 'Focus'}
              </div>
            </div>
          </div>
        </div>

        {/* Sessions Counter */}
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            Sessions Completed: <span className="text-blue-600 dark:text-blue-400">{sessionsCompleted}</span>
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={toggleTimer}
          className={`flex-1 btn-primary ${isRunning ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'}`}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Start'}
        </button>
        <button
          onClick={resetTimer}
          className="flex-1 btn-secondary"
        >
          🔄 Reset
        </button>
        <button
          onClick={skipSession}
          className="flex-1 btn-secondary"
        >
          ⏭️ Skip
        </button>
      </div>

      {/* Ambient Sounds */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">🎵 Ambient Sounds</h3>
        <div className="grid grid-cols-3 gap-2">
          {AMBIENT_SOUNDS.map((sound) => (
            <button
              key={sound.id}
              onClick={() => setSelectedSound(sound.id)}
              className={`p-3 rounded-lg font-medium transition-all ${
                selectedSound === sound.id
                  ? 'bg-blue-500 text-white ring-2 ring-blue-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-lg">{sound.emoji}</div>
              <div className="text-xs mt-1">{sound.name.split(' ')[1]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800">
        <p className="text-sm text-yellow-900 dark:text-yellow-200">
          💡 <strong>Tip:</strong> The Pomodoro technique uses 25-minute focus sessions with 5-minute breaks for optimal productivity!
        </p>
      </div>
    </div>
  )
}

export default StudyWithMe
