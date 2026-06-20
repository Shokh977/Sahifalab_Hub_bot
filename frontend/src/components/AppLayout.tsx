/**
 * AppLayout — shared 2-column content shell used by every main page.
 *
 * Renders inside WebLayout's <main> scroll area:
 *   ┌───────────────────────────────────────────────────────┐
 *   │  CENTER CONTENT (flex-1, maxWidth)   │  RIGHT (280px) │
 *   │  {children}                          │  {rightSidebar}│
 *   └───────────────────────────────────────────────────────┘
 *
 * Right sidebar is hidden on screens < xl (1280px).
 * When rightSidebar is null the center column expands full-width.
 */

import React from 'react'

interface AppLayoutProps {
  /** Main page content — constrained to maxWidth */
  children: React.ReactNode
  /** Optional right sidebar. Pass null/undefined for full-width pages. */
  rightSidebar?: React.ReactNode
  /**
   * Tailwind max-width class for the center column, e.g. "max-w-[680px]".
   * Omit for full-width center (messages, etc.).
   */
  maxWidth?: string
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, rightSidebar, maxWidth }) => (
  <div className="min-h-full pb-28">
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6">
      <div className="flex gap-6 items-start">

        {/* ── Center column ── */}
        {rightSidebar ? (
          <div className={`flex-1 min-w-0 ${maxWidth ?? ''}`}>
            {children}
          </div>
        ) : (
          <div className={`w-full mx-auto ${maxWidth ?? ''}`}>
            {children}
          </div>
        )}

        {/* ── Right sidebar (xl only, hidden on mobile/tablet) ── */}
        {rightSidebar && (
          <aside className="hidden xl:flex flex-col gap-4 w-[280px] flex-shrink-0 sticky top-6">
            {rightSidebar}
          </aside>
        )}

      </div>
    </div>
  </div>
)

export default AppLayout
