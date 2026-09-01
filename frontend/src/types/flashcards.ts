/**
 * Flashcard types — mirrors backend/app/api/v1/endpoints/flashcards.py and
 * the mobile app's lib/types.ts (trimmed to the core deck/card/study surface;
 * the public deck library types aren't ported here).
 */

export type CardStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

export interface FlashcardDeck {
  id: number
  user_id: number
  title: string
  description: string | null
  color: string
  icon: string | null
  card_count: number
  mastered_count: number
  is_public: boolean
  course_id: number | null
  due_count: number
  created_at: string | null
  updated_at: string | null
}

export interface Flashcard {
  id: number
  deck_id: number
  front_text: string
  back_text: string
  position: number
  ease_factor: number
  interval_days: number
  repetitions: number
  next_review: string | null
  last_reviewed: string | null
  status: CardStatus
  created_at: string | null
}

export interface FlashcardStats {
  total_decks: number
  total_cards: number
  total_mastered: number
  total_due: number
  today_reviewed: number
}

export interface StudySession {
  cards: Flashcard[]
  total: number
  due_count: number
  new_count: number
}

export interface ReviewResult {
  ok: boolean
  new_status: CardStatus
  next_review: string | null
  interval_days: number
  xp_awarded: number
  deck_bonus_xp: number
  newly_mastered: boolean
}

export interface CompleteSessionResult {
  ok: boolean
  xp_awarded: number
  flash_minutes: number
  today_minutes: number
  streak_days: number
  goal_met: boolean
  stages_completed: Array<{ key: string; stage_number: number; title: string; bonus_xp: number; bonus_tanga: number }>
  challenges_completed: Array<{ challenge_id: string; slug: string; title: string; reward_xp: number }>
}

export const DECK_COLORS = [
  '#F5A623', '#FF6B6B', '#4DA6FF', '#34C759', '#AF52DE',
  '#FF9F0A', '#30D158', '#FF375F', '#64D2FF', '#FFD60A',
] as const
