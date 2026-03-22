/**
 * Direct Gemini AI service — calls Google Gemini from the browser.
 * Eliminates the ~5s Vercel cold-start overhead completely.
 * Falls back to backend API if Gemini is rate-limited.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import apiService from './apiService'

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

// Primary model
const MODEL_NAME = 'gemini-2.0-flash'

function buildModel(modelName: string) {
  const genAI = new GoogleGenerativeAI(GEMINI_KEY)
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.7,
    },
  })
}

function getModel() {
  if (_model) return _model
  if (!GEMINI_KEY) return null
  _model = buildModel(MODEL_NAME)
  return _model
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function geminiChat(message: string): Promise<string> {
  if (!GEMINI_KEY) {
    // No frontend key — go through backend
    return backendFallback(message)
  }

  const model = getModel()!

  // Retry once on 429, then fall back to backend
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(message)
      return result.response.text().trim()
    } catch (e: any) {
      const is429 = e?.message?.includes('429') || e?.status === 429
      console.error(`[Gemini attempt ${attempt + 1}]`, is429 ? '429 rate limit' : e)

      if (is429 && attempt === 0) {
        await sleep(2000)
        continue
      }

      // Rate-limited or other error → fall back to backend API
      if (is429) {
        console.warn('[Gemini] rate-limited, falling back to backend API')
        return backendFallback(message)
      }
      const reason = e?.message || 'Noma\'lum xatolik'
      return `AI xatolik: ${reason} 🔧`
    }
  }

  return backendFallback(message)
}

/** Slow but reliable — goes through Vercel backend */
async function backendFallback(message: string): Promise<string> {
  try {
    const res = await apiService.aiChat(message)
    return res.data?.reply || res.data?.response || 'Javob olinmadi.'
  } catch (e: any) {
    console.error('[Backend fallback]', e)
    return 'AI hozir ishlamayapti. Iltimos, keyinroq urinib ko\'ring. 🙏'
  }
}

export const isGeminiConfigured = !!GEMINI_KEY
