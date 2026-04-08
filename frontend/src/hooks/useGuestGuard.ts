/**
 * useGuestGuard — action-based authentication guard.
 *
 * Returns `withAuth(fn)` — a wrapper that:
 *   • If user IS authenticated → calls fn normally.
 *   • If user is a GUEST → shows a Uzbek toast ("Tizimga kiring!") and
 *     navigates to /login after a short delay so the user sees the message.
 *
 * Usage:
 *   const { withAuth } = useGuestGuard()
 *   <button onClick={withAuth(handleLike)}>Like</button>
 *
 * Note: withAuth is stable (memoised) so it's safe to pass as a prop.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../components/ErrorBoundary'

export function useGuestGuard() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  /**
   * Wraps any click/event handler.
   * If the user is a guest the original fn is never called.
   */
  const withAuth = useCallback(
    <T extends unknown[]>(fn: (...args: T) => void | Promise<void>) =>
      (...args: T): void => {
        if (!isAuthenticated) {
          showToast("Davom etish uchun tizimga kiring 🔐", 'error')
          setTimeout(() => navigate('/login'), 700)
          return
        }
        void fn(...args)
      },
    [isAuthenticated, navigate],
  )

  return { withAuth, isAuthenticated }
}
