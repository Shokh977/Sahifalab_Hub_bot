/**
 * AI companion chat — always routed through the backend's /api/ai/chat proxy.
 *
 * This used to call the Gemini SDK directly from the browser with an API key
 * baked into the client bundle (VITE_GEMINI_API_KEY). Anyone could extract
 * that key from the built JS and run up billing/abuse against it outside the
 * app. The backend already has a working proxy (apiService.aiChat) that holds
 * the real key server-side, so there is no reason for the client to ever call
 * Gemini directly.
 */
import apiService from './apiService'

export async function geminiChat(message: string): Promise<string> {
  try {
    const res = await apiService.aiChat(message)
    return res.data?.reply || res.data?.response || 'Javob olinmadi.'
  } catch (e: any) {
    console.error('[AI chat]', e)
    return 'AI hozir ishlamayapti. Iltimos, keyinroq urinib ko\'ring. 🙏'
  }
}
