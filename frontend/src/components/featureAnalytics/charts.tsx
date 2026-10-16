/**
 * Chart primitives for the admin "Xususiyatlar" tab — plain SVG/HTML, no
 * chart library (same approach as components/charts/AnalyticsCharts.tsx).
 *
 * Colors are CSS custom properties set on `.fa-root` (FA_STYLE below), with
 * their own dark-mode steps under `.dark .fa-root` — the admin panel uses
 * Tailwind's class-based dark mode. Magnitude is one hue (blue); polarity
 * (flashcard ratings) is red↔blue with labels, never color alone.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export const FA_STYLE = `
.fa-root {
  --fa-s1: #2a78d6;
  --fa-s1-soft: rgba(42, 120, 214, 0.12);
  --fa-seq-1: #cde2fb; --fa-seq-2: #86b6ef; --fa-seq-3: #3987e5; --fa-seq-4: #1c5cab; --fa-seq-5: #0d366b;
  --fa-neg-strong: #e34948; --fa-neg-soft: #f2a3a2; --fa-pos-soft: #86b6ef; --fa-pos-strong: #256abf;
  --fa-good: #0ca30c; --fa-critical: #d03b3b;
  --fa-grid: #e8e7e3; --fa-track: #f0efec; --fa-surface: #ffffff;
}
.dark .fa-root {
  --fa-s1: #3987e5;
  --fa-s1-soft: rgba(57, 135, 229, 0.18);
  --fa-seq-1: #184f95; --fa-seq-2: #256abf; --fa-seq-3: #3987e5; --fa-seq-4: #6da7ec; --fa-seq-5: #b7d3f6;
  --fa-neg-strong: #e66767; --fa-neg-soft: #9c3d3d; --fa-pos-soft: #1c5cab; --fa-pos-strong: #6da7ec;
  --fa-good: #0ca30c; --fa-critical: #e66767;
  --fa-grid: #34332f; --fa-track: #2a2a27; --fa-surface: #1f2937;
}
`

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : n.toLocaleString('uz-UZ', { maximumFractionDigits: digits })

export const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// ─── Info tooltip ─────────────────────────────────────────────────────────────
// Rendered in a portal with fixed positioning: an absolutely positioned
// bubble gets clipped by the tile's `truncate` label and painted under the
// neighbouring card. Hover on desktop, tap on touch; clamped to the viewport.

const TIP_WIDTH = 240
// Inline, not text-white/bg-gray-900: globals.css rewrites bare `text-white`
// to dark text in light mode, which made every tooltip unreadable.
const TIP_COLORS: React.CSSProperties = { background: '#111827', color: '#f9fafb' }

export const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)

  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const margin = 8
    const left = Math.min(Math.max(r.left + r.width / 2 - TIP_WIDTH / 2, margin), window.innerWidth - TIP_WIDTH - margin)
    const below = r.top < 140  // not enough room above — flip under the icon
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8, below })
  }
  const close = () => setPos(null)

  useEffect(() => {
    if (!pos) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])

  return (
    <>
      <button ref={ref} type="button" aria-label={text}
        className="inline-flex shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-help"
        onPointerEnter={e => { if (e.pointerType === 'mouse') open() }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') close() }}
        onClick={e => { e.stopPropagation(); open() }}
        onFocus={open} onBlur={close}>
        <Info className="h-3.5 w-3.5" />
      </button>
      {pos && createPortal(
        <div role="tooltip"
          className="pointer-events-none rounded-xl px-3 py-2 text-[11px] leading-snug font-medium shadow-lg"
          style={{ ...TIP_COLORS, position: 'fixed', left: pos.left, top: pos.top, width: TIP_WIDTH, zIndex: 1000,
                   transform: pos.below ? undefined : 'translateY(-100%)' }}>
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export const Card: React.FC<{
  title: string
  subtitle?: string
  hint?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}> = ({ title, subtitle, hint, action, className = '', children }) => (
  <section className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6 min-w-0 ${className}`}>
    <header className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          {title}
          {hint && <InfoTip text={hint} />}
        </h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </header>
    {children}
  </section>
)

// ─── Stat tile ────────────────────────────────────────────────────────────────

export const Delta: React.FC<{ value: number | null | undefined; invert?: boolean }> = ({ value, invert }) => {
  if (value == null) return <span className="text-xs text-gray-400">yangi davr</span>
  const up = value > 0
  const good = invert ? !up : up
  if (value === 0) return <span className="text-xs text-gray-500 dark:text-gray-400">— 0%</span>
  return (
    <span className="text-xs font-semibold inline-flex items-center gap-0.5"
      style={{ color: good ? 'var(--fa-good)' : 'var(--fa-critical)' }}>
      {up ? '▲' : '▼'} {Math.abs(value).toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}%
    </span>
  )
}

export const StatTile: React.FC<{
  label: string
  value: React.ReactNode
  delta?: number | null
  showDelta?: boolean
  sub?: string
  hint?: string
}> = ({ label, value, delta, showDelta, sub, hint }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 min-w-0">
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1 min-w-0">
      <span className="truncate">{label}</span>
      {hint && <InfoTip text={hint} />}
    </p>
    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1.5 leading-none tabular-nums">{value}</p>
    <div className="mt-1.5 flex items-center gap-2 min-h-[16px]">
      {showDelta && <Delta value={delta} />}
      {sub && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</span>}
    </div>
  </div>
)

// ─── Horizontal bar list (magnitude per category, one hue) ────────────────────

export interface BarItem {
  key: string
  label: string
  value: number
  emoji?: string
  valueLabel?: string
  sub?: string
}

export const BarList: React.FC<{ items: BarItem[]; empty?: string; max?: number }> = ({ items, empty = "Ma'lumot yo'q", max }) => {
  const top = max ?? Math.max(1, ...items.map(i => i.value))
  if (!items.length || items.every(i => !i.value)) return <Empty text={empty} />
  return (
    <ul className="space-y-4">
      {items.map(item => (
        <li key={item.key} className="group" title={`${item.label}: ${item.valueLabel ?? fmt(item.value)}${item.sub ? ` · ${item.sub}` : ''}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
            <span className="text-gray-700 dark:text-gray-200 truncate">
              {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
              {item.label}
            </span>
            <span className="text-gray-900 dark:text-white font-semibold tabular-nums whitespace-nowrap">
              {item.valueLabel ?? fmt(item.value)}
              {item.sub && <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{item.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--fa-track)' }}>
            <div className="h-full rounded-full transition-[width] duration-500 group-hover:opacity-80"
              style={{ width: `${Math.max(item.value ? 1.5 : 0, (item.value / top) * 100)}%`, background: 'var(--fa-s1)' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── Trend line (one series, crosshair + tooltip) ─────────────────────────────

export const TrendChart: React.FC<{
  data: { date: string; value: number }[]
  label: string
  height?: number
  compact?: boolean
}> = ({ data, label, height = 160, compact = false }) => {
  const [hover, setHover] = useState<number | null>(null)
  // Draw in real pixels (not a scaled viewBox) so axis text stays 10px at any width.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(120, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = height
  const pad = compact ? { t: 4, r: 2, b: 4, l: 2 } : { t: 12, r: 12, b: 22, l: 34 }
  const max = Math.max(1, ...data.map(d => d.value))
  const niceMax = compact ? max : niceCeil(max)
  const x = (i: number) => pad.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const ticks = compact ? [] : [0, niceMax / 2, niceMax]
  const labelEvery = Math.max(1, Math.ceil(data.length / 6))

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }

  if (!data.length) return <Empty />
  const h = hover != null ? data[hover] : null
  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      {/* CSS width 100% (not the W attribute) so the svg never props the
          container open — otherwise the observer measures its own output. */}
      <svg height={H} viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={label}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--fa-grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} className="fill-gray-400">{fmt(t)}</text>
          </g>
        ))}
        {!compact && data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) && (
          <text key={d.date} x={x(i)} y={H - 6} fontSize={10} className="fill-gray-400"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{shortDate(d.date)}</text>
        ))}
        <path d={area} fill="var(--fa-s1-soft)" />
        <path d={line} fill="none" stroke="var(--fa-s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--fa-grid)" strokeWidth={1}
              vectorEffect="non-scaling-stroke" />
            {!compact && <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill="var(--fa-s1)" stroke="var(--fa-surface)" strokeWidth={2} />}
          </g>
        )}
        <rect x={0} y={0} width={W} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h && hover != null && (
        <div className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2 py-1 text-[11px] shadow-lg whitespace-nowrap" 
          style={{ ...TIP_COLORS, left: `${(x(hover) / W) * 100}%` }}>
          <span className="text-gray-300">{shortDate(h.date)}</span> · <b>{fmt(h.value)}</b> {compact ? '' : label}
        </div>
      )}
    </div>
  )
}

function niceCeil(v: number) {
  if (v <= 5) return Math.max(1, Math.ceil(v))
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
}

// ─── Columns (ordered buckets: score 0–5, hour 0–23) ─────────────────────────

export const Columns: React.FC<{
  items: { label: string; value: number; tooltip?: string }[]
  height?: number
  unit?: string
  showEveryLabel?: number
}> = ({ items, height = 120, unit = '', showEveryLabel = 1 }) => {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...items.map(i => i.value))
  if (!items.length || items.every(i => !i.value)) return <Empty />
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {items.map((it, i) => (
          <div key={i} className="relative flex-1 h-full flex items-end"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[4px] transition-opacity"
              style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value ? 2 : 0, background: 'var(--fa-s1)', opacity: hover == null || hover === i ? 1 : 0.55 }} />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg px-2 py-1 text-[11px] shadow-lg whitespace-nowrap" style={TIP_COLORS}>
                {it.tooltip ?? `${it.label}: ${fmt(it.value)} ${unit}`}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="h-px" style={{ background: 'var(--fa-grid)' }} />
      <div className="flex gap-[2px] mt-1">
        {items.map((it, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-gray-400 tabular-nums">
            {i % showEveryLabel === 0 ? it.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 100% stacked bar with legend ─────────────────────────────────────────────

export const StackedBar: React.FC<{
  segments: { key: string; label: string; value: number; color: string }[]
}> = ({ segments }) => {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (!total) return <Empty />
  return (
    <div>
      <div className="flex h-4 rounded-md overflow-hidden gap-[2px]">
        {segments.filter(s => s.value > 0).map(s => (
          <div key={s.key} title={`${s.label}: ${fmt(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="hover:opacity-80" />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <li key={s.key} className="flex items-center gap-2 text-xs min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 dark:text-gray-300 truncate">{s.label}</span>
            <span className="ml-auto text-gray-900 dark:text-white font-semibold tabular-nums">{((s.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Weekday × hour heatmap (sequential blue) ────────────────────────────────

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const SEQ = ['var(--fa-track)', 'var(--fa-seq-1)', 'var(--fa-seq-2)', 'var(--fa-seq-3)', 'var(--fa-seq-4)', 'var(--fa-seq-5)']

export const Heatmap: React.FC<{ grid: number[][]; unit?: string }> = ({ grid, unit = 'harakat' }) => {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const max = useMemo(() => Math.max(0, ...grid.flat()), [grid])
  if (!max) return <Empty />
  const step = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999)))
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-[2px] mb-[2px]">
            <span className="w-6 shrink-0 text-[10px] text-gray-400">{WEEKDAYS[d]}</span>
            {row.map((v, h) => (
              <div key={h} className="relative flex-1 h-5 rounded-[3px] cursor-default"
                style={{ background: SEQ[step(v)] }}
                onMouseEnter={() => setHover({ d, h })} onMouseLeave={() => setHover(null)}>
                {hover && hover.d === d && hover.h === h && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg px-2 py-1 text-[11px] shadow-lg whitespace-nowrap" style={TIP_COLORS}>
                    {WEEKDAYS[d]}, {String(h).padStart(2, '0')}:00 · <b>{fmt(v)}</b> {unit}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-[2px] mt-1">
          <span className="w-6 shrink-0" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1 text-center text-[10px] text-gray-400">{h % 3 === 0 ? h : ''}</span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-gray-400">
          <span>kam</span>
          {SEQ.map((c, i) => <span key={i} className="w-4 h-3 rounded-[2px]" style={{ background: c }} />)}
          <span>ko'p</span>
        </div>
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

export const Empty: React.FC<{ text?: string }> = ({ text = "Bu davrda ma'lumot yo'q" }) => (
  <p className="text-xs text-gray-400 dark:text-gray-500 py-6 text-center">{text}</p>
)

export const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
    {children}
  </span>
)

export const Table: React.FC<{
  head: React.ReactNode[]
  rows: React.ReactNode[][]
  align?: ('left' | 'right')[]
  empty?: string
}> = ({ head, rows, align = [], empty }) => {
  if (!rows.length) return <Empty text={empty} />
  return (
    <div className="overflow-x-auto -mx-5 sm:-mx-6">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            {head.map((h, i) => (
              <th key={i} className={`px-5 sm:px-6 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap ${align[i] === 'right' ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
              {r.map((c, ci) => (
                <td key={ci} className={`px-5 sm:px-6 py-3 text-gray-700 dark:text-gray-200 ${align[ci] === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
