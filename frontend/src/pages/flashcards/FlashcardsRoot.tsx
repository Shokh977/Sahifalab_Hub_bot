import React from 'react'
import { useThemeStore } from '../../context/themeStore'
import './flashcards.css'

/** Scopes the .fc design-system CSS vars to whichever theme the rest of the
 * site is already in (src/context/themeStore.ts) — see flashcards.css. */
const FlashcardsRoot: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const { theme } = useThemeStore()
  return (
    <div className={`fc fc-main${className ? ` ${className}` : ''}`} data-theme={theme}>
      {children}
    </div>
  )
}

export default FlashcardsRoot
