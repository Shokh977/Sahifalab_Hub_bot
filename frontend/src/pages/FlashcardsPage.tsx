/**
 * FlashcardsPage — "Kartalar" (SAHIFALAB Hub).
 * Views A ("Mening kartalarim") and B ("Ommaviy to'plamlar") in one page,
 * switched via a segmented tab, per the flashcards design spec.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Sparkles, ChevronDown, ArrowUpDown,
} from 'lucide-react'
import apiService from '../services/apiService'
import { showToast } from '../components/ErrorBoundary'
import FlashcardsRoot from './flashcards/FlashcardsRoot'
import FlashcardHeader from './flashcards/FlashcardHeader'
import { deckCode, withAlpha, gradientFromColor } from './flashcards/colors'
import type { FlashcardDeck, FlashcardStats, PublicDeckItem } from '../types/flashcards'

// ── Helpers ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  english: 'Ingliz tili', ielts: 'IELTS/CEFR', business: 'Biznes',
  arabic: 'Arab tili', programming: 'Dasturlash', medical: 'Tibbiyot', other: 'Boshqa',
}
const CATEGORY_ORDER = ['english', 'ielts', 'business', 'medical', 'arabic', 'programming', 'other']

const WEEKDAY_LABELS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const AUTHOR_COLORS = ['#D6407F', '#2E7BD6', '#E08D2A', '#1FA463']

// ── Deck card (my decks) ─────────────────────────────────────────────────

const DeckCard: React.FC<{ deck: FlashcardDeck; onOpen: () => void }> = ({ deck, onOpen }) => {
  const masteryPct = deck.card_count > 0 ? Math.round((deck.mastered_count / deck.card_count) * 100) : 0
  return (
    <button className="fc-deck-card" onClick={onOpen}>
      <span className="fc-deck-stripe" style={{ background: deck.color }} />
      <div className="fc-deck-top">
        <span className="fc-deck-code" style={{ background: withAlpha(deck.color, '24'), color: deck.color }}>
          {deckCode(deck.title)}
        </span>
        <div className="fc-deck-mid">
          <p className="fc-deck-mid-title">{deck.title}</p>
          <p className="fc-deck-mid-meta">{deck.card_count} karta · {deck.mastered_count} o'zlashtirilgan</p>
        </div>
        {deck.due_count > 0 && <span className="fc-due-pill">{deck.due_count}</span>}
      </div>
      <div className="fc-deck-bottom">
        <div className="fc-bar"><div className="fc-bar-fill" style={{ width: `${masteryPct}%`, background: deck.color }} /></div>
        <span className="fc-deck-pct">{masteryPct}%</span>
      </div>
    </button>
  )
}

// ── Public deck card ──────────────────────────────────────────────────────

const PublicDeckCard: React.FC<{ deck: PublicDeckItem; onOpen: () => void; onClone: () => void; cloning: boolean }> = ({ deck, onOpen, onClone, cloning }) => {
  const [g1, g2] = gradientFromColor(deck.color)
  return (
    <div className="fc-pub-card" onClick={onOpen}>
      <div className="fc-pub-banner" style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }} />
      <div className="fc-pub-body">
        <div className="fc-pub-top">
          <span className="fc-pub-badge" style={{ background: withAlpha(deck.color, '20'), color: deck.color }}>
            {deckCode(deck.title)}
          </span>
        </div>
        <div className="fc-pub-text">
          <p className="fc-pub-title">{deck.title}</p>
          <p className="fc-pub-meta">
            {deck.creator?.name ?? "Noma'lum"} · {deck.card_count} karta
            {deck.rating_count > 0 && <> · ★ {deck.rating_avg.toFixed(1)}</>}
          </p>
        </div>
        <div className="fc-pub-footer">
          <span className="fc-pub-copies">{deck.clone_count} nusxa olingan</span>
          <button
            className="fc-btn-outline-accent"
            disabled={deck.already_cloned || cloning}
            onClick={(e) => { e.stopPropagation(); onClone() }}
          >
            {deck.already_cloned ? 'Olingan' : cloning ? '…' : 'Olish'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────

const FlashcardsPage: React.FC = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'my' | 'public'>('my')
  const [search, setSearch] = useState('')

  // My decks
  const [decks, setDecks] = useState<FlashcardDeck[]>([])
  const [stats, setStats] = useState<FlashcardStats | null>(null)
  const [myLoading, setMyLoading] = useState(true)
  const [filterChip, setFilterChip] = useState<'all' | 'due' | 'new'>('all')
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null)

  // Public decks
  const [publicDecks, setPublicDecks] = useState<PublicDeckItem[]>([])
  const [publicLoading, setPublicLoading] = useState(true)
  const [category, setCategory] = useState<string>('')
  const [cloningId, setCloningId] = useState<number | null>(null)

  const loadMy = useCallback(async () => {
    setMyLoading(true)
    try {
      const [decksRes, statsRes, limitsRes] = await Promise.all([
        apiService.listFlashcardDecks(),
        apiService.getFlashcardStats(),
        apiService.getAiLimits().catch(() => ({ data: { free_remaining_today: null } })),
      ])
      // Defensive: a misconfigured API base (e.g. hitting the Vite dev
      // server itself, which falls through to index.html for an unknown
      // path) can resolve with a 200 whose body isn't the array we expect —
      // guard the shape here so that degrades to an empty state instead of
      // crashing the whole page.
      setDecks(Array.isArray(decksRes.data) ? decksRes.data : [])
      setStats(statsRes.data && typeof statsRes.data === 'object' ? statsRes.data : null)
      setFreeRemaining(limitsRes.data?.free_remaining_today ?? null)
    } catch {
      showToast("To'plamlar yuklanmadi.", 'error')
    } finally {
      setMyLoading(false)
    }
  }, [])

  const loadPublic = useCallback(async () => {
    setPublicLoading(true)
    try {
      // Backend caps limit at 20 (le=20) — see GET /api/flashcards/public.
      const { data } = await apiService.listPublicFlashcardDecks({ category: category || undefined, sort: 'popular', limit: 20 })
      setPublicDecks(Array.isArray(data?.decks) ? data.decks : [])
    } catch {
      showToast("Ommaviy to'plamlar yuklanmadi.", 'error')
    } finally {
      setPublicLoading(false)
    }
  }, [category])

  useEffect(() => { loadMy() }, [loadMy])
  useEffect(() => { if (tab === 'public') loadPublic() }, [tab, loadPublic])

  const handleClone = async (deckId: number) => {
    setCloningId(deckId)
    try {
      await apiService.cloneFlashcardDeck(deckId)
      setPublicDecks(prev => prev.map(d => d.id === deckId ? { ...d, already_cloned: true, clone_count: d.clone_count + 1 } : d))
      showToast("To'plam kartalarimga qo'shildi!", 'success')
    } catch {
      showToast("Nusxa olinmadi. Qayta urinib ko'ring.", 'error')
    } finally {
      setCloningId(null)
    }
  }

  // ── Derived: My decks ──────────────────────────────────────────────────
  const totalNewApprox = decks.reduce((sum, d) => sum + Math.max(0, d.card_count - d.mastered_count - d.due_count), 0)
  const totalDue = stats?.total_due ?? decks.reduce((s, d) => s + d.due_count, 0)

  const visibleDecks = useMemo(() => {
    let list = decks
    if (filterChip === 'due') list = list.filter(d => d.due_count > 0)
    if (filterChip === 'new') list = list.filter(d => (d.card_count - d.mastered_count - d.due_count) > 0)
    if (search.trim()) list = list.filter(d => d.title.toLowerCase().includes(search.trim().toLowerCase()))
    return [...list].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  }, [decks, filterChip, search])

  const todayPct = stats && stats.total_due + stats.today_reviewed > 0
    ? Math.round((stats.today_reviewed / (stats.total_due + stats.today_reviewed)) * 100)
    : 0

  const todayWeekdayIdx = (new Date().getDay() + 6) % 7   // Mon=0..Sun=6
  const chartCap = Math.max(10, stats?.today_reviewed ?? 0)

  // ── Derived: Public — real authors/categories from the fetched page ────
  const topAuthors = useMemo(() => {
    const map = new Map<number, { name: string; avatar_url: string | null; decks: number; clones: number }>()
    for (const d of publicDecks) {
      if (!d.creator) continue
      const cur = map.get(d.creator.id) ?? { name: d.creator.name, avatar_url: d.creator.avatar_url, decks: 0, clones: 0 }
      cur.decks += 1
      cur.clones += d.clone_count
      map.set(d.creator.id, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.clones - a.clones).slice(0, 4)
  }, [publicDecks])

  const seenCategories = useMemo(() => {
    const set = new Set(publicDecks.map(d => d.category).filter(Boolean) as string[])
    return CATEGORY_ORDER.filter(c => set.has(c))
  }, [publicDecks])

  const visiblePublicDecks = useMemo(() => {
    if (!search.trim()) return publicDecks
    return publicDecks.filter(d => d.title.toLowerCase().includes(search.trim().toLowerCase()))
  }, [publicDecks, search])

  return (
    <FlashcardsRoot>
      <FlashcardHeader title="Kartalar" searchValue={search} onSearchChange={setSearch} />

      <div className="fc-body">
        <div className="fc-col">
          <div className="fc-tabs">
            <button className={`fc-tab${tab === 'my' ? ' active' : ''}`} onClick={() => setTab('my')}>Mening kartalarim</button>
            <button className={`fc-tab${tab === 'public' ? ' active' : ''}`} onClick={() => setTab('public')}>Ommaviy to'plamlar</button>
          </div>

          {tab === 'my' ? (
            <>
              <div className="fc-chiprow">
                <button className={`fc-chip${filterChip === 'all' ? ' active' : ''}`} onClick={() => setFilterChip('all')}>Barchasi {decks.length}</button>
                <button className={`fc-chip${filterChip === 'due' ? ' active' : ''}`} onClick={() => setFilterChip('due')}>Takrorlash {totalDue}</button>
                <button className={`fc-chip${filterChip === 'new' ? ' active' : ''}`} onClick={() => setFilterChip('new')}>Yangi {totalNewApprox}</button>
                <span className="fc-sort"><ArrowUpDown size={14} strokeWidth={2.4} />Oxirgi mashq</span>
              </div>

              {myLoading ? (
                <div className="fc-deck-grid">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ height: 118, borderRadius: 18, background: 'var(--surface2)' }} className="fc-skeleton-pulse" />
                  ))}
                </div>
              ) : visibleDecks.length === 0 && !search ? (
                <div className="fc-panel" style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>Hali to'plam yo'q</p>
                  <p style={{ margin: '4px 0 16px', color: 'var(--muted)', fontSize: 13 }}>Birinchi to'plamingizni yarating.</p>
                  <button className="fc-btn-primary" style={{ margin: '0 auto' }} onClick={() => navigate('/flashcards/new')}>
                    <Plus size={16} />To'plam yaratish
                  </button>
                </div>
              ) : (
                <div className="fc-deck-grid">
                  {visibleDecks.map(d => <DeckCard key={d.id} deck={d} onOpen={() => navigate(`/flashcards/${d.id}`)} />)}
                  {!search && (
                    <button className="fc-new-tile" onClick={() => navigate('/flashcards/new')}>
                      <span className="fc-new-tile-icon"><Plus size={20} strokeWidth={2.4} /></span>
                      <span>
                        <p className="fc-new-tile-title">Yangi to'plam</p>
                        <p className="fc-new-tile-sub">Qo'lda yoki AI bilan · matn, rasm, PDF</p>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="fc-chiprow">
                <button className={`fc-chip${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>Barchasi</button>
                {CATEGORY_ORDER.map(c => (
                  <button key={c} className={`fc-chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>
                ))}
                <span className="fc-sort">Mashhur<ChevronDown size={13} strokeWidth={2.4} /></span>
              </div>

              {publicLoading ? (
                <div className="fc-deck-grid">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="fc-skeleton-pulse" style={{ height: 190, borderRadius: 18, background: 'var(--surface2)' }} />
                  ))}
                </div>
              ) : visiblePublicDecks.length === 0 ? (
                <div className="fc-panel" style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>Hech narsa topilmadi.</p>
                </div>
              ) : (
                <div className="fc-deck-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {visiblePublicDecks.map(d => (
                    <PublicDeckCard
                      key={d.id}
                      deck={d}
                      onOpen={() => navigate(`/flashcards/public/${d.id}`)}
                      onClone={() => handleClone(d.id)}
                      cloning={cloningId === d.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="fc-rail">
          {tab === 'my' ? (
            <>
              <div className="fc-panel fc-today">
                <div className="fc-today-row">
                  <span className="fc-donut" style={{ background: `conic-gradient(var(--accent) 0 ${todayPct}%, var(--ringTrack) ${todayPct}% 100%)` }}>
                    <span className="fc-donut-inner">{todayPct}%</span>
                  </span>
                  <div>
                    <p className="fc-today-title">Bugun takrorlangan</p>
                    <p className="fc-today-sub">{stats ? `${stats.total_due + stats.today_reviewed} tadan ${stats.today_reviewed} tasi bajarildi` : '…'}</p>
                  </div>
                </div>
                <button
                  className="fc-btn-block solid"
                  disabled={totalDue === 0}
                  onClick={() => {
                    const target = decks.find(d => d.due_count > 0)
                    if (target) navigate(`/flashcards/${target.id}/study`)
                  }}
                >
                  Takrorlashni davom ettirish
                </button>
                <button
                  className="fc-btn-block outline"
                  disabled={decks.length === 0}
                  onClick={() => {
                    const target = decks[0]
                    if (target) navigate(`/flashcards/${target.id}/study?practice=1`)
                  }}
                >
                  Erkin mashq qilish
                </button>
              </div>

              <div className="fc-stat-grid">
                <div className="fc-stat-tile">
                  <p className="fc-stat-num">{stats?.total_cards ?? '—'}</p>
                  <p className="fc-stat-label">Jami karta</p>
                </div>
                <div className="fc-stat-tile">
                  <p className="fc-stat-num" style={{ color: 'var(--green)' }}>{stats?.total_mastered ?? '—'}</p>
                  <p className="fc-stat-label">O'zlashtirilgan</p>
                </div>
                <div className="fc-stat-tile">
                  <p className="fc-stat-num" style={{ color: 'var(--accent)' }}>{totalDue}</p>
                  <p className="fc-stat-label">Takrorlash</p>
                </div>
                <div className="fc-stat-tile">
                  <p className="fc-stat-num" style={{ color: 'var(--purple)' }}>{totalNewApprox}</p>
                  <p className="fc-stat-label">Yangi</p>
                </div>
              </div>

              <div className="fc-panel">
                <div className="fc-chart-head">
                  <p className="fc-panel-title">So'nggi 7 kun</p>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{stats?.today_reviewed ?? 0} karta</span>
                </div>
                <div className="fc-chart-bars">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const isToday = i === todayWeekdayIdx
                    const pct = isToday ? Math.max(8, Math.round(((stats?.today_reviewed ?? 0) / chartCap) * 100)) : 14
                    return (
                      <div key={label} className="fc-chart-col">
                        <div className={`fc-chart-bar${isToday ? ' active' : ''}`} style={{ height: `${pct}%` }} />
                        <span className="fc-chart-label">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button className="fc-ai-card" onClick={() => navigate('/flashcards/new')}>
                <span className="fc-ai-icon"><Sparkles size={18} /></span>
                <span>
                  <p className="fc-ai-title">AI bilan yaratish</p>
                  <p className="fc-ai-sub">{freeRemaining != null ? `Bugun ${freeRemaining} ta bepul amal qoldi` : 'Matn yoki rasmdan avtomatik yaratish'}</p>
                </span>
              </button>
            </>
          ) : (
            <>
              {topAuthors.length > 0 && (
                <div className="fc-panel">
                  <p className="fc-panel-title">Faol mualliflar</p>
                  <div className="fc-author-list">
                    {topAuthors.map((a, i) => {
                      const g1 = AUTHOR_COLORS[i % AUTHOR_COLORS.length]
                      return (
                        <div key={a.name + i} className="fc-author-row">
                          <span className="fc-author-avatar" style={{ background: withAlpha(g1, '33'), color: g1 }}>
                            {a.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className="fc-author-name">{a.name}</p>
                            <p className="fc-author-meta">{a.decks} to'plam · {a.clones} nusxa</p>
                          </div>
                          <button className="fc-author-follow">Ko'rish</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {seenCategories.length > 0 && (
                <div className="fc-panel">
                  <p className="fc-panel-title">Kategoriyalar</p>
                  <div className="fc-trend-chips">
                    {seenCategories.map(c => <span key={c} className="fc-trend-chip">{CATEGORY_LABELS[c]}</span>)}
                  </div>
                </div>
              )}

              <div className="fc-cta-panel">
                <p className="fc-cta-title">O'z to'plamingizni ulashing</p>
                <p className="fc-cta-body">Nashr qilingan to'plamlar reyting yig'adi va boshqalarga foyda beradi.</p>
                <button className="fc-btn-block solid" style={{ marginTop: 13 }} onClick={() => setTab('my')}>Nashr qilish</button>
              </div>
            </>
          )}
        </div>
      </div>
    </FlashcardsRoot>
  )
}

export default FlashcardsPage
