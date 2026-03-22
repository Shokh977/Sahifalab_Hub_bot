import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import './styles/globals.css'

// ── Google Analytics 4 ────────────────────────────────────────────────────────
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined
if (GA_ID && !GA_ID.includes('XXXX')) {
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  function gtag(...args: any[]) { window.dataLayer.push(args) }
  gtag('js', new Date())
  gtag('config', GA_ID)
}

declare global {
  interface Window { dataLayer: any[] }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
)
