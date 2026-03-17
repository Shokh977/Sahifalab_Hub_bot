/**
 * themeStore — Zustand store for Dark/Light mode.
 *
 * Priority:
 *   1. localStorage preference (if user already toggled)
 *   2. Telegram WebApp colorScheme
 *   3. Default: 'dark'
 *
 * Applies 'dark' class on <html> element for Tailwind's `dark:` variants.
 */

import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

function getInitialTheme(): Theme {
  // 1. Check localStorage
  const stored = localStorage.getItem('sahifalab-theme') as Theme | null
  if (stored === 'light' || stored === 'dark') return stored

  // 2. Check Telegram WebApp colorScheme
  try {
    const tgScheme = window.Telegram?.WebApp?.colorScheme
    if (tgScheme === 'light' || tgScheme === 'dark') return tgScheme
  } catch { /* ignore */ }

  // 3. System preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }

  return 'dark'
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
    html.classList.remove('light')
  } else {
    html.classList.remove('dark')
    html.classList.add('light')
  }
  html.style.colorScheme = theme
  localStorage.setItem('sahifalab-theme', theme)
}

// Apply immediately on load (before React mounts)
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },
  toggle: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return { theme: next }
    })
  },
}))
