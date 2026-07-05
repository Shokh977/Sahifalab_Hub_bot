/**
 * CertificatesSection — grid of earned course certificates.
 * Read-only everywhere (certificates are issued by course completion, never
 * manually added) — data comes straight from the main profile payload.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Award } from 'lucide-react'

export interface CertificateItem {
  id: number
  certificate_id: string
  course_title: string
  score: number
  issued_at: string | null
  share_token: string | null
}

interface CertificatesSectionProps {
  certificates: CertificateItem[]
}

const CertificatesSection: React.FC<CertificatesSectionProps> = ({ certificates }) => {
  if (certificates.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-sahifa-500" /> Sertifikatlar
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {certificates.map(cert => {
          const content = (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/[0.06] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
              <div className="w-10 h-10 rounded-lg bg-sahifa-500/10 border border-sahifa-500/20 flex items-center justify-center flex-shrink-0">
                <Award className="w-5 h-5 text-sahifa-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{cert.course_title}</p>
                <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                  {cert.score}% · {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('uz-UZ') : ''}
                </p>
              </div>
            </div>
          )
          return cert.share_token
            ? <Link key={cert.id} to={`/certificate/${cert.share_token}`}>{content}</Link>
            : <div key={cert.id}>{content}</div>
        })}
      </div>
    </div>
  )
}

export default CertificatesSection
