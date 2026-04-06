/**
 * UserIdentity — The "heart" of the social UI.
 *
 * Renders a circular avatar with a rank-colored border ring,
 * plus verification badges (Blue for Teacher, Orange for Admin).
 *
 * Rank system: 27 levels based on Uzbek/Turkic titles.
 * Border color groups: 🟢 1-4 (green), 🔵 5-9 (blue), 🟣 10-14 (purple),
 * 🟠 15-19 (orange), 🔴 20-24 (red), 👑 25-27 (gold).
 */

import React from 'react'
import { BadgeCheck, Shield } from 'lucide-react'

// ── Rank data ────────────────────────────────────────────────────────────────

const RANKS = [
  { min: 1,  max: 1,  title: 'Navkar',      emoji: '🌱' },
  { min: 2,  max: 2,  title: 'Chokar',       emoji: '🌿' },
  { min: 3,  max: 3,  title: "G'ulom",       emoji: '📚' },
  { min: 4,  max: 4,  title: 'Yasovul',      emoji: '📚' },
  { min: 5,  max: 5,  title: 'Munshiy',      emoji: '🏆' },
  { min: 6,  max: 6,  title: 'Mirzo',        emoji: '🏆' },
  { min: 7,  max: 7,  title: 'Mahram',       emoji: '🚀' },
  { min: 8,  max: 8,  title: "Ko'kalosh",    emoji: '🚀' },
  { min: 9,  max: 9,  title: "To'qsabo",     emoji: '🚀' },
  { min: 10, max: 10, title: 'Yuzboshi',     emoji: '👑' },
  { min: 11, max: 11, title: 'Mingboshi',    emoji: '👑' },
  { min: 12, max: 12, title: "Darug'a",      emoji: '👑' },
  { min: 13, max: 13, title: 'Parvonachi',   emoji: '👑' },
  { min: 14, max: 14, title: "Shog'ovul",    emoji: '👑' },
  { min: 15, max: 15, title: 'Otaliq',       emoji: '🎖️' },
  { min: 16, max: 16, title: 'Inoq',         emoji: '🎖️' },
  { min: 17, max: 17, title: 'Bijiy',        emoji: '🎖️' },
  { min: 18, max: 18, title: 'Bek',          emoji: '🎖️' },
  { min: 19, max: 19, title: 'Biy',          emoji: '🎖️' },
  { min: 20, max: 20, title: 'Beklarbegi',   emoji: '♔' },
  { min: 21, max: 21, title: 'Noib',         emoji: '♔' },
  { min: 22, max: 22, title: "Qo'shbegi",    emoji: '♔' },
  { min: 23, max: 23, title: 'Amir',         emoji: '♔' },
  { min: 24, max: 24, title: 'Sulton',       emoji: '♔' },
  { min: 25, max: 25, title: 'Xon',          emoji: '🔱' },
  { min: 26, max: 26, title: 'Xoqon',        emoji: '🔱' },
  { min: 27, max: 27, title: 'Sohibqiron',   emoji: '👑' },
]

export function getRankInfo(level: number) {
  const rank = RANKS.find(r => level >= r.min && level <= r.max) || RANKS[0]
  return rank
}

// ── Border color by level group ──────────────────────────────────────────────

function getRankBorderColor(level: number): string {
  if (level <= 4)  return '#22C55E' // green — beginner
  if (level <= 9)  return '#3B82F6' // blue — intermediate
  if (level <= 14) return '#8B5CF6' // purple — advanced
  if (level <= 19) return '#F15929' // orange — expert (brand color!)
  if (level <= 24) return '#EF4444' // red — master
  return '#FFD700'                   // gold — legendary
}

function getRankGlowColor(level: number): string {
  if (level <= 4)  return 'rgba(34,197,94,0.35)'
  if (level <= 9)  return 'rgba(59,130,246,0.35)'
  if (level <= 14) return 'rgba(139,92,246,0.35)'
  if (level <= 19) return 'rgba(241,89,41,0.35)'
  if (level <= 24) return 'rgba(239,68,68,0.35)'
  return 'rgba(255,215,0,0.45)'
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserIdentityUser {
  telegram_id: number
  full_name?: string | null
  first_name?: string | null
  username?: string | null
  photo_url?: string | null
  role?: string
  level?: number
  xp?: number
}

interface Props {
  user: UserIdentityUser
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showName?: boolean
  showRank?: boolean
  showBadge?: boolean
  nameClass?: string
  onClick?: () => void
  className?: string
}

// ── Sizes ────────────────────────────────────────────────────────────────────

const SIZES = {
  xs: { avatar: 28, border: 2, badge: 12, font: 'text-xs' },
  sm: { avatar: 36, border: 2, badge: 14, font: 'text-sm' },
  md: { avatar: 44, border: 3, badge: 16, font: 'text-sm' },
  lg: { avatar: 56, border: 3, badge: 18, font: 'text-base' },
  xl: { avatar: 72, border: 4, badge: 22, font: 'text-lg' },
}

// ── Component ────────────────────────────────────────────────────────────────

const UserIdentity: React.FC<Props> = ({
  user,
  size = 'md',
  showName = true,
  showRank = false,
  showBadge = true,
  nameClass = '',
  onClick,
  className = '',
}) => {
  const level = user.level || 1
  const borderColor = getRankBorderColor(level)
  const glowColor = getRankGlowColor(level)
  const { avatar: avatarPx, border: borderPx, badge: badgePx, font } = SIZES[size]
  const rank = getRankInfo(level)
  const displayName = user.full_name || user.first_name || user.username || 'Foydalanuvchi'
  const isTeacher = user.role === 'teacher'
  const isAdmin = user.role === 'admin'

  return (
    <div
      className={`inline-flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Avatar with rank ring */}
      <div
        className="relative flex-shrink-0 rounded-full"
        style={{
          width: avatarPx + borderPx * 2,
          height: avatarPx + borderPx * 2,
          padding: borderPx,
          background: `linear-gradient(135deg, ${borderColor}, ${borderColor}88)`,
          boxShadow: `0 0 ${borderPx * 4}px ${glowColor}`,
        }}
      >
        <div
          className="w-full h-full rounded-full overflow-hidden bg-pitch-700"
          style={{ width: avatarPx, height: avatarPx }}
        >
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={displayName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/60 font-bold"
                 style={{ fontSize: avatarPx * 0.4 }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Name + Badge + Rank */}
      {showName && (
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-1">
            <span className={`font-semibold text-white truncate ${font} ${nameClass}`}>
              {displayName}
            </span>
            {showBadge && isTeacher && (
              <BadgeCheck
                className="flex-shrink-0 text-blue-400 fill-blue-400/20"
                style={{ width: badgePx, height: badgePx }}
              />
            )}
            {showBadge && isAdmin && (
              <Shield
                className="flex-shrink-0 text-sahifa-500 fill-sahifa-500/20"
                style={{ width: badgePx, height: badgePx }}
              />
            )}
          </div>
          {showRank && (
            <span className="text-xs text-white/50 truncate">
              {rank.emoji} {rank.title} · Lvl {level}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default UserIdentity
