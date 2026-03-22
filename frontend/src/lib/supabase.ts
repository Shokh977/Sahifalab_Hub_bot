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

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT SUPABASE READ QUERIES
// All public reads go straight to Supabase (~100ms) instead of through
// the Vercel backend (~3-5s cold start). Writes still go through backend.
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch all quizzes (list view — no questions) */
export async function fetchQuizzes() {
  const { data, error } = await supabase
    .from('quiz')
    .select('id, title, book_title, total_questions, difficulty, category, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Fetch a single quiz with its questions.
 * SECURITY: correct_answer is deliberately excluded — scoring is server-side only.
 */
export async function fetchQuiz(quizId: number) {
  const [quizRes, questionsRes] = await Promise.all([
    supabase
      .from('quiz')
      .select('id, title, book_title, description, difficulty, category, total_questions')
      .eq('id', quizId)
      .single(),
    supabase
      .from('quiz_question')
      .select('id, question, options, explanation, "order"')
      .eq('quiz_id', quizId)
      .order('order', { ascending: true }),
  ])
  if (quizRes.error) throw quizRes.error
  if (questionsRes.error) throw questionsRes.error

  const questions = (questionsRes.data ?? []).map((q: any) => ({
    id: q.id,
    question: q.question,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options ?? []),
    explanation: q.explanation,
    // correct_answer deliberately NOT included
  }))

  return { ...quizRes.data, questions }
}

/** Fetch all books */
export async function fetchBooks() {
  const { data, error } = await supabase
    .from('book')
    .select('id, title, author, description, price, is_paid, file_url, thumbnail_url, category, downloads, rating, is_available, created_at')
    .eq('is_available', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Fetch a single book by ID */
export async function fetchBook(bookId: number) {
  const { data, error } = await supabase
    .from('book')
    .select('id, title, author, description, price, is_paid, file_url, thumbnail_url, category, downloads, rating, is_available')
    .eq('id', bookId)
    .single()
  if (error) throw error
  return data
}

/** Fetch random active hero content */
export async function fetchHeroContent() {
  const { data, error } = await supabase
    .from('hero_content')
    .select('id, title, subtitle, description, image_url, cta_text, cta_link, is_active')
    .eq('is_active', true)
    .limit(10)
  if (error) throw error
  if (!data || data.length === 0) return null
  // Pick one at random client-side (PostgREST doesn't support random())
  const item = data[Math.floor(Math.random() * data.length)]
  return {
    ...item,
    text: item.title || item.description || '',
    author: item.subtitle || 'SAHIFALAB',
    quote_type: item.cta_link ? 'announcement' : 'quote',
  }
}

/** Fetch all resources */
export async function fetchResources() {
  const { data, error } = await supabase
    .from('resource')
    .select('id, title, description, url, resource_type, category, thumbnail_url')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Fetch active ambient sounds */
export async function fetchAmbientSounds() {
  const { data, error } = await supabase
    .from('ambient_sound')
    .select('id, name, emoji, url, display_order, is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Fetch user's rating for a specific book */
export async function fetchMyRating(bookId: number, telegramId: number) {
  const { data, error } = await supabase
    .from('book_rating')
    .select('rating')
    .eq('book_id', bookId)
    .eq('telegram_id', telegramId)
    .maybeSingle()
  if (error) throw error
  return data?.rating ?? 0
}

// ═══════════════════════════════════════════════════════════════════════════
// CABINET PAGE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch user's completed quizzes (for certificates) */
export async function fetchMyCompletedQuizzes(telegramId: number) {
  const { data, error } = await supabase
    .from('user_quiz_completion')
    .select('id, quiz_id, score, total, percentage, completed_at')
    .eq('telegram_id', telegramId)
    .order('completed_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Fetch quiz titles for a list of quiz IDs (for certificate display) */
export async function fetchQuizTitles(quizIds: number[]) {
  if (quizIds.length === 0) return []
  const { data, error } = await supabase
    .from('quiz')
    .select('id, title, book_title')
    .in('id', quizIds)
  if (error) throw error
  return data ?? []
}

/** Fetch user's purchased books (completed purchases only) */
export async function fetchMyPurchasedBooks(telegramId: number) {
  const { data, error } = await supabase
    .from('book_purchase')
    .select('id, book_id, amount, currency, status, completed_at')
    .eq('telegram_id', telegramId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Fetch book details for a list of book IDs */
export async function fetchBooksByIds(bookIds: number[]) {
  if (bookIds.length === 0) return []
  const { data, error } = await supabase
    .from('book')
    .select('id, title, author, thumbnail_url, category, file_url')
    .in('id', bookIds)
  if (error) throw error
  return data ?? []
}
