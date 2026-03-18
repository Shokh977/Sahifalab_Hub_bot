/**
 * profileSkins — Profile circle skins/borders system
 * 
 * Users unlock decorative skins around their avatar circles based on:
 * - Level achievements
 * - XP milestones
 * - Quiz completion
 * - Focus time
 */

export interface ProfileSkin {
  id: string
  name: string
  emoji: string
  borderClass: string        // Tailwind classes for border/ring effect
  requirement: (p: {
    level: number
    totalXP: number
    quizzesCompleted: number
    focusSeconds: number
  }) => boolean
}

export const PROFILE_SKINS: ProfileSkin[] = [
  // ── Basic (Auto-unlocked) ──────────────────────────────────────────
  {
    id: 'bronze',
    name: 'Bronze',
    emoji: '🥉',
    borderClass: 'ring-2 ring-amber-600 dark:ring-amber-500',
    requirement: () => true, // Everyone gets this
  },

  // ── Level-based ────────────────────────────────────────────────────
  {
    id: 'silver',
    name: 'Silver',
    emoji: '🥈',
    borderClass: 'ring-2 ring-slate-400 dark:ring-slate-300',
    requirement: (p) => p.level >= 3,
  },
  {
    id: 'gold',
    name: 'Gold',
    emoji: '🥇',
    borderClass: 'ring-2 ring-yellow-400 dark:ring-yellow-300',
    requirement: (p) => p.level >= 5,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💎',
    borderClass: 'ring-2 ring-cyan-400 dark:ring-cyan-300 shadow-lg shadow-cyan-400/50',
    requirement: (p) => p.level >= 10,
  },
  {
    id: 'emerald',
    name: 'Emerald',
    emoji: '💚',
    borderClass: 'ring-2 ring-emerald-400 dark:ring-emerald-300 shadow-lg shadow-emerald-400/50',
    requirement: (p) => p.level >= 15,
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    emoji: '💙',
    borderClass: 'ring-2 ring-blue-500 dark:ring-blue-400 shadow-lg shadow-blue-500/50',
    requirement: (p) => p.level >= 20,
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    emoji: '💜',
    borderClass: 'ring-2 ring-purple-500 dark:ring-purple-400 shadow-lg shadow-purple-500/50',
    requirement: (p) => p.level >= 25,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    emoji: '❤️',
    borderClass: 'ring-2 ring-red-500 dark:ring-red-400 shadow-lg shadow-red-500/50',
    requirement: (p) => p.level >= 30,
  },
  {
    id: 'celestial',
    name: 'Celestial',
    emoji: '⭐',
    borderClass: 'ring-2 ring-amber-300 dark:ring-amber-200 shadow-lg shadow-amber-300/50',
    requirement: (p) => p.level >= 40,
  },
  {
    id: 'eternal',
    name: 'Eternal',
    emoji: '✨',
    borderClass: 'ring-[3px] ring-white dark:ring-cyan-200 shadow-lg shadow-cyan-400/70 animate-pulse',
    requirement: (p) => p.level >= 50,
  },

  // ── XP-based ───────────────────────────────────────────────────────
  {
    id: 'scholar',
    name: 'Scholar',
    emoji: '📚',
    borderClass: 'ring-2 ring-orange-500 dark:ring-orange-400',
    requirement: (p) => p.totalXP >= 2_500,
  },
  {
    id: 'sage',
    name: 'Sage',
    emoji: '🧙',
    borderClass: 'ring-2 ring-violet-500 dark:ring-violet-400 shadow-lg shadow-violet-500/50',
    requirement: (p) => p.totalXP >= 5_000,
  },
  {
    id: 'oracle',
    name: 'Oracle',
    emoji: '🔮',
    borderClass: 'ring-2 ring-fuchsia-500 dark:ring-fuchsia-400 shadow-lg shadow-fuchsia-500/50',
    requirement: (p) => p.totalXP >= 10_000,
  },

  // ── Quiz-based ─────────────────────────────────────────────────────
  {
    id: 'quizzer',
    name: 'Quizzer',
    emoji: '🎯',
    borderClass: 'ring-2 ring-lime-500 dark:ring-lime-400',
    requirement: (p) => p.quizzesCompleted >= 10,
  },
  {
    id: 'champion',
    name: 'Champion',
    emoji: '🏆',
    borderClass: 'ring-2 ring-yellow-500 dark:ring-yellow-400 shadow-lg shadow-yellow-500/50',
    requirement: (p) => p.quizzesCompleted >= 25,
  },
  {
    id: 'legend',
    name: 'Legend',
    emoji: '👑',
    borderClass: 'ring-2 ring-fuchsia-600 dark:ring-fuchsia-500 shadow-lg shadow-fuchsia-600/50',
    requirement: (p) => p.quizzesCompleted >= 50,
  },

  // ── Focus-based ────────────────────────────────────────────────────
  {
    id: 'focused',
    name: 'Focused',
    emoji: '🔥',
    borderClass: 'ring-2 ring-orange-600 dark:ring-orange-500',
    requirement: (p) => p.focusSeconds >= 10_800, // 3 hours
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    emoji: '⚡',
    borderClass: 'ring-2 ring-yellow-600 dark:ring-yellow-500 shadow-lg shadow-yellow-600/50',
    requirement: (p) => p.focusSeconds >= 36_000, // 10 hours
  },
  {
    id: 'titan',
    name: 'Titan',
    emoji: '🌪️',
    borderClass: 'ring-[3px] ring-slate-600 dark:ring-slate-400 shadow-lg shadow-slate-600/50',
    requirement: (p) => p.focusSeconds >= 180_000, // 50 hours
  },
]

/**
 * Get the highest-tier unlocked skin for a user
 */
export function getProfileSkin(p: {
  level: number
  totalXP: number
  quizzesCompleted: number
  focusSeconds: number
}): ProfileSkin {
  // Return the last (highest tier) unlocked skin
  for (let i = PROFILE_SKINS.length - 1; i >= 0; i--) {
    if (PROFILE_SKINS[i].requirement(p)) {
      return PROFILE_SKINS[i]
    }
  }
  // Fallback to bronze
  return PROFILE_SKINS[0]
}

/**
 * Get all unlocked skins for a user
 */
export function getUnlockedSkins(p: {
  level: number
  totalXP: number
  quizzesCompleted: number
  focusSeconds: number
}): ProfileSkin[] {
  return PROFILE_SKINS.filter((skin) => skin.requirement(p))
}

/**
 * Get the next skin to unlock
 */
export function getNextSkin(p: {
  level: number
  totalXP: number
  quizzesCompleted: number
  focusSeconds: number
}): ProfileSkin | null {
  for (const skin of PROFILE_SKINS) {
    if (!skin.requirement(p)) {
      return skin
    }
  }
  return null // All unlocked
}
