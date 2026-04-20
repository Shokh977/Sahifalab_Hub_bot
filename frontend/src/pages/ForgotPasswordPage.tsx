/**
 * ForgotPasswordPage — /auth/forgot-password
 * User enters email, backend sends reset link via Resend.
 */
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { EnvelopeIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import axios from 'axios'
import { API_BASE } from '../lib/apiUrl'

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await axios.post(`${API_BASE}/api/auth/forgot-password`, { email: email.trim() })
      setSent(true)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 429) {
        setError(detail || "Juda ko'p urinish. Biroz kuting.")
      } else {
        setSent(true) // Don't reveal non-existence
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: '#13141a' }}>
      <div className="w-full max-w-[440px]">
        <div style={{
          background: '#1c1d27',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: '32px 28px',
        }}>
          <p className="font-extrabold text-2xl text-white text-center mb-8 tracking-wide">SAHIFALAB</p>

          {sent ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                     style={{ background: 'rgba(232,121,47,0.12)' }}>
                  <EnvelopeIcon className="w-8 h-8" style={{ color: '#e8792f' }} />
                </div>
              </div>
              <h2 className="text-lg font-bold text-white mb-3">Havola yuborildi</h2>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi.
                Email pochta qutingizni tekshiring.
              </p>
              <Link to="/login" className="text-sm hover:underline"
                    style={{ color: '#e8792f' }}>
                ← Kirish sahifasiga qaytish
              </Link>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                     style={{ background: 'rgba(232,121,47,0.12)' }}>
                  <CheckCircleIcon className="w-7 h-7" style={{ color: '#e8792f' }} />
                </div>
              </div>
              <h1 className="text-xl font-bold text-white text-center mb-2">Parolni tiklash</h1>
              <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Email manzilingizni kiriting — biz sizga parolni tiklash havolasini yuboramiz.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5"
                         style={{ color: 'rgba(255,255,255,0.65)' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                    className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                    style={{
                      background: '#24253a',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#e8792f'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,121,47,0.15)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>

                {error && (
                  <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-60"
                  style={{ background: '#e8792f' }}
                >
                  {loading ? 'Yuborilmoqda…' : 'Havola yuborish'}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/login" className="text-sm hover:underline"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>
                  ← Kirish sahifasiga qaytish
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
