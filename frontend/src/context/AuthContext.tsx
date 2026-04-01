/**
 * AuthContext — unified authentication for both platforms.
 *
 * Telegram Mini App mode:
 *   - User is always considered authenticated (Telegram guarantees it).
 *   - User data comes from useTelegramWebApp().user (initDataUnsafe.user).
 *   - No JWT is stored or needed.
 *
 * Web / browser mode:
 *   - On mount: reads `auth_token` from localStorage, calls GET /api/auth/me
 *     to validate the token and restore the session.
 *   - loginWithTelegram(data): calls POST /api/auth/telegram with the data
 *     received from the Telegram Login Widget, stores the returned JWT.
 *   - logout(): removes the token and clears the user.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { usePlatform } from '../hooks/usePlatform'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

// ── Public types ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  /** 'student' | 'teacher' | 'admin' */
  role: 'student' | 'teacher' | 'admin'
  /** 'active' | 'suspended' | 'pending' */
  status: 'active' | 'suspended' | 'pending'
  /** Gamification — filled from /api/auth/me */
  level?: number
  total_xp?: number
}

/** Data received from the Telegram Login Widget callback */
export interface TelegramWidgetData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  /** true when the user is authenticated and can access protected pages */
  isAuthenticated: boolean
  /** Web-only: call with Telegram Login Widget data → stores JWT + user */
  loginWithTelegram: (data: TelegramWidgetData) => Promise<void>
  /** Web-only: call with data returned by GET /api/auth/verify-code → stores JWT + user */
  loginWithCode: (data: Record<string, any>) => void
  /** Web-only: clears JWT and user */
  logout: () => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isTelegram } = usePlatform()
  const { user: tgUser } = useTelegramWebApp()

  // Web-only state
  const [webUser, setWebUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  // isLoading: only web mode needs async token validation; Telegram = instant
  const [isLoading, setIsLoading] = useState(!isTelegram)

  // ── Web: validate stored token on mount ───────────────────────────────────
  useEffect(() => {
    if (isTelegram) return

    const stored = localStorage.getItem('auth_token')
    if (!stored) {
      setIsLoading(false)
      return
    }

    axios
      .get(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      })
      .then(res => {
        setToken(stored)
        setWebUser({
          id: res.data.telegram_id,
          first_name: res.data.first_name,
          username: res.data.username,
          photo_url: res.data.photo_url,
          role: res.data.role ?? 'student',
          status: res.data.status ?? 'active',
          level: res.data.level ?? 1,
          total_xp: res.data.total_xp ?? 0,
        })
      })
      .catch(() => {
        // Token invalid or expired — clear it silently
        localStorage.removeItem('auth_token')
      })
      .finally(() => setIsLoading(false))
  }, [isTelegram])

  // ── Web: login via Telegram Login Widget ──────────────────────────────────
  const loginWithTelegram = useCallback(async (data: TelegramWidgetData) => {
    const res = await axios.post(`${API_BASE}/api/auth/telegram`, data)
    const { access_token, telegram_id, first_name, username, photo_url, role, status } = res.data
    localStorage.setItem('auth_token', access_token)
    setToken(access_token)
    setWebUser({ id: telegram_id, first_name, username, photo_url, role: role ?? 'student', status: status ?? 'active' })
  }, [])

  // ── Web: login via bot-code verify response ───────────────────────────────
  const loginWithCode = useCallback((data: Record<string, any>) => {
    const { access_token, telegram_id, first_name, username, photo_url, role, status_account } = data
    localStorage.setItem('auth_token', access_token)
    setToken(access_token)
    setWebUser({
      id: telegram_id,
      first_name,
      username,
      photo_url,
      role: role ?? 'student',
      status: status_account ?? 'active',
      level: data.level ?? 1,
      total_xp: data.total_xp ?? 0,
    })
  }, [])

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setWebUser(null)
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────

  // In Telegram mode the user comes from the WebApp; in web mode from the JWT flow
  const user: AuthUser | null = isTelegram
    ? tgUser
      ? {
          id: tgUser.id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          username: tgUser.username,
          photo_url: tgUser.photo_url,
          role: 'student',   // enriched from DB later if needed
          status: 'active',
        }
      : null
    : webUser

  // Telegram Mini App = always authenticated (Telegram guarantees the session)
  // Web mode = authenticated only when we have a valid JWT + user object
  const isAuthenticated = isTelegram ? true : !!token && !!webUser

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated, loginWithTelegram, loginWithCode, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>')
  return ctx
}
