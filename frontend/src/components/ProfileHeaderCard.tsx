/**
 * ProfileHeaderCard — Shared profile header used in both /profile/:id and /kabinet.
 *
 * Shows: Rank-ringed avatar, Name + badges, Bio, Stats (followers, following, posts, XP, level).
 * Supports two modes:
 *   • View mode (Public Profile): static display, follow/message or edit-profile actions
 *   • Edit mode (Kabinet): hover edit icons on avatar/name, live-preview from parent state
 *
 * Premium Light/Dark glass aesthetics with frosted blur and subtle shadows.
 */

import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck, Shield, UserPlus, UserMinus, MessageCircle,
  PenSquare, Camera, Loader2, MapPin, Globe, UserCheck, Clock, Check, X, Lock,
} from 'lucide-react'
import UserIdentity, { getRankInfo } from './social/UserIdentity'
import type { UserIdentityUser } from './social/UserIdentity'
import { levelProgress, levelBounds } from '../context/progressStore'
import CoverPhoto from './profile/CoverPhoto'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileHeaderData extends UserIdentityUser {
  bio?: string | null
  about_me?: string | null
  followers_count?: number
  following_count?: number
  is_following?: boolean
}

export interface ProfileHeaderCardProps {
  /** Profile data to render */
  profile: ProfileHeaderData

  /** Post count to show in stats */
  postCount?: number

  /** For teacher profiles — courses count */
  courseCount?: number
  /** For teacher profiles — total students */
  studentCount?: number
  /** Teacher specialization pill */
  specialization?: string | null

  // ── Mode flags ────────────────────────────────────────────────────────────

  /** Is this the current user viewing their own profile? */
  isOwnProfile?: boolean
  /** Enable edit hover overlays (for Kabinet) */
  editMode?: boolean

  // ── Action callbacks ──────────────────────────────────────────────────────

  /** Follow/unfollow */
  onFollow?: () => void
  followLoading?: boolean
  /** Open messenger — always shown when provided, disabled unless canMessage */
  onMessage?: () => void
  /** Gates the Message button — blocked (visible but disabled) until an
   * accepted connection exists (or a teacher-student link, per backend rules) */
  canMessage?: boolean

  // ── Mutual connection (LinkedIn-style, gates messaging) ───────────────────

  connectionStatus?: 'own' | 'none' | 'accepted' | 'pending_sent' | 'pending_received'
  onConnect?: () => void
  onCancelConnect?: () => void
  onAcceptConnect?: () => void
  onDeclineConnect?: () => void
  connectionLoading?: boolean

  /** Open followers list modal */
  onFollowersClick?: () => void
  /** Open following list modal */
  onFollowingClick?: () => void
  /** Navigate to /kabinet for editing (from PublicProfile) */
  onEditProfile?: () => void
  /** Upload avatar photo (Kabinet) */
  onAvatarUpload?: (file: File) => void
  avatarUploading?: boolean
  /** Open the settings form section (Kabinet) */
  onEditClick?: () => void

  // ── Live preview overrides (for Kabinet form sync) ────────────────────────

  /** Override display name from form input */
  liveFirstName?: string
  /** Override bio from form input */
  liveBio?: string

  // ── LinkedIn-style cover/headline/location (all optional, opt-in) ─────────

  /** Cover banner URL. Passing this prop (even null) switches the card into
   * "cover mode": banner bleeds to the card edges and the avatar overlaps it. */
  coverImageUrl?: string | null
  /** Enables the cover hover-upload overlay (owner only) */
  onCoverUpload?: (file: File) => void
  coverUploading?: boolean
  /** Headline shown under @username, e.g. "Frontend Developer @ Sahifalab" */
  headline?: string | null
  /** City shown alongside the website link */
  locationCity?: string | null
  websiteUrl?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

const ProfileHeaderCard: React.FC<ProfileHeaderCardProps> = ({
  profile,
  postCount = 0,
  courseCount,
  studentCount,
  specialization,
  isOwnProfile = false,
  editMode = false,
  onFollow,
  followLoading = false,
  onMessage,
  canMessage = false,
  connectionStatus,
  onConnect,
  onCancelConnect,
  onAcceptConnect,
  onDeclineConnect,
  connectionLoading = false,
  onFollowersClick,
  onFollowingClick,
  onEditProfile,
  onAvatarUpload,
  avatarUploading = false,
  onEditClick,
  liveFirstName,
  liveBio,
  coverImageUrl,
  onCoverUpload,
  coverUploading = false,
  headline,
  locationCity,
  websiteUrl,
}) => {
  const rank = getRankInfo(profile.level || 1)
  const isTeacher = profile.role === 'teacher'
  const isAdmin = profile.role === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasCover = coverImageUrl !== undefined

  // Live preview: use overrides if provided, else fall back to profile data
  const displayName = liveFirstName ?? profile.full_name ?? profile.first_name ?? profile.username ?? 'Foydalanuvchi'
  const displayBio = liveBio ?? profile.bio ?? null
  const bioFallback = isTeacher ? "O'qituvchi" : "O'quvchi"

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onAvatarUpload) onAvatarUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`rounded-2xl border border-gray-200/60 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-md shadow-[0_2px_24px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden ${hasCover ? '' : 'p-6'}`}
    >
      {/* ── Cover banner (bleeds to card edges) ───────────────────────────── */}
      {hasCover && (
        <CoverPhoto url={coverImageUrl} onUpload={onCoverUpload} uploading={coverUploading} />
      )}

      <div className={hasCover ? 'p-6' : ''}>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">

        {/* ── Avatar with rank ring ───────────────────────────────────────── */}
        <div className={`relative group flex-shrink-0 ${hasCover ? '-mt-14 sm:-mt-16' : ''}`}>
          <div className={hasCover ? 'rounded-full ring-4 ring-white dark:ring-[#0C0C10]' : ''}>
            <UserIdentity user={{ ...profile, full_name: displayName }} size="xl" showName={false} />
          </div>

          {/* Edit overlay on avatar (Kabinet mode) */}
          {editMode && onAvatarUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white drop-shadow-md" />
                )}
              </button>
            </>
          )}
        </div>

        {/* ── Info section ────────────────────────────────────────────────── */}
        <div className="flex-1 text-center sm:text-left min-w-0">

          {/* Name + badges + edit icon */}
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 group/name">
            <span className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[240px]">
              {displayName}
            </span>
            {isTeacher && (
              <BadgeCheck className="w-[18px] h-[18px] text-blue-400 fill-blue-400/20 flex-shrink-0" />
            )}
            {isAdmin && (
              <Shield className="w-[18px] h-[18px] text-sahifa-500 fill-sahifa-500/20 flex-shrink-0" />
            )}
            {editMode && onEditClick && (
              <button
                onClick={onEditClick}
                className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                title="Tahrirlash"
              >
                <PenSquare className="w-3.5 h-3.5 text-gray-400 dark:text-white/40" />
              </button>
            )}
          </div>

          {/* Username */}
          {profile.username && (
            <p className="text-sm text-gray-400 dark:text-white/40">@{profile.username}</p>
          )}

          {/* Headline */}
          {headline && (
            <p className="text-sm text-gray-700 dark:text-white/70 font-medium mt-1">{headline}</p>
          )}

          {/* Location + website */}
          {(locationCity || websiteUrl) && (
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-400 dark:text-white/40">
              {locationCity && (
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {locationCity}</span>
              )}
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-sahifa-500 dark:hover:text-sahifa-400 transition-colors"
                >
                  <Globe className="w-3 h-3" /> {websiteUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          )}

          {/* Teacher specialization */}
          {isTeacher && specialization && (
            <div className="mt-2">
              <span className="inline-block px-3 py-1 rounded-full bg-sahifa-500/10 dark:bg-sahifa-500/20 border border-sahifa-500/20 dark:border-sahifa-500/30 text-sahifa-600 dark:text-sahifa-300 text-xs font-semibold">
                {specialization}
              </span>
            </div>
          )}

          {/* Bio (short) — always show, with role fallback */}
          <p className="text-sm text-gray-500 dark:text-white/50 mt-2 leading-relaxed line-clamp-3">
            {displayBio || bioFallback}
          </p>

          {/* ── Stats row ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-center sm:justify-start gap-5 mt-4 flex-wrap">
            {profile.followers_count !== undefined && (
              onFollowersClick ? (
                <button
                  onClick={onFollowersClick}
                  className="text-center group hover:opacity-70 transition-opacity active:scale-95"
                >
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.followers_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40 group-hover:text-sahifa-500 dark:group-hover:text-sahifa-400 transition-colors">Kuzatuvchi</span>
                </button>
              ) : (
                <div className="text-center">
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.followers_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40">Kuzatuvchi</span>
                </div>
              )
            )}
            {profile.following_count !== undefined && (
              onFollowingClick ? (
                <button
                  onClick={onFollowingClick}
                  className="text-center group hover:opacity-70 transition-opacity active:scale-95"
                >
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.following_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40 group-hover:text-sahifa-500 dark:group-hover:text-sahifa-400 transition-colors">Kuzatuv</span>
                </button>
              ) : (
                <div className="text-center">
                  <span className="block text-lg font-bold text-gray-900 dark:text-white">{profile.following_count}</span>
                  <span className="text-xs text-gray-400 dark:text-white/40">Kuzatuv</span>
                </div>
              )
            )}
            <div className="text-center">
              <span className="block text-lg font-bold text-gray-900 dark:text-white">{postCount}</span>
              <span className="text-xs text-gray-400 dark:text-white/40">Post</span>
            </div>
            {isTeacher && courseCount !== undefined && (
              <div className="text-center">
                <span className="block text-lg font-bold text-gray-900 dark:text-white">{courseCount}</span>
                <span className="text-xs text-gray-400 dark:text-white/40">Kurs</span>
              </div>
            )}
            {isTeacher && studentCount !== undefined && (
              <div className="text-center">
                <span className="block text-lg font-bold text-gray-900 dark:text-white">{studentCount}</span>
                <span className="text-xs text-gray-400 dark:text-white/40">Talaba</span>
              </div>
            )}
          </div>

          {/* ── Rank badge ───────────────────────────────────────────────── */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/[0.06]">
            <span>{rank.emoji}</span>
            <span className="text-xs font-medium text-gray-600 dark:text-white/60">{rank.title}</span>
            <span className="text-xs text-gray-400 dark:text-white/30">· Lvl {profile.level || 1}</span>
          </div>

          {/* ── XP Progress (Kabinet mode) ───────────────────────────────── */}
          {editMode && profile.xp !== undefined && (() => {
            const xp = profile.xp || 0
            const pct = Math.round(levelProgress(xp) * 100)
            const { end } = levelBounds(profile.level || 1)
            return (
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">
                  {xp.toLocaleString()} / {end.toLocaleString()} XP · {pct}%
                </p>
              </div>
            )
          })()}

          {/* ── Action buttons ───────────────────────────────────────────── */}
          <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
            {/* Own profile on PublicProfile → "Edit Profile" button */}
            {isOwnProfile && !editMode && onEditProfile && (
              <button
                onClick={onEditProfile}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/70 border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-all active:scale-95"
              >
                <PenSquare className="w-4 h-4" /> Profilni tahrirlash
              </button>
            )}

            {/* Not own profile → Connection state + Follow + Message */}
            {!isOwnProfile && !editMode && (
              <>
                {connectionStatus === 'none' && onConnect && (
                  <button
                    onClick={onConnect}
                    disabled={connectionLoading}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-sahifa-500 text-white hover:bg-sahifa-600 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {connectionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Ulanish
                  </button>
                )}

                {connectionStatus === 'pending_sent' && onCancelConnect && (
                  <button
                    onClick={onCancelConnect}
                    disabled={connectionLoading}
                    title="So'rovni bekor qilish"
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/60 border border-gray-200/60 dark:border-white/[0.08] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {connectionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Kutilmoqda
                  </button>
                )}

                {connectionStatus === 'pending_received' && (
                  <div className="flex items-center gap-2">
                    {onAcceptConnect && (
                      <button
                        onClick={onAcceptConnect}
                        disabled={connectionLoading}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-sahifa-500 text-white hover:bg-sahifa-600 transition-all active:scale-95 disabled:opacity-60"
                      >
                        {connectionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Qabul qilish
                      </button>
                    )}
                    {onDeclineConnect && (
                      <button
                        onClick={onDeclineConnect}
                        disabled={connectionLoading}
                        title="Rad etish"
                        className="p-2 rounded-xl text-gray-400 dark:text-white/40 bg-gray-100 dark:bg-white/[0.06] border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-60"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {connectionStatus === 'accepted' && (
                  <span className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200/60 dark:border-green-500/20">
                    <UserCheck className="w-4 h-4" /> Ulangan
                  </span>
                )}

                {onFollow && (
                  <button
                    onClick={onFollow}
                    disabled={followLoading}
                    title={profile.is_following ? 'Kuzatishdan chiqish' : 'Kuzatish'}
                    className="p-2.5 rounded-xl text-gray-500 dark:text-white/60 bg-gray-100 dark:bg-white/[0.06] border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-60"
                  >
                    {followLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : profile.is_following ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  </button>
                )}

                {onMessage && (
                  <button
                    onClick={canMessage ? onMessage : undefined}
                    disabled={!canMessage}
                    title={canMessage ? 'Xabar yuborish' : "Xabar yuborish uchun avval ulaning"}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
                      canMessage
                        ? 'text-gray-500 dark:text-white/60 bg-gray-100 dark:bg-white/[0.06] border border-gray-200/60 dark:border-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.10]'
                        : 'text-gray-300 dark:text-white/25 bg-gray-50 dark:bg-white/[0.03] border border-gray-200/40 dark:border-white/[0.05] cursor-not-allowed'
                    }`}
                  >
                    {canMessage ? <MessageCircle className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />} Xabar
                  </button>
                )}
              </>
            )}

            {/* Kabinet mode → edit button */}
            {editMode && onEditClick && (
              <button
                onClick={onEditClick}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-sahifa-500 text-white hover:bg-sahifa-600 transition-all active:scale-95"
              >
                <PenSquare className="w-4 h-4" /> Profilni tahrirlash
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </motion.div>
  )
}

export default ProfileHeaderCard
