/**
 * MessagingContext — global unread count + toast state for real-time DMs.
 *
 * Keeps a totalUnread counter and per-conversation unread counts that update
 * instantly via Supabase Realtime (see GlobalMessagingWatcher in App.tsx).
 *
 * Consuming components:
 *   useMessaging()     — throws if outside provider (layout / chat pages)
 *   useMessagingSafe() — returns null outside provider (optional usage)
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConvUser {
  id: number
  full_name: string | null
  username: string | null
  photo_url: string | null
}

export interface ToastData {
  convId: number
  senderName: string
  senderAvatar: string | null
  preview: string
}

interface MessagingState {
  totalUnread: number
  unreadByConv: Record<number, number>
  myConvIds: Set<number>
  convUsers: Record<number, ConvUser>
  toast: ToastData | null
}

interface MessagingContextValue extends MessagingState {
  /** Populate from /messenger/conversations response on login */
  init: (conversations: any[]) => void
  /** Add a single conversation (e.g. after opening a new DM) */
  addConv: (convId: number, otherUser: ConvUser) => void
  /** Called when a new message arrives for convId */
  incrementUnread: (convId: number) => void
  /** Called when the user opens a conversation */
  markRead: (convId: number) => void
  /** Show a message toast notification */
  showToast: (data: ToastData) => void
  /** Dismiss the current toast */
  clearToast: () => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const MessagingContext = createContext<MessagingContextValue | null>(null)

export const useMessaging = (): MessagingContextValue => {
  const ctx = useContext(MessagingContext)
  if (!ctx) throw new Error('useMessaging must be used inside MessagingProvider')
  return ctx
}

export const useMessagingSafe = (): MessagingContextValue | null =>
  useContext(MessagingContext)

// ── Provider ─────────────────────────────────────────────────────────────────

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MessagingState>({
    totalUnread: 0,
    unreadByConv: {},
    myConvIds: new Set(),
    convUsers: {},
    toast: null,
  })

  const init = useCallback((conversations: any[]) => {
    const unreadByConv: Record<number, number> = {}
    const convUsers: Record<number, ConvUser> = {}
    const myConvIds = new Set<number>()
    let totalUnread = 0

    for (const conv of conversations) {
      myConvIds.add(conv.id)
      const cnt = conv.unread_count ?? 0
      unreadByConv[conv.id] = cnt
      totalUnread += cnt
      if (conv.other_user) {
        convUsers[conv.id] = {
          id: conv.other_user.telegram_id ?? conv.other_user.id,
          full_name: conv.other_user.full_name ?? null,
          username: conv.other_user.username ?? null,
          photo_url: conv.other_user.photo_url ?? null,
        }
      }
    }

    setState(prev => ({ ...prev, totalUnread, unreadByConv, myConvIds, convUsers }))
  }, [])

  const addConv = useCallback((convId: number, otherUser: ConvUser) => {
    setState(prev => ({
      ...prev,
      myConvIds: new Set([...prev.myConvIds, convId]),
      convUsers: { ...prev.convUsers, [convId]: otherUser },
      unreadByConv: { ...prev.unreadByConv, [convId]: prev.unreadByConv[convId] ?? 0 },
    }))
  }, [])

  const incrementUnread = useCallback((convId: number) => {
    setState(prev => ({
      ...prev,
      totalUnread: prev.totalUnread + 1,
      unreadByConv: {
        ...prev.unreadByConv,
        [convId]: (prev.unreadByConv[convId] ?? 0) + 1,
      },
    }))
  }, [])

  const markRead = useCallback((convId: number) => {
    setState(prev => {
      const was = prev.unreadByConv[convId] ?? 0
      if (was === 0) return prev
      return {
        ...prev,
        totalUnread: Math.max(0, prev.totalUnread - was),
        unreadByConv: { ...prev.unreadByConv, [convId]: 0 },
      }
    })
  }, [])

  const showToast = useCallback((data: ToastData) => {
    setState(prev => ({ ...prev, toast: data }))
  }, [])

  const clearToast = useCallback(() => {
    setState(prev => ({ ...prev, toast: null }))
  }, [])

  return (
    <MessagingContext.Provider
      value={{ ...state, init, addConv, incrementUnread, markRead, showToast, clearToast }}
    >
      {children}
    </MessagingContext.Provider>
  )
}
