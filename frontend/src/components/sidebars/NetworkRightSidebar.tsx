import React from 'react'
import { Link } from 'react-router-dom'
import SidebarCard from './SidebarCard'
import SuggestionsWidget from './SuggestionsWidget'

const POPULAR_SKILLS = [
  'Python', 'React', 'Data Science', 'UX/UI Design',
  'FastAPI', 'TypeScript', 'SQL', 'Machine Learning',
]

const NetworkRightSidebar: React.FC = () => (
  <>
    <SuggestionsWidget />
    <SidebarCard title="Ko'nikmalar bo'yicha qidiring">
      <div className="flex flex-wrap gap-1.5">
        {POPULAR_SKILLS.map(skill => (
          <Link
            key={skill}
            to={`/network?skill=${encodeURIComponent(skill)}`}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.05] text-white/50 hover:bg-[#e8792f]/15 hover:text-[#e8792f] transition-colors"
          >
            {skill}
          </Link>
        ))}
      </div>
    </SidebarCard>
  </>
)

export default NetworkRightSidebar
