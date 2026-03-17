import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** True only when both env vars are present and not placeholder values */
export const isSupabaseConfigured =
  !!(SUPABASE_URL && SUPABASE_ANON &&
     !SUPABASE_URL.includes('placeholder') &&
     SUPABASE_ANON !== 'placeholder')

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
    'Progress will not be persisted. Add both vars to your .env / Vercel env settings.',
  )
}

/** Shared Supabase browser client (singleton). */
export const supabase = createClient(
  SUPABASE_URL  ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON ?? 'placeholder',
  {
    auth: { persistSession: false },  // no Supabase Auth — Telegram handles identity
  },
)
