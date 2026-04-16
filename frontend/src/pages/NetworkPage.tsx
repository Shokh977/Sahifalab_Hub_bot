/**
 * NetworkPage — /network
 *
 * Three tabs:
 *   Aloqalarim  — accepted connections + search
 *   So'rovlar   — pending incoming/outgoing requests
 *   Tavsiyalar  — smart suggestions
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Clock, Compass,
  Search, X, MessageCircle, Check, Loader2,
  UserCheck, UserX,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Connection {
  connection_id: number
  accepted_at: string | null
  user: {
    id: number
    name: string
    username: string | null
    avatar_url: string | null
    headline: string | null
    level: number
    account_type: string
  }
}

interface PendingItem {
  connection_id: number
  created_at: string | null
  user: {
    id: number
    name: string
    username: string | null
    avatar_url: string | null
    headline: string | null
    level: number
  }
}

interface Suggestion {
  id: number
  name: string
  username: string | null
  avatar_url: string | null
  headline: string | null
  location_city: string | null
  level: number
  score_breakdown: {
    mutual_connections: number
    shared_courses: number
    same_city: number
    shared_skills: number
  }
}

type TabKey = 'connections' | 'requests' | 'suggestions'

// ── Avatar helper ─────────────────────────────────────────────────────────────

const Avatar: React.FC<{ src?: string | null; name: string; size?: string }> = ({ src, name, size = 'w-11 h-11' }) => (
  <div className={`${size} rounded-full overflow-hidden flex-shrink-0 bg-white/[0.07] ring-2 ring-white/[0.06]`}>
    {src
      ? <img src={src} alt={name} className="w-full h-full object-cover" />
      : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/50">
          {(name || 'U')[0].toUpperCase()}
        </div>
    }
  </div>
)

// ── Why suggested label ───────────────────────────────────────────────────────

function whySuggested(s: Suggestion): string {
  const b = s.score_breakdown
  if (!b) return 'Sizga mos'
  if (b.mutual_connections > 0)
    return `${b.mutual_connections} ta umumiy aloqa`
  if (b.shared_courses > 0)
    return `${b.shared_courses} ta umumiy kurs`
  if (b.same_city && s.location_city)
    return `${s.location_city}da`
  if (b.shared_skills > 0)
    return `${b.shared_skills} ta umumiy ko'nikma`
  return 'Sizga mos'
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — My connections
// ══════════════════════════════════════════════════════════════════════════════

const ConnectionsTab: React.FC = () => {
  const [items, setItems] = useState<Connection[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback((q: string) => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (q.trim()) params.search = q.trim()
    api.client.get('/api/connections', { params })
      .then(r => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load('') }, [load])

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const handleMessage = (userId: number) => {
    window.location.href = `/messages?user=${userId}`
  }

  if (loading && !items.length) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-white/20" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Aloqalar ichidan qidirish..."
          className="w-full pl-9 pr-9 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-white placeholder-white/25 outline-none focus:border-[#e8792f]/40 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">
            {search ? 'Hech kim topilmadi' : "Hali aloqalar yo'q"}
          </p>
          {!search && (
            <p className="text-xs text-white/20 mt-1">Tavsiyalar bo'limidan yangi odamlar bilan bog'laning</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(Array.isArray(items) ? items : []).map(item => (
            <motion.div
              key={item.connection_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1c1d27] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <Link to={`/profile/${item.user.username || item.user.id}`}>
                  <Avatar src={item.user.avatar_url} name={item.user.name} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/profile/${item.user.username || item.user.id}`}
                    className="font-semibold text-sm text-white hover:text-[#e8792f] transition-colors truncate block"
                  >
                    {item.user.name}
                  </Link>
                  {item.user.headline && (
                    <p className="text-xs text-white/40 truncate mt-0.5">{item.user.headline}</p>
                  )}
                  <p className="text-[11px] text-white/25 mt-1">Daraja {item.user.level}</p>
                </div>
              </div>
              <button
                onClick={() => handleMessage(item.user.id)}
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-medium text-white/60 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Xabar
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Requests
// ══════════════════════════════════════════════════════════════════════════════

const RequestsTab: React.FC = () => {
  const [received, setReceived] = useState<PendingItem[]>([])
  const [sent, setSent] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<Set<number>>(new Set())

  useEffect(() => {
    api.client.get('/api/connections/pending')
      .then(r => {
        setReceived(r.data.received || [])
        setSent(r.data.sent || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const act = async (connId: number, action: 'accept' | 'decline' | 'cancel') => {
    setActing(prev => new Set([...prev, connId]))
    try {
      if (action === 'accept') {
        await api.client.put(`/api/connections/${connId}/accept`)
        setReceived(prev => prev.filter(r => r.connection_id !== connId))
      } else if (action === 'decline') {
        await api.client.put(`/api/connections/${connId}/decline`)
        setReceived(prev => prev.filter(r => r.connection_id !== connId))
      } else {
        await api.client.delete(`/api/connections/${connId}`)
        setSent(prev => prev.filter(r => r.connection_id !== connId))
      }
    } catch {}
    setActing(prev => { const s = new Set(prev); s.delete(connId); return s })
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-white/20" /></div>

  const renderUser = (item: PendingItem, mode: 'received' | 'sent') => (
    <motion.div
      key={item.connection_id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-center gap-3 bg-[#1c1d27] border border-white/[0.06] rounded-2xl p-3.5"
    >
      <Link to={`/profile/${item.user.username || item.user.id}`}>
        <Avatar src={item.user.avatar_url} name={item.user.name} size="w-10 h-10" />
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/profile/${item.user.username || item.user.id}`}
          className="text-sm font-semibold text-white hover:text-[#e8792f] truncate block transition-colors">
          {item.user.name}
        </Link>
        {item.user.headline && <p className="text-xs text-white/35 truncate">{item.user.headline}</p>}
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {mode === 'received' ? (
          <>
            <button
              disabled={acting.has(item.connection_id)}
              onClick={() => act(item.connection_id, 'accept')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#e8792f] text-white text-xs font-medium hover:bg-[#d4692a] disabled:opacity-40 transition-colors"
            >
              <Check className="w-3 h-3" /> Qabul
            </button>
            <button
              disabled={acting.has(item.connection_id)}
              onClick={() => act(item.connection_id, 'decline')}
              className="px-2.5 py-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <UserX className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            disabled={acting.has(item.connection_id)}
            onClick={() => act(item.connection_id, 'cancel')}
            className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
          >
            Bekor
          </button>
        )}
      </div>
    </motion.div>
  )

  const empty = received.length === 0 && sent.length === 0

  return (
    <div className="space-y-6">
      {empty && (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">Kutilayotgan so'rovlar yo'q</p>
        </div>
      )}

      {received.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Kelgan so'rovlar ({received.length})
          </h3>
          <AnimatePresence>
            <div className="space-y-2">
              {received.map(item => renderUser(item, 'received'))}
            </div>
          </AnimatePresence>
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            Yuborilgan so'rovlar ({sent.length})
          </h3>
          <AnimatePresence>
            <div className="space-y-2">
              {sent.map(item => renderUser(item, 'sent'))}
            </div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Suggestions
// ══════════════════════════════════════════════════════════════════════════════

const SuggestionsTab: React.FC = () => {
  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<Set<number>>(new Set())
  const [connecting, setConnecting] = useState<Set<number>>(new Set())

  useEffect(() => {
    api.client.get('/api/connections/suggestions')
      .then(r => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleConnect = async (userId: number) => {
    setConnecting(prev => new Set([...prev, userId]))
    try {
      await api.client.post('/api/connections/request', { receiver_id: userId })
      setConnected(prev => new Set([...prev, userId]))
    } catch {}
    setConnecting(prev => { const s = new Set(prev); s.delete(userId); return s })
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-white/20" /></div>

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Compass className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-sm text-white/30">Hozircha tavsiyalar yo'q</p>
        <p className="text-xs text-white/20 mt-1">Ko'proq kurslar va ko'nikmalar qo'shsangiz, tavsiyalar yaxshilanadi</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-white/30 mb-4">Siz uchun tavsiya etilgan odamlar</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {(Array.isArray(items) ? items : []).map(s => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1c1d27] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <Link to={`/profile/${s.username || s.id}`}>
                <Avatar src={s.avatar_url} name={s.name} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/profile/${s.username || s.id}`}
                  className="font-semibold text-sm text-white hover:text-[#e8792f] truncate block transition-colors"
                >
                  {s.name}
                </Link>
                {s.headline && <p className="text-xs text-white/40 truncate mt-0.5">{s.headline}</p>}
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] text-[11px] text-white/30">
                  {whySuggested(s)}
                </span>
              </div>
            </div>
            {connected.has(s.id) ? (
              <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-medium text-white/40 bg-white/[0.04] border border-white/[0.06]">
                <UserCheck className="w-3.5 h-3.5" /> So'rov yuborildi
              </div>
            ) : (
              <button
                disabled={connecting.has(s.id)}
                onClick={() => handleConnect(s.id)}
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-medium bg-[#e8792f] text-white hover:bg-[#d4692a] disabled:opacity-40 transition-colors"
              >
                {connecting.has(s.id)
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <><UserPlus className="w-3.5 h-3.5" /> Bog'lanish</>
                }
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main NetworkPage
// ══════════════════════════════════════════════════════════════════════════════

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'connections', label: 'Aloqalarim',  icon: Users },
  { key: 'requests',    label: "So'rovlar",   icon: Clock },
  { key: 'suggestions', label: 'Tavsiyalar',  icon: Compass },
]

const NetworkPage: React.FC = () => {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('connections')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!user) return
    api.client.get('/api/connections/pending')
      .then(r => setPendingCount((r.data.received || []).length))
      .catch(() => {})
  }, [user])

  return (
    <>
        <h1 className="text-xl font-bold text-white mb-5">Tarmoqim</h1>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-[#1c1d27] rounded-xl border border-white/[0.06] mb-6">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-[#e8792f] text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {key === 'requests' && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#e8792f] text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'connections'  && <ConnectionsTab />}
            {tab === 'requests'     && <RequestsTab />}
            {tab === 'suggestions'  && <SuggestionsTab />}
          </motion.div>
        </AnimatePresence>
    </>
  )
}

export default NetworkPage
