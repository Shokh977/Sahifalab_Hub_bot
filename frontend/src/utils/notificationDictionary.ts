/**
 * notificationDictionary — maps notification types to UI presentation.
 *
 * Each notification row stores only: id, type, category, meta (JSONB), is_read, created_at.
 * The dictionary provides: icon, label, color, route builder — all derived from type + meta.
 *
 * Categories: SOCIAL | EDUCATIONAL | GROWTH | BUSINESS
 *
 * Message templates (Uzbek):
 *   SOCIAL:      like, comment, repost, follow, mention
 *   EDUCATIONAL: new_content, progress, enrollment, lesson_complete, course_complete, certificate, quiz_pass
 *   GROWTH:      level_up, daily_streak, xp_reward, achievement, streak, leaderboard_rank
 *   BUSINESS:    new_student, new_sale, payout, analytics_report, new_review
 */
import {
  Heart, MessageCircle, UserPlus, Repeat2, AtSign,
  GraduationCap, BookCheck, Award, HelpCircle, BookOpen,
  TrendingUp, Trophy, Flame, Medal, Zap,
  Users, Star, Banknote, ShieldCheck, BarChart3,
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
  label: string              // short label shown in badge (e.g. "Yangi obunachi")
  color: string              // Tailwind text color class
  bgColor: string            // Tailwind bg color for icon circle
  /** Build a full human-readable message from meta (Uzbek) */
  message: (meta: Record<string, any>) => string
  /** Build a navigation route from meta (null = no navigation) */
  route: (meta: Record<string, any>) => string | null
}

// ── Helper ────────────────────────────────────────────────────────────────────

const actor = (meta: Record<string, any>) =>
  meta.actor_name || meta.first_name || 'Foydalanuvchi'

const money = (amount: number | undefined) =>
  amount ? `${amount.toLocaleString('uz-UZ')} so'm` : ''

// ── Dictionary ────────────────────────────────────────────────────────────────

const dict: Record<string, NotifDef> = {

  // ─────────────────────────── SOCIAL ───────────────────────────────────────

  follow: {
    icon: UserPlus,
    label: 'Yangi obunachi',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    message: () => "Yangi foydalanuvchi sizga obuna bo'ldi.",
    route: (m) => m.actor_id ? `/profile/${m.actor_id}` : null,
  },

  like: {
    icon: Heart,
    label: 'Layk',
    color: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    message: (m) => `${actor(m)} sizning postingizga like bosdi.`,
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : '/social',
  },

  comment: {
    icon: MessageCircle,
    label: 'Izoh',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) => `${actor(m)} sizning postingizga izoh qoldirdi.`,
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : '/social',
  },

  repost: {
    icon: Repeat2,
    label: 'Repost',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    message: () => "Kimdir sizning postingizni o'z lentasida ulashdi.",
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : '/social',
  },

  mention: {
    icon: AtSign,
    label: 'Eslatma',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: (m) => `${actor(m)} sizni eslatib o'tdi.`,
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : '/social',
  },

  // ─────────────────────────── EDUCATIONAL ──────────────────────────────────

  new_content: {
    icon: BookOpen,
    label: 'Yangi kontent',
    color: 'text-sahifa-600 dark:text-sahifa-400',
    bgColor: 'bg-sahifa-100 dark:bg-sahifa-900/30',
    message: (m) =>
      `Siz kuzatadigan ${m.teacher_name || "o'qituvchi"} yangi kurs yoki dars yukladi.`,
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/courses',
  },

  progress: {
    icon: TrendingUp,
    label: 'Taraqqiyot',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    message: (m) =>
      `Tabriklaymiz! Siz ${m.course_title || 'kurs'}ning ${m.percentage ?? 0}% qismini tugatdingiz.`,
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/courses',
  },

  enrollment: {
    icon: GraduationCap,
    label: "Ro'yxatdan o'tish",
    color: 'text-sahifa-600 dark:text-sahifa-400',
    bgColor: 'bg-sahifa-100 dark:bg-sahifa-900/30',
    message: (m) =>
      m.course_title
        ? `"${m.course_title}" kursiga muvaffaqiyatli yozildingiz.`
        : "Kursga muvaffaqiyatli yozildingiz.",
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/courses',
  },

  lesson_complete: {
    icon: BookCheck,
    label: 'Dars tugadi',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) =>
      m.lesson_title
        ? `"${m.lesson_title}" muvaffaqiyatli yakunlandi.`
        : "Dars muvaffaqiyatli yakunlandi.",
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/courses',
  },

  course_complete: {
    icon: Award,
    label: 'Kurs tugadi',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: (m) =>
      m.course_title
        ? `Tabriklaymiz! "${m.course_title}" to'liq yakunlandi! 🎉`
        : "Tabriklaymiz! Kursni to'liq yakunladingiz! 🎉",
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/courses',
  },

  certificate: {
    icon: Award,
    label: 'Sertifikat',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    message: (m) =>
      m.course_title
        ? `"${m.course_title}" sertifikati tayyor.`
        : "Sertifikat olishga tayyorsiz.",
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/cabinet',
  },

  quiz_pass: {
    icon: HelpCircle,
    label: "Test o'tdi",
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    message: (m) =>
      m.score != null
        ? `Test muvaffaqiyatli topshirildi! Ball: ${m.score}%`
        : "Testni muvaffaqiyatli topshirdingiz.",
    route: (m) => m.quiz_id ? `/quiz/${m.quiz_id}` : '/quiz',
  },

  // ─────────────────────────── GROWTH ───────────────────────────────────────

  level_up: {
    icon: TrendingUp,
    label: 'Yangi daraja',
    color: 'text-sahifa-600 dark:text-sahifa-400',
    bgColor: 'bg-sahifa-100 dark:bg-sahifa-900/30',
    message: (m) =>
      `Ajoyib! Siz ${m.rank_name || m.new_level || 'yangi'}-darajasiga ko'tarildingiz!`,
    route: () => '/cabinet',
  },

  daily_streak: {
    icon: Flame,
    label: 'Streak eslatma',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    message: () =>
      "Bugun hali dars ko'rmadingiz, olovli seriyangiz (🔥) o'chib qolmasin!",
    route: () => '/',
  },

  xp_reward: {
    icon: Zap,
    label: 'XP mukofot',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    message: (m) =>
      `Sizning oxirgi postingiz ${m.view_count ?? 0} ta view yig'di.`,
    route: (m) => m.post_id ? `/social?post=${m.post_id}` : '/social',
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
    message: (m) => `Reytingda ${m.rank || ''}–o'ringa chiqdingiz.`,
    route: () => '/leaderboard',
  },

  // ─────────────────────────── BUSINESS ─────────────────────────────────────

  new_student: {
    icon: Users,
    label: 'Yangi talaba',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    message: (m) =>
      `Yangi o'quvchi kursingizga a'zo bo'ldi.${m.amount ? ` Tushum: ${money(m.amount)} (30% komissiyadan tashqari).` : ''}`,
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/teacher',
  },

  new_sale: {
    icon: Banknote,
    label: 'Yangi sotish',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) =>
      `Yangi o'quvchi kursingizga a'zo bo'ldi.${m.amount ? ` Tushum: ${money(m.amount)} (30% komissiyadan tashqari).` : ''}`,
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/teacher',
  },

  payout: {
    icon: Banknote,
    label: "To'lov",
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    message: (m) =>
      m.amount
        ? `${money(m.amount)} — muvaffaqiyatli hisobingizga o'tkazildi.`
        : "Sizning daromadingiz muvaffaqiyatli hisobingizga o'tkazildi.",
    route: () => '/teacher',
  },

  analytics_report: {
    icon: BarChart3,
    label: 'Haftalik hisobot',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    message: (m) =>
      m.percent_change != null
        ? `Haftalik hisobotingiz tayyor. O'tgan haftaga nisbatan ${m.percent_change}% o'sish bor.`
        : "Haftalik hisobotingiz tayyor.",
    route: () => '/teacher',
  },

  new_review: {
    icon: Star,
    label: 'Yangi sharh',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    message: (m) =>
      m.rating
        ? `${m.rating}★ baho qo'yildi.`
        : "Kursga yangi sharh qoldirildi.",
    route: (m) => m.course_id ? `/courses/${m.course_id}` : '/teacher',
  },
}

// ── Default for unknown types ─────────────────────────────────────────────────

const DEFAULT_DEF: NotifDef = {
  icon: ShieldCheck,
  label: 'Xabar',
  color: 'text-gray-600 dark:text-gray-400',
  bgColor: 'bg-gray-100 dark:bg-gray-800/30',
  message: () => 'Yangi bildirishnoma.',
  route: () => null,
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getNotifDef(type: string): NotifDef {
  return dict[type] ?? DEFAULT_DEF
}

/**
 * getNotificationMessage — convenience helper matching the task spec.
 * Returns the formatted Uzbek message string for any notification item.
 */
export function getNotificationMessage(notif: NotificationItem): string {
  return getNotifDef(notif.type).message(notif.meta)
}

/** Category → display label (Uzbek) */
export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  SOCIAL:      'Ijtimoiy',
  EDUCATIONAL: "Ta'lim",
  GROWTH:      "O'sish",
  BUSINESS:    'Biznes',
}

/** Category → accent color */
export const CATEGORY_COLORS: Record<NotifCategory, string> = {
  SOCIAL:      'text-blue-500',
  EDUCATIONAL: 'text-sahifa-500',
  GROWTH:      'text-amber-500',
  BUSINESS:    'text-emerald-500',
}

/** Category → badge bg+text for pills */
export const CATEGORY_BADGE: Record<NotifCategory, string> = {
  SOCIAL:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  EDUCATIONAL: 'bg-sahifa-100 text-sahifa-700 dark:bg-sahifa-900/30 dark:text-sahifa-300',
  GROWTH:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  BUSINESS:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

/** All notification categories in display order */
export const ALL_CATEGORIES: NotifCategory[] = ['SOCIAL', 'EDUCATIONAL', 'GROWTH', 'BUSINESS']
