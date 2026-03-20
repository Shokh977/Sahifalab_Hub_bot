import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiService from '../services/apiService'

interface Message {
  id: string
  type: 'user' | 'ai'
  text: string
  timestamp: Date
}

interface ChatResponse {
  reply: string
  source?: string
}

// Admin can set this manually in code
const SAHIFALAB_AI_AVATAR_URL = ''

const AICompanionPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      text: "Salom! Men SAHIFALAB AI yordamchisiman. Kitoblar, o'qish va ta'lim bo'yicha savollaringizga yordam beraman.",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedInput = inputValue.trim()
    
    if (!trimmedInput) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: trimmedInput,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setError('')
    setLoading(true)

    try {
      const response = await apiService.aiChat(trimmedInput)
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        text: response.data.reply,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || 'Xizmatda xatolik yuz berdi'
      setError(String(errorMsg))
      
      // Add error message as AI response
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        text: `Uzur, xatolik yuz berdi: ${errorMsg}. Iltimos, keyinroq qayta urinib ko'ring.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] max-w-2xl mx-auto bg-white dark:bg-gray-900">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 z-10"
      >
        <div className="flex items-center gap-3">
          {SAHIFALAB_AI_AVATAR_URL ? (
            <img
              src={SAHIFALAB_AI_AVATAR_URL}
              alt="SahifaLab AI"
              className="w-10 h-10 rounded-full object-cover border-2 border-sahifa-300 dark:border-sahifa-700"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 text-white flex items-center justify-center font-bold text-sm">
              AI
            </div>
          )}
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white">SahifaLab AI</h1>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">🟢 Tayyorman</p>
          </div>
        </div>
      </motion.div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                  message.type === 'user'
                    ? 'bg-sahifa-500 text-white rounded-br-none'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.type === 'user'
                      ? 'text-sahifa-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString('uz-UZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-none">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-red-600 dark:text-red-400 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg"
          >
            ⚠️ {error}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={loading}
            placeholder="Kitob haqida savol yoki fikr qoldiring..."
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sahifa-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="px-4 py-3 bg-sahifa-500 hover:bg-sahifa-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-2xl font-semibold transition-colors disabled:cursor-not-allowed"
          >
            ➤
          </motion.button>
        </form>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-4">
          💡 Masalan: "Abdulla Qahhor kim?"
        </p>
      </div>
    </div>
  )
}

export default AICompanionPage
