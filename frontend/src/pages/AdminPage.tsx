/**
 * SAHIFALAB Admin Panel
 * Sam (16yo mentor) brand voice — Uzbek-first, clean and simple.
 * Authentication: Admin enters their Telegram ID; backend validates against AdminUser table.
 */
import React, { useState, useEffect, useCallback } from 'react'
import apiService from '@services/apiService'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const ADMIN_TELEGRAM_IDS = [807466591]

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
  file_url: string
  thumbnail_url: string
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

type Tab = 'stats' | 'hero' | 'quiz' | 'books' | 'sounds'

// ─── Quiz form types ──────────────────────────────────────────────────────────
interface QuizQuestionForm {
  question: string
  options: [string, string, string, string]
  correct_answer: number
  explanation: string
}

interface QuizForm {
  title: string
  book_title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

const EMPTY_QUESTION: QuizQuestionForm = {
  question: '',
  options: ['', '', '', ''],
  correct_answer: 0,
  explanation: '',
}

const EMPTY_QUIZ: QuizForm = {
  title: '',
  book_title: '',
  description: '',
  difficulty: 'easy',
  category: 'programming',
}

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
  const { user: tgUser } = useTelegramWebApp()
  const [telegramId, setTelegramId] = useState('')
  const [adminId, setAdminId] = useState<number | null>(null)
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('stats')

  // Debug
  const [dbStatus, setDbStatus] = useState<string | null>(null)
  const [dbChecking, setDbChecking] = useState(false)

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null)

  // Hero
  const [heroList, setHeroList] = useState<HeroContent[]>([])
  const [editingHero, setEditingHero] = useState<Partial<HeroContent> | null>(null)
  const [heroSaving, setHeroSaving] = useState(false)
  const [heroMsg, setHeroMsg] = useState('')

  // Quiz
  const [quizForm, setQuizForm] = useState<QuizForm>({ ...EMPTY_QUIZ })
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionForm[]>([{ ...EMPTY_QUESTION, options: ['', '', '', ''] }])
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
  // PDF upload (Supabase Storage)
  const [bookPdfFile, setBookPdfFile] = useState<File | null>(null)
  const [bookPdfUploading, setBookPdfUploading] = useState(false)
  const [bookPdfPercent, setBookPdfPercent] = useState(0)
  const [bookPdfMsg, setBookPdfMsg] = useState('')

  // Ambient Sounds
  interface AmbientSoundItem { id: number; name: string; emoji: string; url: string; display_order: number; is_active: boolean; created_at: string }
  const [ambientSounds, setAmbientSounds] = useState<AmbientSoundItem[]>([])
  const [soundName, setSoundName] = useState('')
  const [soundEmoji, setSoundEmoji] = useState('🎵')
  const [soundFile, setSoundFile] = useState<File | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [soundUploading, setSoundUploading] = useState(false)
  const [soundMsg, setSoundMsg] = useState('')

  // ── Auto-login from Telegram WebApp ────────────────────────────────────
  useEffect(() => {
    if (tgUser?.id && ADMIN_TELEGRAM_IDS.includes(tgUser.id) && !adminId) {
      setAdminId(tgUser.id)
    }
  }, [tgUser, adminId])

  const checkDb = async () => {
    if (!adminId) return
    setDbChecking(true)
    setDbStatus(null)
    try {
      const res = await apiService.debugDb(adminId)
      setDbStatus(JSON.stringify(res.data, null, 2))
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.statusText || err?.message || String(err)
      setDbStatus(`❌ HTTP ${err?.response?.status ?? '?'}: ${detail}`)
    } finally {
      setDbChecking(false)
    }
  }

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

  const loadSounds = useCallback(async () => {
    try {
      const res = await apiService.getAmbientSounds()
      console.log('[AdminPage] loadSounds:', res.data)
      setAmbientSounds(res.data)
    } catch (err) {
      console.error('[AdminPage] loadSounds error:', err)
    }
  }, [])

  useEffect(() => {
    if (!adminId) return
    loadStats()
    if (activeTab === 'hero') loadHero()
    if (activeTab === 'books') loadBooks()
    if (activeTab === 'sounds') loadSounds()
  }, [adminId, activeTab, loadStats, loadHero, loadBooks, loadSounds])

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
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.statusText || err?.message || 'Server xatosi'
      setHeroMsg(`❌ ${err?.response?.status ?? ''} ${detail}`)
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
    // Validate
    if (!quizForm.title.trim()) { setQuizMsg('❌ Quiz nomini kiriting'); return }
    if (!quizForm.book_title.trim()) { setQuizMsg('❌ Kitob nomini kiriting'); return }
    const validQs = quizQuestions.filter(q => q.question.trim() && q.options.some(o => o.trim()))
    if (validQs.length === 0) { setQuizMsg('❌ Kamida bitta savol kiriting'); return }

    setQuizUploading(true)
    setQuizMsg('')
    try {
      const payload = {
        ...quizForm,
        questions: validQs.map(q => ({
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        })),
      }
      await apiService.uploadQuiz(adminId, payload)
      setQuizMsg('✅ Quiz muvaffaqiyatli yuklandi!')
      setQuizForm({ ...EMPTY_QUIZ })
      setQuizQuestions([{ ...EMPTY_QUESTION, options: ['', '', '', ''] }])
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Server xatosi'
      setQuizMsg(`❌ ${detail}`)
    } finally {
      setQuizUploading(false)
    }
  }

  const updateQuestion = (idx: number, field: keyof QuizQuestionForm, value: any) => {
    setQuizQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    setQuizQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q
      const newOptions = [...q.options] as [string, string, string, string]
      newOptions[oIdx] = value
      return { ...q, options: newOptions }
    }))
  }

  const addQuestion = () => {
    setQuizQuestions(prev => [...prev, { ...EMPTY_QUESTION, options: ['', '', '', ''] }])
  }

  const removeQuestion = (idx: number) => {
    if (quizQuestions.length <= 1) return
    setQuizQuestions(prev => prev.filter((_, i) => i !== idx))
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
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.statusText || err?.message || 'Server xatosi'
      setBookMsg(`❌ ${err?.response?.status ?? ''} ${detail}`)
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
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.statusText || err?.message || 'Server xatosi'
      setBookMsg(`❌ ${err?.response?.status ?? ''} ${detail}`)
    } finally {
      setBookSaving(false)
    }
  }

  // ── Book PDF upload (Supabase Storage) ────────────────────────────────────
  const handleUploadBookPdf = async (target: 'new' | 'edit') => {
    if (!bookPdfFile) { setBookPdfMsg('❌ PDF faylni tanlang'); return }
    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (!supabaseUrl || !supabaseAnon) {
      setBookPdfMsg('❌ Supabase env varlarini sozlang')
      return
    }
    setBookPdfUploading(true)
    setBookPdfMsg('⬆️ Yuklanmoqda…')
    setBookPdfPercent(0)
    try {
      const ext      = bookPdfFile.name.split('.').pop()?.toLowerCase() || 'pdf'
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const endpoint = `${supabaseUrl}/storage/v1/object/books/${filename}`
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', endpoint)
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnon}`)
        xhr.setRequestHeader('Content-Type', bookPdfFile.type || 'application/pdf')
        xhr.setRequestHeader('x-upsert', 'false')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setBookPdfPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) resolve()
          else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.message || `Xato: ${xhr.status}`)) }
            catch { reject(new Error(`Xato: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Tarmoq xatosi'))
        xhr.send(bookPdfFile)
      })
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/books/${filename}`
      if (target === 'new') {
        setNewBook(prev => ({ ...prev, file_url: publicUrl }))
      } else if (editingBook) {
        setEditingBook(prev => prev ? { ...prev, file_url: publicUrl } : prev)
      }
      setBookPdfMsg(`✅ Yuklandi!`)
      setBookPdfFile(null)
    } catch (err: any) {
      setBookPdfMsg(`❌ ${err?.message || 'Xato'}`)
    } finally {
      setBookPdfUploading(false)
    }
  }

  // ── Sound handlers ──────────────────────────────────────────────────────
  const handleUploadSound = async () => {
    if (!adminId) return
    if (!soundName.trim()) { setSoundMsg('❌ Tovush nomini kiriting'); return }
    if (!soundFile) { setSoundMsg('❌ Audio faylni tanlang'); return }

    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (!supabaseUrl || !supabaseAnon) {
      setSoundMsg('❌ Vercel-da VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY env varlarini sozlang')
      return
    }

    setSoundUploading(true)
    setSoundMsg('⬆️ Yuklanmoqda…')
    setUploadPercent(0)
    try {
      // 1. Upload file directly from browser → Supabase Storage (bypasses Vercel)
      const ext      = soundFile.name.split('.').pop()?.toLowerCase() || 'mp3'
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const endpoint = `${supabaseUrl}/storage/v1/object/ambient-sounds/${filename}`

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', endpoint)
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnon}`)
        xhr.setRequestHeader('Content-Type', soundFile.type || 'audio/mpeg')
        xhr.setRequestHeader('x-upsert', 'false')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            resolve()
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText)?.message || `Upload xatosi: ${xhr.status}`)) }
            catch { reject(new Error(`Upload xatosi: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Tarmoq xatosi'))
        xhr.send(soundFile)
      })

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/ambient-sounds/${filename}`

      // 2. Save Supabase CDN URL to DB
      setSoundMsg('💾 Saqlanmoqda…')
      await apiService.saveAmbientSound(adminId, soundName.trim(), soundEmoji, publicUrl)
      setSoundMsg('✅ Tovush muvaffaqiyatli saqlandi!')
      setSoundName('')
      setSoundEmoji('🎵')
      setSoundFile(null)
      setUploadPercent(0)
      loadSounds()
    } catch (err: any) {
      console.error('[AdminPage] handleUploadSound error:', err)
      setSoundMsg(`❌ ${err?.message || 'Xato yuz berdi'}`)
    } finally {
      setSoundUploading(false)
    }
  }

  const handleDeleteSound = async (soundId: number) => {
    if (!adminId) return
    if (!window.confirm('Tovushni o\'chirmoqchimisiz?')) return
    try {
      await apiService.deleteAmbientSound(soundId, adminId)
      loadSounds()
    } catch (err) {
      console.error('[AdminPage] handleDeleteSound error:', err)
    }
  }
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
            {tgUser?.id && (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                Telegram ID: <span className="font-mono font-bold text-sahifa-600 dark:text-sahifa-400">{tgUser.id}</span>
              </p>
            )}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Telegram ID
            </label>
            <input
              type="number"
              value={telegramId || (tgUser?.id?.toString() ?? '')}
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
            { id: 'sounds', label: '🎵 Tovushlar' },
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

            {/* ── DB Debug Panel ── */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">🛠 Database ulanishini tekshirish</span>
                <button
                  onClick={checkDb}
                  disabled={dbChecking}
                  className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {dbChecking ? 'Tekshirilmoqda...' : 'Test qilish'}
                </button>
              </div>
              {dbStatus && (
                <pre className="text-xs text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap break-all bg-yellow-100 dark:bg-yellow-900/40 rounded-lg p-2">
                  {dbStatus}
                </pre>
              )}
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                API: {import.meta.env.VITE_API_URL || 'http://localhost:8000'} · Admin ID: {adminId}
              </p>
            </div>
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz Yaratish</h2>

            {/* Quiz info card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">📋 Quiz ma'lumotlari</h3>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Quiz nomi *</label>
                <input
                  type="text"
                  value={quizForm.title}
                  onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                  placeholder="Masalan: Python Asoslari"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kitob nomi *</label>
                <input
                  type="text"
                  value={quizForm.book_title}
                  onChange={(e) => setQuizForm({ ...quizForm, book_title: e.target.value })}
                  placeholder="Masalan: Automate the Boring Stuff"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tavsif</label>
                <input
                  type="text"
                  value={quizForm.description}
                  onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                  placeholder="Quiz haqida qisqacha"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Qiyinlik</label>
                  <select
                    value={quizForm.difficulty}
                    onChange={(e) => setQuizForm({ ...quizForm, difficulty: e.target.value as QuizForm['difficulty'] })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  >
                    <option value="easy">🟢 Oson</option>
                    <option value="medium">🟡 O'rta</option>
                    <option value="hard">🔴 Qiyin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kategoriya</label>
                  <select
                    value={quizForm.category}
                    onChange={(e) => setQuizForm({ ...quizForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  >
                    <option value="programming">💻 Dasturlash</option>
                    <option value="science">🔬 Fan</option>
                    <option value="math">📐 Matematika</option>
                    <option value="language">🌍 Til</option>
                    <option value="religion">📖 Din</option>
                    <option value="other">📂 Boshqa</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Questions */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">❓ Savollar ({quizQuestions.length})</h3>
              <button
                onClick={addQuestion}
                className="text-xs bg-sahifa-600 text-white px-3 py-1.5 rounded-lg font-medium"
              >
                + Savol qo'shish
              </button>
            </div>

            {quizQuestions.map((q, qIdx) => (
              <div key={qIdx} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sahifa-600 dark:text-sahifa-400">Savol {qIdx + 1}</span>
                  {quizQuestions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(qIdx)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      🗑 O'chirish
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Savol matni *</label>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                    placeholder="Savolni yozing..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400">Javob variantlari (to'g'ri javobni tanlang)</label>
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIdx, 'correct_answer', oIdx)}
                        className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          q.correct_answer === oIdx
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:border-green-400'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={`Variant ${String.fromCharCode(65 + oIdx)}`}
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500 ${
                          q.correct_answer === oIdx
                            ? 'border-green-400 dark:border-green-600'
                            : 'border-gray-200 dark:border-gray-600'
                        }`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Izoh (ixtiyoriy)</label>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(qIdx, 'explanation', e.target.value)}
                    placeholder="Nima uchun bu javob to'g'ri?"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>
              </div>
            ))}

            {quizMsg && (
              <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{quizMsg}</div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUploadQuiz}
              disabled={quizUploading}
              className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {quizUploading ? '⏳ Yuklanmoqda…' : `📤 Quiz Yuklash (${quizQuestions.filter(q => q.question.trim()).length} savol)`}
            </button>
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

                {/* PDF file upload → Supabase Storage */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    PDF fayl <span className="text-blue-500">(Supabase-ga yuklanadi)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>📄</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookPdfFile ? bookPdfFile.name : 'PDF tanlang…'}</span>
                      <input type="file" accept=".pdf,application/pdf" className="hidden"
                        onChange={e => { setBookPdfFile(e.target.files?.[0] || null); setBookPdfMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookPdf('new')}
                      disabled={!bookPdfFile || bookPdfUploading}
                      className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookPdfUploading ? `${bookPdfPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  {newBook.file_url ? (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 truncate">✅ {newBook.file_url}</p>
                  ) : (
                    <div className="mt-1">
                      <input
                        type="text"
                        placeholder="Yoki PDF URL ni qo'lda kiriting"
                        value={newBook.file_url}
                        onChange={e => setNewBook({ ...newBook, file_url: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sahifa-500"
                      />
                    </div>
                  )}
                  {bookPdfMsg && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookPdfMsg}</p>}
                  {bookPdfUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${bookPdfPercent}%` }} />
                    </div>
                  )}
                </div>
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
                  { field: 'thumbnail_url', label: 'Muqova URL', type: 'text' },
                ] as { field: keyof AdminBook; label: string; type: string }[]).map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    <input
                      type={type}
                      value={(editingBook as any)[field] ?? ''}
                      onChange={(e) => setEditingBook({ ...editingBook, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value } as AdminBook)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                    />
                  </div>
                ))}

                {/* PDF upload for edit */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    PDF fayl <span className="text-blue-500">(yangi fayl yuklash)</span>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <span>📄</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate">{bookPdfFile ? bookPdfFile.name : 'PDF tanlang…'}</span>
                      <input type="file" accept=".pdf,application/pdf" className="hidden"
                        onChange={e => { setBookPdfFile(e.target.files?.[0] || null); setBookPdfMsg('') }} />
                    </label>
                    <button
                      onClick={() => handleUploadBookPdf('edit')}
                      disabled={!bookPdfFile || bookPdfUploading}
                      className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
                    >
                      {bookPdfUploading ? `${bookPdfPercent}%` : '⬆ Yuklash'}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Yoki PDF URL ni qo'lda kiriting"
                    value={editingBook.file_url ?? ''}
                    onChange={e => setEditingBook({ ...editingBook, file_url: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sahifa-500"
                  />
                  {bookPdfMsg && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{bookPdfMsg}</p>}
                  {bookPdfUploading && (
                    <div className="mt-1.5 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${bookPdfPercent}%` }} />
                    </div>
                  )}
                </div>
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

        {/* ── Sounds Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'sounds' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">🎵 Ambient Tovushlar</h2>

            {/* Add form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Yangi tovush qo'shish</h3>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nomi *</label>
                  <input
                    type="text"
                    value={soundName}
                    onChange={(e) => setSoundName(e.target.value)}
                    placeholder="Masalan: Yomg'ir"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={soundEmoji}
                    onChange={(e) => setSoundEmoji(e.target.value)}
                    placeholder="🌧️"
                    className="w-16 px-2 py-2 text-lg border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sahifa-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Audio fayl * <span className="text-blue-500">(MP3, OGG, WAV — to'g'ridan Supabase-ga yuklanadi)</span>
                </label>
                <label className="flex items-center gap-3 w-full px-3 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <span className="text-xl shrink-0">🎵</span>
                  <span className="flex-1 text-gray-600 dark:text-gray-300 truncate">
                    {soundFile ? soundFile.name : 'Faylni bosing yoki suring…'}
                  </span>
                  {soundFile && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {(soundFile.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) { setSoundFile(f); setSoundMsg('') }
                    }}
                  />
                </label>
              </div>

              {soundUploading && uploadPercent > 0 && (
                <div className="space-y-1">
                  <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{uploadPercent}%</p>
                </div>
              )}

              {soundMsg && (
                <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{soundMsg}</div>
              )}

              <button
                onClick={handleUploadSound}
                disabled={soundUploading}
                className="w-full bg-sahifa-600 hover:bg-sahifa-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {soundUploading ? '⏳ Saqlanmoqda…' : '💾 Saqlash'}
              </button>
            </div>

            {/* Sounds list */}
            <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Mavjud tovushlar ({ambientSounds.length})</h3>
            {ambientSounds.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center text-gray-500 dark:text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
                Hali hech qanday tovush qo'shilmagan
              </div>
            ) : (
              <div className="space-y-2">
                {ambientSounds.map((s) => (
                  <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div className="text-2xl shrink-0">{s.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">🔗 {s.url}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteSound(s.id)}
                      className="text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-3 py-1.5 rounded-lg shrink-0"
                    >
                      🗑 O'chirish
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Setup instructions */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">⚙️ Bir martalik sozlash:</p>
              <ol className="text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5 list-decimal list-inside">
                <li>Supabase → Storage → <strong>ambient-sounds</strong> bucket yarating (<strong>Public ✓</strong>)</li>
                <li>Vercel env vars-ga qo'shing: <code className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">VITE_SUPABASE_URL</code> va <code className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
              </ol>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default AdminPage
