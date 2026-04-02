/**
 * AuthGuard — React Router v6 layout route that protects all pages.
 *
 * Telegram Mini App mode:  always passes through (Telegram handles auth).
 * Web / browser mode:
 *   - While validating the stored JWT  → shows a loading spinner.
 *   - No valid session                 → redirects to /login.
 *   - Session valid                    → renders <Outlet />.
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import { usePlatform } from '../hooks/usePlatform'

const AuthGuard: React.FC = () => {
  const { isTelegram } = usePlatform()
  const { isLoading, isAuthenticated } = useAuth()

  // Telegram Mini App: user is always authenticated via WebApp
  if (isTelegram) return <Outlet />

  // Web: waiting for localStorage token validation
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-slate-950">
        <BookOpenIcon className="w-12 h-12 text-sahifa-500 animate-pulse" />
      </div>
    )
  }

  // Web: no valid session → send to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default AuthGuard
