/**
 * LoginPage — 3-tab authentication.
 *
 * Tab 1: Telegram  — bot-code flow (original)
 * Tab 2: Google    — Google OAuth (always shown)
 * Tab 3: Email     — register / login with email + password
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { PaperAirplaneIcon, EnvelopeIcon, CheckCircleIcon, ClockIcon, XCircleIcon, ArrowPathIcon, ExclamationTriangleIcon, ArrowRightOnRectangleIcon, UserPlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import apiService from '../services/apiService'

import { API_BASE } from '../lib/apiUrl'
const POLL_MS = 2000
const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined) || 'Sahifalab_hub_bot'
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''

declare global {
  interface Window { google?: any }
}

type AuthTab = 'telegram' | 'google' | 'email'
type TelegramState = 'loading' | 'waiting' | 'success' | 'expired' | 'error'
type EmailMode = 'login' | 'register'

const LoginPage: React.FC = () => {
  const { isAuthenticated, loginWithCode } = useAuth()
  const navigate = useNavigate()

  // ── Tab state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<AuthTab>('telegram')

  // ── Telegram state ───────────────────────────────────────────────────────
  const [tgState, setTgState]   = useState<TelegramState>('loading')
  const [botLink, setBotLink]   = useState('')
  const [code, setCode]         = useState('')
  const [tgError, setTgError]   = useState('')
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Google state ─────────────────────────────────────────────────────────
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  // ── Email state ──────────────────────────────────────────────────────────
  const [emailMode, setEmailMode]     = useState<EmailMode>('login')
  const [emailFirstName, setEmailFirstName] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError]   = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // ── Telegram helpers ─────────────────────────────────────────────────────
  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const requestCode = useCallback(async () => {
    setTgState('loading')
    setTgError('')
    stopPolling()
    try {
      const res = await axios.post(`${API_BASE}/api/auth/request-code`)
      setCode(res.data.code)
      setBotLink(res.data.bot_link)
      setTgState('waiting')
    } catch {
      setTgState('error')
      setTgError("Serverga ulanib bo'lmadi. Sahifani yangilang.")
    }
  }, [])

  useEffect(() => {
    if (tgState !== 'waiting' || !code) return
    const poll = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/auth/verify-code/${code}`)
        if (res.status === 200 && res.data.status === 'ok') {
          stopPolling(); setTgState('success')
          loginWithCode(res.data); navigate('/', { replace: true })
        }
      } catch (err: any) {
        const s = err?.response?.status
        if (s === 410 || s === 404) { stopPolling(); setTgState('expired') }
      }
    }
    pollRef.current = setInterval(poll, POLL_MS)
    return stopPolling
  }, [tgState, code, loginWithCode, navigate])

  useEffect(() => { requestCode() }, [requestCode])

  // ── Google helpers ───────────────────────────────────────────────────────
  const initGoogle = useCallback(() => {
    if (!window.google?.accounts?.id || !googleBtnRef.current) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (resp: { credential?: string }) => {
        if (!resp?.credential) return
        try {
          const res = await axios.post(`${API_BASE}/api/auth/google`, { id_token: resp.credential })
          loginWithCode(res.data); navigate('/', { replace: true })
        } catch (err: any) {
          console.error('[Login] Google error:', err?.response?.data?.detail || err?.message)
          setTgError('Google kirishda xatolik yuz berdi')
        }
      },
    })
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline', size: 'large', shape: 'pill',
      text: 'continue_with', width: 300,
    })
  }, [loginWithCode, navigate])

  useEffect(() => {
    if (tab !== 'google' || !GOOGLE_CLIENT_ID) return
    // Script already loaded (preloaded from index.html or previous visit)
    if (window.google?.accounts?.id) { initGoogle(); return }
    // Check if script tag is already in the document (preloaded but not yet executed)
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener('load', initGoogle)
      return () => existing.removeEventListener('load', initGoogle)
    }
    // Fallback: inject dynamically
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true; script.defer = true
    script.onload = initGoogle
    document.head.appendChild(script)
    return () => { if (script.parentNode) script.parentNode.removeChild(script) }
  }, [tab, initGoogle])

  // Re-render Google button when switching back to Google tab
  useEffect(() => {
    if (tab === 'google' && window.google?.accounts?.id && googleBtnRef.current) {
      setTimeout(initGoogle, 100)
    }
  }, [tab, initGoogle])

  // ── Email handlers ───────────────────────────────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailLoading(true); setEmailError('')
    try {
      let res
      if (emailMode === 'register') {
        res = await apiService.emailRegister(emailFirstName.trim(), email.trim(), password)
      } else {
        res = await apiService.emailLogin(email.trim(), password)
      }
      loginWithCode(res.data)
      navigate('/', { replace: true })
    } catch (err: any) {
      console.error('[Login] Email error:', err?.response?.data?.detail || err?.message)
      setEmailError('Xatolik yuz berdi. Iltimos, ma\'lumotlarni tekshirib qayta urinib ko\'ring.')
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────
  const tabs: Array<{ id: AuthTab; icon: string; label: string }> = [
    { id: 'telegram', icon: 'telegram', label: 'Telegram' },
    ...(GOOGLE_CLIENT_ID ? [{ id: 'google' as AuthTab, icon: 'google', label: 'Google' }] : []),
    { id: 'email',    icon: 'email', label: 'Email' },
  ]

  const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sahifa-400/50 focus:border-sahifa-400 transition-all"

  return (
    <div className="min-h-screen bg-gradient-to-br from-sahifa-50 via-white to-sahifa-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-7 space-y-5">

          {/* Logo */}
          <div className="text-center space-y-1">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-sahifa-400 via-sahifa-500 to-sahifa-600 bg-clip-text text-transparent">SAHIFALAB</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 tracking-wide">Bilim va Diqqat Ekotizimi</p>
          </div>

          <div className="text-center flex justify-center"><EnvelopeIcon className="w-10 h-10 text-sahifa-500" /></div>

          {/* Tab bar */}
          <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-700/50 p-1 gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-xs font-semibold transition-all ${
                  tab === t.id
                    ? 'bg-white dark:bg-slate-700 text-sahifa-600 dark:text-sahifa-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span>
                  {t.icon === 'telegram' && <PaperAirplaneIcon className="w-4 h-4" />}
                  {t.icon === 'google' && <MagnifyingGlassIcon className="w-4 h-4" />}
                  {t.icon === 'email' && <EnvelopeIcon className="w-4 h-4" />}
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── Telegram Tab ──────────────────────────────────────────────── */}
          {tab === 'telegram' && (
            <div>
              {tgState === 'loading' && (
                <div className="space-y-3">
                  <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
                  <p className="text-sm text-gray-400 text-center animate-pulse">Tayyorlanmoqda…</p>
                </div>
              )}

              {tgState === 'waiting' && (
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white">Telegram orqali kiring</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Quyidagi tugmani bosing — bot ochiladi.<br />
                      Botda <strong>«Start»</strong> tugmasini bosing.
                    </p>
                  </div>
                  <a
                    href={botLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-[#2AABEE] hover:bg-[#1d97d4] active:scale-95 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
                    </svg>
                    @{BOT_USERNAME}
                  </a>
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <span className="flex gap-1">
                      {[0,1,2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-sahifa-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                      ))}
                    </span>
                    Botdan javob kutilmoqda…
                  </div>
                  <ol className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {['Yuqoridagi tugmani bosing', 'Telegram ilovasida Start bosing', 'Sahifa avtomatik yangilanadi'].map((step, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-sahifa-100 dark:bg-sahifa-900/40 text-sahifa-600 dark:text-sahifa-400 text-[10px] font-bold flex items-center justify-center shrink-0">{i+1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {tgState === 'success' && (
                <div className="space-y-3 text-center">
                  <div className="flex justify-center"><CheckCircleIcon className="w-12 h-12 text-green-600" /></div>
                  <p className="font-semibold text-green-600 dark:text-green-400">Muvaffaqiyatli kirildi!</p>
                  <p className="text-sm text-gray-400 animate-pulse">Yo'naltirilmoqda…</p>
                </div>
              )}

              {(tgState === 'expired' || tgState === 'error') && (
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">{tgState === 'expired' ? <ClockIcon className="w-10 h-10 text-amber-500" /> : <XCircleIcon className="w-10 h-10 text-red-500" />}</div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {tgState === 'expired' ? 'Kod muddati tugadi' : 'Xatolik yuz berdi'}
                  </p>
                  {tgError && <p className="text-sm text-gray-500 dark:text-gray-400">{tgError}</p>}
                  <button onClick={requestCode} className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-2xl transition-colors">
                    <span className="inline-flex items-center gap-1"><ArrowPathIcon className="w-4 h-4" />Qayta urinish</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Google Tab ────────────────────────────────────────────────── */}
          {tab === 'google' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="font-semibold text-gray-900 dark:text-white">Google orqali kiring</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Google akkauntingizni ulang
                </p>
              </div>

              {GOOGLE_CLIENT_ID ? (
                <div className="flex justify-center py-2">
                  <div ref={googleBtnRef} />
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 text-center">
                  <span className="inline-flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4" />Google kirish hali sozlanmagan.</span><br />
                  <span className="text-gray-500 dark:text-gray-400">Telegram yoki Email orqali kiring.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Email Tab ─────────────────────────────────────────────────── */}
          {tab === 'email' && (
            <div className="space-y-4">
              {/* Login / Register toggle */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-700/50 p-1">
                <button
                  type="button"
                  onClick={() => { setEmailMode('login'); setEmailError('') }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    emailMode === 'login'
                      ? 'bg-white dark:bg-slate-600 text-sahifa-600 dark:text-sahifa-300 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 justify-center"><ArrowRightOnRectangleIcon className="w-4 h-4" />Kirish</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setEmailMode('register'); setEmailError('') }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    emailMode === 'register'
                      ? 'bg-white dark:bg-slate-600 text-sahifa-600 dark:text-sahifa-300 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 justify-center"><UserPlusIcon className="w-4 h-4" />Ro'yxatdan o'tish</span>
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                {emailMode === 'register' && (
                  <input
                    type="text"
                    value={emailFirstName}
                    onChange={e => setEmailFirstName(e.target.value)}
                    placeholder="Ismingiz"
                    required
                    maxLength={80}
                    className={inputCls}
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Email manzilingiz"
                  required
                  className={inputCls}
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={emailMode === 'register' ? 'Parol (kamida 6 belgi)' : 'Parolingiz'}
                  required
                  minLength={emailMode === 'register' ? 6 : 1}
                  className={inputCls}
                />

                {emailError && (
                  <p className="text-xs text-red-600 dark:text-red-400 text-center inline-flex items-center gap-1 justify-center"><XCircleIcon className="w-4 h-4" />{emailError}</p>
                )}

                <button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full py-3.5 rounded-2xl bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold text-sm shadow-md disabled:opacity-60 transition-all"
                >
                  {emailLoading
                    ? 'Yuklanmoqda...'
                    : emailMode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}
                </button>
              </form>
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
