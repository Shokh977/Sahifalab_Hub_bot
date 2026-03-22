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

// Models ordered by preference — free-tier availability changes over time
const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash']

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
  _model = buildModel(MODELS[0])
  return _model
}

export async function geminiChat(message: string): Promise<string> {
  if (!GEMINI_KEY) {
    return 'AI hali sozlanmagan. Administrator VITE_GEMINI_API_KEY ni qo\'shishi kerak. 🔧'
  }

  // Try each model in order until one succeeds
  for (const modelName of MODELS) {
    try {
      const model = buildModel(modelName)
      const result = await model.generateContent(message)
      _model = model // cache the working model for next calls
      return result.response.text().trim()
    } catch (e: any) {
      console.error(`[Gemini ${modelName}]`, e)
      // If quota/rate-limit error (429), try next model
      if (e?.message?.includes('429') || e?.status === 429) continue
      // For other errors, stop trying
      const reason = e?.message || 'Noma\'lum xatolik'
      return `AI xatolik: ${reason} 🔧`
    }
  }

  return 'AI modellari hozir ishlamayapti. Iltimos, keyinroq urinib ko\'ring. 🙏'
}

export const isGeminiConfigured = !!GEMINI_KEY
