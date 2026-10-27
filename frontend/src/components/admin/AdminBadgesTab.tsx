/**
 * AdminBadgesTab — Pro name badges (110_name_badges): the small animated
 * object after a Pro user's name in the app. Rendered as a tab inside
 * AdminPage.tsx (activeTab === 'badges').
 *
 * A badge is three files: an animated WebP for dark surfaces, one for light
 * surfaces (softer glow), and a static frame (PNG/WebP) for pickers and
 * Reduce Motion. Square, at most 256 px and 300 KB each; ~54 px at 12–15 fps
 * keeps them near 60 KB. New badges reach the app within a minute — no app
 * update needed. Uploading again with the same id replaces the files.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Upload } from 'lucide-react'
import apiService from '../../services/apiService'
import { API_BASE } from '../../lib/apiUrl'

interface Badge {
  id: string
  title: string
  unlock: 'free' | 'pro' | 'seasonal' | 'achievement'
  season: string | null
  streak_days: number | null
  dark: string
  light: string
  static: string
  sort_order: number
  is_active: boolean
}

const UNLOCK_LABEL: Record<Badge['unlock'], string> = {
  free: 'Bepul', pro: 'Pro', seasonal: 'Mavsumiy', achievement: 'Yutuq',
}

/** Starter badges are served by the backend under a relative path. */
const fileUrl = (u: string) => (u.startsWith('/') ? `${API_BASE}${u}` : u)

const EMPTY = { id: '', title: '', unlock: 'pro', season: 'ramazon', streak_days: '', sort_order: '100' }

export default function AdminBadgesTab() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState<{ dark?: File; light?: File; static?: File }>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiService.client.get('/api/admin/badges')
      setBadges(res.data?.badges ?? [])
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Yuklab bo'lmadi (110-migratsiya qo'llanganmi?)")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(b: Badge) {
    try {
      await apiService.client.patch(`/api/admin/badges/${b.id}`, { is_active: !b.is_active })
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "O'zgartirib bo'lmadi")
    }
  }

  function editFrom(b: Badge) {
    setForm({
      id: b.id, title: b.title, unlock: b.unlock, season: b.season ?? 'ramazon',
      streak_days: b.streak_days ? String(b.streak_days) : '', sort_order: String(b.sort_order),
    })
    setFiles({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!files.dark || !files.light || !files.static) {
      alert('Uchala faylni tanlang: tungi, kunduzgi va statik')
      return
    }
    const fd = new FormData()
    fd.append('id', form.id.trim())
    fd.append('title', form.title.trim())
    fd.append('unlock', form.unlock)
    if (form.unlock === 'seasonal') fd.append('season', form.season)
    if (form.unlock === 'achievement') fd.append('streak_days', form.streak_days)
    fd.append('sort_order', form.sort_order || '100')
    fd.append('dark', files.dark)
    fd.append('light', files.light)
    fd.append('static', files.static)
    setSaving(true)
    try {
      await apiService.client.post('/api/admin/badges', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm(EMPTY)
      setFiles({})
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Saqlab bo'lmadi")
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm'

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-3 border border-gray-100 dark:border-gray-700">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Ism belgisi qo'shish</h3>
          <p className="text-xs text-gray-500 mt-1">
            Kvadrat animatsion WebP (tungi va kunduzgi fon uchun) + statik kadr. Har biri ≤ 300 KB, ≤ 256 px.
            Ilovaga bir daqiqada yetib boradi. Shu id bilan qayta yuklasangiz fayllar almashadi.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="id (masalan: kamalak)" value={form.id}
            onChange={e => setForm({ ...form, id: e.target.value.toLowerCase() })} required />
          <input className={input} placeholder="Nomi (masalan: Kamalak)" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })} required />
          <select className={input} value={form.unlock} onChange={e => setForm({ ...form, unlock: e.target.value })}>
            <option value="pro">Pro</option>
            <option value="seasonal">Mavsumiy (hamma uchun, mavsumda)</option>
            <option value="achievement">Yutuq (eng uzun seriya)</option>
            <option value="free">Bepul</option>
          </select>
          {form.unlock === 'seasonal' ? (
            <select className={input} value={form.season} onChange={e => setForm({ ...form, season: e.target.value })}>
              <option value="ramazon">Ramazon</option>
              <option value="navroz">Navro'z</option>
            </select>
          ) : form.unlock === 'achievement' ? (
            <input className={input} type="number" min={1} placeholder="Seriya kuni" value={form.streak_days}
              onChange={e => setForm({ ...form, streak_days: e.target.value })} required />
          ) : (
            <input className={input} type="number" placeholder="Tartib (kichigi oldinda)" value={form.sort_order}
              onChange={e => setForm({ ...form, sort_order: e.target.value })} />
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
          {(['dark', 'light', 'static'] as const).map(k => (
            <label key={k} className="flex flex-col gap-1">
              {k === 'dark' ? 'Tungi (WebP)' : k === 'light' ? 'Kunduzgi (WebP)' : 'Statik (PNG/WebP)'}
              <input type="file" accept={k === 'static' ? 'image/png,image/webp' : 'image/webp'}
                onChange={e => setFiles({ ...files, [k]: e.target.files?.[0] })} />
            </label>
          ))}
        </div>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-sahifa-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
          <Upload size={16} /> {saving ? 'Yuklanmoqda…' : 'Saqlash'}
        </button>
      </form>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading ? (
        <div className="text-sm text-gray-500">Yuklanmoqda…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {badges.map(b => (
            <div key={b.id} className={`flex items-center gap-3 p-3 ${b.is_active ? '' : 'opacity-50'}`}>
              <div className="flex gap-1 shrink-0">
                <span className="w-11 h-11 rounded-lg bg-gray-900 grid place-items-center">
                  <img src={fileUrl(b.dark)} alt="" className="w-8 h-8" />
                </span>
                <span className="w-11 h-11 rounded-lg bg-white border border-gray-200 grid place-items-center">
                  <img src={fileUrl(b.light)} alt="" className="w-8 h-8" />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white">{b.title} <span className="text-xs text-gray-400">{b.id}</span></div>
                <div className="text-xs text-gray-500">
                  {UNLOCK_LABEL[b.unlock]}
                  {b.unlock === 'seasonal' && b.season ? ` · ${b.season}` : ''}
                  {b.unlock === 'achievement' && b.streak_days ? ` · ${b.streak_days} kun` : ''}
                  {' · '}tartib {b.sort_order}
                </div>
              </div>
              <button onClick={() => editFrom(b)} className="text-xs text-sahifa-600 hover:underline">Fayllarni almashtirish</button>
              <button onClick={() => toggle(b)} title={b.is_active ? 'Yashirish' : "Ko'rsatish"}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                {b.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
          {badges.length === 0 && <div className="p-4 text-sm text-gray-500">Belgilar yo'q</div>}
        </div>
      )}
    </div>
  )
}
