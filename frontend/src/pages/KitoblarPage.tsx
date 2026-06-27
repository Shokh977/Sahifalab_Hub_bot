import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpenIcon, ArchiveBoxXMarkIcon, StarIcon, MagnifyingGlassIcon, XMarkIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
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
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('default')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [displayLimit, setDisplayLimit] = useState(12)

  // Derive unique categories from loaded books
  const categories = useMemo(() => {
    const cats = Array.from(new Set(books.map(b => b.category).filter(Boolean)))
    return cats.sort()
  }, [books])

  // Reset display limit whenever any filter changes
  useEffect(() => { setDisplayLimit(12) }, [search, filter, categoryFilter, sortBy])

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

  const filtered = useMemo(() => {
    let result = books.filter(b => {
      const q = search.trim().toLowerCase()
      const matchesSearch = !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
      const matchesPrice =
        filter === 'all' ? true :
        filter === 'free' ? !b.is_paid : b.is_paid
      const matchesCategory =
        categoryFilter === 'all' ? true :
        (b.category ?? '').toLowerCase() === categoryFilter
      return matchesSearch && matchesPrice && matchesCategory
    })
    if (sortBy === 'rating')     result = [...result].sort((a, b) => b.rating - a.rating)
    if (sortBy === 'downloads')  result = [...result].sort((a, b) => b.downloads - a.downloads)
    if (sortBy === 'price_asc')  result = [...result].sort((a, b) => a.price - b.price)
    if (sortBy === 'price_desc') result = [...result].sort((a, b) => b.price - a.price)
    return result
  }, [books, search, filter, categoryFilter, sortBy])

  return (
    <PageWrapper className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2"><BookOpenIcon className="w-7 h-7" />Kitoblar</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Bepul va pullik PDF kitoblar
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Kitob yoki muallif qidiring..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-sahifa-400 dark:focus:border-sahifa-500 transition-colors"
        />
        <AnimatePresence>
          {search && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <XMarkIcon className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {['all', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${
                categoryFilter === cat
                  ? 'bg-sahifa-600 text-white shadow'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {cat === 'all' ? 'Barcha janrlar' : cat}
            </button>
          ))}
        </div>
      )}

      {/* Price filter + Sort row */}
      <div className="flex items-center gap-2">
        {/* Price tabs */}
        <div className="flex gap-1.5 flex-1">
          {[
            { id: 'all',  label: 'Hammasi' },
            { id: 'free', label: 'Bepul' },
            { id: 'paid', label: 'Pullik' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f.id
                  ? 'bg-sahifa-600 text-white shadow'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <AdjustmentsHorizontalIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="pl-7 pr-2.5 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-sahifa-400 transition-colors"
          >
            <option value="default">Saralash</option>
            <option value="rating">Reyting ↓</option>
            <option value="downloads">Yuklamalar ↓</option>
            <option value="price_asc">Narx ↑</option>
            <option value="price_desc">Narx ↓</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex gap-3 bg-white dark:bg-[#1A1A1A] rounded-2xl border border-slate-200/50 dark:border-[#2A2A2A] p-3 animate-pulse">
              <div className="w-24 h-24 flex-shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 space-y-2 py-1">
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

      {/* Books list */}
      {!loading && filtered.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {filtered.slice(0, displayLimit).map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <button
                  onClick={() => navigate(`/kitoblar/${book.id}`)}
                  className="group block w-full text-left"
                >
                  <div className="flex gap-3 bg-white/90 dark:bg-[#1A1A1A] rounded-2xl border border-slate-200/50 dark:border-[#2A2A2A] overflow-hidden hover:shadow-md transition-all duration-200 p-3">
                    {/* Thumbnail */}
                    <div className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden">
                      {book.thumbnail_url ? (
                        <img
                          src={book.thumbnail_url}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${coverGradient(book.category)} flex items-center justify-center`}>
                          <BookOpenIcon className="w-8 h-8 text-white/70" />
                        </div>
                      )}
                      {/* Price badge */}
                      <div className="absolute bottom-1 left-1">
                        {book.is_paid ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-bold">
                            {book.price.toLocaleString()} so'm
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white text-[9px] font-bold">
                            Bepul
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2 leading-snug">
                          {book.title}
                        </p>
                        <p className="text-[11px] text-sahifa-600 dark:text-sahifa-400 font-medium mt-0.5 truncate">
                          {book.author}
                        </p>
                        {book.category && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{book.category}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                        {book.rating > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <StarIcon className="w-3 h-3 text-amber-400" />
                            {book.rating.toFixed(1)}
                          </span>
                        )}
                        {book.downloads > 0 && (
                          <span>↓ {book.downloads}</span>
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
