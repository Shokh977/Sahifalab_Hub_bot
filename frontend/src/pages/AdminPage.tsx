/**
 * SAHIFALAB Admin Panel
 * Sam (16yo mentor) brand voice — Uzbek-first, clean and simple.
 * Authentication: Admin enters their Telegram ID; backend validates against AdminUser table.
 */
import React, { useState, useEffect, useCallback } from 'react'
import apiService from '@services/apiService'

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeroContent {
  id: number
  title: string | null
  subtitle: string | null
  description: string | null
  image_url: string | null
  cta_text: string | null
  cta_link: string | null
  is_active: boolean
  display_order: number
}

interface AdminBook {
  id: number
  title: string
  author: string
  price: number
  is_paid: boolean
  downloads: number
  rating: number
  created_at: string
}

interface AdminStats {
  total_users: number
  total_quizzes: number
  total_books: number
  total_resources: number
  active_payments: number
  recent_uploads: string[]
}

type Tab = 'stats' | 'hero' | 'quiz' | 'books'

// ─── QUIZ JSON template ───────────────────────────────────────────────────────
const QUIZ_TEMPLATE = JSON.stringify(
  {
    title: 'Python Asoslari',
    book_title: 'Automate the Boring Stuff',
    description: "Python dasturlash asoslarini tekshirish",
    difficulty: 'easy',
    category: 'programming',
    questions: [
      {
        question: 'Python da o\'zgaruvchi e\'lon qilish usuli qaysi?',
        options: ['var x = 5', 'x = 5', 'int x = 5', 'let x = 5'],
        correct_answer: 1,
        explanation: 'Python da o\'zgaruvchi e\'lon qilish uchun shunchaki `x = 5` yoziladi.',
      },
    ],
  },
  null,
  2,
)

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ emoji: string; label: string; value: number | string }> = ({
  emoji, label, value,
}) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 dark:border-gray-700">
    <span className="text-3xl">{emoji}</span>
    <div>
      <div className="text-xl font-bold text-sahifa-700 dark:text-sahifa-300">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  </div>
)

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminPage: React.FC = () => {
  const [telegramId, setTelegramId] = useState('')
  const [adminId, setAdminId] = useState<number | null>(null)
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('stats')

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null)

  // Hero
  const [heroList, setHeroList] = useState<HeroContent[]>([])
  const [editingHero, setEditingHero] = useState<Partial<HeroContent> | null>(null)
  const [heroSaving, setHeroSaving] = useState(false)
  const [heroMsg, setHeroMsg] = useState('')

  // Quiz
  const [quizJson, setQuizJson] = useState(QUIZ_TEMPLATE)
  const [quizUploading, setQuizUploading] = useState(false)
  const [quizMsg, setQuizMsg] = useState('')

  // Books
  const [books, setBooks] = useState<AdminBook[]>([])
  const [editingBook, setEditingBook] = useState<AdminBook | null>(null)
  const [bookSaving, setBookSaving] = useState(false)
  const [bookMsg, setBookMsg] = useState('')
  const [showNewBook, setShowNewBook] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '', author: '', description: '', price: 0,
    is_paid: false, file_url: '', thumbnail_url: '', category: 'programming',
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const id = parseInt(telegramId.trim(), 10)
    if (!id || isNaN(id)) {
      setAuthError('To\'g\'ri Telegram ID kiriting')
      return
    }
    // Verify by fetching stats — if 403, not an admin
    try {
      await apiService.getAdminStats(id)
      setAdminId(id)
      setAuthError('')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setAuthError('❌ Sizda admin huquqi yo\'q')
      } else {
        // Connection error but still proceed (offline dev)
        setAdminId(id)
      }
    }
  }

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminStats(adminId)
      setStats(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  const loadHero = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminHeroList(adminId)
      setHeroList(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  const loadBooks = useCallback(async () => {
    if (!adminId) return
    try {
      const res = await apiService.getAdminBooks(adminId)
      setBooks(res.data)
    } catch { /* ignore */ }
  }, [adminId])

  useEffect(() => {
    if (!adminId) return
    loadStats()
    if (activeTab === 'hero') loadHero()
    if (activeTab === 'books') loadBooks()
  }, [adminId, activeTab, loadStats, loadHero, loadBooks])

  // ── Hero handlers ─────────────────────────────────────────────────────────
  const handleSaveHero = async () => {
    if (!adminId || !editingHero) return
    setHeroSaving(true)
    setHeroMsg('')
    try {
      if (editingHero.id) {
        await apiService.updateHeroContent(editingHero.id, adminId, editingHero)
      } else {
        await apiService.createHeroContent(adminId, editingHero)
      }
      setHeroMsg('✅ Saqlandi!')
      setEditingHero(null)
      loadHero()
    } catch {
      setHeroMsg('❌ Xatolik yuz berdi')
    } finally {
      setHeroSaving(false)
    }
  }

  const handleDeleteHero = async (heroId: number) => {
    if (!adminId) return
    if (!window.confirm('Rostdan ham o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteHeroContent(heroId, adminId)
      loadHero()
    } catch { /* ignore */ }
  }

  // ── Quiz handlers ─────────────────────────────────────────────────────────
  const handleUploadQuiz = async () => {
    if (!adminId) return
    setQuizUploading(true)
    setQuizMsg('')
    try {
      const parsed = JSON.parse(quizJson)
      await apiService.uploadQuiz(adminId, parsed)
      setQuizMsg('✅ Quiz muvaffaqiyatli yuklandi!')
      setQuizJson(QUIZ_TEMPLATE)
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setQuizMsg('❌ JSON formatida xatolik bor')
      } else {
        setQuizMsg(`❌ ${err?.response?.data?.detail || 'Server xatosi'}`)
      }
    } finally {
      setQuizUploading(false)
    }
  }

  // ── Book handlers ─────────────────────────────────────────────────────────
  const handleUpdateBook = async () => {
    if (!adminId || !editingBook) return
    setBookSaving(true)
    setBookMsg('')
    try {
      await apiService.updateBook(editingBook.id, adminId, editingBook)
      setBookMsg('✅ Kitob yangilandi!')
      setEditingBook(null)
      loadBooks()
    } catch {
      setBookMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookSaving(false)
    }
  }

  const handleDeleteBook = async (bookId: number) => {
    if (!adminId) return
    if (!window.confirm('Kitobni o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteBook(bookId, adminId)
      loadBooks()
    } catch { /* ignore */ }
  }

  const handleCreateBook = async () => {
    if (!adminId) return
    setBookSaving(true)
    setBookMsg('')
    try {
      await apiService.createBook(adminId, newBook)
      setBookMsg('✅ Yangi kitob qo\'shildi!')
      setShowNewBook(false)
      setNewBook({ title: '', author: '', description: '', price: 0, is_paid: false, file_url: '', thumbnail_url: '', category: 'programming' })
      loadBooks()
    } catch {
      setBookMsg('❌ Xatolik yuz berdi')
    } finally {
      setBookSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Login Screen
  // ─────────────────────────────────────────────────────────────────────────
  if (!adminId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8 w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <div className="text-5xl">🔐</div>
            <h1 className="text-2xl font-bold text-sahifa-700 dark:text-sahifa-300">Admin Panel</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">SAHIFALAB boshqaruv markazi</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Telegram ID
            </label>
            <input
              type="number"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="123456789"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
            />
            {authError && (
              <p className="text-sm text-red-500">{authError}</p>
            )}
            <button
              onClick={handleLogin}
              className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Kirish →
            </button>
          </div>
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            Faqat ruxsatli adminlar kira oladi
          </p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Dashboard
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-sahifa-700 dark:text-sahifa-300">SAHIFALAB</span>
          <span className="text-xs bg-sahifa-100 dark:bg-sahifa-900/30 text-sahifa-600 dark:text-sahifa-400 px-2 py-0.5 rounded-full">Admin</span>
        </div>
        <button
          onClick={() => setAdminId(null)}
          className="text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          Chiqish
        </button>
      </div>

      {/* Tab navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {([
            { id: 'stats', label: '📊 Stats' },
            { id: 'hero', label: '🖼 Hero' },
            { id: 'quiz', label: '📝 Quiz' },
            { id: 'books', label: '📚 Kitoblar' },
          ] as { id: Tab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-sahifa-600 text-sahifa-600 dark:text-sahifa-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* ── Stats Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dashboard</h2>
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard emoji="📝" label="Quizlar" value={stats.total_quizzes} />
                  <StatCard emoji="📚" label="Kitoblar" value={stats.total_books} />
                  <StatCard emoji="👥" label="Foydalanuvchilar" value={stats.total_users} />
                  <StatCard emoji="💳" label="Faol to'lovlar" value={stats.active_payments} />
                </div>
                {stats.recent_uploads.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">So'nggi yuklangan</h3>
                    <ul className="space-y-1">
                      {stats.recent_uploads.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                          <span className="text-green-500">✓</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 h-20 animate-pulse border border-gray-100 dark:border-gray-700" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hero Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'hero' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Hero Content</h2>
              <button
                onClick={() => setEditingHero({ title: '', subtitle: '', description: '', cta_text: '', cta_link: '', is_active: true, display_order: 0 })}
                className="bg-sahifa-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                + Yangi
              </button>
            </div>

            {heroMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{heroMsg}</div>
            )}

            {/* Edit form */}
            {editingHero && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">
                  {editingHero.id ? 'Tahrirlash' : 'Yangi hero content'}
                </h3>
                {(['title', 'subtitle', 'description', 'image_url', 'cta_text', 'cta_link'] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 capitalize">{field.replace('_', ' ')}</label>
                    {field === 'description' ? (
                      <textarea
                        rows={3}
                        value={(editingHero as any)[field] ?? ''}
                        onChange={(e) => setEditingHero({ ...editingHero, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(editingHero as any)[field] ?? ''}
                        onChange={(e) => setEditingHero({ ...editingHero, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={editingHero.is_active ?? true}
                    onChange={(e) => setEditingHero({ ...editingHero, is_active: e.target.checked })}
                    className="accent-sahifa-600"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">Faol</label>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveHero}
                    disabled={heroSaving}
                    className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {heroSaving ? 'Saqlanmoqda…' : 'Saqlash'}
                  </button>
                  <button
                    onClick={() => { setEditingHero(null); setHeroMsg('') }}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Hero list */}
            {heroList.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Hali hero content yo'q
              </div>
            ) : (
              <div className="space-y-3">
                {heroList.map((h) => (
                  <div key={h.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{h.title || '(Sarlavhasiz)'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{h.subtitle}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setEditingHero(h)}
                          className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg"
                        >
                          Tahrir
                        </button>
                        <button
                          onClick={() => handleDeleteHero(h.id)}
                          className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-2 py-1 rounded-lg"
                        >
                          O'chir
                        </button>
                      </div>
                    </div>
                    <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${h.is_active ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {h.is_active ? 'Faol' : 'Nofaol'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Quiz Tab ───────────────────────────────────────────────────── */}
        {activeTab === 'quiz' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz Yuklash</h2>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                JSON formatida quiz ma'lumotlarini kiriting. Namuna:
              </p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 font-mono overflow-auto max-h-32">
                <pre>{`{\n  "title": "Quiz nomi",\n  "book_title": "Kitob nomi",\n  "difficulty": "easy|medium|hard",\n  "category": "programming",\n  "questions": [\n    {\n      "question": "Savol?",\n      "options": ["A","B","C","D"],\n      "correct_answer": 1,\n      "explanation": "Izoh"\n    }\n  ]\n}`}</pre>
              </div>
              <textarea
                rows={16}
                value={quizJson}
                onChange={(e) => setQuizJson(e.target.value)}
                className="w-full px-3 py-3 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500 resize-none"
                spellCheck={false}
              />
              {quizMsg && (
                <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{quizMsg}</div>
              )}
              <button
                onClick={handleUploadQuiz}
                disabled={quizUploading}
                className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {quizUploading ? '⏳ Yuklanmoqda…' : '📤 Quiz Yuklash'}
              </button>
            </div>
          </div>
        )}

        {/* ── Books Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'books' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kitoblar</h2>
              <button
                onClick={() => setShowNewBook(true)}
                className="bg-sahifa-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                + Yangi kitob
              </button>
            </div>

            {bookMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{bookMsg}</div>
            )}

            {/* New book form */}
            {showNewBook && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">Yangi kitob</h3>
                {([
                  { field: 'title', label: 'Sarlavha', type: 'text' },
                  { field: 'author', label: 'Muallif', type: 'text' },
                  { field: 'description', label: 'Tavsif', type: 'textarea' },
                  { field: 'price', label: 'Narx (UZS)', type: 'number' },
                  { field: 'file_url', label: 'PDF URL', type: 'text' },
                  { field: 'thumbnail_url', label: 'Muqova URL', type: 'text' },
                  { field: 'category', label: 'Kategoriya', type: 'text' },
                ] as { field: keyof typeof newBook; label: string; type: string }[]).map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    {type === 'textarea' ? (
                      <textarea
                        rows={2}
                        value={newBook[field] as string}
                        onChange={(e) => setNewBook({ ...newBook, [field]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    ) : (
                      <input
                        type={type}
                        value={newBook[field] as string | number}
                        onChange={(e) => setNewBook({ ...newBook, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                      />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    id="new_is_paid"
                    type="checkbox"
                    checked={newBook.is_paid}
                    onChange={(e) => setNewBook({ ...newBook, is_paid: e.target.checked })}
                    className="accent-sahifa-600"
                  />
                  <label htmlFor="new_is_paid" className="text-sm text-gray-700 dark:text-gray-300">Pullik kitob</label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateBook}
                    disabled={bookSaving}
                    className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {bookSaving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                  </button>
                  <button
                    onClick={() => { setShowNewBook(false); setBookMsg('') }}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Edit book inline */}
            {editingBook && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-sahifa-200 dark:border-sahifa-700 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-white">Tahrirlash: {editingBook.title}</h3>
                {([
                  { field: 'title', label: 'Sarlavha', type: 'text' },
                  { field: 'author', label: 'Muallif', type: 'text' },
                  { field: 'price', label: 'Narx (UZS)', type: 'number' },
                ] as { field: keyof AdminBook; label: string; type: string }[]).map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    <input
                      type={type}
                      value={(editingBook as any)[field]}
                      onChange={(e) => setEditingBook({ ...editingBook, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value } as AdminBook)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    id="edit_is_paid"
                    type="checkbox"
                    checked={editingBook.is_paid}
                    onChange={(e) => setEditingBook({ ...editingBook, is_paid: e.target.checked })}
                    className="accent-sahifa-600"
                  />
                  <label htmlFor="edit_is_paid" className="text-sm text-gray-700 dark:text-gray-300">Pullik</label>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleUpdateBook} disabled={bookSaving} className="flex-1 bg-sahifa-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {bookSaving ? 'Saqlanmoqda…' : 'Saqlash'}
                  </button>
                  <button onClick={() => { setEditingBook(null); setBookMsg('') }} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm">
                    Bekor
                  </button>
                </div>
              </div>
            )}

            {/* Books list */}
            {books.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Kitoblar mavjud emas
              </div>
            ) : (
              <div className="space-y-2">
                {books.map((book) => (
                  <div key={book.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div className="text-2xl shrink-0">📕</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{book.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{book.author}</p>
                      <div className="flex gap-2 mt-1">
                        {book.is_paid ? (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                            {book.price.toLocaleString()} UZS
                          </span>
                        ) : (
                          <span className="text-xs bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">Bepul</span>
                        )}
                        <span className="text-xs text-gray-400">↓ {book.downloads}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditingBook(book)} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg">
                        Tahrir
                      </button>
                      <button onClick={() => handleDeleteBook(book.id)} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-2 py-1 rounded-lg">
                        O'chir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default AdminPage
