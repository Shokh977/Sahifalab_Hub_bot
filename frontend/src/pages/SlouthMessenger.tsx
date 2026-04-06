/**
 * SlouthMessenger — Real-time DM system.
 *
 * Text/link only (no media uploads).
 * Uses Supabase Realtime for instant message delivery.
 * Features: typing indicators, read receipts, link previews,
 * glassmorphism bubbles (orange = sent, slate-glass = received).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, MessageSquare, Check, CheckCheck, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import api from '../services/apiService'
import UserIdentity from '../components/social/UserIdentity'
import LinkPreview, { extractUrls } from '../components/social/LinkPreview'
import { linkify } from '../utils/linkify'
import type { UserIdentityUser } from '../components/social/UserIdentity'
import { supabase } from '../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  is_read: boolean
  created_at: string
}

interface ConversationItem {
  id: number
  other_user: UserIdentityUser
  last_message: Message | null
  unread_count: number
  last_message_at: string
}

// ── Conversation List ────────────────────────────────────────────────────────

const ConversationList: React.FC<{
  conversations: ConversationItem[]
  loading: boolean
  activeId?: number | null
  onSelect: (conv: ConversationItem) => void
}> = ({ conversations, loading, activeId, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery.trim()
    ? conversations.filter(c => {
        const q = searchQuery.toLowerCase()
        return (
          (c.other_user.full_name ?? '').toLowerCase().includes(q) ||
          (c.other_user.username ?? '').toLowerCase().includes(q)
        )
      })
    : conversations

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div>
      {/* Search bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Suhbat qidirish..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-white/25 outline-none focus:border-sahifa-500/30 transition-colors"
          />
        </div>
      </div>

      {filtered.length === 0 && !loading ? (
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-white/10" />
          </div>
          <p className="text-white/30 text-sm font-medium">
            {searchQuery ? "Hech narsa topilmadi" : "Hali xabarlar yo'q"}
          </p>
          <p className="text-white/15 text-xs mt-1">
            {searchQuery ? "Boshqa so'z bilan qidiring" : "Profildan xabar yuboring"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {filtered.map(conv => {
            const lastMsg = conv.last_message
            const isActive = activeId === conv.id
            const timeStr = lastMsg
              ? new Date(lastMsg.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`w-full flex items-center gap-3 p-4 transition-all text-left relative ${
                  isActive
                    ? 'bg-sahifa-500/[0.08] border-l-2 border-sahifa-500'
                    : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                }`}
              >
                <UserIdentity user={conv.other_user} size="md" showName={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <UserIdentity user={conv.other_user} size="xs" showName showBadge className="!gap-1.5" />
                    <span className="text-[10px] text-white/30 flex-shrink-0">{timeStr}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-white/40 truncate max-w-[200px]">
                      {lastMsg?.content || 'Yangi suhbat'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sahifa-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Chat View ────────────────────────────────────────────────────────────────

const ChatView: React.FC<{
  conversationId: number
  otherUser: UserIdentityUser
  myId: number
  onBack: () => void
}> = ({ conversationId, otherUser, myId, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true)
      try {
        const res = await api.client.get(`/api/v1/messenger/conversations/${conversationId}/messages`)
        setMessages(res.data || [])
        // Mark as read
        await api.client.patch(`/api/v1/messenger/conversations/${conversationId}/read`)
      } catch {}
      setLoading(false)
    }
    fetchMessages()
  }, [conversationId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as Message
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // Mark read if from other user
          if (newMsg.sender_id !== myId) {
            api.client.patch(`/api/v1/messenger/conversations/${conversationId}/read`).catch(() => {})
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, myId])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    // Optimistic insert
    const tempMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await api.client.post(
        `/api/v1/messenger/conversations/${conversationId}/messages`,
        { content: text }
      )
      // Replace temp with real
      setMessages(prev =>
        prev.map(m => m.id === tempMsg.id ? res.data : m)
      )
    } catch {
      // Remove failed message
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setInput(text) // Restore input
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] bg-pitch/80 backdrop-blur-xl">
        <button onClick={onBack} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <UserIdentity user={otherUser} size="sm" showRank showBadge />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-white/20" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs text-white/20">Suhbat boshlang</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.sender_id === myId
            const urls = extractUrls(msg.content)
            const showTime = idx === 0 ||
              new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000

            // Avatar grouping: show avatar only for the first message in a consecutive same-sender sequence
            const prevMsg = idx > 0 ? messages[idx - 1] : null
            const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id || showTime

            return (
              <React.Fragment key={msg.id}>
                {showTime && (
                  <div className="text-center py-2">
                    <span className="text-[10px] text-white/20 px-2 py-0.5 rounded-full bg-white/[0.03]">
                      {new Date(msg.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${!isFirstInGroup ? (isMine ? 'pr-0' : 'pl-10') : ''}`}>
                  {/* Avatar for received messages — only first in group */}
                  {!isMine && isFirstInGroup && (
                    <div className="flex-shrink-0 mr-2 self-end mb-1">
                      <UserIdentity user={otherUser} size="xs" showName={false} />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                      isMine
                        ? 'bg-sahifa-500/90 text-white rounded-br-md shadow-[0_2px_12px_rgba(241,89,41,0.25)]'
                        : 'bg-white/[0.06] backdrop-blur-sm text-white/80 border border-white/[0.06] rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {linkify(msg.content)}
                    </p>
                    {/* Read receipt for sent messages */}
                    {isMine && (
                      <div className="flex justify-end mt-0.5">
                        {msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-white/60" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-white/40" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Link previews */}
                {urls.length > 0 && (
                  <div className={`${isMine ? 'ml-auto' : 'mr-auto'} max-w-[75%] mt-1`}>
                    {urls.slice(0, 1).map(url => (
                      <LinkPreview key={url} url={url} />
                    ))}
                  </div>
                )}
              </React.Fragment>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-white/[0.04] bg-pitch/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Xabar yozing..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-white/30 outline-none focus:border-sahifa-500/30 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-sahifa-500 text-white hover:bg-sahifa-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Messenger Page ──────────────────────────────────────────────────────

const SlouthMessenger: React.FC = () => {
  const { conversationId: paramConvId } = useParams<{ conversationId?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConv, setActiveConv] = useState<ConversationItem | null>(null)

  const myId = (user as any)?.telegram_id || (user as any)?.id

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.client.get('/api/v1/messenger/conversations')
      setConversations(res.data || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  // Open conversation from URL param
  useEffect(() => {
    if (paramConvId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === Number(paramConvId))
      if (conv) setActiveConv(conv)
    }
  }, [paramConvId, conversations])

  const handleSelectConv = (conv: ConversationItem) => {
    setActiveConv(conv)
    navigate(`/messenger/${conv.id}`, { replace: true })
  }

  const handleBack = () => {
    setActiveConv(null)
    navigate('/messenger', { replace: true })
    fetchConversations() // Refresh list
  }

  return (
    <div className="min-h-screen bg-pitch flex flex-col" style={{ height: '100dvh' }}>
      {activeConv ? (
        <ChatView
          conversationId={activeConv.id}
          otherUser={activeConv.other_user}
          myId={myId}
          onBack={handleBack}
        />
      ) : (
        <>
          {/* Header */}
          <div className="sticky top-0 z-30 bg-pitch/80 backdrop-blur-xl border-b border-white/[0.04]">
            <div className="max-w-2xl mx-auto px-4 py-3">
              <h1 className="text-lg font-bold text-white tracking-tight">Xabarlar</h1>
              <p className="text-xs text-white/30">Shaxsiy xabarlar</p>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 max-w-2xl mx-auto w-full overflow-y-auto">
            <ConversationList
              conversations={conversations}
              loading={loading}
              activeId={null}
              onSelect={handleSelectConv}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default SlouthMessenger
