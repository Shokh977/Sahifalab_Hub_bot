/**
 * LoginPage — Bot-code auth flow.
 *
 * 1. Page mounts → POST /api/auth/request-code → 10-min code
 * 2. Shows "Open Bot" button:  t.me/<BOT>?start=auth_<code>
 * 3. Polls GET /api/auth/verify-code/<code> every 2 s
 * 4. Bot receives /start auth_<code>, records telegram_id in Supabase
 * 5. Poll returns 200 → frontend stores JWT → navigates to /
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')
const POLL_MS = 2000
const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined) || 'Sahifalab_hub_bot'
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''

declare global {
  interface Window {
    google?: any
  }
}

type PageState = 'loading' | 'waiting' | 'success' | 'expired' | 'error'

const LoginPage: React.FC = () => {
  const { isAuthenticated, loginWithCode } = useAuth()
  const navigate = useNavigate()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [botLink, setBotLink] = useState('')
  const [code, setCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const requestCode = useCallback(async () => {
    setPageState('loading')
    setErrorMsg('')
    stopPolling()
    try {
      const res = await axios.post(`${API_BASE}/api/auth/request-code`)
      setCode(res.data.code)
      setBotLink(res.data.bot_link)
      setPageState('waiting')
    } catch {
      setPageState('error')
      setErrorMsg("Serverga ulanib bo'lmadi. Sahifani yangilang.")
    }
  }, [])

  useEffect(() => {
    if (pageState !== 'waiting' || !code) return
    const poll = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/auth/verify-code/${code}`)
        if (res.status === 200 && res.data.status === 'ok') {
          stopPolling()
          setPageState('success')
          loginWithCode(res.data)
          navigate('/', { replace: true })
        }
      } catch (err: any) {
        const s = err?.response?.status
        if (s === 410 || s === 404) { stopPolling(); setPageState('expired') }
      }
    }
    pollRef.current = setInterval(poll, POLL_MS)
    return stopPolling
  }, [pageState, code, loginWithCode, navigate])

  useEffect(() => { requestCode() }, [requestCode])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp: { credential?: string }) => {
          if (!resp?.credential) return
          try {
            const res = await axios.post(`${API_BASE}/api/auth/google`, { id_token: resp.credential })
            loginWithCode(res.data)
            navigate('/', { replace: true })
          } catch (err: any) {
            const detail = err?.response?.data?.detail || "Google kirishda xatolik"
            setErrorMsg(String(detail))
            setPageState('error')
          }
        },
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 320,
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGoogle
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [loginWithCode, navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-sahifa-50 via-white to-sahifa-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 space-y-6 text-center">

          {/* Logo */}
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-sahifa-400 via-sahifa-500 to-sahifa-600 bg-clip-text text-transparent">SAHIFALAB</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 tracking-wide">Bilim va Diqqat Ekotizimi</p>
          </div>

          <div className="py-1 text-6xl select-none">📚</div>

          {pageState === 'loading' && (
            <div className="space-y-3">
              <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
              <p className="text-sm text-gray-400 animate-pulse">Tayyorlanmoqda…</p>
            </div>
          )}

          {pageState === 'waiting' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <p className="font-semibold text-gray-900 dark:text-white text-lg">Telegram orqali kiring</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Quyidagi tugmani bosing — Telegram bot ochiladi.<br />
                  Botda <strong>«Start»</strong> tugmasini bosing.
                </p>
              </div>

              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-[#2AABEE] hover:bg-[#1d97d4] active:scale-95 text-white font-semibold py-4 rounded-2xl shadow-lg transition-all text-base"
              >
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
                </svg>
                @{BOT_USERNAME} — Kirish
              </a>

              {GOOGLE_CLIENT_ID && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">yoki</span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="flex justify-center">
                    <div ref={googleBtnRef} />
                  </div>
                </>
              )}

              <div className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <span className="flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-sahifa-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </span>
                Botdan javob kutilmoqda…
              </div>

              <ol className="text-left space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {['Yuqoridagi tugmani bosing', 'Telegram ilovasida Start tugmasini bosing', 'Sahifa avtomatik yangilanadi ✅'].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-600 dark:text-sahifa-400 text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pageState === 'success' && (
            <div className="space-y-3">
              <div className="text-5xl">✅</div>
              <p className="font-semibold text-green-600 dark:text-green-400">Muvaffaqiyatli kirildi!</p>
              <p className="text-sm text-gray-400 animate-pulse">Yo'naltirilmoqda…</p>
            </div>
          )}

          {(pageState === 'expired' || pageState === 'error') && (
            <div className="space-y-4">
              <div className="text-4xl">{pageState === 'expired' ? '⏰' : '❌'}</div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {pageState === 'expired' ? 'Kod muddati tugadi' : 'Xatolik yuz berdi'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pageState === 'expired'
                  ? "10 daqiqa ichida tasdiqlanmadi. Qayta urinib ko'ring."
                  : errorMsg}
              </p>
              <button onClick={requestCode} className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3.5 rounded-2xl transition-colors">
                🔄 Qayta urinish
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-gray-400 dark:text-gray-500">
          @Sahifalab_hub_bot · 2026
        </p>
      </div>
    </div>
  )
}

export default LoginPage
