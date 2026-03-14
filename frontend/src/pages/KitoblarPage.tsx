import React, { useState, useEffect } from 'react'
import apiService from '@services/apiService'

interface Book {
  id: number
  title: string
  author: string
  description: string
  price: number
  isPaid: boolean
  downloads: number
  rating: number
  thumbnail: string
  category: string
}

export const KitoblarPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<number[]>([])

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const response = await apiService.getBooks()
        setBooks(response.data)
      } catch (error) {
        console.error('Failed to fetch books:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBooks()
  }, [])

  const filteredBooks = books.filter((book) => {
    if (filter === 'free') return !book.isPaid
    if (filter === 'paid') return book.isPaid
    return true
  })

  const handleAddToCart = (bookId: number) => {
    setCart([...cart, bookId])
    // Show toast notification
    alert('Added to cart!')
  }

  const handleDownload = (bookId: number) => {
    // Trigger download
    console.log('Downloading book:', bookId)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          📚 Kitoblar
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Free and Paid PDF Books
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'All Books' },
          { id: 'free', label: '🆓 Free' },
          { id: 'paid', label: '💳 Paid' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full font-medium transition-all ${
              filter === f.id
                ? 'bg-sahifa-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Books Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">No books found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredBooks.map((book) => (
            <div key={book.id} className="card space-y-2 hover:shadow-lg transition-shadow">
              {/* Thumbnail */}
              <div className="bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 aspect-square rounded flex items-center justify-center text-4xl">
                📕
              </div>

              {/* Info */}
              <h3 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2">
                {book.title}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">{book.author}</p>

              {/* Rating */}
              <div className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {book.rating}/5
                </span>
              </div>

              {/* Price */}
              {book.isPaid ? (
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  ${book.price}
                </div>
              ) : (
                <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                  🆓 Free
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 space-y-1">
                {book.isPaid ? (
                  <button
                    onClick={() => handleAddToCart(book.id)}
                    className="w-full text-xs btn-primary"
                  >
                    🛒 Add to Cart
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownload(book.id)}
                    className="w-full text-xs btn-primary"
                  >
                    📥 Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default KitoblarPage
