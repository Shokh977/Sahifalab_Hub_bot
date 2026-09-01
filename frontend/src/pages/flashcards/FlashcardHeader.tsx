import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface Props {
  title: string
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
}

const FlashcardHeader: React.FC<Props> = ({
  title, searchValue, onSearchChange,
  searchPlaceholder = "Karta yoki to'plam qidirish",
}) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const initials = (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? user?.first_name?.[1] ?? '')

  return (
    <header className="fc-header">
      <h1 className="fc-title">{title}</h1>
      <div className="fc-spacer" />
      <label className="fc-search">
        <Search size={16} strokeWidth={2} />
        <input
          value={searchValue ?? ''}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>
      <button className="fc-btn-primary" onClick={() => navigate('/flashcards/new')}>
        <Plus size={16} strokeWidth={2.4} />Yaratish
      </button>
      <div className="fc-avatar">
        {user?.photo_url ? <img src={user.photo_url} alt="" /> : (initials.toUpperCase() || '?')}
      </div>
    </header>
  )
}

export default FlashcardHeader
