import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SidebarCard from './SidebarCard'

const PRICE_FILTERS = [
  { label: 'Bepul', value: 'free' },
  { label: 'Pullik', value: 'paid' },
]

const LEVEL_FILTERS = [
  { label: "Boshlang'ich", value: 'beginner' },
  { label: "O'rta",        value: 'intermediate' },
  { label: 'Yuqori',       value: 'advanced' },
]

const POPULAR_SKILLS = ['Python', 'React', 'JavaScript', 'Data Science', 'UX Design', 'SQL']

const CoursesRightSidebar: React.FC = () => {
  const [params] = useSearchParams()

  return (
    <>
      <SidebarCard title="Filtrlash">
        <div className="space-y-4">
          {/* Price */}
          <div>
            <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wider mb-1.5">Narx</p>
            <div className="flex gap-1.5">
              {PRICE_FILTERS.map(({ label, value }) => (
                <Link
                  key={value}
                  to={`/courses?price=${value}`}
                  className={`flex-1 text-center px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    params.get('price') === value
                      ? 'bg-[#e8792f] text-white'
                      : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Level */}
          <div>
            <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wider mb-1.5">Daraja</p>
            <div className="space-y-1">
              {LEVEL_FILTERS.map(({ label, value }) => (
                <Link
                  key={value}
                  to={`/courses?level=${value}`}
                  className={`flex items-center px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    params.get('level') === value
                      ? 'bg-[#e8792f]/15 text-[#e8792f] font-medium'
                      : 'text-white/50 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </SidebarCard>

      <SidebarCard title="Ommabop ko'nikmalar">
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_SKILLS.map(skill => (
            <Link
              key={skill}
              to={`/courses?skill=${encodeURIComponent(skill)}`}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.05] text-white/50 hover:bg-[#e8792f]/15 hover:text-[#e8792f] transition-colors"
            >
              {skill}
            </Link>
          ))}
        </div>
      </SidebarCard>
    </>
  )
}

export default CoursesRightSidebar
