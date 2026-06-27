/**
 * PageWrapper — responsive page container.
 *
 * Telegram Mini App:  max-w-md  (390 px phone width, same as before)
 * Web browser:        max-w-6xl (1152 px, fills desktop content column)
 *
 * Also adjusts bottom-padding:
 *   Telegram → pb-24 (clears Telegram's bottom bar + keyboard)
 *   Web      → pb-8  (WebLayout has no floating overlay, just a flex bottom nav)
 *
 * Usage — replace every:
 *   <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-5">
 * with:
 *   <PageWrapper className="space-y-5">
 */
import React from 'react'
import { usePlatform } from '../hooks/usePlatform'

interface PageWrapperProps {
  children: React.ReactNode
  /** Extra Tailwind classes (e.g. "space-y-5"). Do NOT include max-w / pb / px / py here. */
  className?: string
  /** Override the default top padding (default: py-4) */
  topPadding?: string
}

const PageWrapper: React.FC<PageWrapperProps> = ({
  children,
  className = '',
  topPadding = 'py-4',
}) => {
  const { isTelegram } = usePlatform()

  return (
    <div
      className={[
        'mx-auto',
        topPadding,
        isTelegram ? 'w-full px-3 pb-24' : 'max-w-[1200px] px-4 sm:px-5 lg:px-8 pb-10',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

export default PageWrapper
