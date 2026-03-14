import { useEffect, useState } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramWebApp {
  initData: string
  user?: TelegramUser
  ready: () => void
  expand: () => void
  close: () => void
  onEvent: (event: string, callback: () => void) => void
  offEvent: (event: string, callback: () => void) => void
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
      if (tg.user) {
        setUser(tg.user)
      }
    }
  }, [])

  return { webApp, user }
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
