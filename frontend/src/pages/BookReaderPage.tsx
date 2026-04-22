/**
 * BookReaderPage — /read/:bookId
 *
 * Full-screen zen-mode in-app book reader.
 *
 * PDF  → react-pdf (page-by-page, outline ToC, theme CSS-filter)
 * EPUB → react-reader (CFI-based location, rendition themes, nav ToC)
 *
 * Features:
 *  - Theme: Light / Sepia / Dark
 *  - Mundarija (ToC) slide-in sidebar
 *  - Reading progress auto-saved to /api/books/:id/progress every 30 s
 *  - Floating Focus Timer widget (reuses useBackgroundTimer state shared with Workspace)
 *  - +1.66 XP/min while focus timer is active (via addFocusSeconds)
 *  - Access control: redirects to book page if paid and not purchased
 *  - "Back to Workspace" / back navigation
 */
import React, {
  useState, useEffect, useRef, useCallback,
} from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ReactReader, ReactReaderStyle } from 'react-reader'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Sun, Moon, SunDim, List, Play, Pause,
  ChevronLeft, ChevronRight, Timer, Flame, X,
  Minimize2, Maximize2, BookOpen, Lock, Settings2,
  ZoomIn, ZoomOut, Type,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { useProgressStore } from '../context/progressStore'
import { useBackgroundTimer } from '../hooks/useBackgroundTimer'
import apiService from '@services/apiService'

// ── pdfjs worker via CDN — zero Vite config needed ───────────────────────────
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookInfo {
  id: number
  title: string
  author: string
  is_paid: boolean
  file_url: string | null
  thumbnail_url: string | null
  category: string
}

interface TocEntry {
  id: string
  title: string
  href?: string   // EPUB href
  dest?: unknown  // PDF destination (string or array)
  items?: TocEntry[]
}

type Theme = 'light' | 'sepia' | 'dark'
type FontFamily = 'serif' | 'sans' | 'mono'

const FONT_FAMILIES: Record<FontFamily, { label: string; css: string }> = {
  serif: { label: 'Serif',  css: 'Georgia, "Times New Roman", serif' },
  sans:  { label: 'Sans',   css: 'system-ui, -apple-system, sans-serif' },
  mono:  { label: 'Mono',   css: '"Courier New", Courier, monospace' },
}

const FONT_SIZE_MIN = 14
const FONT_SIZE_MAX = 28

// ── Theme tokens ──────────────────────────────────────────────────────────────

const THEMES = {
  light: {
    outer:   'bg-[#f0f0f0]',
    toolbar: 'bg-white border-slate-200 text-slate-800',
    toc:     'bg-white border-slate-200 text-slate-800',
    text:    'text-slate-900',
    muted:   'text-slate-400',
    hover:   'hover:bg-black/5',
    input:   'bg-white border-slate-200 text-slate-800',
    navBtn:  'bg-slate-100 hover:bg-slate-200 text-slate-700',
    pdfFilter: 'none',
    epubBg:  '#ffffff',
    epubFg:  '#1a1a1a',
  },
  sepia: {
    outer:   'bg-[#ede0c8]',
    toolbar: 'bg-[#e6d5bb] border-[#c4a87a] text-[#4a3320]',
    toc:     'bg-[#e6d5bb] border-[#c4a87a] text-[#4a3320]',
    text:    'text-[#4a3320]',
    muted:   'text-[#8a7060]',
    hover:   'hover:bg-[#c4a87a]/20',
    input:   'bg-[#ede0c8] border-[#c4a87a] text-[#4a3320]',
    navBtn:  'bg-[#d4bc96] hover:bg-[#c4ac86] text-[#4a3320]',
    pdfFilter: 'sepia(0.5) brightness(1.05)',
    epubBg:  '#f4e8d0',
    epubFg:  '#4a3320',
  },
  dark: {
    outer:   'bg-[#0f0f18]',
    toolbar: 'bg-[#18182a] border-[#28283c] text-slate-100',
    toc:     'bg-[#18182a] border-[#28283c] text-slate-100',
    text:    'text-slate-100',
    muted:   'text-slate-400',
    hover:   'hover:bg-white/10',
    input:   'bg-[#28283c] border-[#38384c] text-slate-100',
    navBtn:  'bg-[#28283c] hover:bg-[#38384c] text-slate-200',
    pdfFilter: 'invert(0.88) hue-rotate(180deg)',
    epubBg:  '#1e1e2e',
    epubFg:  '#d8d8ea',
  },
} satisfies Record<Theme, Record<string, string>>

// ── helpers ───────────────────────────────────────────────────────────────────

function detectType(url: string): 'pdf' | 'epub' {
  const clean = url.toLowerCase().split('?')[0]
  if (clean.endsWith('.epub')) return 'epub'
  return 'pdf'
}

// ── FloatingFocusWidget ───────────────────────────────────────────────────────

const FloatingFocusWidget: React.FC<{ theme: Theme }> = ({ theme }) => {
  const timer = useBackgroundTimer()
  const { addFocusSeconds } = useProgressStore()
  const [readingXP, setReadingXP] = useState(0)
  const [minimized, setMinimized] = useState(false)

  const t = THEMES[theme]
  const activeAndFocus = timer.isRunning && !timer.isBreak

  // Grant XP every second while focused (≈ 1.66 XP/min via addFocusSeconds)
  useEffect(() => {
    if (!activeAndFocus) return
    const id = setInterval(() => addFocusSeconds(1), 1_000)
    return () => clearInterval(id)
  }, [activeAndFocus, addFocusSeconds])

  // Local display counter: +1 per minute
  useEffect(() => {
    if (!activeAndFocus) return
    const id = setInterval(() => setReadingXP(p => p + 1), 60_000)
    return () => clearInterval(id)
  }, [activeAndFocus])

  const wrapperCls =
    theme === 'dark'
      ? 'bg-[#18182a]/92 border-[#28283c]'
      : theme === 'sepia'
      ? 'bg-[#e6d5bb]/95 border-[#c4a87a]'
      : 'bg-white/95 border-slate-200'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed bottom-6 right-4 z-[100] rounded-2xl shadow-2xl border backdrop-blur-sm overflow-hidden ${wrapperCls}`}
      style={{ width: minimized ? 'auto' : 216 }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5">
          <Timer
            className={`w-3.5 h-3.5 flex-shrink-0 ${
              activeAndFocus ? 'text-[#F15929]' : t.muted
            }`}
          />
          {!minimized && (
            <span className={`text-[10px] font-bold uppercase tracking-widest ${t.muted}`}>
              Fokus
            </span>
          )}
        </div>
        <button
          onClick={() => setMinimized(m => !m)}
          className={`p-0.5 rounded transition-colors ${t.hover}`}
        >
          {minimized
            ? <Maximize2 className={`w-3.5 h-3.5 ${t.muted}`} />
            : <Minimize2 className={`w-3.5 h-3.5 ${t.muted}`} />}
        </button>
      </div>

      {!minimized && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[22px] font-mono font-extrabold tabular-nums leading-none ${
                activeAndFocus ? 'text-[#F15929]' : t.text
              }`}
            >
              {timer.formatted}
            </span>
            <button
              onClick={() =>
                activeAndFocus ? timer.pause() : timer.startFocus(25)
              }
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow transition-all active:scale-95 ${
                activeAndFocus
                  ? 'bg-[#F15929] hover:bg-orange-600 text-white'
                  : t.navBtn
              }`}
            >
              {activeAndFocus
                ? <Pause className="w-4 h-4" />
                : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          </div>

          <AnimatePresence>
            {readingXP > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#F15929]/12 text-[#F15929]"
              >
                <Flame className="w-3 h-3 flex-shrink-0" />
                O'qish orqali: +{readingXP} XP
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ── TocSidebar ────────────────────────────────────────────────────────────────

interface TocSidebarProps {
  open: boolean
  onClose: () => void
  toc: TocEntry[]
  onNavigate: (e: TocEntry) => void
  theme: Theme
}

const TocSidebar: React.FC<TocSidebarProps> = ({
  open, onClose, toc, onNavigate, theme,
}) => {
  const t = THEMES[theme]

  const renderItems = (items: TocEntry[], depth = 0): React.ReactNode =>
    items.map(item => (
      <React.Fragment key={item.id}>
        <button
          onClick={() => { onNavigate(item); onClose() }}
          className={`w-full text-left py-2 pr-4 text-sm transition-colors hover:bg-[#F15929]/10 ${t.text}`}
          style={{ paddingLeft: 16 + depth * 14 }}
        >
          <span className={depth > 0 ? 'text-xs' : 'font-semibold'}>
            {item.title}
          </span>
        </button>
        {item.items && renderItems(item.items, depth + 1)}
      </React.Fragment>
    ))

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="toc-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-[60] lg:hidden"
            onClick={onClose}
          />
          <motion.aside
            key="toc-panel"
            initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className={`fixed left-0 top-0 bottom-0 w-[280px] z-[70] flex flex-col border-r ${t.toc}`}
          >
            <div className={`flex items-center justify-between px-4 py-3.5 border-b ${t.toolbar}`}>
              <span className={`text-sm font-bold ${t.text}`}>📖 Mundarija</span>
              <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${t.hover}`}>
                <X className={`w-4 h-4 ${t.muted}`} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {toc.length === 0 ? (
                <p className={`text-xs text-center py-10 ${t.muted}`}>
                  Mundarija mavjud emas
                </p>
              ) : renderItems(toc)}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ── BookReaderPage ────────────────────────────────────────────────────────────

const BookReaderPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const { user: tgUser } = useTelegramWebApp()
  const telegramId = (tgUser?.id ?? authUser?.id) as number | null

  // ── Core loading state ────────────────────────────────────────────────────
  const [book, setBook] = useState<BookInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasAccess, setHasAccess] = useState(false)

  // ── Reader config state ───────────────────────────────────────────────────
  const [theme, setTheme] = useState<Theme>('light')
  const [tocOpen, setTocOpen] = useState(false)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif')
  const [lineHeight, setLineHeight] = useState(1.8)

  // PDF-specific
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pdfDocRef = useRef<any>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(640)

  // EPUB-specific
  const [epubLocation, setEpubLocation] = useState<string | number | null>(null)
  const [epubReady, setEpubReady] = useState(false)
  const [epubFailed, setEpubFailed] = useState(false)
  const renditionRef = useRef<any>(null)

  // Progress
  const lastSavedRef = useRef({ page: 1, cfi: '', percent: 0 })

  const t = THEMES[theme]
  const fileType = book?.file_url ? detectType(book.file_url) : 'pdf'
  const ThemeIcon = theme === 'light' ? Sun : theme === 'sepia' ? SunDim : Moon

  // ── Resize → PDF page width ───────────────────────────────────────────────
  useEffect(() => {
    const el = pageContainerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setPageWidth(Math.min(w - 40, 860))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Load book + access check ──────────────────────────────────────────────
  useEffect(() => {
    if (!bookId) return
    const run = async () => {
      // Step 1: fetch book metadata — a real failure (404/500) shows the error screen
      let bk: BookInfo
      try {
        const res = await apiService.getBook(Number(bookId))
        bk = res.data as BookInfo
        setBook(bk)
      } catch {
        setError('Kitob topilmadi')
        setLoading(false)
        return
      }

      // Step 2: access check — failures here mean "no access", not "book missing"
      if (!bk.is_paid) {
        setHasAccess(true)
      } else if (telegramId) {
        try {
          const pr = await apiService.checkPurchase(bk.id, telegramId)
          setHasAccess(pr.data?.purchased === true)
        } catch {
          // checkPurchase failed (auth/network) — treat as not purchased, show lock screen
          setHasAccess(false)
        }
      }
      // else: paid book, no telegramId — hasAccess stays false → lock screen

      setLoading(false)
    }
    run()
  }, [bookId, telegramId])

  // ── Load saved progress ───────────────────────────────────────────────────
  useEffect(() => {
    if (!bookId || !telegramId || !hasAccess) return
    apiService.getBookProgress(Number(bookId), telegramId).then(res => {
      const { page_number, cfi, percent } = res.data
      if (cfi) setEpubLocation(cfi)
      else if (page_number && page_number > 1) setCurrentPage(page_number)
      lastSavedRef.current = {
        page: page_number ?? 1,
        cfi: cfi ?? '',
        percent: percent ?? 0,
      }
    }).catch(() => {})
  }, [bookId, telegramId, hasAccess])

  // ── Save progress ─────────────────────────────────────────────────────────
  const saveProgress = useCallback(() => {
    if (!bookId || !telegramId) return
    const percent = numPages > 0
      ? Math.min(100, Math.round((currentPage / numPages) * 100))
      : 0
    const cfi = typeof epubLocation === 'string' ? epubLocation : ''
    const cur = { page: currentPage, cfi, percent }
    if (cur.page === lastSavedRef.current.page && cur.cfi === lastSavedRef.current.cfi)
      return
    lastSavedRef.current = cur
    apiService.saveBookProgress(Number(bookId), {
      telegram_id: telegramId,
      page_number: cur.page,
      cfi: cur.cfi || null,
      percent: cur.percent,
    }).catch(() => {})
  }, [bookId, telegramId, currentPage, epubLocation, numPages])

  // Auto-save every 30 s
  useEffect(() => {
    if (!hasAccess) return
    const id = setInterval(saveProgress, 30_000)
    return () => clearInterval(id)
  }, [saveProgress, hasAccess])

  // Save on unmount
  useEffect(() => () => { saveProgress() }, [saveProgress])

  // ── PDF load success → get numPages + outline (ToC) ───────────────────────
  const onPdfLoaded = useCallback(async (pdf: any) => {
    pdfDocRef.current = pdf
    setNumPages(pdf.numPages)
    try {
      const outline = await pdf.getOutline()
      if (outline?.length) {
        const conv = (items: any[]): TocEntry[] =>
          items.map((it, i) => ({
            id: `${it.title ?? i}`,
            title: it.title ?? `Sahifa`,
            dest: it.dest,
            items: it.items?.length ? conv(it.items) : undefined,
          }))
        setToc(conv(outline))
      }
    } catch { /* no ToC */ }
  }, [])

  // ── PDF ToC navigation ────────────────────────────────────────────────────
  const navPdfToc = useCallback(async (entry: TocEntry) => {
    if (!pdfDocRef.current || !entry.dest) return
    try {
      let arr = entry.dest as any
      if (typeof arr === 'string')
        arr = await pdfDocRef.current.getDestination(arr)
      if (Array.isArray(arr) && arr.length > 0) {
        const idx = await pdfDocRef.current.getPageIndex(arr[0])
        setCurrentPage(idx + 1)
      }
    } catch { /* ignore */ }
  }, [])

  // ── Apply EPUB rendition styles (theme + font settings) ──────────────────
  const applyEpubStyles = useCallback((th: Theme, fs: number, ff: FontFamily, lh: number) => {
    if (!renditionRef.current) return
    renditionRef.current.themes.register('reader', {
      body: {
        background: THEMES[th].epubBg,
        color: THEMES[th].epubFg,
        fontSize: `${fs}px`,
        lineHeight: String(lh),
        fontFamily: FONT_FAMILIES[ff].css,
        padding: '0 4px',
      },
      'p, div, span, li': {
        color: THEMES[th].epubFg + ' !important',
        fontFamily: FONT_FAMILIES[ff].css + ' !important',
      },
    })
    renditionRef.current.themes.select('reader')
  }, [])

  // ── EPUB rendition ready ──────────────────────────────────────────────────
  const getRendition = useCallback((rendition: any) => {
    renditionRef.current = rendition
    applyEpubStyles(theme, fontSize, fontFamily, lineHeight)

    // Mark ready on first section render
    rendition.on('rendered', () => setEpubReady(true))

    // Catch epub.js-level errors
    rendition.book.ready.catch(() => setEpubFailed(true))

    // Get navigation (ToC)
    rendition.book.loaded.navigation.then((nav: any) => {
      const conv = (items: any[]): TocEntry[] =>
        items.map(it => ({
          id: it.id ?? it.href,
          title: it.label?.trim() ?? it.href,
          href: it.href,
          items: it.subitems?.length ? conv(it.subitems) : undefined,
        }))
      setToc(conv(nav.toc ?? []))
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 20-second timeout: if EPUB never renders, mark as failed
  useEffect(() => {
    if (fileType !== 'epub' || !hasAccess) return
    const t = setTimeout(() => {
      if (!epubReady) setEpubFailed(true)
    }, 20_000)
    return () => clearTimeout(t)
  }, [fileType, hasAccess, epubReady])

  // Re-apply EPUB styles whenever theme or font settings change
  useEffect(() => {
    applyEpubStyles(theme, fontSize, fontFamily, lineHeight)
  }, [theme, fontSize, fontFamily, lineHeight, applyEpubStyles])

  // ── ToC navigation dispatcher ─────────────────────────────────────────────
  const handleTocNav = useCallback((entry: TocEntry) => {
    if (fileType === 'pdf') navPdfToc(entry)
    else if (renditionRef.current && entry.href) renditionRef.current.display(entry.href)
  }, [fileType, navPdfToc])

  // ── Theme cycle ───────────────────────────────────────────────────────────
  const cycleTheme = () =>
    setTheme(prev => prev === 'light' ? 'sepia' : prev === 'sepia' ? 'dark' : 'light')

  const themeLabel = theme === 'light' ? 'Kunduzgi' : theme === 'sepia' ? 'Sepia' : 'Tungi'

  // ─────────────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0f0f18] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-[#F15929]/25 border-t-[#F15929] rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Kitob yuklanmoqda…</span>
        </div>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0f0f18] flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-slate-600 dark:text-slate-400">{error || 'Kitob topilmadi'}</p>
          <button onClick={() => navigate(-1)} className="text-[#F15929] text-sm font-semibold hover:underline">
            ← Orqaga
          </button>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0f0f18] flex items-center justify-center px-6">
        <div className="max-w-xs w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-[#F15929]/10 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-7 h-7 text-[#F15929]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">{book.title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Bu kitob to'lov talab qiladi</p>
          </div>
          <button
            onClick={() => navigate(`/kitoblar/${book.id}`)}
            className="w-full py-3 rounded-2xl bg-[#F15929] text-white font-bold hover:bg-orange-600 transition-all active:scale-95 shadow-md"
          >
            Sotib olish
          </button>
          <button onClick={() => navigate(-1)} className="text-sm text-slate-400 hover:text-[#F15929] transition-colors">
            ← Orqaga
          </button>
        </div>
      </div>
    )
  }

  if (!book.file_url) {
    return (
      <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0f0f18] flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-slate-600 dark:text-slate-400">Fayl hali qo'shilmagan</p>
          <button onClick={() => navigate(-1)} className="text-[#F15929] text-sm font-semibold hover:underline">← Orqaga</button>
        </div>
      </div>
    )
  }

  const pdfPercent = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0

  // ── Main reader UI ────────────────────────────────────────────────────────
  return (
    <div className={`fixed inset-0 z-[200] flex flex-col select-none ${t.outer}`}>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <header className={`flex-shrink-0 flex items-center gap-2 px-3 h-14 border-b ${t.toolbar}`}>
        {/* Back */}
        <button
          onClick={() => { saveProgress(); navigate(-1) }}
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${t.hover}`}
          title="Orqaga"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* ToC toggle */}
        <button
          onClick={() => setTocOpen(o => !o)}
          title="Mundarija"
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${t.hover} ${
            tocOpen ? 'bg-[#F15929]/15 text-[#F15929]' : ''
          }`}
        >
          <List className="w-5 h-5" />
        </button>

        {/* Title + author */}
        <div className="flex-1 min-w-0 px-1">
          <p className={`text-[13px] font-bold truncate ${t.text}`}>{book.title}</p>
          <p className={`text-[11px] truncate ${t.muted}`}>{book.author}</p>
        </div>

        {/* Page count (PDF) */}
        {fileType === 'pdf' && numPages > 0 && (
          <span className={`text-xs font-mono tabular-nums flex-shrink-0 ${t.muted}`}>
            {currentPage}/{numPages}
          </span>
        )}

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          title={`Mavzu: ${themeLabel}`}
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${t.hover}`}
        >
          <ThemeIcon className="w-5 h-5" />
        </button>

        {/* Settings toggle */}
        <button
          onClick={() => setSettingsOpen(o => !o)}
          title="O'qish sozlamalari"
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${t.hover} ${
            settingsOpen ? 'bg-[#F15929]/15 text-[#F15929]' : ''
          }`}
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {/* ── Settings panel ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            key="settings-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex-shrink-0 overflow-hidden border-b ${t.toolbar}`}
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">

              {/* Font family (EPUB only — PDF is pre-rendered) */}
              {fileType === 'epub' && (
                <div className="flex items-center gap-2">
                  <Type className={`w-4 h-4 flex-shrink-0 ${t.muted}`} />
                  <div className="flex rounded-lg overflow-hidden border border-current/10">
                    {(Object.keys(FONT_FAMILIES) as FontFamily[]).map(ff => (
                      <button
                        key={ff}
                        onClick={() => setFontFamily(ff)}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                          fontFamily === ff
                            ? 'bg-[#F15929] text-white'
                            : `${t.navBtn}`
                        }`}
                        style={{ fontFamily: FONT_FAMILIES[ff].css }}
                      >
                        {FONT_FAMILIES[ff].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Font size / zoom */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (fileType === 'epub') setFontSize(s => Math.max(FONT_SIZE_MIN, s - 2))
                    else setPageWidth(w => Math.max(320, w - 60))
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${t.navBtn}`}
                  title="Kichikroq"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className={`text-xs tabular-nums font-mono w-10 text-center ${t.text}`}>
                  {fileType === 'epub' ? `${fontSize}px` : `${Math.round((pageWidth / 640) * 100)}%`}
                </span>
                <button
                  onClick={() => {
                    if (fileType === 'epub') setFontSize(s => Math.min(FONT_SIZE_MAX, s + 2))
                    else setPageWidth(w => Math.min(1200, w + 60))
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${t.navBtn}`}
                  title="Kattaroq"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Line height (EPUB only) */}
              {fileType === 'epub' && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${t.muted}`}>Satr balandligi</span>
                  <input
                    type="range"
                    min={1.2}
                    max={2.4}
                    step={0.1}
                    value={lineHeight}
                    onChange={e => setLineHeight(Number(e.target.value))}
                    className="w-24 accent-[#F15929]"
                  />
                  <span className={`text-xs tabular-nums font-mono ${t.muted}`}>{lineHeight.toFixed(1)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PDF progress bar ─────────────────────────────────────────────────── */}
      {fileType === 'pdf' && numPages > 0 && (
        <div className="h-[3px] flex-shrink-0 bg-black/5 dark:bg-white/5">
          <div
            className="h-full bg-[#F15929] transition-[width] duration-500"
            style={{ width: `${pdfPercent}%` }}
          />
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* Mundarija sidebar */}
        <TocSidebar
          open={tocOpen}
          onClose={() => setTocOpen(false)}
          toc={toc}
          onNavigate={handleTocNav}
          theme={theme}
        />

        {/* ── PDF viewer ──────────────────────────────────────────────────── */}
        {fileType === 'pdf' && (
          <div className="h-full flex flex-col">

            {/* Scrollable PDF page */}
            <div
              ref={pageContainerRef}
              className="flex-1 overflow-y-auto flex justify-center py-6 px-4"
              onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
                  setCurrentPage(p => Math.min(numPages, p + 1))
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
                  setCurrentPage(p => Math.max(1, p - 1))
              }}
              tabIndex={0}
            >
              <div style={{ filter: t.pdfFilter, transition: 'filter 0.3s ease' }}>
                <Document
                  file={book.file_url}
                  onLoadSuccess={onPdfLoaded}
                  loading={
                    <div className="flex items-center justify-center" style={{ width: pageWidth, height: Math.round(pageWidth * 1.41) }}>
                      <div className="w-8 h-8 border-2 border-[#F15929]/25 border-t-[#F15929] rounded-full animate-spin" />
                    </div>
                  }
                  error={
                    <div className={`flex flex-col items-center gap-3 py-16 max-w-sm text-center ${t.muted}`}>
                      <BookOpen className="w-10 h-10 opacity-40" />
                      <p className="text-sm font-semibold">PDF yuklanmadi</p>
                      <p className="text-xs opacity-70">
                        CORS yoki URL muammo bo'lishi mumkin.
                        Brauzeringizda to'g'ridan-to'g'ri oching.
                      </p>
                      <a
                        href={book.file_url ?? ''}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#F15929] text-xs font-semibold hover:underline"
                      >
                        Yangi tabda ochish →
                      </a>
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    width={pageWidth}
                    renderTextLayer
                    renderAnnotationLayer={false}
                  />
                </Document>
              </div>
            </div>

            {/* PDF navigation bar */}
            <div className={`flex-shrink-0 flex items-center justify-center gap-3 py-3 border-t ${t.toolbar}`}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-25 ${t.navBtn}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={numPages || 1}
                  value={currentPage}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (v >= 1 && v <= numPages) setCurrentPage(v)
                  }}
                  className={`w-14 text-center text-sm font-bold rounded-lg border py-1.5 outline-none focus:ring-2 focus:ring-[#F15929]/40 ${t.input}`}
                />
                <span className={`text-xs ${t.muted}`}>/ {numPages}</span>
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-25 ${t.navBtn}`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ── EPUB viewer ─────────────────────────────────────────────────── */}
        {fileType === 'epub' && !epubFailed && (
          <div className="absolute inset-0">
            <ReactReader
              url={apiService.bookFileUrl(book.id)}
              location={epubLocation}
              locationChanged={setEpubLocation as (loc: string) => void}
              getRendition={getRendition}
              showToc={false}
              epubInitOptions={{ openAs: 'epub' }}
              readerStyles={{
                ...ReactReaderStyle,
                container: {
                  ...ReactReaderStyle.container,
                  background: t.epubBg,
                },
                readerArea: {
                  ...ReactReaderStyle.readerArea,
                  background: t.epubBg,
                },
                arrow: {
                  ...ReactReaderStyle.arrow,
                  color: '#F15929',
                },
                arrowHover: {
                  ...ReactReaderStyle.arrowHover,
                  color: '#c0440a',
                },
              }}
            />
          </div>
        )}

        {/* ── EPUB load failure fallback ───────────────────────────────────── */}
        {fileType === 'epub' && epubFailed && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center ${t.outer}`}>
            <BookOpen className={`w-12 h-12 opacity-30 ${t.muted}`} />
            <p className={`text-sm font-semibold ${t.text}`}>EPUB yuklanmadi</p>
            <p className={`text-xs max-w-xs ${t.muted}`}>
              Fayl brauzerda to'g'ridan-to'g'ri ochilishi mumkin.
            </p>
            <a
              href={book.file_url ?? ''}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-xl bg-[#F15929] text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Yangi tabda ochish →
            </a>
          </div>
        )}
      </div>

      {/* ── Floating Focus Timer ─────────────────────────────────────────────── */}
      <FloatingFocusWidget theme={theme} />
    </div>
  )
}

export default BookReaderPage
