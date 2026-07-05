/**
 * RecentActivityPreview — compact 2-3 item preview, LinkedIn-style, replacing
 * the old full "Lenta" posts tab. `activity_type` has no display-ready text
 * from the backend, so this owns the type→label mapping (maintenance seam:
 * unmapped future types fall back to a generic label rather than erroring).
 */

import React from 'react'
import { Activity, Award, TrendingUp, Sparkles, BookOpen, Users, MessageSquare, Trophy } from 'lucide-react'

export interface ActivityItem {
  activity_type: string
  created_at: string
  metadata?: Record<string, any>
}

interface ActivityConfig {
  icon: React.ElementType
  label: (item: ActivityItem) => string
}

const ACTIVITY_CONFIG: Record<string, ActivityConfig> = {
  certificate_earned:   { icon: Award,          label: i => `"${i.metadata?.course_title ?? ''}" kursini yakunladi va sertifikat oldi` },
  level_up:             { icon: TrendingUp,     label: i => `${i.metadata?.level_name ?? ''} darajasiga yetdi` },
  skill_added:          { icon: Sparkles,       label: i => `"${i.metadata?.skill_name ?? ''}" ko'nikmasini qo'shdi` },
  course_enrolled:      { icon: BookOpen,       label: i => `"${i.metadata?.course_title ?? ''}" kursiga yozildi` },
  connection_made:      { icon: Users,          label: () => 'Yangi aloqa qo\'shdi' },
  post_created:         { icon: MessageSquare,  label: () => 'Yangi post joyladi' },
  achievement_unlocked: { icon: Trophy,         label: i => `"${i.metadata?.achievement_name ?? ''}" yutug'ini qo'lga kiritdi` },
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days <= 0) return 'Bugun'
  if (days === 1) return 'Kecha'
  if (days < 30) return `${days} kun oldin`
  const months = Math.floor(days / 30)
  return `${months} oy oldin`
}

interface RecentActivityPreviewProps {
  activity: ActivityItem[]
}

const RecentActivityPreview: React.FC<RecentActivityPreviewProps> = ({ activity }) => {
  if (activity.length === 0) return null
  const items = activity.slice(0, 3)

  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none p-6">
      <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-sahifa-500" /> So'nggi faoliyat
      </h2>

      <div className="space-y-3">
        {items.map((item, i) => {
          const config = ACTIVITY_CONFIG[item.activity_type]
          const Icon = config?.icon ?? Activity
          const label = config ? config.label(item) : 'Faoliyat'
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-sahifa-500/10 border border-sahifa-500/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-sahifa-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-700 dark:text-white/70 leading-snug">{label}</p>
                <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">{timeAgo(item.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default RecentActivityPreview
