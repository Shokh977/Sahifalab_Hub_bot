/**
 * AuthContext — unified authentication for both platforms.
 *
 * Telegram Mini App mode:
 *   - On mount: exchanges window.Telegram.WebApp.initData for a JWT via
 *     POST /api/auth/tma-init, stores the JWT in localStorage.
 *   - User data comes from the backend response (role, status, etc.).
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

import { API_BASE } from '../lib/apiUrl'

// ── Public types ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  /** User email — null if not yet linked (Telegram-only users) */
  email?: string | null
  /** True when the email has been verified (only relevant for email-registered users) */
  email_verified?: boolean | null
  /** 'student' | 'teacher' | 'admin' */
  role: 'student' | 'teacher' | 'admin'
  /** 'active' | 'suspended' | 'pending' */
  status: 'active' | 'suspended' | 'pending'
  /** Gamification — filled from /api/auth/me */
  level?: number
  total_xp?: number
  /** Profile bio fields */
  bio?: string | null
  about_me?: string | null
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
  /** Update the user email in-memory after a successful link-email call */
  updateUserEmail: (email: string) => void
  /** Merge arbitrary fields into the in-memory user object */
  updateUser: (patch: Partial<Record<string, any>>) => void
  /** Web-only: clears JWT and user */
  logout: () => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isTelegram } = usePlatform()
  const { user: tgUser } = useTelegramWebApp()

  // Shared state (used by both TMA and web flows)
  const [webUser, setWebUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── TMA: exchange initData for a JWT on mount ─────────────────────────────
  // Uses a separate localStorage key ('tma_auth_token') so TMA sessions never
  // overwrite web/email sessions stored under 'auth_token'.
  useEffect(() => {
    if (!isTelegram) return

    const initData = window.Telegram?.WebApp?.initData ?? ''

    // Re-use a cached TMA token if it exists
    const stored = localStorage.getItem('tma_auth_token')
    if (stored && tgUser) {
      // Optimistically restore from cache; re-validate via tma-init in background
      setToken(stored)
      setWebUser({
        id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        username: tgUser.username,
        photo_url: tgUser.photo_url,
        role: 'student',
        status: 'active',
      })
    }

    if (!initData) {
      // Running in browser dev mode without Telegram — skip
      setIsLoading(false)
      return
    }

    axios
      .post(`${API_BASE}/api/auth/tma-init`, { init_data: initData })
      .then(res => {
        const d = res.data
        localStorage.setItem('tma_auth_token', d.access_token)
        setToken(d.access_token)
        setWebUser({
          id: d.telegram_id,
          first_name: d.first_name,
          username: d.username,
          photo_url: d.photo_url,
          role: d.role ?? 'student',
          status: d.status ?? 'active',
        })
      })
      .catch(err => {
        console.error('[AuthContext] tma-init failed:', err?.response?.status, err?.response?.data)
        // Don't clear existing user — let them keep working with optimistic cache
      })
      .finally(() => setIsLoading(false))
  }, [isTelegram, tgUser])

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
          email: res.data.email ?? null,
          email_verified: res.data.email_verified ?? null,
          role: res.data.role ?? 'student',
          status: res.data.status ?? 'active',
          level: res.data.level ?? 1,
          total_xp: res.data.total_xp ?? 0,
          bio: res.data.bio ?? null,
          about_me: res.data.about_me ?? null,
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
    const { access_token, telegram_id, first_name, username, photo_url, email, email_verified, role, status_account, status } = data
    localStorage.setItem('auth_token', access_token)
    setToken(access_token)
    setWebUser({
      id: telegram_id,
      first_name,
      username,
      photo_url,
      email: email ?? null,
      email_verified: email_verified ?? null,
      role: role ?? 'student',
      status: status_account ?? status ?? 'active',
      level: data.level ?? 1,
      total_xp: data.total_xp ?? 0,
    })
  }, [])

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('tma_auth_token')
    setToken(null)
    setWebUser(null)
  }, [])

  // ── Update email after link-email ──────────────────────────────────────────
  const updateUserEmail = useCallback((email: string) => {
    setWebUser(prev => prev ? { ...prev, email } : prev)
  }, [])

  const updateUser = useCallback((patch: Partial<Record<string, any>>) => {
    setWebUser(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  // ── Listen for apiService token-expiry signal ──────────────────────────────
  // When the interceptor detects a 401 on /api/auth/me, it dispatches 'auth:expired'.
  // We clear the in-memory state here so the next AuthGuard check redirects to login.
  useEffect(() => {
    const handler = () => { setToken(null); setWebUser(null) }
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────

  // Both TMA and web modes now store auth in webUser + token after the JWT exchange.
  // tgUser is used only as the optimistic fallback while tma-init is in flight.
  const user: AuthUser | null = webUser ?? (
    isTelegram && tgUser
      ? {
          id: tgUser.id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          username: tgUser.username,
          photo_url: tgUser.photo_url,
          role: 'student',
          status: 'active',
        }
      : null
  )

  // Authenticated when we have a JWT + user; TMA gets a token from tma-init.
  const isAuthenticated = !!token && !!webUser

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated, loginWithTelegram, loginWithCode, updateUserEmail, updateUser, logout }}
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
