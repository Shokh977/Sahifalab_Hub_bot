/**
 * QuizBuilder — Inline quiz editor for course builder
 *
 * Allows teachers to create quiz questions with multiple-choice answers
 * directly inside the course builder. Data is stored as part of the
 * lesson draft in localStorage and synced when the course is saved.
 *
 * Props:
 *   questions       — controlled array of QuizQuestion
 *   onChange         — (questions: QuizQuestion[]) => void
 *   disabled?       — locks editing
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

export interface QuizOption {
  id: string
  text: string
  is_correct: boolean
}

export interface QuizQuestion {
  id: string
  text: string
  explanation: string
  options: QuizOption[]
  type: 'single' | 'multiple'
}

interface Props {
  questions: QuizQuestion[]
  onChange:  (questions: QuizQuestion[]) => void
  disabled?: boolean
}

const uid = () => `q_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`

export const createQuestion = (): QuizQuestion => ({
  id: uid(),
  text: '',
  explanation: '',
  options: [
    { id: uid(), text: '', is_correct: true },
    { id: uid(), text: '', is_correct: false },
    { id: uid(), text: '', is_correct: false },
    { id: uid(), text: '', is_correct: false },
  ],
  type: 'single',
})

const inputCls = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26722]/30 focus:border-[#F26722] transition'

const QuizBuilder: React.FC<Props> = ({ questions, onChange, disabled }) => {
  const [expandedId, setExpandedId] = useState<string | null>(questions[0]?.id ?? null)

  const addQuestion = () => {
    const q = createQuestion()
    onChange([...questions, q])
    setExpandedId(q.id)
  }

  const removeQuestion = (qId: string) => {
    const next = questions.filter(q => q.id !== qId)
    onChange(next)
    if (expandedId === qId) setExpandedId(next[0]?.id ?? null)
  }

  const updateQuestion = (qId: string, patch: Partial<QuizQuestion>) => {
    onChange(questions.map(q => q.id === qId ? { ...q, ...patch } : q))
  }

  const addOption = (qId: string) => {
    onChange(questions.map(q => {
      if (q.id !== qId) return q
      return { ...q, options: [...q.options, { id: uid(), text: '', is_correct: false }] }
    }))
  }

  const removeOption = (qId: string, optId: string) => {
    onChange(questions.map(q => {
      if (q.id !== qId) return q
      const opts = q.options.filter(o => o.id !== optId)
      // Ensure at least one correct answer
      if (opts.length > 0 && !opts.some(o => o.is_correct)) {
        opts[0].is_correct = true
      }
      return { ...q, options: opts }
    }))
  }

  const updateOption = (qId: string, optId: string, patch: Partial<QuizOption>) => {
    onChange(questions.map(q => {
      if (q.id !== qId) return q
      let opts = q.options.map(o => o.id === optId ? { ...o, ...patch } : o)
      // For single-choice: uncheck others when one is marked correct
      if (patch.is_correct && q.type === 'single') {
        opts = opts.map(o => ({ ...o, is_correct: o.id === optId }))
      }
      return { ...q, options: opts }
    }))
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const next = [...questions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= next.length) return
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QuestionMarkCircleIcon className="h-4 w-4 text-[#F26722]" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Quiz savollar ({questions.length})
          </span>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#F26722] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#E05A17] disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Savol qo'shish
        </button>
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-8 text-center">
          <QuestionMarkCircleIcon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Hali savol yo'q</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            "Savol qo'shish" tugmasini bosib quiz yaratishni boshlang
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {questions.map((question, index) => {
              const isExpanded = expandedId === question.id
              const hasCorrect = question.options.some(o => o.is_correct && o.text.trim())
              const isComplete = question.text.trim() && hasCorrect && question.options.filter(o => o.text.trim()).length >= 2

              return (
                <motion.div
                  key={question.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/70"
                >
                  {/* Question header */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : question.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${
                      isComplete
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {isComplete ? <CheckCircleIcon className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {question.text || `Savol ${index + 1}`}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {question.options.length} variant · {question.type === 'single' ? 'Bitta to\'g\'ri' : 'Bir nechta'}
                      </p>
                    </div>
                    <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                      {/* Question text */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Savol matni *</label>
                        <textarea
                          value={question.text}
                          onChange={e => updateQuestion(question.id, { text: e.target.value })}
                          placeholder="Savolni yozing..."
                          rows={2}
                          disabled={disabled}
                          className={`${inputCls} resize-none`}
                        />
                      </div>

                      {/* Question type toggle */}
                      <div className="flex gap-2">
                        {(['single', 'multiple'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => updateQuestion(question.id, { type })}
                            disabled={disabled}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                              question.type === type
                                ? 'bg-[#F26722]/10 text-[#F26722] border border-[#F26722]/30'
                                : 'bg-slate-100 text-slate-600 border border-transparent dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {type === 'single' ? 'Bitta to\'g\'ri javob' : 'Bir nechta to\'g\'ri'}
                          </button>
                        ))}
                      </div>

                      {/* Options */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Javob variantlari</label>
                        {question.options.map((opt, optIndex) => (
                          <div key={opt.id} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateOption(question.id, opt.id, { is_correct: !opt.is_correct })}
                              disabled={disabled}
                              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border-2 transition ${
                                opt.is_correct
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900'
                              }`}
                            >
                              {opt.is_correct ? <CheckCircleIcon className="h-4 w-4" /> : <span className="text-xs">{String.fromCharCode(65 + optIndex)}</span>}
                            </button>
                            <input
                              value={opt.text}
                              onChange={e => updateOption(question.id, opt.id, { text: e.target.value })}
                              placeholder={`Variant ${String.fromCharCode(65 + optIndex)}`}
                              disabled={disabled}
                              className={`${inputCls} flex-1`}
                            />
                            {question.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(question.id, opt.id)}
                                disabled={disabled}
                                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}

                        {question.options.length < 6 && (
                          <button
                            type="button"
                            onClick={() => addOption(question.id)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-[#F26722]/30 hover:text-[#F26722] dark:border-slate-700 dark:text-slate-400"
                          >
                            <PlusIcon className="h-3.5 w-3.5" />
                            Variant qo'shish
                          </button>
                        )}
                      </div>

                      {/* Explanation */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Izoh (ixtiyoriy)</label>
                        <textarea
                          value={question.explanation}
                          onChange={e => updateQuestion(question.id, { explanation: e.target.value })}
                          placeholder="Nima uchun bu javob to'g'ri? Talabaga ko'rsatiladigan izoh..."
                          rows={2}
                          disabled={disabled}
                          className={`${inputCls} resize-none`}
                        />
                      </div>

                      {/* Question actions */}
                      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, 'up')}
                          disabled={disabled || index === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:text-slate-700 disabled:opacity-30 dark:border-slate-700"
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, 'down')}
                          disabled={disabled || index === questions.length - 1}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:text-slate-700 disabled:opacity-30 dark:border-slate-700"
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => removeQuestion(question.id)}
                          disabled={disabled}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          O'chirish
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default QuizBuilder
