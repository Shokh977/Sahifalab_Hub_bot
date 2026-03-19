import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

type PlanDuration = 7 | 14 | 30

type PlanState = {
  duration: PlanDuration
  startDate: string
  completedDays: Record<string, true>
}

const PLAN_PRESETS: Array<{ duration: PlanDuration; title: string; subtitle: string }> = [
  { duration: 7, title: '7 kunlik sprint', subtitle: 'Yengil start va ritmni topish' },
  { duration: 14, title: '14 kunlik challenge', subtitle: 'Muntazamlikni mustahkamlash' },
  { duration: 30, title: '30 kunlik master plan', subtitle: 'Kuchli odatga aylantirish' },
]

function tashkentDateKey(daysAgo = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
}

function diffDays(startDate: string, endDate: string): number {
  const s = new Date(startDate)
  const e = new Date(endDate)
  const ms = e.getTime() - s.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const PlansPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useTelegramWebApp()

  const userKey = String(user?.id ?? 'guest')
  const planStorageKey = `study_plan_${userKey}`
  const todayKey = tashkentDateKey(0)

  const [plan, setPlan] = useState<PlanState | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(planStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as PlanState
      setPlan(parsed)
    } catch {
      // Ignore broken local storage
    }
  }, [planStorageKey])

  const startPlan = (duration: PlanDuration) => {
    const next: PlanState = {
      duration,
      startDate: todayKey,
      completedDays: {},
    }
    setPlan(next)
    try {
      localStorage.setItem(planStorageKey, JSON.stringify(next))
    } catch {
      // Ignore local storage failures
    }
  }

  const resetPlan = () => {
    setPlan(null)
    try {
      localStorage.removeItem(planStorageKey)
    } catch {
      // Ignore local storage failures
    }
  }

  const markTodayComplete = () => {
    if (!plan) return
    const next: PlanState = {
      ...plan,
      completedDays: {
        ...plan.completedDays,
        [todayKey]: true,
      },
    }
    setPlan(next)
    try {
      localStorage.setItem(planStorageKey, JSON.stringify(next))
    } catch {
      // Ignore local storage failures
    }
  }

  const removeTodayComplete = () => {
    if (!plan) return
    const nextCompleted = { ...plan.completedDays }
    delete nextCompleted[todayKey]
    const next: PlanState = {
      ...plan,
      completedDays: nextCompleted,
    }
    setPlan(next)
    try {
      localStorage.setItem(planStorageKey, JSON.stringify(next))
    } catch {
      // Ignore local storage failures
    }
  }

  const analytics = useMemo(() => {
    if (!plan) {
      return {
        dayIndex: 0,
        completedCount: 0,
        remainingDays: 0,
        progress: 0,
        isCompleted: false,
        todayCompleted: false,
      }
    }

    const dayIndex = Math.max(1, diffDays(plan.startDate, todayKey) + 1)
    const completedCount = Object.keys(plan.completedDays).length
    const remainingDays = Math.max(0, plan.duration - dayIndex)
    const progress = Math.min(100, Math.round((completedCount / plan.duration) * 100))
    const isCompleted = completedCount >= plan.duration
    const todayCompleted = !!plan.completedDays[todayKey]

    return {
      dayIndex,
      completedCount,
      remainingDays,
      progress,
      isCompleted,
      todayCompleted,
    }
  }, [plan, todayKey])

  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-900 border border-teal-100 dark:border-slate-700"
      >
        <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">🗓️ Reading Plans</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          O‘zingizga mos reja tanlang va har kuni kichik qadam bilan oldinga yuring.
        </p>
      </motion.div>

      {!plan && (
        <div className="space-y-3">
          {PLAN_PRESETS.map((preset, idx) => (
            <motion.button
              key={preset.duration}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * idx }}
              onClick={() => startPlan(preset.duration)}
              className="w-full rounded-2xl p-4 text-left bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{preset.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.subtitle}</p>
                </div>
                <span className="text-lg">➡️</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {plan && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 dark:text-white">Aktiv reja: {plan.duration} kun</p>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-200">
                Kun {analytics.dayIndex}
              </span>
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-500"
                style={{ width: `${analytics.progress}%` }}
              />
            </div>

            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>Bajarilgan: {analytics.completedCount}/{plan.duration}</span>
              <span>{analytics.progress}%</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={analytics.todayCompleted ? removeTodayComplete : markTodayComplete}
                className="py-2 rounded-xl bg-teal-500 text-white text-sm font-semibold"
              >
                {analytics.todayCompleted ? 'Bugunni bekor qilish' : 'Bugun bajarildi'}
              </button>
              <button
                onClick={resetPlan}
                className="py-2 rounded-xl bg-slate-500 text-white text-sm font-semibold"
              >
                Rejani yangidan boshlash
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30"
          >
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {analytics.isCompleted
                ? '🎉 Reja yakunlandi! Keyingi bosqichga o‘ting.'
                : `Qolgan kunlar: ${analytics.remainingDays}`}
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
              Har kuni Daily missiya + 1 ta quiz kombinatsiyasi eng yaxshi natija beradi.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/daily')}
                className="py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold"
              >
                Daily missiyaga o‘tish
              </button>
              <button
                onClick={() => navigate('/quiz')}
                className="py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold"
              >
                Quizga o‘tish
              </button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

export default PlansPage
