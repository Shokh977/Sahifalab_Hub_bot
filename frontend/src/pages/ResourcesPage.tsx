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

export const ResourcesPage: React.FC = () => {
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  const categories = [
    'all',
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
        setResources(response.data)
      } catch (error) {
        console.error('Failed to fetch resources:', error)
      } finally {
        setLoading(false)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          🔗 Foydali Linklar
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          External Resources & YouTube Links
        </p>
      </div>

      {/* Categories */}
      <div className="flex gap-2 flex-wrap overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300'
            }`}
          >
            {cat.replace('-', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {/* Resources List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">No resources found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResources.map((resource) => (
            <a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card hover:shadow-lg transition-all group"
            >
              <div className="flex gap-4">
                {/* Icon/Thumbnail */}
                <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded flex items-center justify-center text-2xl">
                  {getTypeIcon(resource.type)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                    {resource.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
                    {resource.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded">
                      {resource.category.replace('-', ' ')}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {resource.type === 'youtube' ? '📺 YouTube' : '🔗 Link'}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
                  →
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
