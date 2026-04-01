/**
 * TelegramLayout — thin wrapper for Telegram Mini App mode.
 *
 * Keeps all existing Telegram-specific behavior 100% unchanged:
 * - BackButton wiring (done by TelegramBackButtonHandler inside)
 * - tg.ready() / tg.expand() (done by useTelegramWebApp hook inside pages)
 * - Mobile-first max-w-md layout (each page handles its own width)
 *
 * This component intentionally has NO extra markup — it just provides
 * a semantic boundary so AppShell can cleanly switch between layouts.
 */
import React from 'react'

const TelegramLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen premium-shell transition-colors duration-300">
      {children}
    </div>
  )
}

export default TelegramLayout
