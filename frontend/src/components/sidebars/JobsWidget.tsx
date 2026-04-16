import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase } from 'lucide-react'
import SidebarCard from './SidebarCard'
import api from '../../services/apiService'

interface Job { id: number; title: string; company_name?: string; location?: string }

const JobsWidget: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    api.client.get('/api/jobs', { params: { page: 1, page_size: 2 } })
      .then(r => {
        const raw = r.data
        const list = Array.isArray(raw.jobs) ? raw.jobs : Array.isArray(raw) ? raw : []
        setJobs(list.slice(0, 2))
      })
      .catch(() => {})
  }, [])

  if (!jobs.length) return null

  return (
    <SidebarCard
      title="Yangi ish o'rinlari"
      action={
        <Link to="/jobs" className="text-[11px] text-[#e8792f]/70 hover:text-[#e8792f] transition-colors">
          Barchasini →
        </Link>
      }
    >
      <div className="space-y-2.5">
        {jobs.map(job => (
          <Link key={job.id} to="/jobs" className="flex items-start gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Briefcase className="w-3.5 h-3.5 text-white/30" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate transition-colors leading-tight" style={{ color: 'var(--text-secondary)' }}>
                {job.title}
              </p>
              {(job.company_name || job.location) && (
                <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {[job.company_name, job.location].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </SidebarCard>
  )
}

export default JobsWidget
