/**
 * ProgressProvider — initializes the progress store from Telegram user data
 * and keeps it synced with Supabase.
 *
 * Mount this once, wrapping the entire app content (inside <Router>).
 *
 * Responsibilities:
 *   1. Read Telegram user (id + first_name) → call store.init()
 *   2. Heartbeat: sync to Supabase every 5 minutes if there are pending seconds
 *   3. Sync on page unload (beforeunload)
 */

import { useEffect } from 'react'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { useProgressStore } from '../context/progressStore'

const HEARTBEAT_MS = 5 * 60 * 1000   // 5 minutes

const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useTelegramWebApp()
  const { init, syncToSupabase, pendingFocusSeconds } = useProgressStore()

  // ── 1. Initialize store when Telegram user is available ─────────────────
  useEffect(() => {
    if (user?.id) {
      init(user.id, user.first_name, user.username)
    }
  }, [user?.id])  // re-run only if the user id changes

  // ── 2. Heartbeat sync every 5 minutes ───────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingFocusSeconds > 0) {
        syncToSupabase()
      }
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [pendingFocusSeconds, syncToSupabase])

  // ── 3. Sync on page unload ───────────────────────────────────────────────
  useEffect(() => {
    const onUnload = () => syncToSupabase()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [syncToSupabase])

  return <>{children}</>
}

export default ProgressProvider
