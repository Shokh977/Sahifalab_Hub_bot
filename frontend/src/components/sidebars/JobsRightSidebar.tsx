import React from 'react'
import { Link } from 'react-router-dom'
import SidebarCard from './SidebarCard'
import { useAuth } from '../../context/AuthContext'

// Common skills seen in job postings — used to suggest missing skills
const MARKET_SKILLS: Array<{ skill: string; courseId: number | null }> = [
  { skill: 'Python',             courseId: 1 },
  { skill: 'React',              courseId: 2 },
  { skill: 'Data Science',       courseId: null },
  { skill: 'Project Management', courseId: null },
  { skill: 'SQL',                courseId: null },
  { skill: 'UX/UI Design',       courseId: null },
]

const JobsRightSidebar: React.FC = () => {
  const { user } = useAuth()
  const rawSkills: any[] = (user as any)?.skills ?? []
  const userSkillNames = new Set(
    rawSkills.map((s: any) => (s.skill_name || s.name || '').toLowerCase())
  )

  const missingSkills = MARKET_SKILLS.filter(
    s => !userSkillNames.has(s.skill.toLowerCase())
  )

  return (
    <>
      <SidebarCard title="Sizning ko'nikmalaringiz">
        {rawSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rawSkills.slice(0, 8).map((s: any, i: number) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#e8792f]/10 text-[#e8792f]"
              >
                {s.skill_name || s.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/30 leading-relaxed">
            Ko'nikmalar qo'shish uchun{' '}
            <Link to="/profile/me" className="text-[#e8792f] hover:underline">
              profilingizga
            </Link>{' '}
            o'ting.
          </p>
        )}
      </SidebarCard>

      {missingSkills.length > 0 && (
        <SidebarCard title="Yetishmayotgan ko'nikmalar">
          <div className="space-y-2.5">
            {missingSkills.slice(0, 5).map(({ skill, courseId }) => (
              <div key={skill} className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/60 truncate">{skill}</span>
                {courseId ? (
                  <Link
                    to={`/courses/${courseId}`}
                    className="flex-shrink-0 text-[11px] text-[#e8792f] hover:underline"
                  >
                    Kursga o'tish →
                  </Link>
                ) : (
                  <Link
                    to={`/courses?skill=${encodeURIComponent(skill)}`}
                    className="flex-shrink-0 text-[11px] text-white/30 hover:text-white/50"
                  >
                    Kurslar →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </SidebarCard>
      )}
    </>
  )
}

export default JobsRightSidebar
