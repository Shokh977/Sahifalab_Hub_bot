/**
 * EmailVerificationBanner — persistent top banner for unverified email users.
 * Only visible when user.email_verified === false (email-registered, not yet verified).
 * Telegram / Google users have email_verified = null → no banner.
 */
import React, { useState } from 'react'
import { ExclamationTriangleIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../lib/apiUrl'

const EmailVerificationBanner: React.FC = () => {
  const { user } = useAuth()
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Only show for email-registered users with unverified email
  if (!user || user.email_verified !== false || dismissed) return null

  const handleResend = async () => {
    if (sending || sent || !user.email) return
    setSending(true)
    try {
      await axios.post(`${API_BASE}/api/auth/resend-verification`, { email: user.email })
      setSent(true)
    } catch {
      // silent — banner stays visible
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(232,121,47,0.08)',
      borderBottom: '1px solid rgba(232,121,47,0.2)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 13,
      flexWrap: 'wrap',
    }}>
      <span style={{ color: '#e8792f', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ExclamationTriangleIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
        Email manzilingiz tasdiqlanmagan.
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {sent ? (
          <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <CheckCircleIcon style={{ width: 14, height: 14 }} />
            Havola yuborildi
          </span>
        ) : (
          <button
            onClick={handleResend}
            disabled={sending}
            style={{
              color: '#e8792f',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: sending ? 0.6 : 1,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {sending ? 'Yuborilmoqda…' : 'Tasdiqlash havolasini qayta yuborish →'}
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          style={{ color: 'rgba(232,121,47,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          title="Yopish"
        >
          <XMarkIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  )
}

export default EmailVerificationBanner
