/**
 * LoginPage — web-only authentication page.
 *
 * Renders the official Telegram Login Widget which lets users sign in
 * with their Telegram account without needing a username/password.
 *
 * Flow:
 *   1. User clicks the Telegram button
 *   2. Telegram opens a popup, user confirms
 *   3. Telegram calls the global `onTelegramAuth(user)` callback
 *   4. We POST the data to /api/auth/telegram (bot verifies the HMAC hash)
 *   5. Backend returns a JWT → stored in localStorage
 *   6. AuthContext updates → AuthGuard lets the user through → redirect to /
 *
 * Shown only in web/browser mode — Telegram Mini App users skip this entirely.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, TelegramWidgetData } from '../context/AuthContext'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined

// ─── TelegramLoginButton ──────────────────────────────────────────────────────

interface TelegramLoginButtonProps {
  onAuth: (data: TelegramWidgetData) => void
}

const TelegramLoginButton: React.FC<TelegramLoginButtonProps> = ({ onAuth }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !BOT_USERNAME) return

    // Expose a global callback the widget script calls
    ;(window as any).onTelegramAuth = (userData: TelegramWidgetData) => {
      onAuth(userData)
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true
    containerRef.current.appendChild(script)

    return () => {
      delete (window as any).onTelegramAuth
    }
  }, [onAuth])

  if (!BOT_USERNAME) {
    return (
      <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
        ⚠️ <code>VITE_BOT_USERNAME</code> is not set. Add it to <code>.env.local</code>.
      </div>
    )
  }

  return <div ref={containerRef} className="flex justify-center" />
}

// ─── LoginPage ────────────────────────────────────────────────────────────────

const LoginPage: React.FC = () => {
  const { isAuthenticated, loginWithTelegram } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Already authenticated? Redirect immediately
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const handleAuth = async (data: TelegramWidgetData) => {
    setLoading(true)
    setError('')
    try {
      await loginWithTelegram(data)
      navigate('/', { replace: true })
    } catch {
      setError("Kirish muvaffaqiyatsiz. Qayta urinib ko'ring.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sahifa-50 via-white to-sahifa-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 space-y-6 text-center">

          {/* Logo */}
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-sahifa-400 via-sahifa-500 to-sahifa-600 bg-clip-text text-transparent">
              SAHIFALAB
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 tracking-wide">
              Bilim va Diqqat Ekotizimi
            </p>
          </div>

          {/* Illustration */}
          <div className="py-2 text-6xl select-none">📚</div>

          {/* Heading */}
          <div className="space-y-1.5">
            <p className="font-semibold text-gray-900 dark:text-white text-lg">
              Telegram orqali kiring
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Platformaga kirish uchun Telegram&nbsp;hisobingizdan foydalaning
            </p>
          </div>

          {/* Telegram widget */}
          <div className="py-1">
            {loading ? (
              <div className="h-10 flex items-center justify-center">
                <span className="text-sahifa-600 dark:text-sahifa-400 text-sm animate-pulse">
                  Kirish amalga oshirilmoqda…
                </span>
              </div>
            ) : (
              <TelegramLoginButton onAuth={handleAuth} />
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2">
              {error}
            </p>
          )}

          {/* Fine print */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Telegram sizning ma&apos;lumotlaringizni xavfsiz saqlaydi.
            <br />
            Parol talab qilinmaydi.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-gray-400 dark:text-gray-500">
          @Sahifalab_hub_bot · 2026
        </p>
      </div>
    </div>
  )
}

export default LoginPage
