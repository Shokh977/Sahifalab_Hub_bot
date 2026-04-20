/**
 * VerifyEmailPendingPage — shown after email registration.
 * Tells the user to check their inbox and lets them resend the verification.
 */
import React, { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { EnvelopeIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import axios from 'axios'
import { API_BASE } from '../lib/apiUrl'

const RESEND_COOLDOWN = 60 // seconds

const VerifyEmailPendingPage: React.FC = () => {
  const [params] = useSearchParams()
  const email = params.get('email') || ''

  const [cooldown, setCooldown]   = useState(0)
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const handleResend = async () => {
    if (!email || cooldown > 0 || sending) return
    setSending(true); setError(''); setSent(false)
    try {
      await axios.post(`${API_BASE}/api/auth/resend-verification`, { email })
      setSent(true)
      setCooldown(RESEND_COOLDOWN)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Xatolik yuz berdi. Qayta urinib ko'ring.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: '#13141a' }}>
      <div className="w-full max-w-[440px]">
        {/* Card */}
        <div style={{
          background: '#1c1d27',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: '32px 28px',
        }}>
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                 style={{ background: 'rgba(232,121,47,0.12)' }}>
              <EnvelopeIcon className="w-8 h-8" style={{ color: '#e8792f' }} />
            </div>
          </div>

          <h1 className="text-xl font-bold text-white text-center mb-2">
            Email manzilingizni tekshiring
          </h1>
          <p className="text-sm text-center mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Tasdiqlash havolasi yuborildi:
          </p>
          {email && (
            <p className="text-sm font-semibold text-center mb-4" style={{ color: '#e8792f' }}>
              {email}
            </p>
          )}
          <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Email pochta qutingizni (va spam papkasini) tekshiring.
            Havolani bosib emailni tasdiqlang.
          </p>

          {/* Resend */}
          <div className="text-center mb-4">
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Xat kelmadimi?
            </p>
            {sent && (
              <div className="flex items-center justify-center gap-1 mb-2 text-sm"
                   style={{ color: '#22c55e' }}>
                <CheckCircleIcon className="w-4 h-4" />
                Yangi havola yuborildi
              </div>
            )}
            {error && (
              <p className="text-xs mb-2" style={{ color: '#ef4444' }}>{error}</p>
            )}
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || sending || !email}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
              style={{ background: 'rgba(232,121,47,0.15)', color: '#e8792f', border: '1px solid rgba(232,121,47,0.25)' }}
            >
              <ArrowPathIcon className={`w-4 h-4 ${sending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Qayta yuborish (${cooldown}s)` : 'Qayta yuborish'}
            </button>
          </div>

          {/* Back */}
          <div className="text-center">
            <Link to="/login" className="text-sm hover:underline"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>
              ← Kirish sahifasiga qaytish
            </Link>
          </div>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          SAHIFALAB · 2026
        </p>
      </div>
    </div>
  )
}

export default VerifyEmailPendingPage
