import React from 'react'
import { useNavigate } from 'react-router-dom'

interface MenuItem {
  id: string
  icon: string
  title: string
  titleUz: string
  description: string
  path: string
  color: string
  bgGradient: string
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'study',
    icon: '🎯',
    title: 'Study With Me',
    titleUz: "O'qish",
    description: 'Focus timer + ambient sounds',
    path: '/study',
    color: 'from-blue-500 to-blue-600',
    bgGradient: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
  },
  {
    id: 'quiz',
    icon: '📝',
    title: 'Quiz',
    titleUz: 'Test',
    description: 'Book-based tests',
    path: '/quiz',
    color: 'from-purple-500 to-purple-600',
    bgGradient: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
  },
  {
    id: 'kitoblar',
    icon: '📚',
    title: 'Kitoblar',
    titleUz: 'Kitoblar',
    description: 'Free & Paid PDFs',
    path: '/kitoblar',
    color: 'from-amber-500 to-amber-600',
    bgGradient: 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20',
  },
  {
    id: 'foydaliLinklar',
    icon: '🔗',
    title: 'Foydali Linklar',
    titleUz: 'Resurslar',
    description: 'Resources & Videos',
    path: '/resources',
    color: 'from-emerald-500 to-emerald-600',
    bgGradient: 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20',
  },
  {
    id: 'about',
    icon: '👤',
    title: 'Biz Haqimuzda',
    titleUz: 'Haqimizda',
    description: "Sam's Story",
    path: '/about',
    color: 'from-pink-500 to-pink-600',
    bgGradient: 'bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20',
  },
]

export const MenuGrid: React.FC = () => {
  const navigate = useNavigate()

  const handleMenuClick = (path: string) => {
    navigate(path)
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:gap-6">
      {MENU_ITEMS.slice(0, 4).map((item) => (
        <button
          key={item.id}
          onClick={() => handleMenuClick(item.path)}
          className={`${item.bgGradient} p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-sahifa-500 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg`}
        >
          <div className="text-center space-y-2">
            <div className="text-4xl md:text-5xl">{item.icon}</div>
            <h3 className="font-bold text-sm md:text-base text-gray-900 dark:text-white">
              {item.title}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {item.description}
            </p>
          </div>
        </button>
      ))}

      {/* Full-width About Section */}
      <button
        onClick={() => handleMenuClick(MENU_ITEMS[4].path)}
        className={`${MENU_ITEMS[4].bgGradient} p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-sahifa-500 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg col-span-2`}
      >
        <div className="flex items-center gap-4">
          <div className="text-4xl md:text-5xl">{MENU_ITEMS[4].icon}</div>
          <div className="text-left">
            <h3 className="font-bold text-sm md:text-base text-gray-900 dark:text-white">
              {MENU_ITEMS[4].title}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {MENU_ITEMS[4].description}
            </p>
          </div>
        </div>
      </button>
    </div>
  )
}

export default MenuGrid
