/**
 * PlannerCalendar — calendar-based task planner for the Reja tab.
 *
 * Mobile-first: week view scrolls horizontally; unscheduled sidebar
 * collapses into a toggleable panel on small screens.
 * Full light/dark mode support.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ChevronLeft, ChevronRight, Calendar, List,
  Trash2, X, Check, AlertTriangle, Clock, Play,
  GripVertical, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { API_BASE as API } from '../../lib/apiUrl'

// ── Auth helper ───────────────────────────────────────────────────────────────

const _authHeaders = (): HeadersInit => {
  const t = localStorage.getItem('auth_token') || localStorage.getItem('tma_auth_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannerTask {
  id: number
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  sort_order: number
  linked_course_id: number | null
  linked_lesson_id: number | null
  scheduled_at: string | null
  duration_minutes: number
  created_at: string
  updated_at: string
}

interface Props {
  onPlayTask?: (task: PlannerTask) => void
}

// ── Uzbek locale constants ────────────────────────────────────────────────────

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
]
const UZ_DAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

// ── Date utilities ────────────────────────────────────────────────────────────

const toISO = (d: Date) => d.toISOString().split('T')[0]

const startOfWeek = (d: Date): Date => {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

const addDays = (d: Date, n: number): Date => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const weekDays = (start: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i))

const monthGrid = (year: number, month: number): (Date | null)[] => {
  const first = new Date(year, month, 1)
  const firstDow = first.getDay() === 0 ? 6 : first.getDay() - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const isOverdue = (task: PlannerTask): boolean => {
  if (!task.scheduled_at || task.status === 'done') return false
  return new Date(task.scheduled_at) < new Date()
}

const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Priority colours — light/dark aware ──────────────────────────────────────

const PRIORITY_COLORS = {
  low:    'border-l-blue-400 bg-blue-50 dark:bg-blue-400/5',
  medium: 'border-l-amber-400 bg-amber-50 dark:bg-amber-400/5',
  high:   'border-l-rose-400 bg-rose-50 dark:bg-rose-400/5',
}
const PRIORITY_DOT = {
  low:    'bg-blue-400',
  medium: 'bg-amber-400',
  high:   'bg-rose-400',
}

// ── Shared class tokens ───────────────────────────────────────────────────────

const CARD  = 'bg-white dark:bg-[#1c1d27] border border-gray-200 dark:border-white/[0.06]'
const PANEL = 'bg-gray-50 dark:bg-[#16171f] border border-gray-200 dark:border-white/[0.06]'
const BTN   = 'bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white transition-colors'

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ..._authHeaders(), ...(opts.headers ?? {}) },
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-components
// ══════════════════════════════════════════════════════════════════════════════

// ── Draggable task chip ───────────────────────────────────────────────────────

const TaskChip: React.FC<{
  task: PlannerTask
  compact?: boolean
  onClick: () => void
  onPlay?: () => void
}> = ({ task, compact, onClick, onPlay }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const overdue = isOverdue(task)

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={[
        'group flex items-start gap-1.5 rounded-lg border-l-2 px-2 py-1.5 cursor-grab active:cursor-grabbing',
        'transition-all duration-150',
        CARD,
        PRIORITY_COLORS[task.priority],
        overdue ? '!border-l-rose-500 ring-1 ring-rose-500/30' : '',
        task.status === 'done' ? 'opacity-50' : '',
        compact ? 'text-[11px]' : 'text-xs',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {overdue && <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 text-rose-500 dark:text-rose-400" />}
          <span className={`font-medium leading-tight truncate ${
            task.status === 'done'
              ? 'line-through text-gray-400 dark:text-white/30'
              : 'text-gray-800 dark:text-white/90'
          }`}>
            {task.title}
          </span>
        </div>
        {!compact && task.scheduled_at && (
          <span className="text-gray-400 dark:text-white/30 text-[10px]">
            {fmtTime(task.scheduled_at)} · {task.duration_minutes}d
          </span>
        )}
      </div>
      {/* Buttons: always visible on touch, hover-reveal on desktop */}
      <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
        {onPlay && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPlay() }}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 hover:text-orange-500 dark:hover:text-[#e8792f]"
          >
            <Play className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onClick() }}
          className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white"
        >
          <GripVertical className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  )
}

// ── Droppable day column (week view) ─────────────────────────────────────────

const WeekDayColumn: React.FC<{
  date: Date
  tasks: PlannerTask[]
  today: Date
  onTaskClick: (t: PlannerTask) => void
  onPlayTask?: (t: PlannerTask) => void
}> = ({ date, tasks, today, onTaskClick, onPlayTask }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${toISO(date)}` })
  const isToday = sameDay(date, today)
  const dow = date.getDay() === 0 ? 6 : date.getDay() - 1

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col rounded-xl border transition-colors duration-150 min-w-[88px] flex-1',
        isOver
          ? 'border-orange-400 bg-orange-50 dark:border-[#e8792f]/50 dark:bg-[#e8792f]/5'
          : 'border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[#16171f]',
      ].join(' ')}
    >
      {/* Day header */}
      <div className={`px-2 py-1.5 border-b flex items-center justify-between ${
        isToday
          ? 'border-orange-300 dark:border-[#e8792f]/30'
          : 'border-gray-100 dark:border-white/[0.04]'
      }`}>
        <span className="text-[10px] text-gray-400 dark:text-white/40 uppercase tracking-wide">{UZ_DAYS_SHORT[dow]}</span>
        <span className={`text-sm font-bold ${isToday ? 'text-orange-500 dark:text-[#e8792f]' : 'text-gray-600 dark:text-white/70'}`}>
          {date.getDate()}
        </span>
      </div>
      {/* Tasks */}
      <div className="flex-1 p-1.5 space-y-1 min-h-[80px]">
        {tasks.map(t => (
          <TaskChip
            key={t.id}
            task={t}
            compact
            onClick={() => onTaskClick(t)}
            onPlay={onPlayTask ? () => onPlayTask(t) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ── Droppable month cell ──────────────────────────────────────────────────────

const MonthCell: React.FC<{
  date: Date
  tasks: PlannerTask[]
  today: Date
  onTaskClick: (t: PlannerTask) => void
}> = ({ date, tasks, today }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${toISO(date)}` })
  const isToday = sameDay(date, today)

  return (
    <div
      ref={setNodeRef}
      className={[
        'min-h-[60px] sm:min-h-[80px] p-1 rounded-lg border transition-colors duration-150',
        isOver
          ? 'border-orange-400 bg-orange-50 dark:border-[#e8792f]/40 dark:bg-[#e8792f]/5'
          : isToday
            ? 'border-orange-300 dark:border-[#e8792f]/30 bg-orange-50/50 dark:bg-[#16171f]/50'
            : 'border-gray-100 dark:border-white/[0.04] bg-gray-50/50 dark:bg-[#16171f]/50',
      ].join(' ')}
    >
      <span className={`text-[11px] font-semibold block mb-1 ${isToday ? 'text-orange-500 dark:text-[#e8792f]' : 'text-gray-400 dark:text-white/40'}`}>
        {date.getDate()}
      </span>
      <div className="space-y-0.5">
        {tasks.slice(0, 3).map(t => (
          <div key={t.id} className={`w-full h-1.5 rounded-full ${PRIORITY_DOT[t.priority]} ${isOverdue(t) ? '!bg-rose-400' : ''} opacity-70`} />
        ))}
        {tasks.length > 3 && (
          <span className="text-[9px] text-gray-400 dark:text-white/30">+{tasks.length - 3}</span>
        )}
      </div>
    </div>
  )
}

// ── Unscheduled panel (sidebar on desktop, collapsible on mobile) ─────────────

const UnscheduledPanel: React.FC<{
  tasks: PlannerTask[]
  onTaskClick: (t: PlannerTask) => void
  onPlayTask?: (t: PlannerTask) => void
  onAdd: () => void
  collapsed: boolean
  onToggle: () => void
  isMobile: boolean
}> = ({ tasks, onTaskClick, onPlayTask, onAdd, collapsed, onToggle, isMobile }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' })

  return (
    <div className={isMobile ? 'w-full' : 'w-48 flex-shrink-0 flex flex-col gap-2'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={isMobile ? onToggle : undefined}
          className={`flex items-center gap-1.5 ${isMobile ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
            Rejalashtirilmagan
          </span>
          {tasks.length > 0 && (
            <span className="text-[10px] font-bold bg-orange-100 dark:bg-[#e8792f]/20 text-orange-600 dark:text-[#e8792f] px-1.5 py-0.5 rounded-full">
              {tasks.length}
            </span>
          )}
          {isMobile && (
            collapsed
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
              : <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-white/30" />
          )}
        </button>
        <button
          onClick={onAdd}
          className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-100 dark:bg-white/5 hover:bg-orange-100 dark:hover:bg-[#e8792f]/20 hover:text-orange-500 dark:hover:text-[#e8792f] text-gray-400 dark:text-white/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task list */}
      <AnimatePresence initial={false}>
        {(!isMobile || !collapsed) && (
          <motion.div
            initial={isMobile ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              ref={setNodeRef}
              className={[
                'rounded-xl border p-2 space-y-1.5 transition-colors duration-150',
                isMobile ? 'min-h-[80px]' : 'min-h-[200px] flex-1',
                isOver
                  ? 'border-orange-400 bg-orange-50 dark:border-[#e8792f]/40 dark:bg-[#e8792f]/5'
                  : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#1c1d27]',
              ].join(' ')}
            >
              {tasks.length === 0 && (
                <p className="text-[11px] text-gray-400 dark:text-white/20 text-center pt-4">
                  Barcha vazifalar rejalashtirilgan
                </p>
              )}
              {tasks.map(t => (
                <TaskChip
                  key={t.id}
                  task={t}
                  onClick={() => onTaskClick(t)}
                  onPlay={onPlayTask ? () => onPlayTask(t) : undefined}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Input class ───────────────────────────────────────────────────────────────

const inputCls = [
  'w-full rounded-lg px-3 py-2 text-sm transition-colors',
  'bg-gray-50 dark:bg-white/[0.04]',
  'border border-gray-300 dark:border-white/[0.08]',
  'text-gray-900 dark:text-white',
  'placeholder-gray-400 dark:placeholder-white/25',
  'focus:outline-none focus:border-orange-400 dark:focus:border-[#e8792f]/50',
].join(' ')

const selectCls = inputCls + ' appearance-none'

// ── Quick Edit Modal ──────────────────────────────────────────────────────────

const DURATION_PRESETS = [15, 30, 60, 90]

const QuickEditModal: React.FC<{
  task: PlannerTask | null
  onClose: () => void
  onSave: (updates: Partial<PlannerTask>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}> = ({ task, onClose, onSave, onDelete }) => {
  const [form, setForm] = useState({
    title: '', description: '', status: 'todo', priority: 'medium',
    scheduled_date: '', scheduled_time: '', duration_minutes: 30,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!task) return
    let date = '', time = ''
    if (task.scheduled_at) {
      const d = new Date(task.scheduled_at)
      date = toISO(d)
      time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    setForm({
      title: task.title, description: task.description ?? '',
      status: task.status, priority: task.priority,
      scheduled_date: date, scheduled_time: time,
      duration_minutes: task.duration_minutes,
    })
  }, [task])

  if (!task) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      let scheduled_at: string | null = null
      if (form.scheduled_date) {
        const dt = new Date(`${form.scheduled_date}T${form.scheduled_time || '00:00'}:00`)
        scheduled_at = dt.toISOString()
      }
      await onSave({
        title: form.title,
        description: form.description || null,
        status: form.status as PlannerTask['status'],
        priority: form.priority as PlannerTask['priority'],
        scheduled_at,
        duration_minutes: form.duration_minutes,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await onDelete(task.id); onClose() }
    finally { setDeleting(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-md bg-white dark:bg-[#1c1d27] rounded-2xl border border-gray-200 dark:border-white/[0.08] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <span className="text-sm font-semibold text-gray-800 dark:text-white/80">Vazifani tahrirlash</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 dark:text-white/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <input
            className={inputCls}
            placeholder="Vazifa nomi"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className={`${inputCls} resize-none h-16`}
            placeholder="Tavsif (ixtiyoriy)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide block mb-1">Holat</label>
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="todo">Rejada</option>
                <option value="in_progress">Jarayonda</option>
                <option value="done">Bajarildi</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide block mb-1">Muhimlik</label>
              <select className={selectCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="low">Past</option>
                <option value="medium">O'rta</option>
                <option value="high">Yuqori</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide block mb-1">Sana</label>
              <input type="date" className={inputCls} value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide block mb-1">Vaqt</label>
              <input type="time" className={inputCls} value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide block mb-1">Davomiyligi</label>
            <div className="flex gap-1.5 flex-wrap">
              {DURATION_PRESETS.map(mins => (
                <button
                  key={mins}
                  onClick={() => setForm(f => ({ ...f, duration_minutes: mins }))}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    form.duration_minutes === mins
                      ? 'bg-orange-500 dark:bg-[#e8792f] text-white'
                      : 'bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  {mins < 60 ? `${mins}d` : `${mins / 60}s`}
                </button>
              ))}
              <input
                type="number" min={5} max={480}
                className="w-16 rounded-lg px-2 py-1 text-xs bg-gray-50 dark:bg-white/[0.04] border border-gray-300 dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:border-orange-400 dark:focus:border-[#e8792f]/50"
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) || 30 }))}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
          <button
            onClick={handleDelete} disabled={deleting}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-gray-400 dark:text-white/30 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white transition-colors">
            Bekor
          </button>
          <button
            onClick={handleSave} disabled={saving || !form.title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-orange-500 dark:bg-[#e8792f] text-white hover:bg-orange-600 dark:hover:bg-[#d06820] disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {saving ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Saqlash
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── New Task Modal ────────────────────────────────────────────────────────────

const NewTaskModal: React.FC<{
  initialDate?: string
  onClose: () => void
  onCreate: (data: { title: string; scheduled_at: string | null; priority: string }) => Promise<void>
}> = ({ initialDate, onClose, onCreate }) => {
  const [title, setTitle]       = useState('')
  const [date, setDate]         = useState(initialDate ?? '')
  const [time, setTime]         = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      let scheduled_at: string | null = null
      if (date) scheduled_at = new Date(`${date}T${time || '00:00'}:00`).toISOString()
      await onCreate({ title: title.trim(), scheduled_at, priority })
      onClose()
    } finally { setSaving(false) }
  }

  const PRIO = [
    { key: 'low',    label: 'Past',    active: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300' },
    { key: 'medium', label: "O'rta",   active: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300' },
    { key: 'high',   label: 'Yuqori',  active: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300' },
  ] as const

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-sm bg-white dark:bg-[#1c1d27] rounded-2xl border border-gray-200 dark:border-white/[0.08] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <span className="text-sm font-semibold text-gray-800 dark:text-white/80">Yangi vazifa</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 dark:text-white/40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            ref={inputRef}
            className={inputCls}
            placeholder="Vazifa nomi"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {PRIO.map(p => (
              <button
                key={p.key}
                onClick={() => setPriority(p.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  priority === p.key
                    ? p.active
                    : 'bg-gray-100 dark:bg-white/[0.04] text-gray-400 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-gray-500 dark:text-white/50 hover:text-gray-800 dark:hover:text-white transition-colors">
            Bekor
          </button>
          <button
            onClick={handleCreate} disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-orange-500 dark:bg-[#e8792f] text-white hover:bg-orange-600 dark:hover:bg-[#d06820] disabled:opacity-40 transition-colors"
          >
            {saving ? '...' : "Qo'shish"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  Main Calendar component
// ══════════════════════════════════════════════════════════════════════════════

const PlannerCalendar: React.FC<Props> = ({ onPlayTask }) => {
  const { user } = useAuth()
  const userId = user?.id

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const [tasks, setTasks]             = useState<PlannerTask[]>([])
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState<'week' | 'month'>('week')
  const [weekStart, setWeekStart]     = useState<Date>(() => startOfWeek(today))
  const [monthDate, setMonthDate]     = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [editTask, setEditTask]       = useState<PlannerTask | null>(null)
  const [newDate, setNewDate]         = useState<string | undefined>()
  const [showNew, setShowNew]         = useState(false)
  const [activeDrag, setActiveDrag]   = useState<PlannerTask | null>(null)
  const [xpToast, setXpToast]         = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Detect mobile via a simple window width check (updates on resize)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Fetch tasks ──────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await apiFetch<PlannerTask[]>(`/api/planner/tasks/${userId}`)
      setTasks(data)
    } catch {}
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const weekDaysList  = useMemo(() => weekDays(weekStart), [weekStart])
  const monthGridList = useMemo(() => monthGrid(monthDate.getFullYear(), monthDate.getMonth()), [monthDate])
  const unscheduled   = useMemo(() => tasks.filter(t => !t.scheduled_at), [tasks])

  const tasksForDay = useCallback((date: Date) =>
    tasks.filter(t => t.scheduled_at && sameDay(new Date(t.scheduled_at), date)),
  [tasks])

  // ── Navigation ───────────────────────────────────────────────────────────────
  const prevPeriod = () => {
    if (view === 'week') setWeekStart(d => addDays(d, -7))
    else setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  const nextPeriod = () => {
    if (view === 'week') setWeekStart(d => addDays(d, 7))
    else setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  const goToday = () => {
    setWeekStart(startOfWeek(today))
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  const periodLabel = view === 'week'
    ? `${weekDaysList[0].getDate()} – ${weekDaysList[6].getDate()} ${UZ_MONTHS[weekDaysList[6].getMonth()]}`
    : `${UZ_MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const createTask = useCallback(async (data: { title: string; scheduled_at: string | null; priority: string }) => {
    if (!userId) return
    const t = await apiFetch<PlannerTask>('/api/planner/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: data.title, scheduled_at: data.scheduled_at, priority: data.priority }),
    })
    setTasks(prev => [t, ...prev])
  }, [userId])

  const updateTask = useCallback(async (id: number, updates: Partial<PlannerTask>) => {
    const res = await apiFetch<PlannerTask & { xp_awarded?: number }>(`/api/planner/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...res } : t))
    if (res.xp_awarded && res.xp_awarded > 0) {
      setXpToast(res.xp_awarded)
      setTimeout(() => setXpToast(0), 3000)
    }
  }, [])

  const deleteTask = useCallback(async (id: number) => {
    await apiFetch(`/api/planner/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── DnD ──────────────────────────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDrag(tasks.find(t => t.id === e.active.id) ?? null)
  }

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = e
    if (!over) return
    const taskId = active.id as number
    const target = over.id as string
    if (target === 'unscheduled') {
      await updateTask(taskId, { scheduled_at: null })
    } else if (target.startsWith('day:')) {
      const iso = target.replace('day:', '')
      const task = tasks.find(t => t.id === taskId)
      let scheduled_at: string
      if (task?.scheduled_at) {
        const oldTime = new Date(task.scheduled_at)
        const [y, m, d] = iso.split('-').map(Number)
        scheduled_at = new Date(y, m - 1, d, oldTime.getHours(), oldTime.getMinutes()).toISOString()
      } else {
        scheduled_at = new Date(`${iso}T00:00:00`).toISOString()
      }
      await updateTask(taskId, { scheduled_at })
    }
  }, [tasks, updateTask])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3">

        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Nav arrows */}
          <button onClick={prevPeriod} className={`w-7 h-7 flex items-center justify-center rounded-lg ${BTN}`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextPeriod} className={`w-7 h-7 flex items-center justify-center rounded-lg ${BTN}`}>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Period label */}
          <span className="text-sm font-semibold text-gray-700 dark:text-white/80 flex-1 min-w-0 truncate">
            {periodLabel}
          </span>

          {/* Today */}
          <button onClick={goToday} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${BTN}`}>
            Bugun
          </button>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-white/[0.06]">
            <button
              onClick={() => setView('week')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                view === 'week'
                  ? 'bg-orange-500 dark:bg-[#e8792f] text-white'
                  : 'bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white'
              }`}
            >
              <List className="w-3 h-3" /> Hafta
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                view === 'month'
                  ? 'bg-orange-500 dark:bg-[#e8792f] text-white'
                  : 'bg-gray-50 dark:bg-white/[0.03] text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3 h-3" /> Oy
            </button>
          </div>

          {/* Add task */}
          <button
            onClick={() => { setNewDate(undefined); setShowNew(true) }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500 dark:bg-[#e8792f] text-white text-xs font-semibold hover:bg-orange-600 dark:hover:bg-[#d06820] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vazifa</span>
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-orange-500 dark:border-[#e8792f] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className={isMobile ? 'flex flex-col gap-3' : 'flex gap-3 items-start'}>

            {/* Unscheduled panel */}
            <UnscheduledPanel
              tasks={unscheduled}
              onTaskClick={setEditTask}
              onPlayTask={onPlayTask}
              onAdd={() => { setNewDate(undefined); setShowNew(true) }}
              collapsed={!sidebarOpen}
              onToggle={() => setSidebarOpen(o => !o)}
              isMobile={isMobile}
            />

            {/* Calendar grid */}
            <div className="flex-1 min-w-0">
              {view === 'week' ? (
                /* Horizontal scroll on mobile so all 7 columns are reachable */
                <div className="overflow-x-auto -mx-1 px-1">
                  <div className="flex gap-1.5" style={{ minWidth: isMobile ? '560px' : undefined }}>
                    {weekDaysList.map(date => (
                      <WeekDayColumn
                        key={toISO(date)}
                        date={date}
                        tasks={tasksForDay(date)}
                        today={today}
                        onTaskClick={setEditTask}
                        onPlayTask={onPlayTask}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Day-of-week header */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {UZ_DAYS_SHORT.map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-wide py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthGridList.map((date, i) =>
                      date === null ? (
                        <div key={`null-${i}`} className="min-h-[60px] sm:min-h-[80px]" />
                      ) : (
                        <MonthCell
                          key={toISO(date)}
                          date={date}
                          tasks={tasksForDay(date)}
                          today={today}
                          onTaskClick={setEditTask}
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── XP toast ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {xpToast > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#1c1d27] border border-orange-200 dark:border-[#e8792f]/30 shadow-xl z-50"
            >
              <Sparkles className="w-4 h-4 text-orange-500 dark:text-[#e8792f]" />
              <span className="text-sm font-bold text-gray-800 dark:text-white">+{xpToast} XP</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Drag overlay ─────────────────────────────────────────────── */}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div className={[
              'flex items-center gap-1.5 rounded-lg border-l-2 px-2 py-1.5 text-xs shadow-2xl rotate-1',
              CARD, PRIORITY_COLORS[activeDrag.priority],
            ].join(' ')}>
              <span className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[160px]">{activeDrag.title}</span>
            </div>
          )}
        </DragOverlay>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNew && (
          <NewTaskModal
            initialDate={newDate}
            onClose={() => setShowNew(false)}
            onCreate={createTask}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTask && (
          <QuickEditModal
            task={editTask}
            onClose={() => setEditTask(null)}
            onSave={async updates => { await updateTask(editTask.id, updates) }}
            onDelete={deleteTask}
          />
        )}
      </AnimatePresence>
    </DndContext>
  )
}

export default PlannerCalendar
