/**
 * donationTheme.ts — Qo'llab-quvvatlash (donation) card theming.
 * region -> gradient/shadow/badge treatment. Never random, never per-render
 * — a method's theme is a pure function of its own region/currency fields.
 * `intl` (or any unrecognised region) is the deliberate fallback.
 */
export type DonationRegion = 'uz' | 'kr' | 'intl' | string

export interface CardTheme {
  gradient: string   // CSS linear-gradient, 140deg 3-stop
  shadow:   string   // CSS box-shadow
}

const THEMES: Record<'uz' | 'kr' | 'intl', CardTheme> = {
  uz: {
    gradient: 'linear-gradient(140deg, #F79246 0%, #E8722D 52%, #CE581C 100%)',
    shadow:   '0 14px 28px rgba(206,88,28,.28)',
  },
  kr: {
    gradient: 'linear-gradient(140deg, #3C5167 0%, #2B3B4D 60%, #1E2A38 100%)',
    shadow:   '0 14px 28px rgba(43,59,77,.28)',
  },
  intl: {
    gradient: 'linear-gradient(140deg, #3A3733 0%, #26241F 55%, #191713 100%)',
    shadow:   '0 14px 28px rgba(25,23,19,.34)',
  },
}

export function cardThemeFor(region: DonationRegion): CardTheme {
  if (region === 'uz' || region === 'kr') return THEMES[region]
  return THEMES.intl
}

export const donationColors = {
  screenBg:        '#FBF7F2',
  surface:         '#FFFFFF',
  surface2:        '#F3EDE5',
  accent:          '#E8722D',
  accentPressed:   '#CE581C',
  accentLabel:     '#B0663A',
  navy:            '#2B3B4D',
  textBody:        '#5A6774',
  textMuted:       '#7A8794',
  textFaint:       '#A79C8E',
  hairline:        'rgba(43,59,77,.09)',
  success:         '#4ABE7C',
  successTint:     '#EAF6EE',
  successText:     '#2F7A50',
  successOnNavy:   '#9FE3B8',
}
