import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiService from '@services/apiService'

interface Book {
  id: number
  title: string
  author: string
  description: string
  price: number
  is_paid: boolean
  file_url: string | null
  thumbnail_url: string | null
  category: string
  downloads: number
  rating: number
}

// Category-based gradient covers for books without thumbnails
const COVER_GRADIENTS: Record<string, string> = {
  programming: 'from-indigo-500 to-purple-600',
  math:        'from-blue-500 to-cyan-600',
  science:     'from-green-500 to-teal-600',
  language:    'from-orange-500 to-amber-600',
  history:     'from-red-500 to-rose-600',
  business:    'from-yellow-500 to-orange-600',
  design:      'from-pink-500 to-fuchsia-600',
  default:     'from-sahifa-500 to-teal-600',
}

function coverGradient(category: string) {
  return COVER_GRADIENTS[category?.toLowerCase()] ?? COVER_GRADIENTS.default
}

export const KitoblarPage: React.FC = () => {
  const navigate = useNavigate()
  const [books, setBooks] = useState<Book[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiService.getBooks()
      .then(r => setBooks(r.data))
      .catch(() => setError('Kitoblarni yuklab bo\'lmadi'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = books.filter(b => {
    if (filter === 'free') return !b.is_paid
    if (filter === 'paid') return b.is_paid
    return true
  })

  return (
    <div className="max-w-md mx-auto py-4 px-4 pb-24 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📚 Kitoblar</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Bepul va pullik PDF kitoblar
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all',  label: 'Hammasi' },
          { id: 'free', label: '🆓 Bepul' },
          { id: 'paid', label: '💳 Pullik' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f.id
                ? 'bg-sahifa-600 text-white shadow'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden animate-pulse shadow-sm">
              <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700" />
              <div className="p-3 space-y-1.5">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Kitoblar topilmadi</p>
        </div>
      )}

      {/* Books grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(book => (
            <button
              key={book.id}
              onClick={() => navigate(`/kitoblar/${book.id}`)}
              className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 text-left hover:shadow-md active:scale-95 transition-all"
            >
              {/* Cover */}
              <div className="aspect-[3/4] relative overflow-hidden">
                {book.thumbnail_url ? (
                  <img
                    src={book.thumbnail_url}
                    alt={book.title}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${coverGradient(book.category)} flex items-center justify-center`}>
                    <span className="text-5xl">📕</span>
                  </div>
                )}
                {/* Badge */}
                <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full shadow ${
                  book.is_paid
                    ? 'bg-blue-600 text-white'
                    : 'bg-green-500 text-white'
                }`}>
                  {book.is_paid ? `${book.price.toLocaleString()} UZS` : 'Bepul'}
                </div>
              </div>

              {/* Info */}
              <div className="p-2.5 space-y-0.5">
                <p className="font-semibold text-xs text-gray-900 dark:text-white line-clamp-2 leading-snug">
                  {book.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-yellow-500 text-xs">★ {book.rating.toFixed(1)}</span>
                  <span className="text-gray-400 text-xs">↓ {book.downloads}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default KitoblarPage
