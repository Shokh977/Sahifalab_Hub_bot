/**
 * SlouthMessenger — Real-time DM system.
 * Desktop: Telegram-style 2-column split (list | chat).
 * Mobile:  Single-panel toggle (list ↔ chat).
 *
 * Features: Supabase Realtime, typing indicators, read receipts,
 * link previews, optimistic send, message delete.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, Loader2, MessageSquare,
  Check, CheckCheck, Search, Trash2, Clock, X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useMessagingSafe } from '../context/MessagingContext'
import api from '../services/apiService'
import LinkPreview, { extractUrls } from '../components/social/LinkPreview'
import DeleteConfirmModal from '../components/social/DeleteConfirmModal'
import { linkify } from '../utils/linkify'
import type { UserIdentityUser } from '../components/social/UserIdentity'
import { supabase } from '../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  is_delivered: boolean
  is_read: boolean
  created_at: string
  _sending?: boolean
}

interface ConversationItem {
  id: number
  other_user: UserIdentityUser
  last_message: Message | null
  unread_count: number
  last_message_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtConvTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Kecha'
  if (diffDays < 7)  return d.toLocaleDateString('uz-UZ', { weekday: 'short' })
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })
}

function fmtMsgTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Bugun'
  if (diffDays === 1) return 'Kecha'
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Avatar sub-component ─────────────────────────────────────────────────────

const Avatar: React.FC<{
  user: UserIdentityUser
  size?: 'xs' | 'sm' | 'md' | 'lg'
  onClick?: () => void
}> = ({ user, size = 'md', onClick }) => {
  const dim = { xs: 28, sm: 34, md: 42, lg: 52 }[size]
  const initials = (user.full_name || user.username || '?').charAt(0).toUpperCase()

  return (
    <div
      onClick={onClick}
      className={`flex-shrink-0 rounded-full overflow-hidden ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: dim, height: dim }}
    >
      {user.photo_url ? (
        <img src={user.photo_url} alt={user.full_name || ''} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #e8792f, #8b2a10)',
            fontSize: dim * 0.38,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  )
}

// ── Conversation List ─────────────────────────────────────────────────────────

const ConversationList: React.FC<{
  conversations: ConversationItem[]
  loading: boolean
  activeId: number | null
  onSelect: (conv: ConversationItem) => void
}> = ({ conversations, loading, activeId, onSelect }) => {
  const [q, setQ] = useState('')

  const filtered = useMemo(() =>
    q.trim()
      ? conversations.filter(c => {
          const query = q.toLowerCase()
          return (
            (c.other_user.full_name ?? '').toLowerCase().includes(query) ||
            (c.other_user.username  ?? '').toLowerCase().includes(query)
          )
        })
      : conversations,
    [conversations, q]
  )

  return (
    <div className="flex flex-col h-full">

      {/* Panel header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-3">
        <h2 className="text-[17px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Xabarlar
        </h2>

        {/* Search */}
        <div className="relative mt-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Qidirish..."
            className="messenger-input w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="flex-shrink-0 h-px mx-4" style={{ background: 'var(--border-default)' }} />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
            >
              <MessageSquare className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
              {q ? 'Hech narsa topilmadi' : "Hali xabarlar yo'q"}
            </p>
            {!q && (
              <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                Profildan xabar yuboring
              </p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map(conv => {
              const isActive = activeId === conv.id
              const timeStr  = conv.last_message ? fmtConvTime(conv.last_message.created_at) : ''
              const preview  = conv.last_message?.content || 'Yangi suhbat'

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all relative"
                  style={{
                    background: isActive ? 'var(--brand-subtle)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-full"
                      style={{ background: 'var(--brand-primary)' }}
                    />
                  )}

                  <Avatar user={conv.other_user} size="md" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {conv.other_user.full_name || conv.other_user.username}
                      </span>
                      <span
                        className="text-[11px] flex-shrink-0 tabular-nums"
                        style={{ color: conv.unread_count > 0 ? 'var(--brand-primary)' : 'var(--text-muted)' }}
                      >
                        {timeStr}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5 gap-2">
                      <p
                        className="text-xs truncate"
                        style={{
                          color: conv.unread_count > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                          fontWeight: conv.unread_count > 0 ? 500 : 400,
                        }}
                      >
                        {preview}
                      </p>
                      {conv.unread_count > 0 && (
                        <span
                          className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                          style={{ background: 'var(--brand-primary)' }}
                        >
                          {conv.unread_count > 99 ? '99+' : conv.unread_count}
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
    </div>
  )
}

// ── Empty State (desktop no-selection) ──────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1,   opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="w-24 h-24 rounded-3xl flex items-center justify-center"
      style={{ background: 'var(--brand-subtle)', border: '1px solid var(--border-default)' }}
    >
      <MessageSquare className="w-10 h-10" style={{ color: 'var(--brand-primary)', opacity: 0.7 }} />
    </motion.div>
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="text-center"
    >
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
        Suhbat tanlang
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
        Chap paneldan suhbatni bosing
      </p>
    </motion.div>
  </div>
)

// ── Chat View ────────────────────────────────────────────────────────────────

const ChatView: React.FC<{
  conversationId: number
  otherUser: UserIdentityUser
  myId: number
  onBack: () => void
  isDesktop: boolean
}> = ({ conversationId, otherUser, myId, onBack, isDesktop }) => {
  const navigate    = useNavigate()
  const messaging   = useMessagingSafe()
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null)
  const [deletingMessage, setDeletingMessage] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  // Fetch messages and mark read
  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const res = await api.client.get(`/api/v1/messenger/conversations/${conversationId}/messages`)
        setMessages(res.data || [])
        await api.client.patch(`/api/v1/messenger/conversations/${conversationId}/delivered`)
        await api.client.patch(`/api/v1/messenger/conversations/${conversationId}/read`)
        messaging?.markRead(conversationId)
      } catch {}
      setLoading(false)
    }
    fetch()
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: any) => {
        const newMsg = payload.new as Message
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        if (newMsg.sender_id !== myId) {
          api.client.patch(`/api/v1/messenger/conversations/${conversationId}/delivered`).catch(() => {})
          api.client.patch(`/api/v1/messenger/conversations/${conversationId}/read`).catch(() => {})
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: any) => {
        const updated = payload.new as Message
        setMessages(prev =>
          prev.map(m => m.id === updated.id ? { ...m, is_delivered: updated.is_delivered, is_read: updated.is_read } : m)
        )
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, myId])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const tempMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      sender_id: myId,
      content: text,
      is_delivered: false,
      is_read: false,
      _sending: true,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await api.client.post(
        `/api/v1/messenger/conversations/${conversationId}/messages`,
        { content: text }
      )
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? res.data : m))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setInput(text)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleDeleteMessage = async () => {
    if (!deleteMessageId) return
    setDeletingMessage(true)
    try {
      await api.client.delete(`/api/v1/messenger/messages/${deleteMessageId}`)
      setMessages(prev => prev.filter(m => m.id !== deleteMessageId))
    } catch {}
    setDeletingMessage(false)
    setDeleteMessageId(null)
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Chat header ───────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
        }}
      >
        {/* Back button — always shown on mobile, hidden on desktop */}
        {!isDesktop && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl transition-colors flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* User info — clickable to profile */}
        <button
          onClick={() => navigate(`/profile/${otherUser.username || otherUser.telegram_id}`)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 active:scale-[0.98] transition-all rounded-xl px-1 -mx-1"
        >
          <Avatar user={otherUser} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {otherUser.full_name || otherUser.username}
            </p>
            {otherUser.username && (
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                @{otherUser.username}
              </p>
            )}
          </div>
        </button>
      </div>

      {/* ── Messages area ─────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-hover) transparent' }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16 select-none">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Suhbat boshlang</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMine  = msg.sender_id === myId
            const urls    = extractUrls(msg.content)
            const prevMsg = idx > 0 ? messages[idx - 1] : null
            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null

            // Group: same sender within 5 minutes
            const isFirstInGroup = !prevMsg ||
              prevMsg.sender_id !== msg.sender_id ||
              new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 300_000

            const isLastInGroup = !nextMsg ||
              nextMsg.sender_id !== msg.sender_id ||
              new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime() > 300_000

            // Date separator
            const showDateSep = !prevMsg || !sameDay(prevMsg.created_at, msg.created_at)

            // Bubble shape: all corners rounded-2xl, except the "tail" corner on last in group
            const sentRadius   = isLastInGroup ? 'rounded-2xl rounded-br-md'   : 'rounded-2xl'
            const receivedRadius = isLastInGroup ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'

            return (
              <React.Fragment key={msg.id}>
                {/* Date separator */}
                {showDateSep && (
                  <div className="flex items-center justify-center py-3">
                    <span
                      className="text-[11px] px-3 py-1 rounded-full font-medium"
                      style={{
                        color: 'var(--text-muted)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      {dayLabel(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Message row */}
                <div
                  className={`group/msg flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${
                    isFirstInGroup ? 'mt-3' : 'mt-0.5'
                  }`}
                >
                  {/* Avatar — received messages, first in group only */}
                  {!isMine && (
                    <div className="w-[28px] flex-shrink-0 self-end mb-1">
                      {isLastInGroup && (
                        <Avatar
                          user={otherUser}
                          size="xs"
                          onClick={() => navigate(`/profile/${otherUser.username || otherUser.telegram_id}`)}
                        />
                      )}
                    </div>
                  )}

                  {/* Delete button — own messages, hover reveal */}
                  {isMine && (
                    <button
                      onClick={() => setDeleteMessageId(msg.id)}
                      className="self-center p-1 rounded-lg opacity-0 group-hover/msg:opacity-100 transition-all flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#f87171'
                        e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.background = 'transparent'
                      }}
                      title="O'chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Bubble */}
                  <div className={`max-w-[70%] md:max-w-[60%] ${isMine ? sentRadius : receivedRadius} px-3.5 py-2.5`}
                    style={isMine ? {
                      background: 'linear-gradient(135deg, #e8792f, #c44a1a)',
                      boxShadow: '0 2px 12px rgba(232,121,47,0.20)',
                    } : {
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <p
                      className="text-sm whitespace-pre-wrap break-words leading-relaxed"
                      style={{ color: isMine ? '#fff' : 'var(--text-primary)' }}
                    >
                      {linkify(msg.content)}
                    </p>

                    {/* Timestamp + read receipt */}
                    <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <span
                        className="text-[10px] tabular-nums"
                        style={{ color: isMine ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)' }}
                      >
                        {msg._sending ? '' : fmtMsgTime(msg.created_at)}
                      </span>
                      {isMine && (
                        msg._sending ? (
                          <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.45)' }} />
                        ) : msg.is_read ? (
                          <CheckCheck className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.85)' }} />
                        ) : msg.is_delivered ? (
                          <CheckCheck className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.45)' }} />
                        ) : (
                          <Check className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.45)' }} />
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Link previews */}
                {urls.length > 0 && (
                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${!isMine ? 'pl-[36px]' : ''} mt-1`}>
                    <div className="max-w-[70%] md:max-w-[60%]">
                      <LinkPreview url={urls[0]} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 py-3 border-t"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Xabar yozing..."
            className="messenger-input flex-1 px-4 py-2.5 rounded-2xl text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(232,121,47,0.40)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border-default)')}
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            whileTap={{ scale: 0.88 }}
            className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'var(--brand-primary)' }}
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin text-white" />
              : <Send className="w-4 h-4 text-white" style={{ marginLeft: 1 }} />
            }
          </motion.button>
        </div>
      </div>

      {/* Delete confirm */}
      <DeleteConfirmModal
        open={!!deleteMessageId}
        title="Xabarni o'chirish"
        description="Bu xabar butunlay o'chiriladi."
        loading={deletingMessage}
        onConfirm={handleDeleteMessage}
        onCancel={() => setDeleteMessageId(null)}
      />
    </div>
  )
}

// ── Main SlouthMessenger ──────────────────────────────────────────────────────

const SlouthMessenger: React.FC = () => {
  const { conversationId: paramConvId } = useParams<{ conversationId?: string }>()
  const { user }     = useAuth()
  const messaging    = useMessagingSafe()
  const navigate     = useNavigate()

  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading,       setLoading]       = useState(true)
  const [activeConv,    setActiveConv]    = useState<ConversationItem | null>(null)
  const [isDesktop,     setIsDesktop]     = useState(window.innerWidth >= 768)

  const myId = (user as any)?.telegram_id || (user as any)?.id

  // Track viewport width for responsive split
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

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
    navigate(`/messages/${conv.id}`, { replace: true })
    messaging?.markRead(conv.id)
  }

  const handleBack = () => {
    setActiveConv(null)
    navigate('/messages', { replace: true })
    fetchConversations()
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* ── Left panel: conversation list ─────────────────────────────────── */}
      <div
        className={`
          flex-shrink-0 flex flex-col border-r transition-all
          ${activeConv
            ? 'w-0 opacity-0 md:w-[300px] lg:w-[340px] md:opacity-100'
            : 'w-full md:w-[300px] lg:w-[340px] opacity-100'
          }
        `}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
          overflow: 'hidden',
        }}
      >
        <ConversationList
          conversations={conversations}
          loading={loading}
          activeId={activeConv?.id ?? null}
          onSelect={handleSelectConv}
        />
      </div>

      {/* ── Right panel: chat or empty state ──────────────────────────────── */}
      <div
        className={`
          flex flex-col flex-1 min-w-0 transition-all
          ${activeConv ? 'opacity-100' : 'hidden md:flex md:opacity-100'}
        `}
        style={{ background: 'var(--bg-primary)' }}
      >
        {activeConv ? (
          <ChatView
            conversationId={activeConv.id}
            otherUser={activeConv.other_user}
            myId={myId}
            onBack={handleBack}
            isDesktop={isDesktop}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

export default SlouthMessenger
