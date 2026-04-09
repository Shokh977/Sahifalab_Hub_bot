/**
 * KanbanBoard — drag-and-drop task planner with 3 columns.
 *
 * Columns: Rejada (todo) → Jarayonda (in_progress) → Bajarildi (done)
 * Drag a task card between columns to change its status.
 * Completing a task fires confetti and awards 20 XP server-side.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, GripVertical, Play, Trash2, X, Loader2,
  ChevronDown, Sparkles,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const API = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

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
  created_at: string
  updated_at: string
}

type ColumnId = 'todo' | 'in_progress' | 'done'

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: { id: ColumnId; title: string; emoji: string; accent: string; bg: string }[] = [
  { id: 'todo',        title: 'Rejada',     emoji: '📋', accent: 'text-slate-600 dark:text-slate-300',   bg: 'bg-slate-50 dark:bg-slate-800/30' },
  { id: 'in_progress', title: 'Jarayonda',  emoji: '🔄', accent: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50/60 dark:bg-blue-900/15' },
  { id: 'done',        title: 'Bajarildi',  emoji: '✅', accent: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/60 dark:bg-emerald-900/15' },
]

const PRIORITY_CFG: Record<string, { label: string; dot: string; badge: string }> = {
  low:    { label: 'Past',   dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  medium: { label: "O'rta",  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  high:   { label: 'Yuqori', dot: 'bg-red-500',     badge: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
}

// Mobile: dropdown to move task between columns
const MOVE_OPTIONS: { id: ColumnId; label: string; emoji: string }[] = [
  { id: 'todo',        label: 'Rejada',    emoji: '📋' },
  { id: 'in_progress', label: 'Jarayonda', emoji: '🔄' },
  { id: 'done',        label: 'Bajarildi', emoji: '✅' },
]

// ── Droppable Column ──────────────────────────────────────────────────────────

interface ColumnProps {
  column: typeof COLUMNS[number]
  tasks: PlannerTask[]
  onPlayTask?: (task: PlannerTask) => void
  onDeleteTask: (id: number) => void
  onMoveTask: (taskId: number, targetStatus: ColumnId) => void
}

const Column: React.FC<ColumnProps> = ({ column, tasks, onPlayTask, onDeleteTask, onMoveTask }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-2xl p-3 min-h-[180px] transition-all duration-200 border
        ${column.bg}
        ${isOver
          ? 'border-sahifa-400 dark:border-sahifa-500 ring-2 ring-sahifa-500/20 scale-[1.01]'
          : 'border-slate-200/60 dark:border-white/5'
        }
      `}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-base">{column.emoji}</span>
        <h3 className={`text-sm font-bold ${column.accent}`}>{column.title}</h3>
        <span className="ml-auto text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-white/60 dark:bg-white/5 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
      </div>

      {/* Task cards */}
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onPlay={onPlayTask}
            onDelete={onDeleteTask}
            onMove={onMoveTask}
          />
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center py-6 text-slate-400 dark:text-slate-600 text-xs">
            {isOver ? (
              <motion.span initial={{ scale: 0.9 }} animate={{ scale: 1.05 }} className="font-semibold text-sahifa-500">
                Shu yerga tashlang ↓
              </motion.span>
            ) : (
              'Hozircha bo\u2019sh'
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Draggable Task Card ───────────────────────────────────────────────────────

interface TaskCardProps {
  task: PlannerTask
  overlay?: boolean
  onPlay?: (task: PlannerTask) => void
  onDelete?: (id: number) => void
  onMove?: (taskId: number, targetStatus: ColumnId) => void
}

const TaskCard: React.FC<TaskCardProps> = ({ task, overlay, onPlay, onDelete, onMove }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
  })
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const pri = PRIORITY_CFG[task.priority] || PRIORITY_CFG.low

  const style: React.CSSProperties = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : {}

  return (
    <motion.div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      layout={!overlay}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`
        relative rounded-xl p-3 transition-shadow
        bg-white dark:bg-[#222230] border border-slate-200/70 dark:border-white/5
        ${overlay ? 'shadow-xl rotate-2 scale-105' : 'shadow-sm hover:shadow-md'}
        ${isDragging ? 'opacity-40' : ''}
        ${task.status === 'done' ? 'opacity-70' : ''}
      `}
    >
      {/* Drag handle + priority dot */}
      <div className="flex items-start gap-2">
        <button
          {...(overlay ? {} : listeners)}
          {...(overlay ? {} : attributes)}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 touch-none"
          aria-label="Sudrab ko'chirish"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
        {/* Priority badge */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pri.badge}`}>
          {pri.label}
        </span>

        <div className="flex items-center gap-1">
          {/* Mobile: move dropdown */}
          <div className="relative md:hidden">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Ko'chirish"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {showMoveMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 bottom-8 z-20 bg-white dark:bg-[#2A2A36] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg py-1 min-w-[130px]"
                >
                  {MOVE_OPTIONS.filter(o => o.id !== task.status).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { onMove?.(task.id, opt.id); setShowMoveMenu(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <span>{opt.emoji}</span> {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Play button (not for done tasks) */}
          {task.status !== 'done' && onPlay && (
            <button
              onClick={() => onPlay(task)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sahifa-500 hover:bg-sahifa-50 dark:hover:bg-sahifa-500/10 transition-colors"
              aria-label="Boshlash"
              title={task.linked_course_id ? "Kursga o'tish" : 'Fokus rejimini boshlash'}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          {/* Done sparkle for completed */}
          {task.status === 'done' && (
            <Sparkles className="w-4 h-4 text-emerald-400" />
          )}

          {/* Delete */}
          <button
            onClick={() => onDelete?.(task.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            aria-label="O'chirish"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Add Task Modal ────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  onAdd: (title: string, description: string, priority: string) => void
  onClose: () => void
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({ onAdd, onClose }) => {
  const [title, setTitle] = useState('')
  const [desc, setDesc]   = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title, desc, priority)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <motion.form
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-white dark:bg-[#222230] rounded-2xl p-5 shadow-2xl border border-slate-200/60 dark:border-white/5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">📝 Yangi vazifa</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title */}
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Vazifa nomi..."
          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-400 mb-3"
        />

        {/* Description */}
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Tavsif (ixtiyoriy)..."
          rows={2}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-400 resize-none mb-3"
        />

        {/* Priority */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Muhimlik</p>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`
                  flex-1 py-2 rounded-xl text-xs font-bold transition-all border
                  ${priority === p
                    ? `${PRIORITY_CFG[p].badge} border-current shadow-sm`
                    : 'bg-slate-50 dark:bg-white/5 text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-white/10'
                  }
                `}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${PRIORITY_CFG[p].dot} mr-1.5`} />
                {PRIORITY_CFG[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
            Bekor
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-glow-sm"
          >
            Qo'shish
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}

// ── Main KanbanBoard ──────────────────────────────────────────────────────────

interface KanbanBoardProps {
  onPlayTask?: (task: PlannerTask) => void
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ onPlayTask }) => {
  const { user } = useAuth()
  const [tasks, setTasks]       = useState<PlannerTask[]>([])
  const [loading, setLoading]   = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showAdd, setShowAdd]   = useState(false)

  // ── Fetch tasks ────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`${API}/api/planner/tasks/${user.id}`)
      if (res.ok) setTasks(await res.json())
    } catch (err) {
      console.error('[Kanban] fetch error', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // ── DnD sensors ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(Number(e.active.id.toString().replace('task-', '')))
  }, [])

  const moveTask = useCallback(async (taskId: number, targetStatus: ColumnId) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === targetStatus) return

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: targetStatus } : t))

    // Confetti on completion 🎉
    if (targetStatus === 'done' && task.status !== 'done') {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#F15929', '#FF8A65', '#FFD54F', '#4CAF50', '#42A5F5'] })
    }

    // Server update (awards 20 XP when status→done)
    try {
      await fetch(`${API}/api/planner/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
    } catch {
      // Rollback on error
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t))
    }
  }, [tasks])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return

    const taskId = Number(active.id.toString().replace('task-', ''))
    const overId = over.id.toString()

    // Determine target column
    let targetStatus: ColumnId
    if (['todo', 'in_progress', 'done'].includes(overId)) {
      targetStatus = overId as ColumnId
    } else {
      const overTaskId = Number(overId.replace('task-', ''))
      const overTask = tasks.find(t => t.id === overTaskId)
      if (!overTask) return
      targetStatus = overTask.status
    }

    moveTask(taskId, targetStatus)
  }, [tasks, moveTask])

  // ── Add task ───────────────────────────────────────────────────────────
  const addTask = useCallback(async (title: string, description: string, priority: string) => {
    if (!user?.id || !title.trim()) return
    try {
      const res = await fetch(`${API}/api/planner/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, title: title.trim(), description: description.trim() || null, priority }),
      })
      if (res.ok) {
        const newTask = await res.json()
        setTasks(prev => [...prev, newTask])
        setShowAdd(false)
      }
    } catch (err) { console.error('[Kanban] add error', err) }
  }, [user?.id])

  // ── Delete task ────────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await fetch(`${API}/api/planner/tasks/${id}`, { method: 'DELETE' })
    } catch { fetchTasks() }
  }, [fetchTasks])

  // ── Active task for DragOverlay ────────────────────────────────────────
  const activeTask = useMemo(() => activeId ? tasks.find(t => t.id === activeId) : null, [activeId, tasks])

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-sahifa-500" />
      </div>
    )
  }

  return (
    <>
      {/* Add task button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {tasks.length} ta vazifa · {tasks.filter(t => t.status === 'done').length} bajarildi
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sahifa-500 hover:bg-sahifa-600 shadow-glow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Yangi vazifa
        </button>
      </div>

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {COLUMNS.map(col => (
            <Column
              key={col.id}
              column={col}
              tasks={tasks.filter(t => t.status === col.id).sort((a, b) => a.sort_order - b.sort_order)}
              onPlayTask={onPlayTask}
              onDeleteTask={deleteTask}
              onMoveTask={moveTask}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && <TaskCard task={activeTask} overlay />}
        </DragOverlay>
      </DndContext>

      {/* Add task modal */}
      <AnimatePresence>
        {showAdd && <AddTaskModal onAdd={addTask} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </>
  )
}

export default KanbanBoard
