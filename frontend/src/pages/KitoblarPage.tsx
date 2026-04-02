import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpenIcon, ArchiveBoxXMarkIcon, StarIcon } from '@heroicons/react/24/outline'
import { fetchBooks } from '../lib/supabase'
import PageWrapper from '../components/PageWrapper'

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
  const [displayLimit, setDisplayLimit] = useState(12)

  useEffect(() => {
    // Cache books in sessionStorage to avoid refetching
    const cached = sessionStorage.getItem('books_cache')
    if (cached) {
      setBooks(JSON.parse(cached))
      setLoading(false)
      return
    }

    fetchBooks()
      .then(data => {
        setBooks(data as Book[])
        sessionStorage.setItem('books_cache', JSON.stringify(data))
      })
      .catch(() => setError('Kitoblarni yuklab bo\'lmadi'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = books.filter(b => {
    if (filter === 'free') return !b.is_paid
    if (filter === 'paid') return b.is_paid
    return true
  })

  return (
    <PageWrapper className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2"><BookOpenIcon className="w-7 h-7" />Kitoblar</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Bepul va pullik PDF kitoblar
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all',  label: 'Hammasi' },
          { id: 'free', label: 'Bepul' },
          { id: 'paid', label: 'Pullik' },
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-pulse">
              <div className="h-36 bg-slate-100 dark:bg-slate-700" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <ArchiveBoxXMarkIcon className="w-12 h-12 mx-auto text-slate-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Kitoblar topilmadi</p>
        </div>
      )}

      {/* Books grid */}
      {!loading && filtered.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.slice(0, displayLimit).map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <button
                  onClick={() => navigate(`/kitoblar/${book.id}`)}
                  className="group block w-full text-left"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md hover:border-sahifa-300 dark:hover:border-sahifa-600 transition-all">
                    {/* Thumbnail */}
                    <div className="relative h-36 overflow-hidden">
                      {book.thumbnail_url ? (
                        <img
                          src={book.thumbnail_url}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${coverGradient(book.category)} flex items-center justify-center group-hover:scale-105 transition-transform duration-300`}>
                          <BookOpenIcon className="w-12 h-12 text-white/70" />
                        </div>
                      )}
                      {/* Price badge */}
                      <div className="absolute top-2 right-2">
                        {book.is_paid ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow">
                            {book.price.toLocaleString()} so'm
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow">
                            Bepul
                          </span>
                        )}
                      </div>
                      {/* Category badge */}
                      {book.category && (
                        <div className="absolute bottom-2 left-2">
                          <span className="px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm capitalize">
                            {book.category}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">
                        {book.title}
                      </p>
                      <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium truncate">
                        {book.author}
                      </p>
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                          {book.rating > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <StarIcon className="w-3 h-3 text-amber-400" />
                              {book.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {book.downloads > 0 && (
                          <span className="text-[11px] text-gray-400">↓ {book.downloads}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </motion.div>
            ))}
          </div>

          {/* Load more */}
          {displayLimit < filtered.length && (
            <button
              onClick={() => setDisplayLimit(displayLimit + 12)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sahifa-400 dark:hover:border-sahifa-500 transition-colors"
            >
              Ko'proq ko'rish ({filtered.length - displayLimit} qolgan)
            </button>
          )}
        </>
      )}
    </PageWrapper>
  )
}

export default KitoblarPage
