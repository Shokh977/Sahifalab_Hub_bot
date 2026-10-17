// Response shapes of /api/admin/feature-analytics/* (backend:
// app/api/v1/endpoints/admin_feature_analytics.py).

export interface Window { days: number; start: string; end: string }
export interface Kpi { value: number; prev: number; delta: number | null }

export interface FeatureRow {
  key: string
  label: string
  emoji: string
  unit: string
  group: string
  users: number
  users_prev: number
  users_delta: number | null
  actions: number
  actions_prev: number
  actions_delta: number | null
  actions_per_user: number
  adoption_pct: number
  daily: { date: string; users: number; actions: number }[]
}

export interface OverviewData {
  window: Window
  totals: {
    registered: number
    seen_in_app: number
    active_users: number
    active_users_prev: number
    active_users_delta: number | null
    new_users: number
    new_users_prev: number
    new_users_delta: number | null
    dau_avg: number
    wau: number
    stickiness_pct: number
    focus_minutes: number
    focus_minutes_delta: number | null
  }
  features: FeatureRow[]
  daily: { date: string; active_users: number; new_users: number }[]
  depth: { features: number; users: number }[]
  combos: { a: string; b: string; a_label: string; b_label: string; a_emoji: string; b_emoji: string; users: number; pct: number }[]
  heatmap: number[][]
}

export interface Owner { id: number; name: string }

export interface FlashcardsData {
  window: Window
  source_tracking: boolean
  totals: { decks: number; cards: number; owners: number; public_decks: number; mastered_cards: number; avg_cards_per_deck: number }
  period: {
    reviews: Kpi
    reviewers: Kpi
    new_decks: Kpi
    new_cards: Kpi
    creators: number
    sessions: Kpi
    avg_seconds_per_card: number
    recall_pct: number
  }
  ratings: { rating: number; count: number; pct: number }[]
  card_status: { status: string; count: number }[]
  card_format: { total: number; with_image: number; word: number; question: number; long_text: number; avg_back_len: number }
  deck_sizes: { bucket: string; decks: number }[]
  sources: { key: string; label: string; decks: number; cards: number; users: number; new_decks: number; new_cards: number; reviews: number }[]
  themes: { key: string; label: string; emoji: string; decks: number; cards: number; users: number; new_decks: number; new_cards: number; reviews: number; ai_decks: number }[]
  ai: {
    requests: number
    succeeded: number
    failed: number
    cache_hits: number
    users: number
    cost_usd: number
    paid_generations: number
    tanga_spent: number
    saved_decks: number
    saved_cards: number
    saved_from_text: number
    saved_from_image: number
    save_rate_pct: number
  }
  library: {
    published_total: number
    published_new: number
    clones: number
    cloners: number
    ratings: number
    avg_rating: number | null
    top: { id: number; title: string; owner: Owner; theme: string; cards: number; clones: number; rating: number; ratings: number }[]
  }
  top_decks: { id: number; title: string; owner: Owner; theme: string; source: string; cards: number; reviews: number; learners: number; is_public: boolean }[]
  top_creators: { id: number; name: string; decks: number; cards: number; ai_decks: number; cloned: number; reviews: number; top_themes: string[] }[]
  daily: { date: string; reviews: number; reviewers: number; new_cards: number; ai_generations: number }[]
}

export interface DailyQuizData {
  window: Window
  totals: {
    quizzes: number
    started: number
    finished: number
    finished_prev: number
    finished_delta: number | null
    completion_pct: number
    players: number
    players_prev: number
    players_delta: number | null
    avg_score: number | null
    avg_seconds: number | null
    avg_active_seconds: number | null
    active_samples: number
    perfect_pct: number
    tanga_awarded: number
    avg_days_per_player: number
    returning_pct: number
  }
  score_distribution: { score: number; count: number }[]
  days: { date: string; quiz_number: number; theme: string; theme_label: string; sub_topic: string | null; status: string; started: number; finished: number; avg_score: number | null }[]
  categories: { key: string; label: string; days: number; players_per_day: number; avg_score: number | null }[]
  loyalty: { bucket: string; users: number }[]
  streaks: { bucket: string; users: number }[]
  hours: number[]
  hardest: { question: string; date: string; theme_label: string; answers: number; correct_pct: number }[]
  reports: { reason: string; count: number }[]
}

export interface DistRow { key: string | null; label: string; users: number; pct: number }

export interface AudienceData {
  window: Window
  totals: { users: number; active: number; new: number; onboarded: number; onboarded_pct: number; with_decks: number }
  segments: { key: string; label: string; users: number; pct: number }[]
  interests: { label: string; icon: string; users: number; active_users: number; pct: number }[]
  motivation: DistRow[]
  experience: DistRow[]
  registered_via: DistRow[]
  roles: DistRow[]
  timezones: DistRow[]
  cities: DistRow[]
  daily_goal: { key: string; label: string; users: number }[]
  flashcard_themes: { key: string; label: string; emoji: string; users: number; creators: number; learners: number; pct: number }[]
  motivation_features: {
    features: { key: string; label: string; emoji: string }[]
    rows: { key: string; label: string; users: number; features: Record<string, number> }[]
  }
}

// /api/admin/ai-usage (admin_ai_usage.py)
export interface AiUsageData {
  window_days: number
  features: {
    feature: string
    calls: number
    cache_hits: number
    cache_hit_rate: number
    successes: number
    failures: number
    free_actions: number
    paid_actions: number
    tanga_spent: number
    api_cost_usd: number
    avg_latency_ms: number
  }[]
  total_tanga_refunded: number
  total_api_cost_usd: number
}
