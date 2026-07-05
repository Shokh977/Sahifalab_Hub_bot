/**
 * SkillsSection — pill list with endorsement counts.
 * Display data comes from the main profile payload's `skills[]` (works for any
 * viewer). Add/delete only for the owner; endorse only for visitors (can't
 * endorse your own skill — backend returns 400).
 */

import React, { useState } from 'react'
import { Sparkles, Plus, Trash2, ThumbsUp, BadgeCheck } from 'lucide-react'
import api from '../../services/apiService'
import AddSkillModal from './AddSkillModal'

export interface SkillItem {
  id: number
  skill_name: string
  is_verified: boolean
  endorsement_count: number
  display_order?: number
}

interface SkillsSectionProps {
  skills: SkillItem[]
  isOwnProfile: boolean
}

const SkillsSection: React.FC<SkillsSectionProps> = ({ skills: initial, isOwnProfile }) => {
  const [skills, setSkills] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [endorsedIds, setEndorsedIds] = useState<Set<number>>(new Set())

  if (skills.length === 0 && !isOwnProfile) return null

  const handleAdded = (item: SkillItem) => setSkills(prev => [...prev, item])

  const handleDelete = async (id: number) => {
    const prev = skills
    setSkills(prev.filter(s => s.id !== id))
    try {
      await api.client.delete(`/api/skills/${id}`)
    } catch {
      setSkills(prev)
    }
  }

  const handleEndorse = async (id: number) => {
    try {
      const res = await api.client.post(`/api/skills/${id}/endorse`)
      setSkills(prev => prev.map(s => s.id === id ? { ...s, endorsement_count: res.data.endorsement_count } : s))
      setEndorsedIds(prev => {
        const next = new Set(prev)
        if (res.data.endorsed) next.add(id); else next.delete(id)
        return next
      })
    } catch {
      // 400 for own skill, or network error — no-op
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sahifa-500" /> Ko'nikmalar
        </h2>
        {isOwnProfile && (
          <button
            onClick={() => setModalOpen(true)}
            className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 text-center py-4">
          {isOwnProfile ? "Hali ko'nikma qo'shilmagan. Yuqoridagi + tugmasini bosing." : ''}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {skills.map(skill => (
            <div
              key={skill.id}
              className="group/skill inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-gray-100 dark:bg-white/[0.05] border border-gray-200/60 dark:border-white/[0.08]"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-white/80">{skill.skill_name}</span>
              {skill.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />}
              {skill.endorsement_count > 0 && (
                <span className="text-xs text-gray-400 dark:text-white/40">{skill.endorsement_count}</span>
              )}

              {isOwnProfile ? (
                <button onClick={() => handleDelete(skill.id)} className="ml-1 p-0.5 rounded-full text-gray-400 opacity-0 group-hover/skill:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={() => handleEndorse(skill.id)}
                  title="Tasdiqlash"
                  className={`ml-1 p-0.5 rounded-full transition-colors ${endorsedIds.has(skill.id) ? 'text-sahifa-500' : 'text-gray-400 hover:text-sahifa-500'}`}
                >
                  <ThumbsUp className="w-3 h-3" fill={endorsedIds.has(skill.id) ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddSkillModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={handleAdded} />
    </div>
  )
}

export default SkillsSection
