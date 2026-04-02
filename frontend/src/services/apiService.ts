import axios, { AxiosInstance } from 'axios'
import { showToast } from '../components/ErrorBoundary'

const API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

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

  // ─── Teacher application ───────────────────────────────────────────────────

  /** Current user applies to become a teacher — sends full application form */
  async applyTeacher(data: {
    specialization: string
    experience_years: number
    bio: string
    course_idea: string
    motivation: string
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

  /** Current user: update profile photo URL */
  async updateMyPhoto(photoUrl: string) {
    return this.axiosInstance.patch('/api/auth/me/photo', { photo_url: photoUrl })
  }

  /** Current user: update editable profile fields */
  async updateMyProfile(data: { first_name?: string; username?: string | null }) {
    return this.axiosInstance.patch('/api/auth/me', data)
  }

  /** Current user: upload avatar image to Bunny and set photo_url */
  async uploadMyPhotoFile(file: File) {
    const form = new FormData()
    form.append('file', file)
    return this.axiosInstance.post('/api/auth/me/photo/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
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

  /** Teacher: aggregate analytics (students, paid orders, income estimate) */
  async getTeacherAnalytics() {
    return this.axiosInstance.get('/api/teacher/analytics')
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

  /** Paid course: create Telegram invoice link */
  async createCourseInvoiceLink(courseId: number, provider: 'telegram_stars' | 'click' | 'payme' = 'telegram_stars') {
    return this.axiosInstance.post('/api/enrollments/create-invoice-link', {
      course_id: courseId,
      provider,
    })
  }

  /** Paid course: confirm payment from invoice callback */
  async confirmCoursePayment(orderId: string) {
    return this.axiosInstance.post('/api/enrollments/confirm-payment', { order_id: orderId })
  }

  /** Paid course: read payment order status */
  async getCoursePaymentOrder(orderId: string) {
    return this.axiosInstance.get(`/api/enrollments/order/${orderId}`)
  }

  // ─── Unified Payments (Click/Payme/Stars for any item) ────────────────────

  /** Initialize payment for any item type via the unified /pay/init endpoint */
  async initPayment(itemType: 'book' | 'course', itemId: number, provider: 'telegram_stars' | 'click' | 'payme', returnUrl = '', userId?: number) {
    return this.axiosInstance.post('/api/pay/init', {
      item_type: itemType,
      item_id: itemId,
      provider,
      return_url: returnUrl,
      ...(userId ? { user_id: userId } : {}),
    })
  }

  /** Confirm payment after openInvoice callback returns 'paid' */
  async confirmUnifiedPayment(orderId: string, userId?: number) {
    return this.axiosInstance.post('/api/pay/confirm', {
      order_id: orderId,
      ...(userId ? { user_id: userId } : {}),
    })
  }

  /** Poll payment status */
  async getPaymentStatus(orderId: string, userId?: number) {
    return this.axiosInstance.get(`/api/pay/${orderId}`, {
      params: userId ? { user_id: userId } : undefined,
    })
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
}

export default new ApiService()
