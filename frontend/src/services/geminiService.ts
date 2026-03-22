/**
 * Direct Gemini AI service — calls Google Gemini from the browser.
 * Eliminates the ~5s Vercel cold-start overhead completely.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string

const SYSTEM_PROMPT =
  "Sen SAHIFALAB platformasining rasmiy AI yordamchisisan. " +
  "O'zingni hech qachon Sam deb tanishtirma va yosh aytma. " +
  "Sen shaxs emas, SAHIFALAB platformasi nomidan yordam beradigan AI yordamchisan. " +
  "Asosan o'zbek tilida javob ber, lekin foydalanuvchi rus yoki ingliz tilida yozsa, shu tilda javob ber. " +
  "Kitoblar, ta'lim, o'z-o'zini rivojlantirish mavzularida yordam ber. " +
  "Javoblarni qisqa, aniq va foydali ber. Emoji ishlatishingiz mumkin. " +
  "Foydalanuvchi salom bermasa, har javobni salomlashish bilan boshlama. To'g'ridan-to'g'ri savolga javob ber."

let _model: any = null

function getModel() {
  if (_model) return _model
  if (!GEMINI_KEY) return null
  const genAI = new GoogleGenerativeAI(GEMINI_KEY)
  // Try gemini-2.0-flash-lite first; fall back to gemini-1.5-flash if unavailable
  _model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.7,
    },
  })
  return _model
}

function getFallbackModel() {
  if (!GEMINI_KEY) return null
  const genAI = new GoogleGenerativeAI(GEMINI_KEY)
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.7,
    },
  })
}

export async function geminiChat(message: string): Promise<string> {
  const model = getModel()
  if (!model) {
    return 'AI hali sozlanmagan. Administrator VITE_GEMINI_API_KEY ni qo\'shishi kerak. 🔧'
  }
  try {
    const result = await model.generateContent(message)
    return result.response.text().trim()
  } catch (e: any) {
    console.error('[Gemini primary]', e)
    // Try fallback model
    try {
      const fallback = getFallbackModel()
      if (fallback) {
        const result = await fallback.generateContent(message)
        _model = fallback // switch to working model
        return result.response.text().trim()
      }
    } catch (e2: any) {
      console.error('[Gemini fallback]', e2)
    }
    const reason = e?.message || e?.status || 'Noma\'lum xatolik'
    return `AI xatolik: ${reason} 🔧`
  }
}

export const isGeminiConfigured = !!GEMINI_KEY
