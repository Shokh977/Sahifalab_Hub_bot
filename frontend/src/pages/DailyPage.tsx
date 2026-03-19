import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useProgressStore, formatFocusTime } from '../context/progressStore'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

type DailyState = {
  reflectionDone: boolean
}

type BaselineState = {
  focusStart: number
  quizStart: number
}

const DAILY_FOCUS_SECONDS = 15 * 60
const DAILY_QUIZ_COUNT = 1

function tashkentDateKey(daysAgo = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
}

const DailyPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useTelegramWebApp()
  const { focusSeconds, quizzesCompleted } = useProgressStore()

  const userKey = String(user?.id ?? 'guest')
  const dateKey = tashkentDateKey(0)

  const stateStorageKey = `daily_state_${userKey}_${dateKey}`
  const baselineStorageKey = `daily_baseline_${userKey}_${dateKey}`

  const [dailyState, setDailyState] = useState<DailyState>({ reflectionDone: false })
  const [baseline, setBaseline] = useState<BaselineState>({
    focusStart: focusSeconds,
    quizStart: quizzesCompleted,
  })

  useEffect(() => {
    try {
      const baselineRaw = localStorage.getItem(baselineStorageKey)
      if (baselineRaw) {
        const parsed = JSON.parse(baselineRaw) as BaselineState
        setBaseline(parsed)
      } else {
        const fresh: BaselineState = {
          focusStart: focusSeconds,
          quizStart: quizzesCompleted,
        }
        localStorage.setItem(baselineStorageKey, JSON.stringify(fresh))
        setBaseline(fresh)
      }

      const stateRaw = localStorage.getItem(stateStorageKey)
      if (stateRaw) {
        const parsed = JSON.parse(stateRaw) as DailyState
        setDailyState(parsed)
      }
    } catch {
      // Ignore corrupted local storage and continue with defaults
    }
  }, [baselineStorageKey, stateStorageKey, focusSeconds, quizzesCompleted])

  const focusToday = Math.max(0, focusSeconds - baseline.focusStart)
  const quizToday = Math.max(0, quizzesCompleted - baseline.quizStart)

  const focusDone = focusToday >= DAILY_FOCUS_SECONDS
  const quizDone = quizToday >= DAILY_QUIZ_COUNT
  const reflectionDone = dailyState.reflectionDone

  const completed = [focusDone, quizDone, reflectionDone].filter(Boolean).length
  const progress = Math.round((completed / 3) * 100)

  const streak = useMemo(() => {
    let days = 0
    for (let i = 0; i < 30; i += 1) {
      const k = `daily_state_${userKey}_${tashkentDateKey(i)}`
      const b = `daily_baseline_${userKey}_${tashkentDateKey(i)}`
      try {
        const sRaw = localStorage.getItem(k)
        const bRaw = localStorage.getItem(b)
        if (!sRaw || !bRaw) break

        const s = JSON.parse(sRaw) as DailyState
        const base = JSON.parse(bRaw) as BaselineState

        if (i === 0) {
          if (focusDone && quizDone && s.reflectionDone) {
            days += 1
            continue
          }
          break
        }

        // For past days, we only track reflection manually in storage.
        // Keep streak conservative: require reflection flag as minimum completion proof.
        if (s.reflectionDone && typeof base.focusStart === 'number' && typeof base.quizStart === 'number') {
          days += 1
        } else {
          break
        }
      } catch {
        break
      }
    }
    return days
  }, [userKey, focusDone, quizDone, reflectionDone])

  const markReflection = () => {
    const next = { reflectionDone: !dailyState.reflectionDone }
    setDailyState(next)
    try {
      localStorage.setItem(stateStorageKey, JSON.stringify(next))
    } catch {
      // Ignore local storage failure
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-slate-800 dark:to-slate-900 border border-rose-100 dark:border-slate-700"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">🔥 Daily Missiya</h1>
          <span className="text-xs px-2 py-1 rounded-full bg-white/70 dark:bg-slate-700 text-gray-600 dark:text-gray-200">
            {dateKey}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          Bugungi 3 vazifani yakunlang va ketma-ketlikni ushlab turing.
        </p>

        <div className="mt-4">
          <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose-500 to-orange-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Bajarildi: {completed}/3</span>
            <span>Progress: {progress}%</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl p-4 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">1) 15 daqiqa fokus</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Bugun: {formatFocusTime(focusToday)} / {formatFocusTime(DAILY_FOCUS_SECONDS)}
            </p>
          </div>
          <span className={`text-xl ${focusDone ? 'text-green-500' : 'text-gray-400'}`}>{focusDone ? '✅' : '⏳'}</span>
        </div>
        <button
          onClick={() => navigate('/study')}
          className="mt-3 w-full py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold"
        >
          Focus boshlash
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-4 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">2) 1 ta quiz topshirish</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Bugun: {quizToday} / {DAILY_QUIZ_COUNT}
            </p>
          </div>
          <span className={`text-xl ${quizDone ? 'text-green-500' : 'text-gray-400'}`}>{quizDone ? '✅' : '⏳'}</span>
        </div>
        <button
          onClick={() => navigate('/quiz')}
          className="mt-3 w-full py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold"
        >
          Quiz yechish
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl p-4 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">3) Qisqa refleksiya</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Bugun nimani o'rgandingiz? 1 gap yozing.
            </p>
          </div>
          <span className={`text-xl ${reflectionDone ? 'text-green-500' : 'text-gray-400'}`}>{reflectionDone ? '✅' : '⏳'}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={markReflection}
            className="py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold"
          >
            {reflectionDone ? 'Bekor qilish' : 'Bajardim'}
          </button>
          <button
            onClick={() => navigate('/ai-companion')}
            className="py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold"
          >
            AI bilan yozish
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30"
      >
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">🏅 Joriy streak: {streak} kun</p>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
          Har kuni 3/3 vazifa bilan muntazamlikni ushlab turing.
        </p>
      </motion.div>
    </div>
  )
}

export default DailyPage
