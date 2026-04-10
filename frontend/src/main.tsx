import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient } from './lib/queryClient'
import App from './App'
import './styles/globals.css'
import { DEV_MOCK, initMockAuth, seedSupabaseCache } from './lib/mockAdapter'

// ── Option A: Runtime console override (safety net) ───────────────────────────
// Build-time esbuild.drop handles 99.9% of cases, but dynamically-constructed
// console calls (e.g. console[level](...)) can't be statically stripped.
// This runtime noop catches those edge cases. Runs before anything else.
if (import.meta.env.PROD) {
  const noop = () => {}
  const methods = ['log', 'debug', 'info', 'warn', 'error', 'time', 'timeEnd', 'timeLog', 'trace', 'dir', 'table', 'group', 'groupEnd', 'count', 'countReset', 'assert', 'profile', 'profileEnd'] as const
  methods.forEach(m => { (console as any)[m] = noop })
}

if (DEV_MOCK) {
  initMockAuth()
  seedSupabaseCache()
}

// ── Google Analytics 4 ────────────────────────────────────────────────────────
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined
if (GA_ID && !GA_ID.includes('XXXX')) {
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: any[]) { window.dataLayer.push(args) }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, { send_page_view: false }) // we send page views manually on route change
}

declare global {
  interface Window { dataLayer: any[] }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </QueryClientProvider>
    <Analytics />
  </React.StrictMode>
)
