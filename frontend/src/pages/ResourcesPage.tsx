import React, { useState, useEffect } from 'react'
import apiService from '@services/apiService'

interface Resource {
  id: number
  title: string
  description: string
  url: string
  type: 'youtube' | 'link' | 'course'
  category: string
  thumbnail?: string
}

const DEFAULT_RESOURCES: Resource[] = [
  {
    id: 1001,
    title: 'SAHIFALAB Telegram Channel',
    description: 'Rasmiy Telegram kanalimiz',
    url: 'https://t.me/sahifalab1',
    type: 'link',
    category: 'social',
  },
  {
    id: 1002,
    title: 'SAHIFALAB Instagram',
    description: 'Instagram sahifamiz',
    url: 'https://www.instagram.com/sahifalab?utm_source=qr&igsh=cGQ1NXNudXZ3NDNj',
    type: 'link',
    category: 'social',
  },
  {
    id: 1003,
    title: 'SAHIFALAB YouTube',
    description: 'YouTube kanalimiz',
    url: 'http://www.youtube.com/@SahifaLab',
    type: 'youtube',
    category: 'social',
  },
  {
    id: 1004,
    title: 'SAHIFALAB Email',
    description: 'Biz bilan email orqali bog\'laning',
    url: 'mailto:sahifalab@gmail.com',
    type: 'link',
    category: 'social',
  },
  {
    id: 1005,
    title: 'SAHIFALAB TikTok',
    description: 'TikTok sahifamiz',
    url: 'https://www.tiktok.com/@sahifalab?_r=1&_t=ZS-94ldMgz986i',
    type: 'link',
    category: 'social',
  },
]

export const ResourcesPage: React.FC = () => {
  const [resources, setResources] = useState<Resource[]>(DEFAULT_RESOURCES)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(false)

  const categories = [
    'all',
    'social',
    'programming',
    'languages',
    'science',
    'business',
    'personal-development',
  ]

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await apiService.getResources()
        if (Array.isArray(response.data) && response.data.length > 0) {
          const normalized = response.data.map((item: any, index: number) => ({
            id: item.id ?? 2000 + index,
            title: item.title,
            description: item.description,
            url: item.url,
            type: (item.resource_type ?? item.type ?? 'link') as Resource['type'],
            category: item.category ?? 'other',
            thumbnail: item.thumbnail_url ?? item.thumbnail,
          }))
          setResources([...DEFAULT_RESOURCES, ...normalized])
        }
      } catch (error) {
        console.error('Failed to fetch resources:', error)
      }
    }

    fetchResources()
  }, [])

  const filteredResources = resources.filter((resource) => {
    if (selectedCategory === 'all') return true
    return resource.category === selectedCategory
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'youtube':
        return '📺'
      case 'course':
        return '🎓'
      default:
        return '🔗'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'youtube':
        return 'YouTube'
      case 'course':
        return 'Course'
      default:
        return 'Link'
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-5">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-md">
        <h1 className="text-2xl font-bold">🔗 Foydali Linklar</h1>
        <p className="text-sm text-emerald-50 mt-1">
          SAHIFALAB rasmiy sahifalari va foydali manbalar
        </p>
      </div>

      {/* Categories */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
            }`}
          >
            {cat === 'all' ? 'Hammasi' : cat.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Resources List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 animate-pulse">
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            </div>
          ))}
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-700">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-gray-600 dark:text-gray-400">Hozircha linklar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResources.map((resource) => (
            <a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-700 transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Icon/Thumbnail */}
                <div className="flex-shrink-0 w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-xl">
                  {getTypeIcon(resource.type)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {resource.category.replace('-', ' ')}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {getTypeLabel(resource.type)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {resource.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {resource.description}
                  </p>
                </div>

                {/* Arrow */}
                <div className="flex items-center text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                  ↗
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResourcesPage
