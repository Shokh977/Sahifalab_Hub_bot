/**
 * RoleGuard — React Router v6 layout route that checks user.role.
 *
 * Usage:
 *   <Route element={<RoleGuard roles={['teacher', 'admin']} />}>
 *     <Route path="/teacher" element={<TeacherDashboardPage />} />
 *   </Route>
 *
 * Behaviour:
 *   - isLoading (web JWT validation in progress) → spinner
 *   - Not authenticated at all → redirect to /login
 *   - Authenticated but wrong role → redirect to / (with state so we can show a toast)
 *   - Authenticated + correct role → render <Outlet />
 *
 * In Telegram Mini App mode, role is read from AuthContext (defaults to 'student'
 * for regular users, 'admin' for the known admin telegram_id).
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface RoleGuardProps {
  /** List of roles that are allowed to access the nested routes */
  roles: Array<'student' | 'teacher' | 'admin'>
}

const RoleGuard: React.FC<RoleGuardProps> = ({ roles }) => {
  const { user, isLoading, isAuthenticated } = useAuth()

  // Still validating JWT
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-slate-950">
        <div className="text-5xl animate-pulse select-none">📚</div>
      </div>
    )
  }

  // Not logged in at all
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Logged in but insufficient role
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace state={{ roleError: true }} />
  }

  return <Outlet />
}

export default RoleGuard
