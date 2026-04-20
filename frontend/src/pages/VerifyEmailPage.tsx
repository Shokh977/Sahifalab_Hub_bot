/**
 * VerifyEmailPage — handles /auth/verify-email?token=xxx
 * Calls backend to verify the token, shows success or error.
 */
import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import axios from 'axios'
import { API_BASE } from '../lib/apiUrl'

type State = 'loading' | 'success' | 'error'

const VerifyEmailPage: React.FC = () => {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')
  const [firstName, setFirstName] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage("Havola noto'g'ri. Token topilmadi.")
      return
    }
    axios.get(`${API_BASE}/api/auth/verify-email`, { params: { token } })
      .then(res => {
        setState('success')
        setFirstName(res.data.first_name || '')
        setMessage(res.data.message || "Email tasdiqlandi!")
      })
      .catch(err => {
        setState('error')
        setMessage(err?.response?.data?.detail || "Havola noto'g'ri yoki muddati o'tgan.")
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: '#13141a' }}>
      <div className="w-full max-w-[440px]">
        <div style={{
          background: '#1c1d27',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: '32px 28px',
          textAlign: 'center',
        }}>
          {/* Logo */}
          <p className="font-extrabold text-2xl text-white mb-8 tracking-wide">SAHIFALAB</p>

          {state === 'loading' && (
            <>
              <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
                   style={{ borderColor: '#e8792f', borderTopColor: 'transparent' }} />
              <p style={{ color: 'rgba(255,255,255,0.65)' }}>Tasdiqlanmoqda…</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                     style={{ background: 'rgba(34,197,94,0.12)' }}>
                  <CheckCircleIcon className="w-8 h-8" style={{ color: '#22c55e' }} />
                </div>
              </div>
              {firstName && (
                <h1 className="text-xl font-bold text-white mb-2">
                  Tabriklaymiz, {firstName}!
                </h1>
              )}
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {message}
              </p>
              <Link
                to="/login"
                className="inline-block px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90"
                style={{ background: '#e8792f' }}
              >
                Tizimga kirish →
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                     style={{ background: 'rgba(239,68,68,0.12)' }}>
                  <XCircleIcon className="w-8 h-8" style={{ color: '#ef4444' }} />
                </div>
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Xatolik</h1>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {message}
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-2.5 rounded-xl text-sm font-medium hover:underline"
                style={{ color: '#e8792f' }}
              >
                ← Kirish sahifasiga qaytish
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default VerifyEmailPage
