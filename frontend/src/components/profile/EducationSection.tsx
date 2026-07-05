/**
 * EducationSection — LinkedIn-style education list.
 * Display data comes from the main profile payload's `education[]`; add/edit/
 * delete only ever shown for the profile owner, hitting /api/profile/me/education.
 */

import React, { useState } from 'react'
import { GraduationCap, Plus, PenSquare, Trash2 } from 'lucide-react'
import api from '../../services/apiService'
import EducationModal, { type EducationItem } from './EducationModal'

interface EducationSectionProps {
  education: EducationItem[]
  isOwnProfile: boolean
}

const EducationSection: React.FC<EducationSectionProps> = ({ education: initial, isOwnProfile }) => {
  const [education, setEducation] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EducationItem | null>(null)

  if (education.length === 0 && !isOwnProfile) return null

  const handleSaved = (item: EducationItem) => {
    setEducation(prev => {
      const exists = prev.some(e => e.id === item.id)
      const next = exists ? prev.map(e => e.id === item.id ? item : e) : [item, ...prev]
      return [...next].sort((a, b) => (b.end_year ?? 9999) - (a.end_year ?? 9999))
    })
  }

  const handleDelete = async (id: number) => {
    const prev = education
    setEducation(prev.filter(e => e.id !== id))
    try {
      await api.client.delete(`/api/profile/me/education/${id}`)
    } catch {
      setEducation(prev)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-sahifa-500" /> Ta'lim
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

      {education.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 text-center py-4">
          {isOwnProfile ? "Hali ta'lim ma'lumoti qo'shilmagan. Yuqoridagi + tugmasini bosing." : ''}
        </p>
      ) : (
        <div className="space-y-5">
          {education.map(edu => (
            <div key={edu.id} className="flex gap-3 group/edu">
              <div className="w-9 h-9 rounded-xl bg-sahifa-500/10 border border-sahifa-500/20 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-sahifa-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{edu.school}</p>
                    {(edu.degree || edu.field_of_study) && (
                      <p className="text-sm text-gray-500 dark:text-white/50">
                        {[edu.degree, edu.field_of_study].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {(edu.start_year || edu.end_year) && (
                      <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">
                        {edu.start_year ?? ''}{edu.start_year && edu.end_year ? ' — ' : ''}{edu.end_year ?? ''}
                      </p>
                    )}
                  </div>
                  {isOwnProfile && (
                    <div className="flex gap-1 opacity-0 group-hover/edu:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditing(edu); setModalOpen(true) }} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06]">
                        <PenSquare className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(edu.id)} className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {edu.description && (
                  <p className="text-sm text-gray-500 dark:text-white/50 mt-1.5 leading-relaxed whitespace-pre-line">{edu.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <EducationModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

export default EducationSection
