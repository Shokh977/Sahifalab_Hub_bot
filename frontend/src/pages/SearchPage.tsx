import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, Loader2, Users, BookOpen, Briefcase,
  BadgeCheck, ArrowLeft,
} from 'lucide-react'
import api from '../services/apiService'
import { getLevelTitle } from '../utils/levelTitles'

type TabKey = 'all' | 'people' | 'courses' | 'jobs'

interface PersonResult {
  id: number
  name: string
  username: string | null
  avatar_url: string | null
  headline: string
  account_type: string
  is_verified: boolean
  level: number
}

interface CourseResult {
  id: number
  title: string
  thumbnail_url: string | null
  teacher_name: string
  price: number
  rating: number
  enrolled_count: number
}

interface JobResult {
  id: number
  title: string
  company_name: string
  location: string
  employment_type: string
}

interface SearchResults {
  people: PersonResult[]
  courses: CourseResult[]
  jobs: JobResult[]
}

const TABS: { key: TabKey; label: string; Icon: React.FC<any> }[] = [
  { key: 'all',     label: 'Hammasi',  Icon: Search },
  { key: 'people',  label: 'Odamlar',  Icon: Users },
  { key: 'courses', label: 'Kurslar',  Icon: BookOpen },
  { key: 'jobs',    label: 'Ishlar',   Icon: Briefcase },
]

const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [tab, setTab] = useState<TabKey>('all')
  const [results, setResults] = useState<SearchResults>({ people: [], courses: [], jobs: [] })
  const [loading, setLoading] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults({ people: [], courses: [], jobs: [] }); return }
    setLoading(true)
    try {
      const type = tab === 'all' ? 'all' : tab
      const res = await api.client.get('/api/search', { params: { q, type } })
      setResults({
        people:  res.data.people  || [],
        courses: res.data.courses || [],
        jobs:    res.data.jobs    || [],
      })
    } catch {}
    setLoading(false)
  }, [tab])

  // Sync query from URL on mount
  useEffect(() => {
    const q = searchParams.get('q') || ''
    setQuery(q)
    doSearch(q)
  }, [tab])

  useEffect(() => {
    const q = searchParams.get('q') || ''
    if (q !== query) {
      setQuery(q)
      doSearch(q)
    }
  }, [searchParams])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams(query ? { q: query } : {}, { replace: true })
      doSearch(query)
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const totalCount = results.people.length + results.courses.length + results.jobs.length
  const hasQuery = query.trim().length > 0

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-pitch pb-24">

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-pitch/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Qidiruv</h1>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Kurs, odamlar, ish o'rinlari..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200/60 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#e8792f]/40 transition-colors"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === key
                    ? 'bg-[#e8792f] text-white'
                    : 'bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-6">

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-white/20" />
          </div>
        )}

        {/* Empty state */}
        {!loading && hasQuery && totalCount === 0 && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-gray-200 dark:text-white/10 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-white/30 text-sm font-medium">"{query}" bo'yicha natija topilmadi</p>
          </div>
        )}

        {/* No query */}
        {!loading && !hasQuery && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-gray-200 dark:text-white/10 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-white/30 text-sm">Qidirish uchun yozing</p>
          </div>
        )}

        {/* People */}
        {!loading && (tab === 'all' || tab === 'people') && results.people.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-white/30 mb-3">
              Odamlar · {results.people.length}
            </h2>
            <div className="space-y-2">
              {results.people.map(p => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/profile/${p.username || p.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.05] hover:border-[#e8792f]/30 dark:hover:border-[#e8792f]/20 cursor-pointer transition-all"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-[#24253a] flex-shrink-0">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#e8792f] to-[#8b2a10]">
                          <span className="text-white text-sm font-bold">{(p.name || '?').charAt(0)}</span>
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</span>
                      {p.is_verified && <span className="w-3.5 h-3.5 text-[#e8792f] flex-shrink-0">✓</span>}
                      {p.account_type === 'admin'
                        ? <BadgeCheck className="w-3.5 h-3.5 text-[#e8792f] flex-shrink-0" title="Admin" />
                        : p.account_type === 'teacher'
                          ? <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="O'qituvchi" />
                          : null
                      }
                    </div>
                    <p className="text-xs text-gray-400 dark:text-white/40 truncate">
                      {p.headline || getLevelTitle(p.level || 1)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-300 dark:text-white/20 flex-shrink-0">Lv.{p.level}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Courses */}
        {!loading && (tab === 'all' || tab === 'courses') && results.courses.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-white/30 mb-3">
              Kurslar · {results.courses.length}
            </h2>
            <div className="space-y-2">
              {results.courses.map(c => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/courses/${c.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.05] hover:border-[#e8792f]/30 dark:hover:border-[#e8792f]/20 cursor-pointer transition-all"
                >
                  <div className="w-12 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-[#24253a] flex-shrink-0">
                    {c.thumbnail_url
                      ? <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-gray-300 dark:text-white/20" />
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40">{c.teacher_name}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-bold text-[#e8792f]">
                      {c.price === 0 ? 'Bepul' : `${c.price?.toLocaleString()} so'm`}
                    </p>
                    {c.rating > 0 && (
                      <p className="text-[10px] text-gray-400 dark:text-white/30">⭐ {c.rating.toFixed(1)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Jobs */}
        {!loading && (tab === 'all' || tab === 'jobs') && results.jobs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-white/30 mb-3">
              Ish o'rinlari · {results.jobs.length}
            </h2>
            <div className="space-y-2">
              {results.jobs.map(j => (
                <div
                  key={j.id}
                  onClick={() => navigate('/jobs')}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.05] hover:border-[#e8792f]/30 dark:hover:border-[#e8792f]/20 cursor-pointer transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#24253a] flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-gray-300 dark:text-white/20" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{j.title}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40">{j.company_name} · {j.location}</p>
                  </div>
                  {j.employment_type && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-white/40 flex-shrink-0">
                      {j.employment_type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

export default SearchPage
