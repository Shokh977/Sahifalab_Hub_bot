import axios, { AxiosInstance } from 'axios'
import { showToast } from '../components/ErrorBoundary'

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

    // Log every response and handle errors with toasts
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.debug(`[API] ← ${response.status} ${response.config.url}`, response.data)
        return response
      },
      (error) => {
        const status = error?.response?.status ?? 'NO_RESPONSE'
        const url = error?.config?.url ?? ''
        const detail = error?.response?.data?.detail ?? error?.response?.data?.message ?? error?.response?.data ?? error?.message ?? 'Unknown error'
        console.error(`[API] ❌ ${status} ${url}`, detail, error?.response?.data)
        
        // Show toast notification for errors (unless it's from a query with showErrorToast = false)
        const shouldShowToast = error?.config?.headers?.['X-Show-Error-Toast'] !== 'false'
        if (shouldShowToast) {
          const errorMessage = typeof detail === 'string' ? detail : JSON.stringify(detail).substring(0, 100)
          showToast(errorMessage, 'error', 4000)
        }
        
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
    return this.axiosInstance.get(`/api/books/${bookId}/download`)
  }

  async rateBook(bookId: number, telegramId: number, rating: number) {
    return this.axiosInstance.post(`/api/books/${bookId}/rate`, {
      telegram_id: telegramId,
      rating,
    })
  }

  async getMyRating(bookId: number, telegramId: number) {
    return this.axiosInstance.get(`/api/books/${bookId}/my-rating`, {
      params: { telegram_id: telegramId },
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
  async getAdminQuizzes(telegramId: number) {
    return this.axiosInstance.get('/api/admin/quizzes', this.adminParams(telegramId))
  }

  async uploadQuiz(telegramId: number, quizJson: any) {
    return this.axiosInstance.post('/api/admin/quizzes/upload', quizJson, this.adminParams(telegramId))
  }

  async deleteAdminQuiz(quizId: number, telegramId: number) {
    return this.axiosInstance.delete(`/api/admin/quizzes/${quizId}`, this.adminParams(telegramId))
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

  // ─── Quiz endpoints ─────────────────────────────────────────────────────────

  async getQuizzes(category?: string, difficulty?: string) {
    return this.axiosInstance.get('/api/quizzes', { params: { category, difficulty } })
  }

  /** Returns quiz + questions (correct_answer NOT included — use verifyQuiz for scoring) */
  async getQuiz(quizId: number) {
    return this.axiosInstance.get(`/api/quizzes/${quizId}`)
  }

  /** Legacy: kept for backward-compat */
  async getQuizQuestions(quizId: number) {
    return this.axiosInstance.get(`/api/quizzes/${quizId}`)
  }

  /**
   * Submit raw selected-option indices for server-side scoring.
   * Returns { score, total, percentage, passed, certificate_eligible, result_token }.
   */
  async verifyQuiz(
    quizId: number,
    telegramId: number,
    telegramName: string,
    answers: number[],
  ) {
    return this.axiosInstance.post(`/api/quizzes/${quizId}/verify`, {
      telegram_id: telegramId,
      telegram_name: telegramName,
      answers,
    })
  }

  // ─── Payment endpoints ────────────────────────────────────────────────────

  /** Check if user already purchased a paid book */
  async checkPurchase(bookId: number, telegramId: number) {
    return this.axiosInstance.get('/api/payments/check-purchase', {
      params: { book_id: bookId, telegram_id: telegramId },
    })
  }

  /** Create payment order for any provider (telegram_stars | click | payme) */
  async createPaymentOrder(bookId: number, telegramId: number, provider: string) {
    return this.axiosInstance.post('/api/payments/create-order', {
      book_id: bookId,
      telegram_id: telegramId,
      provider,
    })
  }

  /** Create invoice link for WebApp.openInvoice() flow */
  async createInvoiceLink(bookId: number, telegramId: number, provider: string) {
    return this.axiosInstance.post('/api/payments/create-invoice-link', {
      book_id: bookId,
      telegram_id: telegramId,
      provider,
    })
  }

  /** Check order status */
  async getOrderStatus(orderId: string) {
    return this.axiosInstance.get(`/api/payments/order/${orderId}`)
  }

  /** Confirm payment from frontend (after openInvoice returns 'paid') */
  async confirmPayment(orderId: string) {
    return this.axiosInstance.post('/api/payments/confirm-payment', {
      order_id: orderId,
    })
  }

  /** Debug payment config */
  async debugPaymentConfig() {
    return this.axiosInstance.get('/api/payments/debug-config')
  }

  // ─── Audio / Ambient Sound endpoints ─────────────────────────────────────

  /** List all active ambient sounds from the database */
  async getAmbientSounds() {
    return this.axiosInstance.get('/api/audio/ambient-sounds')
  }

  /**
   * Save a new ambient sound by URL (Google Drive share link or any direct URL).
   * The backend handles Google Drive → direct stream URL conversion.
   */
  async saveAmbientSound(telegramId: number, name: string, emoji: string, url: string) {
    console.log('[Sound] Saving:', { name, emoji, url })
    return this.axiosInstance.post(
      `/api/audio/admin/ambient-sounds?telegram_id=${telegramId}`,
      { name, emoji, url },
    )
  }

  /** Delete an ambient sound (admin) */
  async deleteAmbientSound(soundId: number, telegramId: number) {
    return this.axiosInstance.delete(
      `/api/audio/admin/ambient-sounds/${soundId}?telegram_id=${telegramId}`,
    )
  }

  // ─── AI endpoints ────────────────────────────────────────────────────────

  async bookSummarizer(text: string, question?: string, maxSentences: number = 4) {
    return this.axiosInstance.post('/api/ai/book-summarizer', {
      text,
      question,
      max_sentences: maxSentences,
    })
  }

  async aiChat(message: string) {
    return this.axiosInstance.post('/api/ai/chat', {
      message,
    })
  }
}

export default new ApiService()
