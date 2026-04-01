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
 *   - role=teacher + status=pending → "waiting admin approval" screen (NOT redirect)
 *   - Authenticated but wrong role → redirect to / (with state so we can show a toast)
 *   - Authenticated + correct role + status=active → render <Outlet />
 *
 * In Telegram Mini App mode, role is read from AuthContext (defaults to 'student'
 * for regular users, 'admin' for the known admin telegram_id).
 */
import React from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
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

  // Role matches but teacher account is still pending admin approval
  if (
    user &&
    roles.includes(user.role) &&
    user.role === 'teacher' &&
    user.status === 'pending'
  ) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 bg-[#FAFAFA] dark:bg-slate-950">
        <div className="text-7xl select-none animate-bounce">⏳</div>
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">
            Ariza ko'rib chiqilmoqda
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Arizangiz admin tomonidan tekshirilmoqda.
            Tasdiqlangandan so'ng o'qituvchi paneli ochiladi va
            keyingi kirishda avtomatik yo'naltirilasiz.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-700 dark:text-amber-300 text-left max-w-sm w-full space-y-1">
          <p className="font-semibold">📋 Holat: Kutilmoqda</p>
          <p>Foydalanuvchi: <span className="font-mono">{user.first_name}</span></p>
          {user.username && <p>Username: <span className="font-mono">@{user.username}</span></p>}
        </div>
        <Link
          to="/"
          className="px-6 py-2.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          🏠 Bosh sahifaga qaytish
        </Link>
      </div>
    )
  }

  // Logged in but insufficient role
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace state={{ roleError: true }} />
  }

  return <Outlet />
}

export default RoleGuard

