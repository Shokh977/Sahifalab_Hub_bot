/**
 * GlobalMessagingWatcher — always-on Supabase Realtime listener.
 *
 * Lives at the app root (inside Router + AuthProvider + MessagingProvider).
 * On auth:
 *   1. Fetches /messenger/conversations and initialises MessagingContext.
 *   2. Opens a single Supabase channel for all direct_messages INSERTs.
 *   3. Client-side filters: only process rows where conversation_id is in
 *      myConvIds and sender_id !== current user.
 *   4. Calls incrementUnread() and showToast() for messages arriving outside
 *      the active chat.
 *
 * When the user is IN the active conversation (URL = /messages/:convId or
 * /messenger/:convId) we skip the toast — the chat page already handles it.
 */

import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMessagingSafe } from '../context/MessagingContext'
import api from '../services/apiService'
import { supabase } from '../lib/supabase'

const GlobalMessagingWatcher: React.FC = () => {
  const { isAuthenticated, user } = useAuth()
  const ctx = useMessagingSafe()
  const location = useLocation()

  // Refs so the Supabase handler always sees fresh values without
  // needing to recreate the subscription on every state change.
  const myConvIdsRef = useRef<Set<number>>(new Set())
  const convUsersRef = useRef<Record<number, any>>({})
  const locationRef  = useRef(location)

  useEffect(() => { locationRef.current = location }, [location])

  useEffect(() => {
    if (!ctx) return
    myConvIdsRef.current = ctx.myConvIds
    convUsersRef.current = ctx.convUsers
  }, [ctx?.myConvIds, ctx?.convUsers])

  const myId = (user as any)?.telegram_id ?? (user as any)?.id

  // ── 1. Fetch conversations once on login ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !ctx) return
    api.client
      .get('/api/v1/messenger/conversations')
      .then(res => ctx.init(res.data || []))
      .catch(() => {})
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Global Supabase Realtime subscription ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !myId || !ctx) return

    const channel = supabase
      .channel('global-dm-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload: any) => {
          const msg = payload.new
          if (!msg) return

          // Skip own messages
          if (msg.sender_id === myId) return

          // Skip conversations that aren't mine
          if (!myConvIdsRef.current.has(msg.conversation_id)) return

          // Increment badge
          ctx.incrementUnread(msg.conversation_id)

          // Skip toast if the user is already viewing this conversation
          const pathMatch = locationRef.current.pathname.match(
            /\/(?:messages|messenger)\/(\d+)/
          )
          const activeConvId = pathMatch ? Number(pathMatch[1]) : null
          if (activeConvId === msg.conversation_id) return

          // Also skip if user is on the messages list — they'll see it
          const onMessagesRoot =
            locationRef.current.pathname === '/messages' ||
            locationRef.current.pathname === '/messenger'
          if (onMessagesRoot) return

          // Show toast
          const sender = convUsersRef.current[msg.conversation_id]
          ctx.showToast({
            convId: msg.conversation_id,
            senderName:
              sender?.full_name || sender?.username || 'Foydalanuvchi',
            senderAvatar: sender?.photo_url ?? null,
            preview: msg.content ?? '…',
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default GlobalMessagingWatcher
