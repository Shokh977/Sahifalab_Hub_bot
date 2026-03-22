/// <reference types="vite/client" />

declare module 'qrcode'

declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}
