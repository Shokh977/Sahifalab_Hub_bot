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
const MODELS = ['gemini-2.0-flash']
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 3000 // wait 3s before retrying on 429

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function geminiChat(message: string): Promise<string> {
  if (!GEMINI_KEY) {
    return 'AI hali sozlanmagan. Administrator VITE_GEMINI_API_KEY ni qo\'shishi kerak. 🔧'
  }

  const model = getModel()!

  // Retry with exponential back-off on 429 (rate limit)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(message)
      return result.response.text().trim()
    } catch (e: any) {
      const is429 = e?.message?.includes('429') || e?.status === 429
      console.error(`[Gemini attempt ${attempt + 1}]`, is429 ? '429 rate limit' : e)

      if (is429 && attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1)) // 3s, 6s, 9s
        continue
      }

      if (is429) {
        return 'AI hozir band. Iltimos, 30 soniyadan keyin qayta urinib ko\'ring. ⏳'
      }
      const reason = e?.message || 'Noma\'lum xatolik'
      return `AI xatolik: ${reason} 🔧`
    }
  }

  return 'AI modellari hozir ishlamayapti. Iltimos, keyinroq urinib ko\'ring. 🙏'
}

export const isGeminiConfigured = !!GEMINI_KEY
