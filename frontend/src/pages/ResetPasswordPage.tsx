/**
 * ResetPasswordPage — /auth/reset-password?token=xxx
 * Lets the user set a new password using the one-time reset token.
 */
import React, { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import axios from 'axios'
import { API_BASE } from '../lib/apiUrl'
import PasswordStrengthIndicator, { validatePassword } from '../components/PasswordStrengthIndicator'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#24253a',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  padding: '12px 44px 12px 14px',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
}

const ResetPasswordPage: React.FC = () => {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const token      = params.get('token') || ''

  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [loading, setLoading]           = useState(false)
  const [success, setSuccess]           = useState(false)
  const [error, setError]               = useState('')

  const { isValid } = validatePassword(password)
  const canSubmit = isValid && password === confirm && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, {
        token,
        new_password: password,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Xatolik yuz berdi. Qayta urinib ko'ring.")
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#13141a' }}>
        <div style={{ background: '#1c1d27', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
          <p className="text-white font-bold text-lg mb-3">Havola noto'g'ri</p>
          <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Token topilmadi.</p>
          <Link to="/auth/forgot-password" style={{ color: '#e8792f' }} className="text-sm hover:underline">
            Yangi havola so'rash →
          </Link>
        </div>
      </div>
    )
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

          {success ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                     style={{ background: 'rgba(34,197,94,0.12)' }}>
                  <CheckCircleIcon className="w-8 h-8" style={{ color: '#22c55e' }} />
                </div>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Parol o'zgartirildi!</h2>
              <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Yangi parolingiz saqlandi. Tizimga kirish sahifasiga yo'naltirilmoqda…
              </p>
              <Link to="/login" style={{ color: '#e8792f' }} className="text-sm hover:underline">
                Tizimga kirish →
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white text-center mb-2">Yangi parol o'rnatish</h1>
              <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Kuchli parol kiriting.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password */}
                <div>
                  <label className="block text-xs font-medium mb-1.5"
                         style={{ color: 'rgba(255,255,255,0.65)' }}>
                    Yangi parol *
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Yangi parol"
                      required
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      {showPw ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && <PasswordStrengthIndicator password={password} />}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-xs font-medium mb-1.5"
                         style={{ color: 'rgba(255,255,255,0.65)' }}>
                    Parolni tasdiqlash *
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Parolni tasdiqlang"
                      required
                      style={{
                        ...inputStyle,
                        borderColor: confirm && confirm !== password ? '#ef4444' : 'rgba(255,255,255,0.06)',
                      }}
                    />
                  </div>
                  {confirm && confirm !== password && (
                    <p className="text-xs mt-1" style={{ color: '#ef4444' }}>
                      Parollar mos kelmayapti
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                  style={{ background: '#e8792f' }}
                >
                  {loading ? 'Saqlanmoqda…' : "Parolni o'zgartirish"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage
