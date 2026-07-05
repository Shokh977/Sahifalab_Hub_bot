/**
 * ExperienceSection — LinkedIn-style work-experience timeline.
 * Display data comes from the main profile payload's `experiences[]` (works for
 * any viewer); add/edit/delete only ever shown for the profile owner and hit
 * the self-only /api/profile/me/experiences endpoints.
 */

import React, { useState } from 'react'
import { Briefcase, Plus, PenSquare, Trash2 } from 'lucide-react'
import api from '../../services/apiService'
import ExperienceModal, { type ExperienceItem } from './ExperienceModal'

const MONTHS_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

function formatMonth(value: string | null): string {
  if (!value) return ''
  const [y, m] = value.split('-')
  const idx = Number(m) - 1
  return idx >= 0 && idx < 12 ? `${MONTHS_UZ[idx]} ${y}` : y
}

interface ExperienceSectionProps {
  experiences: ExperienceItem[]
  isOwnProfile: boolean
}

const ExperienceSection: React.FC<ExperienceSectionProps> = ({ experiences: initial, isOwnProfile }) => {
  const [experiences, setExperiences] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ExperienceItem | null>(null)

  if (experiences.length === 0 && !isOwnProfile) return null

  const handleSaved = (item: ExperienceItem) => {
    setExperiences(prev => {
      const exists = prev.some(e => e.id === item.id)
      const next = exists ? prev.map(e => e.id === item.id ? item : e) : [item, ...prev]
      return [...next].sort((a, b) => {
        if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
        return (b.start_date ?? '').localeCompare(a.start_date ?? '')
      })
    })
  }

  const handleDelete = async (id: number) => {
    const prev = experiences
    setExperiences(prev.filter(e => e.id !== id))
    try {
      await api.client.delete(`/api/profile/me/experiences/${id}`)
    } catch {
      setExperiences(prev)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-sahifa-500" /> Ish tajribasi
        </h2>
        {isOwnProfile && (
          <button
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {experiences.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 text-center py-4">
          {isOwnProfile ? "Hali ish tajribasi qo'shilmagan. Yuqoridagi + tugmasini bosing." : ''}
        </p>
      ) : (
        <div className="space-y-5">
          {experiences.map(exp => (
            <div key={exp.id} className="flex gap-3 group/exp">
              <div className="w-9 h-9 rounded-xl bg-sahifa-500/10 border border-sahifa-500/20 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-sahifa-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{exp.title}</p>
                    <p className="text-sm text-gray-500 dark:text-white/50">{exp.company}</p>
                    <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">
                      {formatMonth(exp.start_date)} — {exp.is_current ? 'Hozirgi vaqt' : formatMonth(exp.end_date)}
                    </p>
                  </div>
                  {isOwnProfile && (
                    <div className="flex gap-1 opacity-0 group-hover/exp:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditing(exp); setModalOpen(true) }} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06]">
                        <PenSquare className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(exp.id)} className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {exp.description && (
                  <p className="text-sm text-gray-500 dark:text-white/50 mt-1.5 leading-relaxed whitespace-pre-line">{exp.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExperienceModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

export default ExperienceSection
