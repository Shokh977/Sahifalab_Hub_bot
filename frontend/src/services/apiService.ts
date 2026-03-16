import axios, { AxiosInstance } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

class ApiService {
  private axiosInstance: AxiosInstance

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add interceptor to include auth token
    this.axiosInstance.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      console.debug(`[API] → ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.params || '')
      return config
    })

    // Log every response
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.debug(`[API] ← ${response.status} ${response.config.url}`, response.data)
        return response
      },
      (error) => {
        const status = error?.response?.status ?? 'NO_RESPONSE'
        const url = error?.config?.url ?? ''
        const detail = error?.response?.data?.detail ?? error?.response?.data ?? error?.message ?? 'Unknown error'
        console.error(`[API] ❌ ${status} ${url}`, detail, error?.response?.data)
        return Promise.reject(error)
      },
    )
  }

  // User endpoints
  async getUserProfile(userId: number) {
    return this.axiosInstance.get(`/api/users/${userId}`)
  }

  async createUser(userData: any) {
    return this.axiosInstance.post('/api/users', userData)
  }

  async updateUser(userId: number, userData: any) {
    return this.axiosInstance.put(`/api/users/${userId}`, userData)
  }

  // Product endpoints
  async getProducts(skip: number = 0, limit: number = 10) {
    return this.axiosInstance.get('/api/products', { params: { skip, limit } })
  }

  async getProduct(productId: number) {
    return this.axiosInstance.get(`/api/products/${productId}`)
  }

  async searchProducts(query: string) {
    return this.axiosInstance.get('/api/products/search', { params: { q: query } })
  }

  // Order endpoints
  async createOrder(orderData: any) {
    return this.axiosInstance.post('/api/orders', orderData)
  }

  async getUserOrders(userId: number) {
    return this.axiosInstance.get(`/api/users/${userId}/orders`)
  }

  async getOrder(orderId: number) {
    return this.axiosInstance.get(`/api/orders/${orderId}`)
  }

  async updateOrder(orderId: number, orderData: any) {
    return this.axiosInstance.put(`/api/orders/${orderId}`, orderData)
  }

  // Cart endpoints
  async getCart(userId: number) {
    return this.axiosInstance.get(`/api/cart/${userId}`)
  }

  async addToCart(userId: number, productId: number, quantity: number) {
    return this.axiosInstance.post(`/api/cart/${userId}`, {
      product_id: productId,
      quantity,
    })
  }

  async removeFromCart(userId: number, productId: number) {
    return this.axiosInstance.delete(`/api/cart/${userId}/${productId}`)
  }

  async clearCart(userId: number) {
    return this.axiosInstance.delete(`/api/cart/${userId}`)
  }

  // Hero Content endpoints
  async getHeroContent() {
    return this.axiosInstance.get('/api/hero')
  }

  // Quiz endpoints
  async getQuizzes() {
    return this.axiosInstance.get('/api/quizzes')
  }

  async getQuizQuestions(quizId: number) {
    return this.axiosInstance.get(`/api/quizzes/${quizId}/questions`)
  }

  async submitQuizAnswers(quizId: number, answers: number[]) {
    return this.axiosInstance.post(`/api/quizzes/${quizId}/submit`, { answers })
  }

  // Books endpoints
  async getBooks(skip = 0, limit = 50) {
    return this.axiosInstance.get('/api/books', { params: { skip, limit } })
  }

  async getBook(bookId: number) {
    return this.axiosInstance.get(`/api/books/${bookId}`)
  }

  async downloadBook(bookId: number) {
    return this.axiosInstance.get(`/api/books/${bookId}/download`, {
      responseType: 'blob',
    })
  }

  // Resources endpoints
  async getResources() {
    return this.axiosInstance.get('/api/resources')
  }

  async getResourcesByCategory(category: string) {
    return this.axiosInstance.get('/api/resources', { params: { category } })
  }

  // ─── Admin endpoints ────────────────────────────────────────────────────────

  /** All admin calls pass telegram_id as a query param for identity */
  private adminParams(telegramId: number) {
    return { params: { telegram_id: telegramId } }
  }

  async getAdminStats(telegramId: number) {
    return this.axiosInstance.get('/api/admin/dashboard/stats', this.adminParams(telegramId))
  }

  async debugDb(telegramId: number) {
    return this.axiosInstance.get('/api/admin/debug', this.adminParams(telegramId))
  }

  // Admin – Hero
  async getAdminHeroList(telegramId: number) {
    return this.axiosInstance.get('/api/admin/hero', this.adminParams(telegramId))
  }

  async createHeroContent(telegramId: number, data: any) {
    return this.axiosInstance.post('/api/admin/hero', data, this.adminParams(telegramId))
  }

  async updateHeroContent(heroId: number, telegramId: number, data: any) {
    return this.axiosInstance.put(`/api/admin/hero/${heroId}`, data, this.adminParams(telegramId))
  }

  async deleteHeroContent(heroId: number, telegramId: number) {
    return this.axiosInstance.delete(`/api/admin/hero/${heroId}`, this.adminParams(telegramId))
  }

  // Admin – Quizzes
  async uploadQuiz(telegramId: number, quizJson: any) {
    return this.axiosInstance.post('/api/admin/quizzes/upload', quizJson, this.adminParams(telegramId))
  }

  // Admin – Books
  async getAdminBooks(telegramId: number) {
    return this.axiosInstance.get('/api/admin/books', this.adminParams(telegramId))
  }

  async createBook(telegramId: number, data: any) {
    return this.axiosInstance.post('/api/admin/books', data, this.adminParams(telegramId))
  }

  async updateBook(bookId: number, telegramId: number, data: any) {
    return this.axiosInstance.put(`/api/admin/books/${bookId}`, data, this.adminParams(telegramId))
  }

  async deleteBook(bookId: number, telegramId: number) {
    return this.axiosInstance.delete(`/api/admin/books/${bookId}`, this.adminParams(telegramId))
  }

  // ─── Payment endpoints ──────────────────────────────────────────────────────

  async initiateStarsPayment(bookId: number, userId: number) {
    return this.axiosInstance.post('/api/payments/telegram-stars/pay', null, {
      params: { book_id: bookId, user_id: userId },
    })
  }

  async initiateClickPayment(bookId: number, merchantUserId: string) {
    return this.axiosInstance.post('/api/payments/click/prepare', null, {
      params: { book_id: bookId, merchant_user_id: merchantUserId },
    })
  }

  async initiatePaymePayment(bookId: number, phone: string) {
    return this.axiosInstance.post('/api/payments/payme/subscribe', null, {
      params: { book_id: bookId, phone },
    })
  }

  // ─── Audio endpoints ──────────────────────────────────────────────────────

  /** Convert Telegram file_id → temporary direct download URL */
  async getAudioLink(fileId: string): Promise<string> {
    const resp = await this.axiosInstance.get(`/api/audio/get-audio-link/${fileId}`)
    return resp.data.url
  }
  /** List all active ambient sounds from the database */
  async getAmbientSounds() {
    return this.axiosInstance.get('/api/audio/ambient-sounds')
  }

  /**
   * Two-step MP3 upload — NO backend call for auth config.
   *  Step 1 – Upload file directly to Telegram Bot API from the browser
   *            (uses VITE_TELEGRAM_BOT_TOKEN + VITE_STORAGE_CHAT_ID env vars)
   *  Step 2 – Send the resulting file_id to our backend to persist in DB
   *
   * Prerequisites:
   *  • VITE_TELEGRAM_BOT_TOKEN  must be set in Vercel frontend env vars
   *  • VITE_STORAGE_CHAT_ID     should be a chat/group/channel where the bot
   *    is a member. Falls back to the admin's own telegram_id, which requires
   *    the admin to have previously opened/started the bot.
   */
  async uploadAmbientSound(telegramId: number, name: string, emoji: string, file: File) {
    const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined
    if (!token) {
      throw new Error('VITE_TELEGRAM_BOT_TOKEN env var is not set in Vercel')
    }

    // Prefer an explicit storage chat; fall back to admin's own DM with the bot
    const chatId: string = (import.meta.env.VITE_STORAGE_CHAT_ID as string) || String(telegramId)

    console.log('[Sound Upload] Step 1 – preparing Telegram upload', {
      name, emoji,
      fileName: file.name, fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      chatId,
      tokenPrefix: token.slice(0, 8) + '…',
    })

    // ── Step 1: upload MP3 directly to Telegram (bypasses Vercel body limit) ──
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('title', name)
    formData.append('audio', file)

    let tgData: any
    try {
      console.log('[Sound Upload] Sending to api.telegram.org/sendAudio …')
      const tgRes = await fetch(
        `https://api.telegram.org/bot${token}/sendAudio`,
        { method: 'POST', body: formData },
      )
      tgData = await tgRes.json()
      console.log('[Sound Upload] Telegram response:', tgData)
    } catch (fetchErr: any) {
      // Network / CORS failure hitting the Telegram endpoint
      console.error('[Sound Upload] ❌ fetch to Telegram failed:', fetchErr)
      throw new Error(
        `Telegram ga ulanib bo'lmadi: ${fetchErr.message}. ` +
        'Bot bilan /start bosganmisiz? VITE_STORAGE_CHAT_ID ni tekshiring.',
      )
    }

    if (!tgData.ok) {
      console.error('[Sound Upload] ❌ Telegram rejected the request:', tgData)
      // 403 means the bot can't message the target chat
      if (tgData.error_code === 403) {
        throw new Error(
          'Bot bu chatga yoza olmaydi (403). ' +
          'Telegram\'da botga /start yuboring yoki VITE_STORAGE_CHAT_ID ni sozlang.',
        )
      }
      throw new Error(tgData.description || `Telegram sendAudio xatosi (${tgData.error_code})`)
    }

    const audioObj = tgData.result?.audio || tgData.result?.document
    if (!audioObj?.file_id) {
      console.error('[Sound Upload] ❌ No audio/document in result:', tgData.result)
      throw new Error('Telegram javobida file_id yo\'q')
    }
    const file_id: string = audioObj.file_id
    console.log('[Sound Upload] ✅ Got file_id:', file_id)

    // ── Step 2: persist in our database ───────────────────────────────────────
    console.log('[Sound Upload] Step 2 – saving to DB …')
    return this.axiosInstance.post(
      `/api/audio/admin/ambient-sounds?telegram_id=${telegramId}`,
      { name, emoji, file_id },
    )
  }

  /** Delete an ambient sound (admin) */
  async deleteAmbientSound(soundId: number, telegramId: number) {
    return this.axiosInstance.delete(
      `/api/audio/admin/ambient-sounds/${soundId}?telegram_id=${telegramId}`,
    )
  }}

export default new ApiService()
