/**
 * SettingsPage — /settings
 *
 * Sections:
 *   1. Profil        — edit name, headline, bio, city, website
 *   2. Ko'rinish     — theme toggle (light / dark) + language selector
 *   3. Bildirishnomalar — notification preferences toggles
 *   4. Maxfiylik     — privacy preferences toggles
 *   5. Hisob         — email / password change + delete account
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Check, Loader2, X, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useThemeStore } from '../context/themeStore'
import api from '../services/apiService'

// ═══════════════════════════════════════════════════════════════════════════════
// Shared primitives
// ═══════════════════════════════════════════════════════════════════════════════

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl p-6 mb-4" style={{
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-sm)',
  }}>
    <h2 className="text-[17px] font-bold mb-5" style={{ color: 'var(--text-primary)' }}>{title}</h2>
    {children}
  </div>
)

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
    {children}
  </label>
)

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all ${props.className ?? ''}`}
    style={{
      backgroundColor: 'var(--input-bg)',
      border: '1px solid var(--input-border)',
      color: 'var(--text-primary)',
      ...props.style,
    }}
    onFocus={e => { e.target.style.borderColor = 'var(--input-focus)'; props.onFocus?.(e) }}
    onBlur={e => { e.target.style.borderColor = 'var(--input-border)'; props.onBlur?.(e) }}
  />
)

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
    {...props}
    className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all resize-none ${props.className ?? ''}`}
    style={{
      backgroundColor: 'var(--input-bg)',
      border: '1px solid var(--input-border)',
      color: 'var(--text-primary)',
      ...props.style,
    }}
    onFocus={e => { e.target.style.borderColor = 'var(--input-focus)'; props.onFocus?.(e) }}
    onBlur={e => { e.target.style.borderColor = 'var(--input-border)'; props.onBlur?.(e) }}
  />
)

const SaveButton: React.FC<{ loading?: boolean; saved?: boolean; onClick: () => void }> = ({ loading, saved, onClick }) => (
  <div className="flex justify-end mt-5">
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
      style={{ backgroundColor: saved ? '#16a34a' : 'var(--brand-primary)' }}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {saved && <Check className="w-3.5 h-3.5" />}
      {saved ? 'Saqlandi' : 'Saqlash'}
    </button>
  </div>
)

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
    <div className="flex-1 min-w-0 pr-4">
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {description && <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 relative"
      style={{ backgroundColor: checked ? 'var(--brand-primary)' : 'var(--bg-tertiary)' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: checked ? 'calc(100% - 1.375rem)' : '2px' }}
      />
    </button>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1 — Profile
// ═══════════════════════════════════════════════════════════════════════════════

const ProfileSection: React.FC = () => {
  const { user } = useAuth()
  const [form, setForm] = useState({
    first_name:    (user as any)?.first_name    || '',
    headline:      (user as any)?.headline      || '',
    bio:           (user as any)?.bio           || '',
    location_city: (user as any)?.location_city || '',
    website_url:   (user as any)?.website_url   || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const set = (key: string, val: string) => {
    setForm(f => ({ ...f, [key]: val }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      await api.client.put('/api/profile/me', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError("Saqlashda xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Profil">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Ism</Label>
            <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Ismingiz" />
          </div>
          <div>
            <Label>Shahar</Label>
            <Input value={form.location_city} onChange={e => set('location_city', e.target.value)} placeholder="Toshkent" />
          </div>
        </div>
        <div>
          <Label>Sarlavha (Headline)</Label>
          <Input value={form.headline} onChange={e => set('headline', e.target.value)} placeholder="Kasbingiz yoki qisqacha tavsif" maxLength={120} />
        </div>
        <div>
          <Label>Bio</Label>
          <Textarea value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="O'zingiz haqida qisqacha yozing..." rows={3} maxLength={500} />
          <p className="text-[11px] mt-1 text-right" style={{ color: 'var(--text-muted)' }}>{form.bio.length}/500</p>
        </div>
        <div>
          <Label>Veb-sayt</Label>
          <Input value={form.website_url} onChange={e => set('website_url', e.target.value)} placeholder="https://..." type="url" />
        </div>
      </div>
      {error && <p className="text-sm mt-3 text-red-500">{error}</p>}
      <SaveButton loading={saving} saved={saved} onClick={handleSave} />
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2 — Appearance
// ═══════════════════════════════════════════════════════════════════════════════

const AppearanceSection: React.FC = () => {
  const { theme, setTheme } = useThemeStore()

  return (
    <Card title="Ko'rinish">
      <div>
        <p className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Mavzu</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'light' as const, icon: <Sun className="w-7 h-7" />, label: 'Kunduzgi' },
            { id: 'dark'  as const, icon: <Moon className="w-7 h-7" />, label: 'Tungi' },
          ] as const).map(({ id, icon, label }) => {
            const active = theme === id
            return (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className="flex flex-col items-center gap-3 py-5 rounded-2xl transition-all"
                style={{
                  backgroundColor: active ? 'var(--brand-subtle)' : 'var(--bg-tertiary)',
                  border: `2px solid ${active ? 'var(--brand-primary)' : 'transparent'}`,
                  color: active ? 'var(--brand-primary)' : 'var(--text-tertiary)',
                }}
              >
                {icon}
                <span className="text-sm font-semibold" style={{ color: active ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                  {label}
                </span>
                {active && (
                  <span className="w-5 h-5 rounded-full bg-[#e8792f] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Til</p>
        <select
          disabled
          className="w-full rounded-xl px-3.5 py-2.5 text-sm cursor-not-allowed opacity-60"
          style={{
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            color: 'var(--text-primary)',
          }}
        >
          <option>O'zbekcha (Lotin)</option>
        </select>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Ko'p tillar tez orada qo'shiladi
        </p>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3 — Notifications
// ═══════════════════════════════════════════════════════════════════════════════

interface NotifPrefs {
  messages:       boolean
  connections:    boolean
  courses:        boolean
  weekly_digest:  boolean
  endorsements:   boolean
}

const defaultNotif: NotifPrefs = {
  messages: true, connections: true, courses: true, weekly_digest: true, endorsements: true,
}

const NotificationsSection: React.FC = () => {
  const [prefs,   setPrefs]   = useState<NotifPrefs>(defaultNotif)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    api.client.get('/api/settings')
      .then(r => setPrefs({ ...defaultNotif, ...(r.data?.notification_prefs ?? {}) }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = (key: keyof NotifPrefs, val: boolean) => {
    setPrefs(p => ({ ...p, [key]: val })); setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.client.put('/api/settings', { notification_prefs: prefs })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {} finally { setSaving(false) }
  }

  if (loading) return (
    <Card title="Bildirishnomalar">
      <div className="space-y-3">
        {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />)}
      </div>
    </Card>
  )

  return (
    <Card title="Bildirishnomalar">
      <Toggle checked={prefs.messages}      onChange={v => set('messages', v)}      label="Yangi xabarlar" />
      <Toggle checked={prefs.connections}   onChange={v => set('connections', v)}   label="Bog'lanish so'rovlari" />
      <Toggle checked={prefs.courses}       onChange={v => set('courses', v)}       label="Kurs yangiliklari" />
      <Toggle checked={prefs.weekly_digest} onChange={v => set('weekly_digest', v)} label="Haftalik hisobot" />
      <Toggle checked={prefs.endorsements}  onChange={v => set('endorsements', v)}  label="Ko'nikma tasdiqlanishi" />
      <SaveButton loading={saving} saved={saved} onClick={handleSave} />
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4 — Privacy
// ═══════════════════════════════════════════════════════════════════════════════

interface PrivacyPrefs {
  public_profile: boolean
  show_activity:  boolean
}

const defaultPrivacy: PrivacyPrefs = { public_profile: true, show_activity: true }

const PrivacySection: React.FC = () => {
  const [prefs,   setPrefs]   = useState<PrivacyPrefs>(defaultPrivacy)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    api.client.get('/api/settings')
      .then(r => setPrefs({ ...defaultPrivacy, ...(r.data?.privacy_prefs ?? {}) }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = (key: keyof PrivacyPrefs, val: boolean) => {
    setPrefs(p => ({ ...p, [key]: val })); setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.client.put('/api/settings', { privacy_prefs: prefs })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {} finally { setSaving(false) }
  }

  if (loading) return (
    <Card title="Maxfiylik">
      <div className="space-y-3">
        {[1,2].map(i => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />)}
      </div>
    </Card>
  )

  return (
    <Card title="Maxfiylik">
      <Toggle
        checked={prefs.public_profile}
        onChange={v => set('public_profile', v)}
        label="Profilni ommaviy ko'rsatish"
        description="Kim ko'rganini ko'rsatish"
      />
      <Toggle
        checked={prefs.show_activity}
        onChange={v => set('show_activity', v)}
        label="Faollik tarixini ko'rsatish"
        description="Boshqalar faollik grafikni ko'rsin"
      />
      <SaveButton loading={saving} saved={saved} onClick={handleSave} />
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 5 — Account (password change + delete)
// ═══════════════════════════════════════════════════════════════════════════════

const PasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState({ current: false, next: false, confirm: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.next !== form.confirm) { setError("Yangi parollar mos kelmaydi"); return }
    if (form.next.length < 8) { setError("Parol kamida 8 ta belgidan iborat bo'lishi kerak"); return }
    setSaving(true); setError(null)
    try {
      await api.client.put('/api/settings/password', { current_password: form.current, new_password: form.next })
      setDone(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Joriy parol noto'g'ri")
    } finally { setSaving(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Parolni o'zgartirish</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {done ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Parol muvaffaqiyatli o'zgartirildi</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {(['current', 'next', 'confirm'] as const).map((key) => {
              const labels = { current: 'Joriy parol', next: 'Yangi parol', confirm: 'Yangi parolni tasdiqlang' }
              return (
                <div key={key}>
                  <Label>{labels[key]}</Label>
                  <div className="relative">
                    <Input
                      type={show[key] ? 'text' : 'password'}
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      required
                      minLength={key === 'current' ? 1 : 8}
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 mt-2"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Saqlash
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}

const DeleteAccountModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await api.client.delete('/api/settings/account')
      window.location.href = '/login'
    } catch {} finally { setLoading(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Hisobni o'chirish</h3>
        </div>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Bu amalni <strong>qaytarib bo'lmaydi</strong>. Barcha ma'lumotlaringiz — kurslar, sertifikatlar, yutuqlar — butunlay o'chiriladi.
        </p>
        <div className="mb-4">
          <Label>Tasdiqlash uchun <strong>O'CHIRISH</strong> deb yozing</Label>
          <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="O'CHIRISH" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            Bekor qilish
          </button>
          <button
            onClick={handleDelete}
            disabled={confirm !== 'O\'CHIRISH' || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            O'chirish
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

const AccountSection: React.FC = () => {
  const { user } = useAuth()
  const [pwModal,     setPwModal]     = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)

  return (
    <>
      <Card title="Hisob">
        {/* Email row */}
        <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Email</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {(user as any)?.email || "Qo'shilmagan"}
            </p>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--brand-primary)', backgroundColor: 'var(--brand-subtle)' }}
            onClick={() => {}} // email change modal can be added later
          >
            O'zgartirish
          </button>
        </div>

        {/* Password row */}
        <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Parol</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>••••••••</p>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--brand-primary)', backgroundColor: 'var(--brand-subtle)' }}
            onClick={() => setPwModal(true)}
          >
            O'zgartirish
          </button>
        </div>

        {/* Delete account */}
        <div className="pt-4">
          <button
            onClick={() => setDeleteModal(true)}
            className="text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
          >
            Hisobni o'chirish
          </button>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Bu amalni qaytarib bo'lmaydi
          </p>
        </div>
      </Card>

      <AnimatePresence>
        {pwModal     && <PasswordModal     onClose={() => setPwModal(false)} />}
        {deleteModal && <DeleteAccountModal onClose={() => setDeleteModal(false)} />}
      </AnimatePresence>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════════

const SettingsPage: React.FC = () => (
  <div className="max-w-[680px]">
    <h1 className="text-2xl font-extrabold mb-6" style={{ color: 'var(--text-primary)' }}>Sozlamalar</h1>
    <ProfileSection />
    <AppearanceSection />
    <NotificationsSection />
    <PrivacySection />
    <AccountSection />
  </div>
)

export default SettingsPage
