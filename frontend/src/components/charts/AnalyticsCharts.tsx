/**
 * YT-Studio style analytics charts — pure SVG, zero deps.
 *
 * Components:
 *   • DonutChart     — simple donut/pie for traffic sources
 *   • DualAxisChart  — posts (bars, left axis) vs visits (line, right axis)
 *   • HBarChart      — horizontal bar chart for demographics
 *   • Tooltip        — hover/tap tooltip explaining each stat
 *   • InsightCard    — glassmorphism card wrapper with tooltip trigger
 *
 * Style: Oxygen font, Sahifalab Orange (#F15929) primary, minimalist.
 */
import React, { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info } from 'lucide-react'

// ─── Color palette ──────────────────────────────────────────────────────────

export const CHART_COLORS = {
  orange:  '#F15929',
  blue:    '#3b82f6',
  emerald: '#10b981',
  violet:  '#8b5cf6',
  amber:   '#f59e0b',
  slate:   '#94a3b8',
}

type ChartColor = keyof typeof CHART_COLORS

// ─── Tooltip ────────────────────────────────────────────────────────────────

export const Tooltip: React.FC<{
  text: string
  children?: React.ReactNode
  className?: string
}> = ({ text, children, className = '' }) => {
  const [open, setOpen] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback(() => {
    clearTimeout(timeout.current)
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    timeout.current = setTimeout(() => setOpen(false), 200)
  }, [])

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={show}
      onTouchEnd={hide}
    >
      {children ?? <Info className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-help" />}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-3 py-2 rounded-xl text-[11px] leading-snug font-medium text-white bg-gray-900/95 dark:bg-gray-100/95 dark:text-gray-900 shadow-lg pointer-events-none"
          >
            {text}
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900/95 dark:border-t-gray-100/95" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

// ─── Insight Card ───────────────────────────────────────────────────────────

export const InsightCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  tooltip?: string
  accent?: string
  children?: React.ReactNode
}> = ({ icon, label, value, sub, tooltip, accent = 'text-sahifa-500', children }) => (
  <div className="rounded-2xl p-4 bg-white/70 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.06] shadow-[0_2px_16px_rgba(0,0,0,0.04)] dark:shadow-none" style={{ fontFamily: "'Oxygen', sans-serif" }}>
    <div className="flex items-center gap-2 mb-2">
      <span className={accent}>{icon}</span>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-1">{label}</p>
      {tooltip && <Tooltip text={tooltip} />}
    </div>
    <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-0.5">{value}</p>
    {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
    {children}
  </div>
)

// ─── Donut / Pie Chart ──────────────────────────────────────────────────────

export interface DonutSlice {
  label: string
  value: number
  color: string
}

export const DonutChart: React.FC<{
  slices: DonutSlice[]
  size?: number
  thickness?: number
  className?: string
}> = ({ slices, size = 120, thickness = 24, className = '' }) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <p className="text-[10px] text-gray-400">Ma'lumot yo'q</p>
      </div>
    )
  }

  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.filter(s => s.value > 0).map((sl, i) => {
          const frac = sl.value / total
          const dashLen = frac * circ
          const dashOffset = -offset * circ
          offset += frac
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={sl.color}
              strokeWidth={thickness}
              strokeDasharray={`${dashLen} ${circ - dashLen}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )
        })}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{total}</p>
        <p className="text-[9px] text-gray-400">jami</p>
      </div>
    </div>
  )
}

export const DonutLegend: React.FC<{ slices: DonutSlice[] }> = ({ slices }) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  return (
    <div className="flex flex-col gap-1.5">
      {slices.map((sl, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sl.color }} />
          <span className="text-[11px] text-gray-600 dark:text-gray-400 flex-1">{sl.label}</span>
          <span className="text-[11px] font-semibold text-gray-900 dark:text-white">{sl.value}</span>
          <span className="text-[10px] text-gray-400 w-8 text-right">{total > 0 ? `${Math.round(sl.value / total * 100)}%` : '0%'}</span>
        </div>
      ))}
    </div>
  )
}


// ─── Dual-Axis Chart (bars + line) ──────────────────────────────────────────

export interface DualAxisData {
  label: string
  barValue: number   // e.g. posts_count
  lineValue: number  // e.g. profile_visits
}

export const DualAxisChart: React.FC<{
  data: DualAxisData[]
  barColor?: string
  lineColor?: string
  barLabel?: string
  lineLabel?: string
  height?: number
}> = ({
  data,
  barColor = CHART_COLORS.orange,
  lineColor = CHART_COLORS.blue,
  barLabel = 'Postlar',
  lineLabel = 'Profil tashriflari',
  height = 120,
}) => {
  if (!data.length) return null

  const W = 300
  const padL = 28
  const padR = 28
  const padT = 8
  const padB = 18
  const plotW = W - padL - padR
  const plotH = height - padT - padB

  const maxBar  = Math.max(...data.map(d => d.barValue), 1)
  const maxLine = Math.max(...data.map(d => d.lineValue), 1)

  const barW = Math.max(4, (plotW - data.length * 2) / data.length)

  const linePoints = data.map((d, i) => {
    const x = padL + i * (plotW / (data.length - 1 || 1))
    const y = padT + (1 - d.lineValue / maxLine) * plotH
    return `${x},${y}`
  })
  const [lastX, lastY] = linePoints[linePoints.length - 1].split(',').map(Number)

  return (
    <div style={{ fontFamily: "'Oxygen', sans-serif" }}>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: barColor }} />
          {barLabel}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="w-5 h-0.5 rounded-full" style={{ background: lineColor }} />
          {lineLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {/* Y-axis left labels */}
        <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="7" className="fill-gray-400">{maxBar}</text>
        <text x={padL - 4} y={padT + plotH} textAnchor="end" fontSize="7" className="fill-gray-400">0</text>

        {/* Y-axis right labels */}
        <text x={W - padR + 4} y={padT + 4} textAnchor="start" fontSize="7" style={{ fill: lineColor }}>{maxLine}</text>
        <text x={W - padR + 4} y={padT + plotH} textAnchor="start" fontSize="7" style={{ fill: lineColor }}>0</text>

        {/* Bars */}
        {data.map((d, i) => {
          const bh = Math.max(2, (d.barValue / maxBar) * plotH)
          const x = padL + i * ((plotW) / data.length) + 1
          return (
            <g key={i}>
              <rect
                x={x}
                y={padT + plotH - bh}
                width={barW}
                height={bh}
                rx={2}
                fill={barColor}
                fillOpacity={0.7}
              />
              {/* X label — every 5th */}
              {d.label && (
                <text x={x + barW / 2} y={height - 2} textAnchor="middle" fontSize="6" className="fill-gray-400">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Line with gradient fill */}
        <defs>
          <linearGradient id="dual-lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {linePoints.length > 1 && (
          <>
            <polygon
              points={`${linePoints[0]} ${linePoints.join(' ')} ${lastX},${padT + plotH} ${padL},${padT + plotH}`}
              fill="url(#dual-lg)"
            />
            <polyline
              points={linePoints.join(' ')}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
          </>
        )}
      </svg>
    </div>
  )
}


// ─── Horizontal Bar Chart ───────────────────────────────────────────────────

export interface HBarItem {
  label: string
  value: number
  color?: string
}

export const HBarChart: React.FC<{
  items: HBarItem[]
  primaryColor?: string
  height?: number
}> = ({ items, primaryColor = CHART_COLORS.orange, height: barHeight = 28 }) => {
  const max = Math.max(...items.map(i => i.value), 1)

  return (
    <div className="space-y-2" style={{ fontFamily: "'Oxygen', sans-serif" }}>
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
            <span className="text-[11px] font-bold text-gray-900 dark:text-white">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: item.color || primaryColor }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
