import { useEffect, useState } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

interface BackButton {
  isVisible: boolean
  show: () => void
  hide: () => void
  onClick: (callback: () => void) => void
  offClick: (callback: () => void) => void
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    [key: string]: unknown
  }
  ready: () => void
  expand: () => void
  close: () => void
  BackButton: BackButton
  onEvent: (event: string, callback: () => void) => void
  offEvent: (event: string, callback: () => void) => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}

export const useTelegramWebApp = () => {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)
  const [user, setUser] = useState<TelegramUser | null>(null)

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp
      tg.ready()
      tg.expand()
      setWebApp(tg)
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user)
      }
    }
  }, [])

  return { webApp, user }
}

/**
 * Wires the Telegram BackButton to React Router.
 * Shows the back button on any page except home ("/"),
 * and navigates back when pressed instead of closing the app.
 */
export const useTelegramBackButton = (isHome: boolean, onBack: () => void) => {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.BackButton) return

    if (isHome) {
      tg.BackButton.hide()
    } else {
      tg.BackButton.show()
      tg.BackButton.onClick(onBack)
    }

    return () => {
      tg.BackButton.offClick(onBack)
    }
  }, [isHome, onBack])
}

export const useTelegramInitData = () => {
  const [initData, setInitData] = useState<string>('')

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      setInitData(window.Telegram.WebApp.initData)
    }
  }, [])

  return initData
}
