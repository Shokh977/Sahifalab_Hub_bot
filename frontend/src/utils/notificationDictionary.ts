/**
 * notificationDictionary — maps notification types to UI presentation.
 *
 * Each notification row stores only: id, type, category, meta (JSONB), is_read, created_at.
 * The dictionary provides: icon, label, color, route builder — all derived from type + meta.
 *
 * Categories: SOCIAL | EDUCATIONAL | GROWTH | BUSINESS
 */
import {
  Heart, MessageCircle, UserPlus, Repeat2, AtSign,
  GraduationCap, BookCheck, Award, HelpCircle,
  TrendingUp, Trophy, Flame, Medal,
  Users, Star, Banknote, ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifCategory = 'SOCIAL' | 'EDUCATIONAL' | 'GROWTH' | 'BUSINESS'

export interface NotificationItem {
  id: number
  type: string
  category: NotifCategory
  meta: Record<string, any>
  is_read: boolean
  created_at: string
}

export interface NotifDef {
  icon: LucideIcon
  label: string              // short label (e.g. "Yangi obunachi")
  color: string              // Tailwind text color class
  bgColor: string            // Tailwind bg color for icon circle
  /** Build a human-readable message from meta */
  message: (meta: Record<string, any>) => string
  /** Build a navigation route from meta (null = no navigation) */
  route: (meta: Record<string, any>) => string | null
}

// ── Dictionary ────────────────────────────────────────────────────────────────

const dict: Record<string, NotifDef> = {

  // ── SOCIAL ──────────────────────────────────────────────────────────────

  follow: {
    icon: UserPlus,
    label: 'Yangi obunachi',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    message: () => 'sizga obuna bo\'ldi',
    route: (m) => m.actor_id ? `/profile/${m.actor_id}` : null,
  },

  like: {
    icon: Heart,
    label: 'Layk',
    color: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    message: () => 'postingizni yoqtirdi',
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : null,
  },

  comment: {
    icon: MessageCircle,
    label: 'Izoh',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: () => 'postingizga izoh qoldirdi',
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : null,
  },

  repost: {
    icon: Repeat2,
    label: 'Repost',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    message: () => 'postingizni repost qildi',
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : null,
  },

  mention: {
    icon: AtSign,
    label: 'Eslatma',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: () => 'sizni eslatib o\'tdi',
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : null,
  },

  // ── EDUCATIONAL ─────────────────────────────────────────────────────────

  enrollment: {
    icon: GraduationCap,
    label: 'Ro\'yxatdan o\'tish',
    color: 'text-sahifa-600 dark:text-sahifa-400',
    bgColor: 'bg-sahifa-100 dark:bg-sahifa-900/30',
    message: () => 'kursga yozildingiz',
    route: (m) => m.course_id ? `/courses/${m.course_id}` : null,
  },

  lesson_complete: {
    icon: BookCheck,
    label: 'Dars tugadi',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: () => 'dars muvaffaqiyatli yakunlandi',
    route: (m) => m.course_id ? `/courses/${m.course_id}` : null,
  },

  course_complete: {
    icon: Award,
    label: 'Kurs tugadi',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: () => 'kursni to\'liq yakunladingiz! 🎉',
    route: (m) => m.course_id ? `/courses/${m.course_id}` : null,
  },

  certificate: {
    icon: Award,
    label: 'Sertifikat',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    message: () => 'sertifikat olishga tayyorsiz',
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/cabinet',
  },

  quiz_pass: {
    icon: HelpCircle,
    label: 'Test o\'tdi',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    message: () => 'testni muvaffaqiyatli topshirdingiz',
    route: (m) => m.quiz_id ? `/quiz/${m.quiz_id}` : '/quiz',
  },

  // ── GROWTH ──────────────────────────────────────────────────────────────

  level_up: {
    icon: TrendingUp,
    label: 'Yangi daraja',
    color: 'text-sahifa-600 dark:text-sahifa-400',
    bgColor: 'bg-sahifa-100 dark:bg-sahifa-900/30',
    message: (m) => `${m.new_level || ''}-darajaga ko'tarildingiz! 🚀`,
    route: () => '/cabinet',
  },

  achievement: {
    icon: Medal,
    label: 'Yutuq',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    message: (m) => `"${m.achievement_name || 'Yangi yutuq'}" ochildi!`,
    route: () => '/cabinet',
  },

  streak: {
    icon: Flame,
    label: 'Streak',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    message: (m) => `${m.days || ''} kunlik streak! 🔥`,
    route: () => '/',
  },

  leaderboard_rank: {
    icon: Trophy,
    label: 'Reyting',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    message: (m) => `reytingda ${m.rank || ''}–o'ringa chiqdingiz`,
    route: () => '/leaderboard',
  },

  // ── BUSINESS ────────────────────────────────────────────────────────────

  new_student: {
    icon: Users,
    label: 'Yangi talaba',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    message: () => 'kursga yangi talaba qo\'shildi',
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/teacher',
  },

  new_review: {
    icon: Star,
    label: 'Yangi sharh',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: (m) => `${m.rating || ''}★ baho qo'yildi`,
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/teacher',
  },

  new_sale: {
    icon: Banknote,
    label: 'Yangi sotish',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) => `${m.amount ? m.amount.toLocaleString() + ' so\'m' : ''} daromad!`,
    route: () => '/teacher',
  },

  payout: {
    icon: Banknote,
    label: 'To\'lov',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) => `${m.amount ? m.amount.toLocaleString() + ' so\'m' : ''} to'lov amalga oshirildi`,
    route: () => '/teacher',
  },
}

// ── Default for unknown types ─────────────────────────────────────────────────

const DEFAULT_DEF: NotifDef = {
  icon: ShieldCheck,
  label: 'Xabar',
  color: 'text-gray-600 dark:text-gray-400',
  bgColor: 'bg-gray-100 dark:bg-gray-800/30',
  message: () => 'yangi bildirishnoma',
  route: () => null,
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getNotifDef(type: string): NotifDef {
  return dict[type] ?? DEFAULT_DEF
}

/** Category → color for grouping */
export const CATEGORY_COLORS: Record<NotifCategory, string> = {
  SOCIAL:      'text-blue-500',
  EDUCATIONAL: 'text-sahifa-500',
  GROWTH:      'text-amber-500',
  BUSINESS:    'text-emerald-500',
}
