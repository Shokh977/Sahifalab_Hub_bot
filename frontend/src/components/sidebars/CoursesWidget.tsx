import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import SidebarCard from './SidebarCard'
import api from '../../services/apiService'

interface Course { id: number; title: string; thumbnail_url?: string; enrolled_count?: number }

const CoursesWidget: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    api.client.get('/api/courses', { params: { page: 1, page_size: 2, sort: 'popular' } })
      .then(r => {
        const raw = r.data
        const list = Array.isArray(raw.courses) ? raw.courses : Array.isArray(raw) ? raw : []
        setCourses(list.slice(0, 2))
      })
      .catch(() => {})
  }, [])

  if (!courses.length) return null

  return (
    <SidebarCard
      title="Ommabop kurslar"
      action={
        <Link to="/courses" className="text-[11px] text-[#e8792f]/70 hover:text-[#e8792f] transition-colors">
          Barchasini →
        </Link>
      }
    >
      <div className="space-y-2.5">
        {courses.map(c => (
          <Link key={c.id} to={`/courses/${c.id}`} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white/20" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium line-clamp-2 transition-colors leading-tight" style={{ color: 'var(--text-secondary)' }}>
                {c.title}
              </p>
              {c.enrolled_count !== undefined && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.enrolled_count.toLocaleString()} o'quvchi</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </SidebarCard>
  )
}

export default CoursesWidget
