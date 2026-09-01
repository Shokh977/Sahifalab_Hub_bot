import axios, { AxiosInstance } from 'axios'
import { showToast } from '../components/ErrorBoundary'
import { DEV_MOCK, mockAxiosAdapter } from '../lib/mockAdapter'
import { API_BASE } from '../lib/apiUrl'

const API_BASE_URL = API_BASE

/**
 * Lets the backend attribute a new signup to the right surface — the same
 * frontend bundle runs both as a plain website and as a Telegram Mini App,
 * so this is the only way the two are distinguishable server-side. Mirrors
 * the check in hooks/usePlatform.ts (kept independent since this file isn't
 * a React hook and runs before any component mounts).
 */
function clientPlatform(): 'web' | 'telegram_miniapp' {
  const tg = (window as any).Telegram?.WebApp
  const isTelegram = !!(tg && (tg.initData?.length > 0 || tg.initDataUnsafe?.user))
  return isTelegram ? 'telegram_miniapp' : 'web'
}

class ApiService {
  private axiosInstance: AxiosInstance

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      // In mock mode replace the HTTP adapter so zero real requests are made
      ...(DEV_MOCK ? { adapter: mockAxiosAdapter } : {}),
    })

    // Add interceptor to include auth token
    this.axiosInstance.interceptors.request.use((config) => {
      const token = localStorage.getItem('tma_auth_token') || localStorage.getItem('auth_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      config.headers['X-Client-Platform'] = clientPlatform()
      if (import.meta.env.DEV) console.debug(`[API] → ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.params || '')
      return config
    })

    // Log every response and handle errors with toasts
    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (import.meta.env.DEV) console.debug(`[API] ← ${response.status} ${response.config.url}`, response.data)
        return response
      },
      (error) => {
        const status = error?.response?.status ?? 'NO_RESPONSE'
        const url = error?.config?.url ?? ''
        const detail = error?.response?.data?.detail ?? error?.response?.data?.message ?? error?.response?.data ?? error?.message ?? 'Unknown error'
        // Only log details to console (developer eyes only)
        console.error(`[API] ❌ ${status} ${url}`, detail, error?.response?.data)

        // A 401 (Unauthorized) means the Bearer token itself is missing/invalid/
        // expired — that's true regardless of which endpoint returned it; a
        // "you're logged in but lack permission for this" case is a 403, not a
        // 401 (see the 403 branch below). Previously this only cleared the
        // token when the 401 came from /api/auth/me specifically, so an
        // expired session on any other endpoint left isAuthenticated stuck
        // "true" forever — the user saw a login-again toast on every action
        // with no way to actually recover short of clearing browser storage.
        if (status === 401) {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('tma_auth_token')
          window.dispatchEvent(new CustomEvent('auth:expired'))
        }

        // Show SAFE toast notification — never expose raw backend details to users
        const shouldShowToast = error?.config?.headers?.['X-Show-Error-Toast'] !== 'false'
        if (shouldShowToast) {
          // Map HTTP status to user-friendly Uzbek messages
          const safeMessages: Record<number, string> = {
            400: "So'rov noto'g'ri. Iltimos, ma'lumotlarni tekshiring.",
            401: "Tizimga qayta kiring.",
            403: "Ruxsat berilmagan.",
            404: "Ma'lumot topilmadi.",
            409: "Bu ma'lumot allaqachon mavjud.",
            413: "Fayl hajmi juda katta.",
            422: "Ma'lumotlar noto'g'ri formatda.",
            429: "Juda ko'p so'rov. Biroz kuting.",
            500: "Serverda xatolik yuz berdi. Keyinroq urinib ko'ring.",
            502: "Server vaqtincha ishlamayapti.",
            503: "Xizmat vaqtincha mavjud emas.",
          }
          const errorMessage = safeMessages[status as number] || "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring."
          showToast(errorMessage, 'error', 4000)
        }
        
        return Promise.reject(error)
      },
    )
  }

  /**
   * Public accessor for the underlying Axios instance.
   * Useful for ad-hoc requests (social, messenger, etc.) that don't
   * have dedicated wrapper methods yet.
   */
  get client(): AxiosInstance {
    return this.axiosInstance
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

  // (Quiz endpoints moved to unified section below)

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

  bookFileUrl(bookId: number): string {
    return `${API_BASE_URL}/api/books/${bookId}/file`
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

  async getBookProgress(bookId: number, telegramId: number) {
    return this.axiosInstance.get(`/api/books/${bookId}/progress`, {
      params: { telegram_id: telegramId },
    })
  }

  async saveBookProgress(
    bookId: number,
    data: { telegram_id: number; page_number: number; cfi?: string | null; percent: number },
  ) {
    return this.axiosInstance.post(`/api/books/${bookId}/progress`, data)
  }
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

  /** Admin: platform-wide analytics (Step 15) */
  async getAdminPlatformAnalytics(telegramId: number) {
    return this.axiosInstance.get('/api/admin/platform-analytics', this.adminParams(telegramId))
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

  // ─── Daily quiz ("5 Savol") endpoints ────────────────────────────────────────
  // Named dailyQuiz* — /api/quizzes/* above (now removed) was the old
  // book/course knowledge-test + certificate feature. /api/quiz/* (singular)
  // is a different feature: one shared 5-question quiz per day for everyone,
  // scored server-side, rewarding Tanga (never XP). Mirrors the shapes used
  // by the mobile app's lib/api.ts `dailyQuiz` namespace.

  async getDailyQuizToday() {
    return this.axiosInstance.get('/api/quiz/today')
  }

  async submitDailyQuiz(quizId: number, answers: Array<{ question_id: number; selected_index: number }>) {
    return this.axiosInstance.post('/api/quiz/submit', { quiz_id: quizId, answers })
  }

  async getDailyQuizResults(quizId: number) {
    return this.axiosInstance.get(`/api/quiz/results/${quizId}`)
  }

  async reportDailyQuizQuestion(questionId: number, reason: string) {
    return this.axiosInstance.post('/api/quiz/report', { question_id: questionId, reason })
  }

  // ─── Flashcards ("Kartalar") endpoints ───────────────────────────────────────
  // Core deck/card/study-session surface only — mirrors the mobile app's
  // lib/api.ts `flashcards` namespace. The public deck library (browse/clone/
  // rate/report/publish) is a separate, larger feature not covered here.

  async listFlashcardDecks() {
    return this.axiosInstance.get('/api/flashcards/decks')
  }

  async createFlashcardDeck(body: { title: string; description?: string; color?: string; icon?: string }) {
    return this.axiosInstance.post('/api/flashcards/decks', body)
  }

  async getFlashcardDeck(deckId: number) {
    return this.axiosInstance.get(`/api/flashcards/decks/${deckId}`)
  }

  async updateFlashcardDeck(deckId: number, body: Partial<{ title: string; description: string; color: string; icon: string }>) {
    return this.axiosInstance.patch(`/api/flashcards/decks/${deckId}`, body)
  }

  async deleteFlashcardDeck(deckId: number) {
    return this.axiosInstance.delete(`/api/flashcards/decks/${deckId}`)
  }

  async listFlashcards(deckId: number) {
    return this.axiosInstance.get(`/api/flashcards/decks/${deckId}/cards`)
  }

  async addFlashcard(deckId: number, body: { front_text: string; back_text: string; position?: number }) {
    return this.axiosInstance.post(`/api/flashcards/decks/${deckId}/cards`, body)
  }

  async updateFlashcard(cardId: number, body: Partial<{ front_text: string; back_text: string }>) {
    return this.axiosInstance.patch(`/api/flashcards/cards/${cardId}`, body)
  }

  async deleteFlashcard(cardId: number) {
    return this.axiosInstance.delete(`/api/flashcards/cards/${cardId}`)
  }

  async getFlashcardStudySession(deckId: number, practice?: boolean) {
    return this.axiosInstance.get(`/api/flashcards/decks/${deckId}/study`, { params: { practice } })
  }

  async reviewFlashcard(cardId: number, body: { rating: 1 | 2 | 3 | 4; time_spent_ms?: number }) {
    return this.axiosInstance.post(`/api/flashcards/cards/${cardId}/review`, body)
  }

  async completeFlashcardSession(deckId: number, body: { total_time_ms: number; cards_reviewed: number }) {
    return this.axiosInstance.post(`/api/flashcards/decks/${deckId}/complete`, {
      ...body,
      local_date: new Date().toLocaleDateString('en-CA'),   // YYYY-MM-DD, local calendar day
    })
  }

  async getFlashcardStats() {
    return this.axiosInstance.get('/api/flashcards/stats')
  }

  // ─── Payment endpoints ────────────────────────────────────────────────────

  /** Check if user already purchased a paid book (JWT auth — no telegram_id param) */
  async checkPurchase(bookId: number, _telegramId?: number) {
    return this.axiosInstance.get('/api/pay/check-purchase', {
      params: { book_id: bookId },
    })
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

  // ─── Teacher application ───────────────────────────────────────────────────

  /** Current user applies to become a teacher — sends full application form */
  async applyTeacher(data: {
    specialization: string
    experience_years: number
    bio: string
    course_idea: string
    motivation: string
    contact: string
  }) {
    return this.axiosInstance.post('/api/auth/apply-teacher', data)
  }

  /** Admin: list pending teacher applications */
  async getTeacherRequests() {
    return this.axiosInstance.get('/api/auth/admin/teacher-requests')
  }

  /** Admin: approve a teacher application (sets status=active) */
  async approveTeacher(telegramId: number) {
    return this.axiosInstance.post(`/api/auth/admin/approve-teacher/${telegramId}`)
  }

  /** Admin: reject a teacher application (reverts to student) */
  async rejectTeacher(telegramId: number) {
    return this.axiosInstance.post(`/api/auth/admin/reject-teacher/${telegramId}`)
  }

  /** Admin: search/list all users (q = name or telegram_id) */
  async searchAdminUsers(q?: string, limit = 50) {
    return this.axiosInstance.get('/api/auth/admin/users', { params: { q: q || undefined, limit } })
  }

  /** Admin: directly set a user's role and status */
  async setUserRole(telegramId: number, role: string, status: string) {
    return this.axiosInstance.patch(`/api/auth/admin/users/${telegramId}/role`, { role, status })
  }

  /** Admin: permanently delete a user account */
  async adminDeleteUser(telegramId: number) {
    return this.axiosInstance.delete(`/api/auth/admin/users/${telegramId}`)
  }

  /** Current user: delete own account permanently */
  async deleteAccount() {
    return this.axiosInstance.delete('/api/settings/account')
  }

  /** Messenger: delete a conversation for both sides */
  async deleteConversation(conversationId: number) {
    return this.axiosInstance.delete(`/api/v1/messenger/conversations/${conversationId}`)
  }

  /** Current user: update profile photo URL */
  async updateMyPhoto(photoUrl: string) {
    return this.axiosInstance.patch('/api/auth/me/photo', { photo_url: photoUrl })
  }

  /** Current user: update editable profile fields */
  async updateMyProfile(data: { first_name?: string; username?: string | null; bio?: string | null; about_me?: string | null }) {
    return this.axiosInstance.patch('/api/auth/me', data)
  }

  /** Current user: upload avatar image to Bunny and set photo_url */
  async uploadMyPhotoFile(file: File) {
    const form = new FormData()
    form.append('file', file)
    return this.axiosInstance.post('/api/auth/me/photo/upload', form, {
      headers: { 'Content-Type': undefined },
    })
  }

  // ─── Email auth ───────────────────────────────────────────────────────────

  /** Register a new account with email + password */
  async emailRegister(firstName: string, email: string, password: string) {
    return this.axiosInstance.post('/api/auth/email-register', {
      first_name: firstName,
      email,
      password,
    })
  }

  /** Login with email + password */
  async emailLogin(email: string, password: string) {
    return this.axiosInstance.post('/api/auth/email-login', { email, password })
  }

  /** Link an email to the current (Telegram/Google) account — merges if email-only profile exists */
  async linkEmail(email: string) {
    return this.axiosInstance.post('/api/auth/link-email', { email })
  }

  // ─── Teacher profile ──────────────────────────────────────────────────────

  /** Get calling teacher's own profile (auto-creates row if not yet present) */
  async getTeacherProfile() {
    return this.axiosInstance.get('/api/teacher/profile')
  }

  /**
   * Update teacher profile fields.
   * Omit fields you don't want to change.
   */
  async updateTeacherProfile(data: {
    bio?:              string
    specialization?:   string
    experience_years?: number
    education?:        string
    website_url?:      string
    youtube_url?:      string
    telegram_channel?: string
    profile_complete?: boolean
  }) {
    return this.axiosInstance.patch('/api/teacher/profile', data)
  }

  /** Public: read any teacher's profile by telegram_id */
  async getPublicTeacherProfile(telegramId: number) {
    return this.axiosInstance.get(`/api/teacher/profile/${telegramId}`)
  }

  /** Public: list all active teachers with aggregated stats (gallery page) */
  async getTeachersGallery() {
    return this.axiosInstance.get('/api/profiles/teachers')
  }

  /** Teacher: aggregate analytics (students, paid orders, income estimate) */
  async getTeacherAnalytics() {
    return this.axiosInstance.get('/api/teacher/analytics')
  }

  // ─── Analytics (YT Studio) ────────────────────────────────────────────────

  /** Track analytics events (course_view, profile_visit, etc.) */
  async trackAnalyticsEvents(events: Array<{
    event_type: string; target_id: number; teacher_id?: number; source?: string; meta?: Record<string, unknown>
  }>) {
    return this.axiosInstance.post('/api/analytics/track', { events })
  }

  /** Teacher: traffic & conversion funnel (impressions → views → enrollments) */
  async getTeacherFunnel(days = 30) {
    return this.axiosInstance.get('/api/analytics/teacher/funnel', { params: { days } })
  }

  /** Teacher: growth correlation (daily posts vs profile visits) */
  async getTeacherGrowth(days = 30) {
    return this.axiosInstance.get('/api/analytics/teacher/growth', { params: { days } })
  }

  /** Teacher: student demographics (level distribution) */
  async getTeacherDemographics() {
    return this.axiosInstance.get('/api/analytics/teacher/demographics')
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  /** Public: list all course categories */
  async getCategories() {
    return this.axiosInstance.get('/api/courses/categories')
  }

  // ─── Courses ──────────────────────────────────────────────────────────────

  /** Public: list published courses with optional filters */
  async getCourses(filters?: {
    category?:   string
    level?:      string
    search?:     string
    teacher_id?: number
    limit?:      number
    offset?:     number
  }) {
    return this.axiosInstance.get('/api/courses', { params: filters })
  }

  /** Public: get a single course by ID */
  async getCourse(courseId: number) {
    return this.axiosInstance.get(`/api/courses/${courseId}`)
  }

  /** Teacher: list own courses (all statuses) */
  async getMyCourses() {
    return this.axiosInstance.get('/api/courses/mine')
  }

  /** Teacher/Admin: create a new course */
  async createCourse(data: {
    title:          string
    description?:   string
    category_id?:   number
    thumbnail_url?: string
    price?:         number
    is_paid?:       boolean
    level?:         string
    language?:      string
    is_published?:  boolean
  }) {
    return this.axiosInstance.post('/api/courses', data)
  }

  /** Teacher/Admin: update a course */
  async updateCourse(courseId: number, data: {
    title?:                  string
    description?:            string
    category_id?:            number
    thumbnail_url?:          string
    price?:                  number
    is_paid?:                boolean
    level?:                  string
    language?:               string
    is_published?:           boolean
    total_lessons?:          number
    total_duration_minutes?: number
  }) {
    return this.axiosInstance.patch(`/api/courses/${courseId}`, data)
  }

  /** Teacher/Admin: delete a course */
  async deleteCourse(courseId: number) {
    return this.axiosInstance.delete(`/api/courses/${courseId}`)
  }

  // ─── Course ratings ───────────────────────────────────────────────────────

  /** Public: list all reviews for a course */
  async getCourseReviews(courseId: number) {
    return this.axiosInstance.get(`/api/courses/${courseId}/reviews`)
  }

  /** Auth: get current user's own rating for a course */
  async getMyCourseRating(courseId: number) {
    return this.axiosInstance.get(`/api/courses/${courseId}/my-rating`)
  }

  /** Enrolled student: submit or update a rating + review */
  async rateCourse(courseId: number, rating: number, review = '') {
    return this.axiosInstance.post(`/api/courses/${courseId}/rate`, { rating, review })
  }

  // ─── Admin: Courses management (Step 20) ─────────────────────────────────

  /** Admin: list ALL courses (published + draft) with teacher info */
  async getAdminCourses(telegramId: number) {
    return this.axiosInstance.get('/api/admin/courses', { params: { telegram_id: telegramId } })
  }

  /** Admin: toggle is_published for any course */
  async adminToggleCoursePublish(courseId: number, telegramId: number) {
    return this.axiosInstance.patch(`/api/admin/courses/${courseId}/publish`, null, {
      params: { telegram_id: telegramId },
    })
  }

  /** Admin: delete any course */
  async adminDeleteCourse(courseId: number, telegramId: number) {
    return this.axiosInstance.delete(`/api/admin/courses/${courseId}`, {
      params: { telegram_id: telegramId },
    })
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────

  /** Student: check if current user is enrolled in a course */
  async checkEnrollment(courseId: number) {
    return this.axiosInstance.get('/api/enrollments/check', { params: { course_id: courseId } })
  }

  /** Student: enroll in a course (free courses for now) */
  async enrollCourse(courseId: number) {
    return this.axiosInstance.post('/api/enrollments/enroll', { course_id: courseId })
  }

  /** Student: unenroll from a course */
  async unenrollCourse(courseId: number) {
    return this.axiosInstance.delete('/api/enrollments/enroll', { params: { course_id: courseId } })
  }

  /** Student: list my enrollments */
  async getMyEnrollments() {
    return this.axiosInstance.get('/api/enrollments/mine')
  }

  /** Student: generate / return existing PAY code for a paid course */
  async requestEnrollmentCode(courseId: number) {
    return this.axiosInstance.post('/api/enrollments/request-code', { course_id: courseId })
  }

  // ─── Unified Payments (Click/Payme for any item) ───────────────────────────

  /** Initialize payment for any item type via the unified /pay/init endpoint */
  async initPayment(itemType: 'book' | 'course', itemId: number, provider: 'click' | 'payme', returnUrl = '') {
    return this.axiosInstance.post('/api/pay/init', {
      item_type: itemType,
      item_id: itemId,
      provider,
      return_url: returnUrl,
    })
  }

  /** Confirm payment after webhook has set status to processing */
  async confirmUnifiedPayment(orderId: string) {
    return this.axiosInstance.post('/api/pay/confirm', {
      order_id: orderId,
    })
  }

  /** Poll payment status */
  async getPaymentStatus(orderId: string) {
    return this.axiosInstance.get(`/api/pay/${orderId}`)
  }

  // ─── Lessons ──────────────────────────────────────────────────────────────

  /** Public: list all lessons for a course */
  async getLessons(courseId: number) {
    return this.axiosInstance.get('/api/lessons', { params: { course_id: courseId } })
  }

  /** Get single lesson (video_url hidden for paid unless enrolled) */
  async getLesson(lessonId: number) {
    return this.axiosInstance.get(`/api/lessons/${lessonId}`)
  }

  /** Student: mark lesson as completed */
  async completeLesson(lessonId: number) {
    return this.axiosInstance.post(`/api/lessons/${lessonId}/complete`)
  }

  /** Student: fetch completed lesson IDs for a course */
  async getMyLessonProgress(courseId: number) {
    return this.axiosInstance.get('/api/lessons/my-progress', { params: { course_id: courseId } })
  }

  /** Student: fetch my issued course certificates */
  async getMyCourseCertificates() {
    return this.axiosInstance.get('/api/lessons/my-course-certificates')
  }

  /** Teacher: create a lesson */
  async createLesson(data: {
    course_id:        number
    title:            string
    description?:     string
    video_url?:       string
    video_source?:    string
    duration_minutes?: number
    order_index?:     number
    is_free?:         boolean
    lesson_type?:     string
    section_title?:   string
    material_url?:    string
    material_name?:   string
    bunny_video_id?:  string
    encoding_status?: string
  }) {
    return this.axiosInstance.post('/api/lessons', data)
  }

  /** Teacher: update a lesson */
  async updateLesson(lessonId: number, data: {
    title?:            string
    description?:      string
    video_url?:        string
    video_source?:     string
    duration_minutes?: number
    order_index?:      number
    is_free?:          boolean
    lesson_type?:      string
    section_title?:    string
    material_url?:     string
    material_name?:    string
    bunny_video_id?:   string
    encoding_status?:  string
  }) {
    return this.axiosInstance.patch(`/api/lessons/${lessonId}`, data)
  }

  /** Teacher: delete a lesson */
  async deleteLesson(lessonId: number) {
    return this.axiosInstance.delete(`/api/lessons/${lessonId}`)
  }

  /** Teacher: bulk reorder lessons */
  async reorderLessons(lessons: { id: number; order_index: number }[]) {
    return this.axiosInstance.patch('/api/lessons/reorder', { lessons })
  }

  /** Save quiz questions for a lesson (upsert) */
  async saveLessonQuiz(lessonId: number, data: {
    title:          string
    questions:      any[]
    time_limit_min: number | null
    passing_score:  number
    is_final:       boolean
  }) {
    return this.axiosInstance.put(`/api/tests/${lessonId}/questions`, data)
  }

  /** Block a user — stops messaging in both directions and hides their posts from your feed */
  async blockUser(targetId: number) {
    return this.axiosInstance.post(`/api/v1/social/users/${targetId}/block`)
  }

  async unblockUser(targetId: number) {
    return this.axiosInstance.delete(`/api/v1/social/users/${targetId}/block`)
  }

  async getBlockedUsers() {
    return this.axiosInstance.get(`/api/v1/social/users/blocked`)
  }

  /** Report a post or user for moderator review */
  async reportContent(targetType: 'post' | 'user', targetId: number, reason: string, details?: string) {
    return this.axiosInstance.post('/api/v1/social/reports', { target_type: targetType, target_id: targetId, reason, details })
  }

  /** Teacher: get existing quiz questions (with correct answers) for a lesson being edited */
  async getLessonQuiz(lessonId: number) {
    return this.axiosInstance.get(`/api/tests/${lessonId}`)
  }

  /** Start (or restart) a lesson-quiz attempt. Returns shuffled questions with no answers. */
  async startLessonQuizAttempt(lessonId: number) {
    return this.axiosInstance.post(`/api/tests/${lessonId}/attempts`)
  }

  /** Submit answers for a lesson-quiz attempt and get the scored result. */
  async submitLessonQuizAttempt(
    testId: number,
    attemptId: number,
    answers: { question_id: number; selected_option_id?: number | null; text?: string | null }[],
  ) {
    return this.axiosInstance.post(`/api/tests/${testId}/attempts/${attemptId}/submit`, { answers })
  }

  // ─── Bunny Stream ─────────────────────────────────────────────────────────

  /** Create a Bunny Stream video placeholder (returns { video_id, library_id }) */
  async createStreamVideo(title: string, courseId?: number) {
    return this.axiosInstance.post('/api/stream/create-video', { title, course_id: courseId })
  }

  /** Get encoding status for a Stream video */
  async getStreamStatus(videoId: string) {
    return this.axiosInstance.get(`/api/stream/status/${videoId}`)
  }

  /** Get signed embed + HLS URLs for a Stream video */
  async getStreamEmbed(videoId: string) {
    return this.axiosInstance.get(`/api/stream/embed/${videoId}`)
  }

  /** Delete a video from Bunny Stream */
  async deleteStreamVideo(videoId: string) {
    return this.axiosInstance.delete(`/api/stream/delete/${videoId}`)
  }

  /** Heatmap — per-day activity count from quiz completions */
  async getHeatmap(telegramId: number, days = 365) {
    return this.axiosInstance.get<{ date: string; count: number }[]>(
      '/api/profiles/heatmap',
      { params: { telegram_id: telegramId, days } },
    )
  }

  // ─── Teacher Wallet ──────────────────────────────────────────────────────

  /** Get teacher wallet balances */
  async getTeacherWallet() {
    return this.axiosInstance.get('/api/teacher/wallet')
  }

  /** Request a withdrawal */
  async requestWithdrawal(amount: number, card_number: string) {
    return this.axiosInstance.post('/api/teacher/wallet/withdraw', { amount, card_number })
  }

  /** Get teacher payout history */
  async getPayoutHistory(limit = 50) {
    return this.axiosInstance.get('/api/teacher/wallet/history', { params: { limit } })
  }

  // ─── Admin Payouts ───────────────────────────────────────────────────────

  /** Admin: get all pending payout requests */
  async getPendingPayouts(telegramId: number) {
    return this.axiosInstance.get('/api/admin/payouts/pending', { params: { telegram_id: telegramId } })
  }

  /** Admin: get all payout requests */
  async getAllPayouts(telegramId: number, status?: string, limit = 100) {
    const params: Record<string, any> = { telegram_id: telegramId, limit }
    if (status) params.status = status
    return this.axiosInstance.get('/api/admin/payouts/all', { params })
  }

  /** Admin: approve a payout (mark as paid) */
  async approvePayout(payoutId: number, telegramId: number, adminNote = '') {
    return this.axiosInstance.post(
      `/api/admin/payouts/${payoutId}/approve`,
      { admin_note: adminNote },
      { params: { telegram_id: telegramId } },
    )
  }

  /** Admin: reject a payout */
  async rejectPayout(payoutId: number, telegramId: number, adminNote = '') {
    return this.axiosInstance.post(
      `/api/admin/payouts/${payoutId}/reject`,
      { admin_note: adminNote },
      { params: { telegram_id: telegramId } },
    )
  }

  // ── Announcements ────────────────────────────────────────────────────────────

  async getAnnouncements() {
    return this.axiosInstance.get('/api/announcements/admin')
  }

  async createAnnouncement(data: {
    title: string; body: string; image_url?: string | null
    cta_text?: string | null; cta_link?: string | null
    starts_at?: string | null; expires_at?: string | null; is_active: boolean
  }) {
    return this.axiosInstance.post('/api/announcements/admin', data)
  }

  async updateAnnouncement(id: number, data: Partial<{
    title: string; body: string; image_url: string | null
    cta_text: string | null; cta_link: string | null
    starts_at: string | null; expires_at: string | null; is_active: boolean
  }>) {
    return this.axiosInstance.put(`/api/announcements/admin/${id}`, data)
  }

  async deleteAnnouncement(id: number) {
    return this.axiosInstance.delete(`/api/announcements/admin/${id}`)
  }

  // ── Musobaqalar (cohort challenges) ───────────────────────────────────────────

  async getAdminChallenges() {
    return this.axiosInstance.get('/api/admin/challenges')
  }

  async getAdminChallengeDetail(id: string) {
    return this.axiosInstance.get(`/api/admin/challenges/${id}`)
  }

  async createChallenge(data: {
    slug: string; title: string; description?: string | null
    metric?: string; challenge_type?: string
    starts_at: string; ends_at: string; join_deadline?: string | null
    reward_xp?: number; badge_key?: string | null
    color?: string; icon?: string; cover_image_url?: string | null; is_featured?: boolean
    max_participants?: number | null
    target_amount?: number | null
    daily_minimum?: number | null; required_days?: number | null; allowed_misses?: number
    winner_count?: number | null
    team_a_name?: string | null; team_a_color?: string | null; team_a_icon?: string | null
    team_b_name?: string | null; team_b_color?: string | null; team_b_icon?: string | null
  }) {
    return this.axiosInstance.post('/api/admin/challenges', data)
  }

  async updateChallenge(id: string, data: Partial<{
    title: string; description: string | null
    color: string; icon: string; cover_image_url: string | null; is_featured: boolean
    max_participants: number | null; badge_key: string | null; reward_xp: number
    target_amount: number; starts_at: string; ends_at: string; join_deadline: string | null; metric: string
    challenge_type: string
    daily_minimum: number; required_days: number; allowed_misses: number
    winner_count: number
    team_a_name: string; team_a_color: string; team_a_icon: string
    team_b_name: string; team_b_color: string; team_b_icon: string
  }>) {
    return this.axiosInstance.patch(`/api/admin/challenges/${id}`, data)
  }

  async cancelChallenge(id: string) {
    return this.axiosInstance.post(`/api/admin/challenges/${id}/cancel`)
  }

  async checkChallengeOverlap(metric: string, startsAt: string, endsAt: string, excludeId?: string) {
    return this.axiosInstance.get('/api/admin/challenges/check-overlap', {
      params: { metric, starts_at: startsAt, ends_at: endsAt, exclude_id: excludeId },
    })
  }

  async getLeaderboard(scope: 'global' | 'friends', period: 'week' | 'month' | 'all') {
    return this.axiosInstance.get('/api/leaderboard/weekly', { params: { scope, period } })
  }
}

export default new ApiService()
