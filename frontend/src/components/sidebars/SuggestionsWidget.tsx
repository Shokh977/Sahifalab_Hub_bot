import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, UserCheck } from 'lucide-react'
import SidebarCard from './SidebarCard'
import api from '../../services/apiService'
import { useAuth } from '../../context/AuthContext'

interface Suggestion {
  id: number
  name: string
  username: string | null
  avatar_url: string | null
  headline: string | null
  level: number
}

const SuggestionsWidget: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const [items, setItems] = useState<Suggestion[]>([])
  const [connected, setConnected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!isAuthenticated) return
    api.client.get('/api/connections/suggestions', { params: { limit: 3 } })
      .then(r => setItems(Array.isArray(r.data) ? r.data.slice(0, 3) : []))
      .catch(() => {})
  }, [isAuthenticated])

  if (!items.length) return null

  const handleConnect = async (id: number) => {
    try {
      await api.client.post('/api/connections/request', { receiver_id: id })
      setConnected(prev => new Set([...prev, id]))
    } catch {}
  }

  return (
    <SidebarCard
      title="Tavsiya etilgan aloqalar"
      action={
        <Link to="/network" className="text-[11px] text-[#e8792f]/70 hover:text-[#e8792f] transition-colors">
          Barchasini ko'rish →
        </Link>
      }
    >
      <div className="space-y-3">
        {items.map(u => (
          <div key={u.id} className="flex items-center gap-2.5">
            <Link to={`/profile/${u.username || u.id}`} className="flex-shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#24253a]">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                    <span className="text-white text-xs font-bold">{(u.name || '?')[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${u.username || u.id}`}>
                <p className="text-xs font-semibold truncate transition-colors leading-tight hover:text-[#e8792f]" style={{ color: 'var(--text-primary)' }}>
                  {u.name}
                </p>
              </Link>
              {u.headline && (
                <p className="text-[11px] text-white/35 truncate leading-tight mt-0.5">{u.headline}</p>
              )}
            </div>
            <button
              onClick={() => handleConnect(u.id)}
              disabled={connected.has(u.id)}
              className="flex-shrink-0 p-1.5 rounded-lg text-[#e8792f] hover:bg-[#e8792f]/10 disabled:text-white/20 disabled:hover:bg-transparent transition-colors"
              title={connected.has(u.id) ? "So'rov yuborildi" : 'Ulanish'}
            >
              {connected.has(u.id)
                ? <UserCheck className="w-3.5 h-3.5" />
                : <UserPlus className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        ))}
      </div>
    </SidebarCard>
  )
}

export default SuggestionsWidget
