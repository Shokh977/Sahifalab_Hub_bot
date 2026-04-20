/**
 * JobsPage — /jobs
 *
 * Three tabs:
 *   Barchasi         — all active jobs with search + filters
 *   Menga mos        — pre-filtered by user's skills (match %)
 *   Mening e'lonlarim — own job listings + applicants management
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, MapPin, Clock, DollarSign, Plus, Search,
  X, ChevronDown, CheckCircle, XCircle, Users, Loader2,
  Sparkles, Building2, Calendar, Tag, Send,
  ChevronRight, AlertCircle, Trash2, Edit3, Filter,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Job {
  id: number
  title: string
  company_name: string | null
  description: string | null
  location: string | null
  job_type: string | null
  required_skills: string[]
  salary_min: number | null
  salary_max: number | null
  expires_at: string | null
  created_at: string
  is_active: boolean
  poster_id: number
  poster_name: string | null
  poster_username: string | null
  poster_photo: string | null
  applicant_count?: number
  match_pct?: number
  skill_matches?: { skill: string; has: boolean }[]
}

interface Applicant {
  application_id: number
  applied_at: string
  status: string
  message: string | null
  applicant_id: number
  applicant_name: string | null
  applicant_username: string | null
  applicant_photo: string | null
  applicant_headline: string | null
  applicant_level: number
}

type TabKey = 'all' | 'matched' | 'mine'
type JobType = 'full_time' | 'part_time' | 'freelance' | 'internship' | 'remote'

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: 'To\'liq stavka',
  part_time: 'Yarim stavka',
  freelance: 'Frilauns',
  internship: 'Amaliyot',
  remote: 'Masofaviy',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return ''
  if (min && max) return `$${min.toLocaleString()} – $${max.toLocaleString()}`
  if (min) return `$${min.toLocaleString()}+`
  return `~$${max!.toLocaleString()}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysLeft(expires: string | null): string | null {
  if (!expires) return null
  const diff = Math.ceil((new Date(expires).getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'Muddati o\'tgan'
  if (diff === 0) return 'Bugun tugaydi'
  return `${diff} kun qoldi`
}

// ── Skill Tag ──────────────────────────────────────────────────────────────────

const SkillTag: React.FC<{ skill: string; has?: boolean; showIcon?: boolean }> = ({ skill, has, showIcon = false }) => {
  if (!showIcon || has === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
        {skill}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      has
        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    }`}>
      {has ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {skill}
    </span>
  )
}

// ── Match Badge ────────────────────────────────────────────────────────────────

const MatchBadge: React.FC<{ pct: number }> = ({ pct }) => {
  const color = pct >= 80 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
    : pct >= 50 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
    : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      <Sparkles className="w-3 h-3" />
      {pct}% mos
    </span>
  )
}

// ── Job Card ───────────────────────────────────────────────────────────────────

const JobCard: React.FC<{
  job: Job
  showMatch?: boolean
  isOwn?: boolean
  onApply?: (job: Job) => void
  onViewApplicants?: (job: Job) => void
  onDelete?: (job: Job) => void
  onEdit?: (job: Job) => void
}> = ({ job, showMatch, isOwn, onApply, onViewApplicants, onDelete, onEdit }) => {
  const [expanded, setExpanded] = useState(false)
  const dl = daysLeft(job.expires_at)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Company avatar */}
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">
            {(job.company_name || job.title)[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2">{job.title}</h3>
              {showMatch && job.match_pct !== undefined && job.match_pct > 0 && (
                <MatchBadge pct={job.match_pct} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
              {job.company_name && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {job.company_name}
                </span>
              )}
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {job.location}
                </span>
              )}
              {job.job_type && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Salary + deadline */}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {formatSalary(job.salary_min, job.salary_max) && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-3 h-3" />
              {formatSalary(job.salary_min, job.salary_max)}
            </span>
          )}
          {dl && (
            <span className={`text-xs ${dl.includes('o\'tgan') ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
              <Calendar className="w-3 h-3 inline mr-1" />{dl}
            </span>
          )}
          {isOwn && (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 ml-auto">
              <Users className="w-3 h-3" />
              {job.applicant_count ?? 0} ariza
            </span>
          )}
        </div>
      </div>

      {/* Skills */}
      {job.required_skills?.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {job.required_skills.slice(0, expanded ? undefined : 5).map(s => {
            const match = job.skill_matches?.find(m => m.skill === s)
            return (
              <SkillTag
                key={s}
                skill={s}
                has={match?.has}
                showIcon={showMatch}
              />
            )
          })}
          {!expanded && job.required_skills.length > 5 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-sahifa-500 hover:text-sahifa-600 font-medium"
            >
              +{job.required_skills.length - 5} ko'proq
            </button>
          )}
        </div>
      )}

      {/* Description excerpt */}
      {job.description && expanded && (
        <div className="px-4 pb-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
          {job.description}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        {!isOwn ? (
          <>
            <button
              onClick={() => onApply?.(job)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sahifa-500 hover:bg-sahifa-600 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Ariza topshirish
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onViewApplicants?.(job)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Arizalar ({job.applicant_count ?? 0})
            </button>
            <button
              onClick={() => onEdit?.(job)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete?.(job)}
              className="p-2 rounded-xl border border-red-100 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Skill Tag Input ────────────────────────────────────────────────────────────

const SkillInput: React.FC<{
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}> = ({ value, onChange, placeholder = 'Ko\'nikma qo\'shish...' }) => {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await api.client.get(`/api/jobs/skills/autocomplete?q=${encodeURIComponent(q)}&limit=6`)
      setSuggestions((res.data.suggestions || []).filter((s: string) => !value.includes(s)))
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [value])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setInput(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchSuggestions(v), 300)
  }

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase()
    if (clean && !value.includes(clean)) {
      onChange([...value, clean])
    }
    setInput('')
    setSuggestions([])
  }

  const removeTag = (tag: string) => onChange(value.filter(t => t !== tag))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length) {
      removeTag(value[value.length - 1])
    }
  }

  return (
    <div className="relative">
      <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-sahifa-500/30 focus-within:border-sahifa-500 transition-all">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sahifa-50 dark:bg-sahifa-900/30 text-sahifa-700 dark:text-sahifa-300 text-xs font-medium">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-sahifa-400 hover:text-sahifa-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400"
        />
        {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin self-center" />}
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); addTag(s) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Job Form Modal ─────────────────────────────────────────────────────────────

interface JobFormData {
  title: string
  company_name: string
  description: string
  location: string
  job_type: JobType | ''
  required_skills: string[]
  salary_min: string
  salary_max: string
  expires_at: string
}

const EMPTY_FORM: JobFormData = {
  title: '', company_name: '', description: '', location: '',
  job_type: '', required_skills: [], salary_min: '', salary_max: '', expires_at: '',
}

const JobFormModal: React.FC<{
  initial?: Job | null
  onClose: () => void
  onSaved: () => void
}> = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState<JobFormData>(() => initial
    ? {
        title: initial.title,
        company_name: initial.company_name || '',
        description: initial.description || '',
        location: initial.location || '',
        job_type: (initial.job_type as JobType) || '',
        required_skills: initial.required_skills || [],
        salary_min: initial.salary_min?.toString() || '',
        salary_max: initial.salary_max?.toString() || '',
        expires_at: initial.expires_at ? initial.expires_at.slice(0, 10) : '',
      }
    : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof JobFormData, val: string | string[]) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Sarlavha majburiy'); return }
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        company_name: form.company_name.trim() || null,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        job_type: form.job_type || null,
        required_skills: form.required_skills,
        salary_min: form.salary_min ? parseInt(form.salary_min) : null,
        salary_max: form.salary_max ? parseInt(form.salary_max) : null,
        expires_at: form.expires_at || null,
      }
      if (initial) {
        await api.client.patch(`/api/jobs/${initial.id}`, payload)
      } else {
        await api.client.post('/api/jobs', payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-gray-900 dark:text-white">
            {initial ? 'E\'lonni tahrirlash' : 'Yangi ish e\'loni'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Lavozim nomi *
            </label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Masalan: Frontend Developer"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Kompaniya
              </label>
              <input
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="CompanyX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Joylashuv
              </label>
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Toshkent yoki Remote"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Ish turi
            </label>
            <select
              value={form.job_type}
              onChange={e => set('job_type', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
            >
              <option value="">Tanlang...</option>
              {Object.entries(JOB_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Tavsif
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Ish haqida qisqacha ma'lumot..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Talab qilinadigan ko'nikmalar
            </label>
            <SkillInput value={form.required_skills} onChange={v => set('required_skills', v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Maosh (min, $)
              </label>
              <input
                type="number"
                value={form.salary_min}
                onChange={e => set('salary_min', e.target.value)}
                placeholder="500"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Maosh (max, $)
              </label>
              <input
                type="number"
                value={form.salary_max}
                onChange={e => set('salary_max', e.target.value)}
                placeholder="1500"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Muddati
            </label>
            <input
              type="date"
              value={form.expires_at}
              onChange={e => set('expires_at', e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saqlanmoqda...' : initial ? 'Saqlash' : 'E\'lon joylash'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ── Apply Modal ────────────────────────────────────────────────────────────────

const ApplyModal: React.FC<{
  job: Job
  onClose: () => void
}> = ({ job, onClose }) => {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleApply = async () => {
    setLoading(true)
    try {
      await api.client.post(`/api/jobs/${job.id}/apply`, { message: message.trim() || null })
      setDone(true)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl"
      >
        {done ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white">Ariza yuborildi!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ish beruvchi siz bilan bog'lanadi.</p>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors">
              Yopish
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Ariza topshirish</h2>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 mb-4">
              <p className="font-semibold text-sm text-gray-900 dark:text-white">{job.title}</p>
              {job.company_name && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{job.company_name}</p>}
            </div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Xabar (ixtiyoriy)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="O'zingiz haqida qisqacha yozing..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all resize-none mb-4"
            />
            <button
              onClick={handleApply}
              disabled={loading}
              className="w-full py-3 bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? 'Yuborilmoqda...' : 'Ariza yuborish'}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Applicants Modal ───────────────────────────────────────────────────────────

const ApplicantsModal: React.FC<{
  job: Job
  onClose: () => void
}> = ({ job, onClose }) => {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.client.get(`/api/jobs/${job.id}/applicants`).then(r => {
      setApplicants(r.data.applicants || [])
    }).finally(() => setLoading(false))
  }, [job.id])

  const updateStatus = async (appId: number, status: string) => {
    try {
      await api.client.patch(`/api/jobs/${job.id}/applicants/${appId}`, { status })
      setApplicants(prev => prev.map(a => a.application_id === appId ? { ...a, status } : a))
    } catch { /* ignore */ }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Arizalar</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{job.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-sahifa-500 animate-spin" />
            </div>
          ) : applicants.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Hozircha arizalar yo'q</p>
            </div>
          ) : applicants.map(app => (
            <div key={app.application_id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                  {app.applicant_photo
                    ? <img src={app.applicant_photo} alt={app.applicant_name || ''} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">
                        {(app.applicant_name || 'U')[0]}
                      </div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/profile/${app.applicant_id}`}
                    className="font-semibold text-sm text-gray-900 dark:text-white hover:text-sahifa-500 transition-colors"
                  >
                    {app.applicant_name || 'Foydalanuvchi'}
                  </Link>
                  {app.applicant_headline && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{app.applicant_headline}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  app.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : app.status === 'rejected' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {app.status === 'accepted' ? 'Qabul qilindi' : app.status === 'rejected' ? 'Rad etildi' : 'Ko\'rib chiqilmoqda'}
                </span>
              </div>
              {app.message && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{app.message}</p>
              )}
              {app.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(app.application_id, 'accepted')}
                    className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Qabul
                  </button>
                  <button
                    onClick={() => updateStatus(app.application_id, 'rejected')}
                    className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Rad
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Tab: All Jobs ──────────────────────────────────────────────────────────────

const AllJobsTab: React.FC<{ onApply: (job: Job) => void }> = ({ onApply }) => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jobType, setJobType] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const loadJobs = useCallback(async (reset = false) => {
    setLoading(true)
    const p = reset ? 1 : page
    try {
      const params = new URLSearchParams({ page: p.toString(), page_size: '12' })
      if (search) params.set('q', search)
      if (jobType) params.set('job_type', jobType)
      const res = await api.client.get(`/api/jobs?${params}`)
      const newJobs: Job[] = res.data.jobs || []
      setJobs(prev => reset ? newJobs : [...prev, ...newJobs])
      setHasMore(res.data.has_more ?? false)
      if (reset) setPage(1)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [search, jobType, page])

  useEffect(() => { loadJobs(true) }, [search, jobType])

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Lavozim, kompaniya..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sahifa-500/30 focus:border-sahifa-500 transition-all"
          />
        </div>
        <button
          onClick={() => setFilterOpen(v => !v)}
          className={`p-2.5 rounded-xl border transition-colors ${filterOpen
            ? 'bg-sahifa-500 border-sahifa-500 text-white'
            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex flex-wrap gap-2">
              <button
                onClick={() => setJobType('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !jobType ? 'bg-sahifa-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Barchasi
              </button>
              {Object.entries(JOB_TYPE_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setJobType(k === jobType ? '' : k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    jobType === k ? 'bg-sahifa-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job list */}
      {loading && jobs.length === 0 ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-7 h-7 text-sahifa-500 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-16 text-center text-slate-400 dark:text-slate-500">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Ish e'lonlari topilmadi</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onApply={onApply} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => { setPage(p => p + 1); loadJobs() }}
            disabled={loading}
            className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Ko\'proq ko\'rish'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Tab: Matched ───────────────────────────────────────────────────────────────

const MatchedTab: React.FC<{ onApply: (job: Job) => void }> = ({ onApply }) => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.client.get('/api/jobs/matched').then(r => {
      setJobs(r.data.jobs || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-sahifa-500 animate-spin" /></div>

  if (jobs.length === 0) return (
    <div className="py-16 text-center space-y-3 text-slate-400 dark:text-slate-500">
      <Sparkles className="w-12 h-12 mx-auto opacity-40" />
      <div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Ko'nikmalar yo'q</p>
        <p className="text-xs mt-1">Ko'nikmalaringizni profilingizga qo'shing — siz uchun mos ishlar topamiz.</p>
      </div>
      <Link to="/profile/me" className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-sahifa-500 hover:text-sahifa-600">
        Profilni to'ldirish <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Sizning ko'nikmalaringizga mos <span className="font-semibold text-gray-900 dark:text-white">{jobs.length}</span> ta ish e'loni topildi.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} showMatch onApply={onApply} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Tab: Mine ─────────────────────────────────────────────────────────────────

const MineTab: React.FC<{
  onEdit: (job: Job) => void
  onRefresh: () => void
  refreshKey: number
}> = ({ onEdit, onRefresh, refreshKey }) => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [applicantsJob, setApplicantsJob] = useState<Job | null>(null)

  useEffect(() => {
    setLoading(true)
    api.client.get('/api/jobs/mine').then(r => {
      setJobs(r.data.jobs || [])
    }).finally(() => setLoading(false))
  }, [refreshKey])

  const handleDelete = async (job: Job) => {
    if (!confirm(`"${job.title}" e'lonini o'chirishni tasdiqlaysizmi?`)) return
    try {
      await api.client.delete(`/api/jobs/${job.id}`)
      setJobs(prev => prev.filter(j => j.id !== job.id))
    } catch { /* ignore */ }
  }

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-sahifa-500 animate-spin" /></div>

  if (jobs.length === 0) return (
    <div className="py-16 text-center space-y-3 text-slate-400 dark:text-slate-500">
      <Building2 className="w-12 h-12 mx-auto opacity-40" />
      <div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Hali e'lon joylashilmagan</p>
        <p className="text-xs mt-1">Yangi ish e'loni joylashtiring va nomzodlar toping.</p>
      </div>
    </div>
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              isOwn
              onEdit={onEdit}
              onDelete={handleDelete}
              onViewApplicants={setApplicantsJob}
            />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {applicantsJob && (
          <ApplicantsModal job={applicantsJob} onClose={() => setApplicantsJob(null)} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TAB_CONFIG = [
  { key: 'all' as TabKey,     label: 'Barchasi',          icon: Briefcase },
  { key: 'matched' as TabKey, label: 'Menga mos',         icon: Sparkles  },
  { key: 'mine' as TabKey,    label: 'Mening e\'lonlarim', icon: Building2 },
]

const JobsPage: React.FC = () => {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [applyJob, setApplyJob] = useState<Job | null>(null)
  const [mineRefreshKey, setMineRefreshKey] = useState(0)

  const handleFormSaved = () => {
    setShowForm(false)
    setEditingJob(null)
    setMineRefreshKey(k => k + 1)
    setTab('mine')
  }

  const handleEdit = (job: Job) => {
    setEditingJob(job)
    setShowForm(true)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">Ish e'lonlari</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Ko'nikmalaringizga mos ishlarni toping</p>
        </div>
        {user && (
          <button
            onClick={() => { setEditingJob(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-sahifa-500 hover:bg-sahifa-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">E'lon qo'shish</span>
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6 w-fit">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-slate-900 text-sahifa-600 dark:text-sahifa-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'all'     && <AllJobsTab onApply={setApplyJob} />}
          {tab === 'matched' && <MatchedTab onApply={setApplyJob} />}
          {tab === 'mine'    && <MineTab onEdit={handleEdit} onRefresh={() => setMineRefreshKey(k => k + 1)} refreshKey={mineRefreshKey} />}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {(showForm || editingJob) && (
          <JobFormModal
            initial={editingJob}
            onClose={() => { setShowForm(false); setEditingJob(null) }}
            onSaved={handleFormSaved}
          />
        )}
        {applyJob && (
          <ApplyModal job={applyJob} onClose={() => setApplyJob(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

export default JobsPage
