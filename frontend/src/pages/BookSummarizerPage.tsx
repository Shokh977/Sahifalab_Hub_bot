import React, { useState } from 'react'
import { motion } from 'framer-motion'
import apiService from '../services/apiService'

interface SummarizerResponse {
  summary: string
  assistant_reply: string
  key_points: string[]
  word_count: number
  sentence_count: number
}

// Admin can set this manually in code (or via env/build-time replacement)
// Example: const SAHIFALAB_AI_AVATAR_URL = '/ai-avatar.png'
const SAHIFALAB_AI_AVATAR_URL = ''

const BookSummarizerPage: React.FC = () => {
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('')
  const [maxSentences, setMaxSentences] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SummarizerResponse | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (text.trim().length < 120) {
      setError("Iltimos, kamida 120 belgilik matn kiriting.")
      return
    }

    setLoading(true)
    try {
      const r = await apiService.bookSummarizer(text, question || undefined, maxSentences)
      setResult(r.data)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Xizmatda xatolik yuz berdi"
      setError(String(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700"
      >
        <div className="flex items-center gap-3">
          {SAHIFALAB_AI_AVATAR_URL ? (
            <img
              src={SAHIFALAB_AI_AVATAR_URL}
              alt="SahifaLab AI"
              className="w-11 h-11 rounded-full object-cover border-2 border-sahifa-300 dark:border-sahifa-700"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sahifa-400 to-sahifa-600 text-white flex items-center justify-center font-black">
              AI
            </div>
          )}
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-white">🤖 SahifaLab AI</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Book Summarizer</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Bepul AI yordamchi: kitob matnini qisqartiradi va savollaringizga o'zbekcha javob beradi.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        onSubmit={onSubmit}
        className="space-y-3"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Kitob matni</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Kitobdan bo'lim yoki paragrafni shu yerga qo'ying..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-sahifa-400"
          />
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Belgilar: {text.length}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Savolingiz (ixtiyoriy)</label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Masalan: Muallifning asosiy fikri nima?"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-sahifa-400"
          />

          <div className="pt-1">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Qisqa mazmun uzunligi</label>
            <select
              value={maxSentences}
              onChange={(e) => setMaxSentences(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-sahifa-400"
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n} ta gap</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl py-3 bg-sahifa-500 hover:bg-sahifa-600 disabled:opacity-60 text-white text-sm font-bold transition-colors"
        >
          {loading ? 'Tahlil qilinmoqda...' : '🧠 Qisqa mazmun chiqarish'}
        </button>
      </motion.form>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-3"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {result.word_count} ta so'z • {result.sentence_count} ta gap
            </p>
            <h2 className="text-sm font-black text-gray-900 dark:text-white">Qisqa mazmun</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">{result.summary}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-black text-gray-900 dark:text-white">Asosiy nuqtalar</h3>
            <ul className="mt-2 space-y-1.5">
              {result.key_points.map((point, idx) => (
                <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">• {point}</li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              {SAHIFALAB_AI_AVATAR_URL ? (
                <img
                  src={SAHIFALAB_AI_AVATAR_URL}
                  alt="SahifaLab AI"
                  className="w-7 h-7 rounded-full object-cover border border-blue-300 dark:border-blue-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center">AI</div>
              )}
              <h3 className="text-sm font-black text-blue-900 dark:text-blue-300">SahifaLab AI javobi</h3>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed mt-2 whitespace-pre-line">
              {result.assistant_reply}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default BookSummarizerPage
