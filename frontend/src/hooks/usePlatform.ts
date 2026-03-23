/**
 * usePlatform — detects whether the app is running inside a Telegram Mini App
 * or a standard web browser.
 *
 * Detection logic:
 *   - Telegram client injects window.Telegram.WebApp and sets initData
 *     (a non-empty string) when opened via the Telegram app.
 *   - In a normal browser, window.Telegram is undefined or initData is empty.
 *
 * This hook is memoized — the platform never changes during a session.
 */
import { useMemo } from 'react'

export type Platform = 'telegram' | 'web'

export interface PlatformInfo {
  /** 'telegram' when opened inside Telegram, 'web' in a normal browser */
  platform: Platform
  /** true when running as a Telegram Mini App */
  isTelegram: boolean
  /** true when running in a regular browser */
  isWeb: boolean
}

export function usePlatform(): PlatformInfo {
  return useMemo(() => {
    const tg = window.Telegram?.WebApp
    // Telegram sets initData to a JWT-like string; in browsers it's empty/absent.
    // Also check initDataUnsafe.user as a fallback (e.g. Telegram desktop clients).
    const isTelegram = !!(
      tg && (tg.initData?.length > 0 || tg.initDataUnsafe?.user)
    )
    return {
      platform: isTelegram ? 'telegram' : 'web',
      isTelegram,
      isWeb: !isTelegram,
    }
  }, [])
}
