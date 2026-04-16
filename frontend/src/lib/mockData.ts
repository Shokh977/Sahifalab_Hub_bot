/**
 * mockData.ts — Realistic fake data for SAHIFALAB Hub dev/mock mode.
 *
 * Activated when VITE_DEV_MOCK=true (frontend/.env.local).
 * This file is NEVER imported in production builds (tree-shaken away).
 */

// ── Mock User (admin role so every page is accessible) ───────────────────────
export const MOCK_USER = {
  id: 999_001,
  telegram_id: 999_001,
  first_name: 'Dev',
  last_name: 'Tester',
  username: 'dev_tester',
  photo_url: 'https://ui-avatars.com/api/?name=Dev+Tester&background=F15929&color=fff&size=128',
  role: 'admin',
  status: 'active',
  status_account: 'active',
  level: 8,
  total_xp: 4_200,
  focus_seconds: 72_000,
  quizzes_completed: 12,
  access_token: 'dev_mock_token',
  app_online_at: new Date().toISOString(),
}

// ── Categories ────────────────────────────────────────────────────────────────
export const MOCK_CATEGORIES = [
  { id: 1, name: "Dasturlash",    slug: "programming",  icon: "💻", color: "#6366F1" },
  { id: 2, name: "Matematika",    slug: "math",         icon: "📐", color: "#F59E0B" },
  { id: 3, name: "Ingliz tili",   slug: "english",      icon: "🇬🇧", color: "#10B981" },
  { id: 4, name: "Fizika",        slug: "physics",      icon: "⚛️", color: "#3B82F6" },
  { id: 5, name: "Tarix",         slug: "history",      icon: "📜", color: "#8B5CF6" },
  { id: 6, name: "Biologiya",     slug: "biology",      icon: "🧬", color: "#EC4899" },
]

// ── Courses ───────────────────────────────────────────────────────────────────
export const MOCK_COURSES = [
  {
    id: 1,
    title: "Python dasturlash — boshlang'ichdan mutaxassisgacha",
    description: "Python tilini noldan o'rganib, real loyihalar yarating. Data Science, Web, Automation.",
    category_id: 1,
    category: { id: 1, name: "Dasturlash", icon: "💻" },
    thumbnail_url: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600&q=80",
    price: 149_000,
    is_paid: true,
    level: "beginner",
    language: "uz",
    is_published: true,
    total_lessons: 42,
    total_duration_minutes: 1_260,
    enrolled_count: 318,
    rating_avg: 4.8,
    rating_count: 74,
    teacher_id: 1,
    teacher: { first_name: "Sardor", last_name: "Toshmatov", username: "sardor_dev", photo_url: "https://ui-avatars.com/api/?name=Sardor+T&background=6366F1&color=fff" },
    created_at: "2025-11-01T10:00:00Z",
  },
  {
    id: 2,
    title: "Ingliz tili: IELTS 7.0 ga tayyorlanish",
    description: "IELTS imtihoniga tizimli tayyorlanish. Listening, Reading, Writing, Speaking.",
    category_id: 3,
    category: { id: 3, name: "Ingliz tili", icon: "🇬🇧" },
    thumbnail_url: "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&q=80",
    price: 0,
    is_paid: false,
    level: "intermediate",
    language: "uz",
    is_published: true,
    total_lessons: 28,
    total_duration_minutes: 840,
    enrolled_count: 521,
    rating_avg: 4.6,
    rating_count: 103,
    teacher_id: 2,
    teacher: { first_name: "Nilufar", last_name: "Karimova", username: "nilufar_english", photo_url: "https://ui-avatars.com/api/?name=Nilufar+K&background=10B981&color=fff" },
    created_at: "2025-10-15T09:00:00Z",
  },
  {
    id: 3,
    title: "React + TypeScript: Zamonaviy Frontend",
    description: "React 18, TypeScript, Tailwind CSS, Zustand, React Query — professional level.",
    category_id: 1,
    category: { id: 1, name: "Dasturlash", icon: "💻" },
    thumbnail_url: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&q=80",
    price: 199_000,
    is_paid: true,
    level: "intermediate",
    language: "uz",
    is_published: true,
    total_lessons: 56,
    total_duration_minutes: 2_100,
    enrolled_count: 189,
    rating_avg: 4.9,
    rating_count: 48,
    teacher_id: 1,
    teacher: { first_name: "Sardor", last_name: "Toshmatov", username: "sardor_dev", photo_url: "https://ui-avatars.com/api/?name=Sardor+T&background=6366F1&color=fff" },
    created_at: "2025-12-01T10:00:00Z",
  },
  {
    id: 4,
    title: "Oliy matematika: chuqur kurs",
    description: "Differensial hisob, integral, qatorlar, differensial tenglamalar.",
    category_id: 2,
    category: { id: 2, name: "Matematika", icon: "📐" },
    thumbnail_url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&q=80",
    price: 89_000,
    is_paid: true,
    level: "advanced",
    language: "uz",
    is_published: true,
    total_lessons: 35,
    total_duration_minutes: 1_050,
    enrolled_count: 97,
    rating_avg: 4.7,
    rating_count: 22,
    teacher_id: 3,
    teacher: { first_name: "Jasur", last_name: "Mirzayev", username: "jasur_math", photo_url: "https://ui-avatars.com/api/?name=Jasur+M&background=F59E0B&color=fff" },
    created_at: "2025-09-10T08:00:00Z",
  },
  {
    id: 5,
    title: "Kvant fizikasi — kirish kursi",
    description: "Kvant mexanikasining asoslari: to'lqin funksiyasi, Shr'odinger tenglamasi, kvantlanish.",
    category_id: 4,
    category: { id: 4, name: "Fizika", icon: "⚛️" },
    thumbnail_url: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&q=80",
    price: 0,
    is_paid: false,
    level: "beginner",
    language: "uz",
    is_published: true,
    total_lessons: 18,
    total_duration_minutes: 540,
    enrolled_count: 245,
    rating_avg: 4.5,
    rating_count: 61,
    teacher_id: 3,
    teacher: { first_name: "Jasur", last_name: "Mirzayev", username: "jasur_math", photo_url: "https://ui-avatars.com/api/?name=Jasur+M&background=F59E0B&color=fff" },
    created_at: "2025-08-05T07:00:00Z",
  },
  {
    id: 6,
    title: "SQL va PostgreSQL: Ma'lumotlar bazasi",
    description: "Asosiy so'rovlardan murakkab JOIN, window functions, va optimizatsiyagacha.",
    category_id: 1,
    category: { id: 1, name: "Dasturlash", icon: "💻" },
    thumbnail_url: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=600&q=80",
    price: 120_000,
    is_paid: true,
    level: "intermediate",
    language: "uz",
    is_published: true,
    total_lessons: 31,
    total_duration_minutes: 930,
    enrolled_count: 142,
    rating_avg: 4.7,
    rating_count: 35,
    teacher_id: 1,
    teacher: { first_name: "Sardor", last_name: "Toshmatov", username: "sardor_dev", photo_url: "https://ui-avatars.com/api/?name=Sardor+T&background=6366F1&color=fff" },
    created_at: "2026-01-20T10:00:00Z",
  },
]

// ── Lessons (for course 1) ────────────────────────────────────────────────────
export const MOCK_LESSONS = [
  { id: 1,  course_id: 1, title: "Python nima? Muhit sozlash",     description: "Python interpretatori, VS Code, virtual env.",            video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 22, order_index: 1,  is_free: true,  lesson_type: "video", section_title: "Kirish" },
  { id: 2,  course_id: 1, title: "O'zgaruvchilar va ma'lumot turlari", description: "int, float, str, bool, list, dict, tuple, set.",      video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 35, order_index: 2,  is_free: true,  lesson_type: "video", section_title: "Asoslar" },
  { id: 3,  course_id: 1, title: "Shartli ifodalar (if/elif/else)", description: "Mantiqiy operatorlar va tarmoqlanish.",                   video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 28, order_index: 3,  is_free: false, lesson_type: "video", section_title: "Asoslar" },
  { id: 4,  course_id: 1, title: "Sikllar: for va while",           description: "Iteratsiya, range(), break, continue.",                  video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 31, order_index: 4,  is_free: false, lesson_type: "video", section_title: "Asoslar" },
  { id: 5,  course_id: 1, title: "Funksiyalar",                      description: "def, parametrlar, return, lambda, *args, **kwargs.",     video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 44, order_index: 5,  is_free: false, lesson_type: "video", section_title: "Funksiyalar" },
  { id: 6,  course_id: 1, title: "OOP: Sinflar va obyektlar",        description: "class, __init__, meros, polimorfizm.",                   video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 55, order_index: 6,  is_free: false, lesson_type: "video", section_title: "OOP" },
  { id: 7,  course_id: 1, title: "Fayllar bilan ishlash",            description: "open(), read(), write(), with statement.",               video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 30, order_index: 7,  is_free: false, lesson_type: "video", section_title: "Amaliy" },
  { id: 8,  course_id: 1, title: "Modullar va paketlar",             description: "import, pip, requirements.txt, virtual env.",            video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", video_source: "youtube", duration_minutes: 27, order_index: 8,  is_free: false, lesson_type: "video", section_title: "Amaliy" },
]

// ── Course reviews (default = course 1) ─────────────────────────────────────────
// Note: field is `profiles` (not `user`) — matches CourseDetailPage.tsx interface
export const MOCK_REVIEWS = [
  { id: 1, student_id: 11, rating: 5, review: "Juda yaxshi kurs! Hamma narsani tushuntiradi.", created_at: "2026-01-10T12:00:00Z", profiles: { first_name: "Alisher", username: "alisher_uz", photo_url: null } },
  { id: 2, student_id: 12, rating: 5, review: "O'qituvchi juda tajribali, amaliy misollar ko'p.", created_at: "2026-01-15T08:30:00Z", profiles: { first_name: "Barno", username: "barno_code", photo_url: null } },
  { id: 3, student_id: 13, rating: 4, review: "Kurs yaxshi lekin biroz sekinroq tushuntirishsa yaxshi bo'lardi.", created_at: "2026-02-01T14:00:00Z", profiles: { first_name: "Dilshod", username: "dilshod99", photo_url: null } },
  { id: 4, student_id: 14, rating: 5, review: "Eng yaxshi Python kursi! Loyiha misollar juda qimmatli.", created_at: "2026-02-14T10:30:00Z", profiles: { first_name: "Kamola", username: "kamola_learns", photo_url: null } },
  { id: 5, student_id: 15, rating: 4, review: "Tushuntirishlar aniq va lo'nda. Davom ettiring!", created_at: "2026-03-03T16:00:00Z", profiles: { first_name: "Jahongir", username: null, photo_url: null } },
]

// ── Per-course reviews map (keyed by course id) ────────────────────────────────
export const MOCK_COURSE_REVIEWS: Record<number, typeof MOCK_REVIEWS> = {
  1: MOCK_REVIEWS,
  2: [
    { id: 11, student_id: 21, rating: 5, review: "IELTS tayyorgarligim uchun juda foydali bo'ldi. 7.5 oldim!", created_at: "2026-01-20T09:00:00Z", profiles: { first_name: "Zulfiya", username: "zulfiya_study", photo_url: null } },
    { id: 12, student_id: 22, rating: 4, review: "Speaking bo'limiga ko'proq e'tibor bersalar yaxshi bo'lardi.", created_at: "2026-02-05T14:00:00Z", profiles: { first_name: "Nodir", username: "nodir_dev", photo_url: null } },
    { id: 13, student_id: 23, rating: 5, review: "Bepul kurs bo'lgani holda sifat juda yuqori!", created_at: "2026-02-20T11:30:00Z", profiles: { first_name: "Mohira", username: "mohira_22", photo_url: null } },
    { id: 14, student_id: 24, rating: 5, review: "Grammatika bo'limlari ayniqsa foydali. Tavsiya qilaman.", created_at: "2026-03-10T08:00:00Z", profiles: { first_name: "Sherzod", username: null, photo_url: null } },
  ],
  3: [
    { id: 21, student_id: 31, rating: 5, review: "React va TypeScript'ni shu kurs orqali yaxshi o'rgandim. Professional daraja!", created_at: "2026-01-12T10:00:00Z", profiles: { first_name: "Alisher", username: "alisher_uz", photo_url: null } },
    { id: 22, student_id: 32, rating: 5, review: "Zustand va React Query misollar bilan juda tushunarliq. Rahmat!", created_at: "2026-02-08T15:00:00Z", profiles: { first_name: "Kamola", username: "kamola_learns", photo_url: null } },
    { id: 23, student_id: 33, rating: 4, review: "Kurs hajmi katta lekin har bir dars qimmatli. Sabr talab qiladi.", created_at: "2026-03-01T12:00:00Z", profiles: { first_name: "Barno", username: "barno_code", photo_url: null } },
  ],
  4: [
    { id: 31, student_id: 41, rating: 5, review: "Integral va differensial hisob nihoyat tushunarli bo'ldi!", created_at: "2026-01-25T09:30:00Z", profiles: { first_name: "Dilshod", username: "dilshod99", photo_url: null } },
    { id: 32, student_id: 42, rating: 4, review: "Murakkab mavzular bor lekin mukammal tushuntirilgan. Tavsiya!", created_at: "2026-02-18T14:00:00Z", profiles: { first_name: "Jahongir", username: null, photo_url: null } },
  ],
  5: [
    { id: 41, student_id: 51, rating: 5, review: "Kvant fizikasiga kirish uchun ideal kurs. Juda qiziqarli!", created_at: "2026-02-01T10:00:00Z", profiles: { first_name: "Nodir", username: "nodir_dev", photo_url: null } },
    { id: 42, student_id: 52, rating: 4, review: "Shr'odinger tenglamasi misollar bilan tushuntirilgan — zo'r!", created_at: "2026-02-25T16:00:00Z", profiles: { first_name: "Zulfiya", username: "zulfiya_study", photo_url: null } },
    { id: 43, student_id: 53, rating: 5, review: "Bepul va shu qadar sifatli. Rahmat!", created_at: "2026-03-15T11:00:00Z", profiles: { first_name: "Sherzod", username: null, photo_url: null } },
  ],
  6: [
    { id: 51, student_id: 61, rating: 5, review: "SQL optimizatsiya qismi ayniqsa foydali bo'ldi. Window functions — ajoyib.", created_at: "2026-02-10T09:00:00Z", profiles: { first_name: "Alisher", username: "alisher_uz", photo_url: null } },
    { id: 52, student_id: 62, rating: 4, review: "Window functions'ni shu kursdan o'rgandim. Tavsiya!", created_at: "2026-03-05T13:00:00Z", profiles: { first_name: "Barno", username: "barno_code", photo_url: null } },
  ],
}

// ── Enrollments ───────────────────────────────────────────────────────────────
export const MOCK_ENROLLMENTS = [
  { id: 1, course_id: 1, enrolled_at: "2026-01-05T10:00:00Z", progress_percent: 35, course: MOCK_COURSES[0] },
  { id: 2, course_id: 2, enrolled_at: "2026-01-20T14:00:00Z", progress_percent: 70, course: MOCK_COURSES[1] },
  { id: 3, course_id: 5, enrolled_at: "2026-02-10T09:00:00Z", progress_percent: 10, course: MOCK_COURSES[4] },
]

// ── Books ─────────────────────────────────────────────────────────────────────
// Fields match KitoblarPage + BookDetailPage interfaces:
//   thumbnail_url (not cover_url), rating (not rating_avg), downloads (not download_count)
//   category — English slug so COVER_GRADIENTS in page works correctly
export const MOCK_BOOKS = [
  {
    id: 1, title: "Clean Code", author: "Robert C. Martin",
    description: "Dastur kodini qanday toza va o'qilishi oson qilish haqida fundamental asar. Har bir dasturchining kutubxonasida bo'lishi shart.",
    thumbnail_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80",
    file_url: "#", price: 25_000, is_paid: true, category: "programming",
    rating: 4.9, downloads: 342, is_active: true,
  },
  {
    id: 2, title: "Atomic Habits", author: "James Clear",
    description: "Kichik odatlar orqali katta o'zgarishlarga erishish yo'llari. 1% yaxshilanish qanday ulkan natija beradi.",
    thumbnail_url: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "business",
    rating: 4.8, downloads: 890, is_active: true,
  },
  {
    id: 3, title: "Python Crash Course", author: "Eric Matthes",
    description: "Python tilini tezda o'rganish uchun eng yaxshi amaliy qo'llanma. Loyihalar orqali o'rganish.",
    thumbnail_url: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=400&q=80",
    file_url: "#", price: 35_000, is_paid: true, category: "programming",
    rating: 4.7, downloads: 255, is_active: true,
  },
  {
    id: 4, title: "The Pragmatic Programmer", author: "David Thomas, Andrew Hunt",
    description: "Professional dasturchilar uchun hayotiy maslahatlar va best practices to'plami.",
    thumbnail_url: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&q=80",
    file_url: "#", price: 30_000, is_paid: true, category: "programming",
    rating: 4.8, downloads: 178, is_active: true,
  },
  {
    id: 5, title: "Thinking, Fast and Slow", author: "Daniel Kahneman",
    description: "Ikkita fikrlash tizimi: tez va sekin. Qarorlar qanday qabul qilinadi — psixologiya klassikasi.",
    thumbnail_url: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "science",
    rating: 4.6, downloads: 612, is_active: true,
  },
  {
    id: 6, title: "The Art of Problem Solving vol.1", author: "Richard Rusczyk",
    description: "Olimpiada matematikasiga tayyorlanish uchun klassik qo'llanma. Chuqur matematik fikrlash.",
    thumbnail_url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80",
    file_url: "#", price: 40_000, is_paid: true, category: "math",
    rating: 4.9, downloads: 123, is_active: true,
  },
  {
    id: 7, title: "Deep Work", author: "Cal Newport",
    description: "Chuqur diqqat orqali maksimal natijaga erishish va professional hayotni qayta qurish yo'llari.",
    thumbnail_url: "https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "business",
    rating: 4.7, downloads: 445, is_active: true,
  },
  {
    id: 8, title: "JavaScript: The Good Parts", author: "Douglas Crockford",
    description: "JS ning eng kuchli va foydalanishga tayyor qismlarini chuqur o'rganish. Har bir frontend uchun.",
    thumbnail_url: "https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=400&q=80",
    file_url: "#", price: 20_000, is_paid: true, category: "programming",
    rating: 4.5, downloads: 203, is_active: true,
  },
  {
    id: 9, title: "IELTS Writing Masterclass", author: "Marc Roche",
    description: "IELTS Writing Task 1 va Task 2 uchun barcha zarur strategiya va misollar.",
    thumbnail_url: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&q=80",
    file_url: "#", price: 15_000, is_paid: true, category: "language",
    rating: 4.6, downloads: 387, is_active: true,
  },
  {
    id: 10, title: "O'zbekiston Yangi Tarixi", author: "Prof. A. Qodirov",
    description: "Istiqloldan bugungi kungacha — ijtimoiy, siyosiy va iqtisodiy taraqqiyot bosqichlari.",
    thumbnail_url: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "history",
    rating: 4.4, downloads: 156, is_active: true,
  },
]

// ── Quizzes ───────────────────────────────────────────────────────────────────
export const MOCK_QUIZZES = [
  { id: 1, title: "Python asoslari",      category: "Dasturlash",  difficulty: "easy",   question_count: 5,  passing_score: 70, xp_reward: 50,  is_active: true, description: "Python sintaksisi va asosiy tushunchalar." },
  { id: 2, title: "Algebra — 9-sinf",    category: "Matematika",  difficulty: "medium", question_count: 5,  passing_score: 65, xp_reward: 75,  is_active: true, description: "Algebraik ifodalar, tenglamalar, funksiyalar." },
  { id: 3, title: "Ingliz tili: Grammar",category: "Ingliz tili", difficulty: "medium", question_count: 5,  passing_score: 60, xp_reward: 80,  is_active: true, description: "Tenses, conditionals, passive voice." },
  { id: 4, title: "Umumiy fizika",       category: "Fizika",      difficulty: "hard",   question_count: 5,  passing_score: 75, xp_reward: 100, is_active: true, description: "Mexanika, termodinamika, elektr." },
  { id: 5, title: "JavaScript asoslari",  category: "Dasturlash",  difficulty: "easy",   question_count: 5,  passing_score: 70, xp_reward: 50,  is_active: true, description: "JavaScript sintaksisi, DOM, events, ES6+." },
  { id: 6, title: "O'zbek tili: Imlo",   category: "Til",         difficulty: "easy",   question_count: 5,  passing_score: 60, xp_reward: 45,  is_active: true, description: "Imlo qoidalari, tinish belgilari, lug'at boyligi." },
  { id: 7, title: "Kimyo: Davriy jadval",category: "Kimyo",       difficulty: "medium", question_count: 5,  passing_score: 65, xp_reward: 60,  is_active: true, description: "Elementlar, valentlik, kimyoviy reaksiyalar." },
  { id: 8, title: "O'zbekiston tarixi",  category: "Tarix",       difficulty: "easy",   question_count: 5,  passing_score: 60, xp_reward: 55,  is_active: true, description: "Qadimgi davrdan hozirgi kunga qadar." },
]

// ── Full quiz question banks (all quizzes) ────────────────────────────────────
const mkQ = (id: number, text: string, opts: string[]) =>
  ({ id, question_text: text, options: opts, order_index: id })

export const MOCK_QUIZ_DETAILS: Record<number, {
  id: number; title: string; category: string; difficulty: string
  question_count: number; passing_score: number; xp_reward: number
  is_active: boolean; description: string
  questions: { id: number; question_text: string; options: string[]; order_index: number }[]
}> = {
  1: { ...MOCK_QUIZZES[0], questions: [
    mkQ(1, "Python — bu qanday dasturlash tili?",          ["Kompilyatsiya qilinadigan", "Interpretatsiya qilinadigan", "Assamblerlik", "Mashina tili"]),
    mkQ(2, "Python'da ro'yxat (list) qanday e'lon qilinadi?", ["{ }", "( )", "[ ]", "< >"]),
    mkQ(3, "Python'da funksiya qanday aniqlanadi?",         ["function foo():", "def foo():", "fun foo():", "void foo():"]),
    mkQ(4, "len('salom') qanday qiymat qaytaradi?",         ["4", "5", "6", "Xato"]),
    mkQ(5, "Python'da izoh (comment) qanday yoziladi?",     ["// izoh", "/* izoh */", "# izoh", "-- izoh"]),
  ]},
  2: { ...MOCK_QUIZZES[1], questions: [
    mkQ(1, "x² - 5x + 6 = 0 tenglamaning yechimlari qaysi?", ["x=1, x=6", "x=2, x=3", "x=-2, x=-3", "x=0, x=5"]),
    mkQ(2, "f(x) = 2x + 3 bo'lsa, f(5) = ?",                ["8", "10", "13", "16"]),
    mkQ(3, "-3 < 2x - 1 < 5 tengsizligining yechimi?",      ["-2 < x < 3", "-1 < x < 3", "1 < x < 3", "-1 < x < 2"]),
    mkQ(4, "√144 = ?",                                       ["10", "11", "12", "13"]),
    mkQ(5, "3a + 2b = 12 va a - b = 1 bo'lsa, a = ?",       ["2", "3", "4", "5"]),
  ]},
  3: { ...MOCK_QUIZZES[2], questions: [
    mkQ(1, "Choose the correct sentence:",                   ["She don't like apples.", "She doesn't likes apples.", "She doesn't like apples.", "She not like apples."]),
    mkQ(2, "If I ___ rich, I would travel the world.",       ["am", "were", "will be", "would be"]),
    mkQ(3, "The report ___ by the manager yesterday.",       ["wrote", "was written", "has been written", "is written"]),
    mkQ(4, "He said he ___ come tomorrow. (Reported speech)", ["will", "would", "shall", "should"]),
    mkQ(5, "Which word is a synonym for 'happy'?",           ["Sad", "Angry", "Content", "Tired"]),
  ]},
  4: { ...MOCK_QUIZZES[3], questions: [
    mkQ(1, "F = ma — bu qaysi qonun?",                       ["Termodinamika 1-qonuni", "Newton 1-qonuni", "Newton 2-qonuni", "Arximed qonuni"]),
    mkQ(2, "1 Joule (J) — bu nima?",                         ["1 N·m", "1 W·s", "Ikkalasi ham to'g'ri", "Hech biri to'g'ri emas"]),
    mkQ(3, "Erkin tushish tezlanishi (g) taxminan qancha?",  ["5 m/s²", "9.8 m/s²", "10.2 m/s²", "12 m/s²"]),
    mkQ(4, "Ohm qonuniga ko'ra: U = ?",                      ["I / R", "I · R", "R / I", "I + R"]),
    mkQ(5, "Energiyaning saqlanish qonuni nima deydi?",      ["Energiya yo'qolishi mumkin", "Energiya faqat shaklini o'zgartiradi", "Energiya o'sib boradi", "Energiya faqat issiqlik holida saqlanadi"]),
  ]},
  5: { ...MOCK_QUIZZES[4], questions: [
    mkQ(1, "JavaScript'da o'zgaruvchi e'lon qilishning to'g'ri usuli?", ["var x = 5 (faqat)", "let x = 5 (faqat)", "const x = 5 (faqat)", "Uchala usul ham to'g'ri"]),
    mkQ(2, "typeof null natijasi qanday?",                   ["'null'", "'undefined'", "'object'", "'boolean'"]),
    mkQ(3, "Arrow function'ning to'g'ri sintaksisi?",        ["function => (x) x*2", "(x) => x * 2", "x -> x * 2", "(x) function x * 2"]),
    mkQ(4, "Array.prototype.map() nima qaytaradi?",          ["Asl massivni o'zgartiradi", "Yangi massiv", "undefined", "Boolean"]),
    mkQ(5, "console.log(1 + '2') natijasi?",                 ["3", "'12'", "NaN", "Xato"]),
  ]},
  6: { ...MOCK_QUIZZES[5], questions: [
    mkQ(1, "\"Salom\" so'zi qaysi so'z turkumiga kiradi?",  ["Fe'l", "Ot", "Undov so'z", "Ravish"]),
    mkQ(2, "Qaysi so'z to'g'ri yozilgan?",                   ["ko'rinish", "ko'riniş", "ko'rinış", "koriniş"]),
    mkQ(3, "Fe'lning buyruq maylida qo'llanadigan qo'shimcha?", ["-moqchi", "-ing/-ingiz", "-gan", "-sa"]),
    mkQ(4, "\"Kitob o'qidim\" gapida to'ldiruvchi nima?",    ["Ega: kitob", "To'ldiruvchi: kitob", "Kesim: o'qidim", "Hol: kitob"]),
    mkQ(5, "Qo'shma gap qanday gap?",                        ["Bitta ega, bitta kesim", "Ikki yoki undan ortiq sodda gapdan iborat", "Faqat uyushiq bo'lakli gap", "Undov gapning turi"]),
  ]},
  7: { ...MOCK_QUIZZES[6], questions: [
    mkQ(1, "Suvning kimyoviy formulasi?",                     ["CO\u2082", "H\u2082O", "NaCl", "O\u2082"]),
    mkQ(2, "Vodorodning atom raqami?",                        ["1", "2", "6", "8"]),
    mkQ(3, "Yer atmosferasida qaysi gaz ko'proq?",           ["Kislorod (O\u2082)", "Azot (N\u2082)", "CO\u2082", "Argon"]),
    mkQ(4, "NaCl — bu qanday modda?",                        ["Shakar", "Natriy xlorid (osh tuzi)", "Kalsiy karbonat", "Sulfat kislota"]),
    mkQ(5, "Massa saqlanish qonunini kim kashf etgan?",       ["Mendeleev", "Lavoisier", "Curie", "Dalton"]),
  ]},
  8: { ...MOCK_QUIZZES[7], questions: [
    mkQ(1, "O'zbekiston mustaqilligini qachon qo'lga kiritdi?", ["1990-yil", "1991-yil", "1993-yil", "1989-yil"]),
    mkQ(2, "Amir Temur qaysi davlatni asos soldi?",           ["Somoniylar davlati", "Temuriylar davlati", "Xorazmshohlar davlati", "Qo'qon xonligi"]),
    mkQ(3, "O'zbekistonning poytaxti qaysi shahar?",          ["Samarqand", "Buxoro", "Toshkent", "Namangan"]),
    mkQ(4, "Al-Xorazmiy qaysi sohada mashhur?",               ["Tibbiyot", "Matematika va astronomiya", "Falsafa", "Adabiyot"]),
    mkQ(5, "O'zbekiston qachon BMTga qabul qilindi?",         ["1991-yil", "1992-yil", "1995-yil", "1993-yil"]),
  ]},
}

/** Legacy single-quiz export — kept for backward compatibility */
export const MOCK_QUIZ_DETAIL = MOCK_QUIZ_DETAILS[1]

// ── Resources ─────────────────────────────────────────────────────────────────
export const MOCK_RESOURCES = [
  { id: 1, title: "Python rasmiy hujjatlar",  url: "https://docs.python.org/3/", category: "Dasturlash", description: "Python 3 to'liq dokumentatsiyasi.", icon: "📘", is_active: true },
  { id: 2, title: "MDN Web Docs",              url: "https://developer.mozilla.org/", category: "Dasturlash", description: "HTML, CSS, JavaScript hujjatlar.", icon: "🌐", is_active: true },
  { id: 3, title: "Khan Academy",              url: "https://khanacademy.org/",       category: "Matematika", description: "Bepul matematika kurslari.", icon: "🎓", is_active: true },
  { id: 4, title: "Desmos grafik kalkulyator", url: "https://www.desmos.com/",        category: "Matematika", description: "Onlayn grafik va hisoblash vositasi.", icon: "📈", is_active: true },
  { id: 5, title: "Cambridge IELTS resurslar", url: "https://www.cambridgeenglish.org/exams-and-tests/ielts/", category: "Ingliz tili", description: "Rasmiy IELTS tayyorlov materiallari.", icon: "🇬🇧", is_active: true },
]

// ── Ambient sounds ────────────────────────────────────────────────────────────
export const MOCK_AMBIENT_SOUNDS = [
  { id: 1, name: "Yomg'ir",      emoji: "🌧️", url: "https://cdn.pixabay.com/audio/2022/03/10/audio_270f2ebe07.mp3", is_active: true },
  { id: 2, name: "Qahvaxona",    emoji: "☕", url: "https://cdn.pixabay.com/audio/2022/03/25/audio_61de5cf3e3.mp3", is_active: true },
  { id: 3, name: "O'rmon",       emoji: "🌲", url: "https://cdn.pixabay.com/audio/2021/10/22/audio_c47f89e5e0.mp3", is_active: true },
  { id: 4, name: "Okeam to'lqin", emoji: "🌊", url: "https://cdn.pixabay.com/audio/2022/06/07/audio_b9f879b59e.mp3", is_active: true },
  { id: 5, name: "Shovqin oq",   emoji: "🤍", url: "https://cdn.pixabay.com/audio/2022/02/15/audio_9dc28caa10.mp3", is_active: true },
]

// ── Heatmap (last 90 days of mock activity) ───────────────────────────────────
function buildHeatmap(days: number) {
  const result: { date: string; count: number }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const count = Math.random() < 0.55 ? Math.floor(Math.random() * 5) + 1 : 0
    result.push({ date: d.toISOString().slice(0, 10), count })
  }
  return result
}
export const MOCK_HEATMAP = buildHeatmap(365)

// ── Teachers gallery ──────────────────────────────────────────────────────────
export const MOCK_TEACHERS = [
  {
    telegram_id: 1, first_name: "Sardor", last_name: "Toshmatov", username: "sardor_dev",
    photo_url: "https://ui-avatars.com/api/?name=Sardor+T&background=6366F1&color=fff&size=128",
    bio: "10 yillik tajriba. Python, FastAPI, React, DevOps.",
    specialization: "Backend & Frontend", experience_years: 10, rating_avg: 4.9,
    rating_count: 122, course_count: 3, student_count: 649, is_verified: true,
  },
  {
    telegram_id: 2, first_name: "Nilufar", last_name: "Karimova", username: "nilufar_english",
    photo_url: "https://ui-avatars.com/api/?name=Nilufar+K&background=10B981&color=fff&size=128",
    bio: "IELTS 8.5 sohibi. 7 yillik ingliz tili o'qituvchisi.",
    specialization: "Ingliz tili", experience_years: 7, rating_avg: 4.7,
    rating_count: 103, course_count: 1, student_count: 521, is_verified: true,
  },
  {
    telegram_id: 3, first_name: "Jasur", last_name: "Mirzayev", username: "jasur_math",
    photo_url: "https://ui-avatars.com/api/?name=Jasur+M&background=F59E0B&color=fff&size=128",
    bio: "Oliy matematika va fizika bo'yicha nomzod.",
    specialization: "Matematika & Fizika", experience_years: 12, rating_avg: 4.8,
    rating_count: 83, course_count: 2, student_count: 342, is_verified: true,
  },
]

// ── Teacher profile (own) ─────────────────────────────────────────────────────
export const MOCK_TEACHER_PROFILE = {
  telegram_id: 999_001, first_name: "Dev", last_name: "Tester", username: "dev_tester",
  bio: "Mock mode — bu yerda o'z bio'ngizni yozing.",
  specialization: "Dasturlash", experience_years: 3,
  education: "Toshkent Axborot Texnologiyalari Universiteti",
  website_url: "https://example.com", youtube_url: "", telegram_channel: "",
  profile_complete: false, rating_avg: 0, rating_count: 0, student_count: 0, course_count: 0,
}

// ── Teacher analytics ─────────────────────────────────────────────────────────
export const MOCK_TEACHER_ANALYTICS = {
  total_students: 87, total_paid_orders: 34, estimated_income: 4_250_000,
  total_courses: 2, published_courses: 1, avg_rating: 4.6,
  monthly_stats: [
    { month: "2025-11", orders: 8,  income: 960_000 },
    { month: "2025-12", orders: 12, income: 1_440_000 },
    { month: "2026-01", orders: 9,  income: 1_080_000 },
    { month: "2026-02", orders: 5,  income: 600_000 },
  ],
}

// ── Admin stats ────────────────────────────────────────────────────────────────
export const MOCK_ADMIN_STATS = {
  total_users: 1_842,
  active_users_7d: 347,
  total_courses: 6,
  total_books: 10,
  total_quizzes: 8,
  total_orders: 218,
  total_revenue: 28_650_000,
  new_users_today: 14,
  quiz_completions_today: 38,
}

// ── Platform analytics ─────────────────────────────────────────────────────────
export const MOCK_PLATFORM_ANALYTICS = {
  ...MOCK_ADMIN_STATS,
  daily_active: [
    { date: "2026-03-30", users: 218 }, { date: "2026-03-31", users: 249 },
    { date: "2026-04-01", users: 301 }, { date: "2026-04-02", users: 287 },
    { date: "2026-04-03", users: 334 }, { date: "2026-04-04", users: 347 },
    { date: "2026-04-05", users: 361 },
  ],
  top_courses: MOCK_COURSES.slice(0, 3).map(c => ({ ...c, revenue: c.price * 20 })),
}

// ── Hero content ──────────────────────────────────────────────────────────────
export const MOCK_HERO = [
  {
    id: 1, title: "SAHIFALAB bilan muvaffaqiyatga erishing",
    subtitle: "O'zbekistondagi eng yaxshi ta'lim platformasida o'qing.",
    cta_text: "Boshlash", cta_url: "/courses",
    image_url: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=1200&q=80",
    is_active: true, order: 1,
  },
]

// ── Payment (mock order) ──────────────────────────────────────────────────────
export const MOCK_PAYMENT_ORDER = {
  order_id: 'MOCK_PAY_001',
  item_type: 'book',
  item_id: 1,
  provider: 'click',
  amount: 25_000,
  currency: 'UZS',
  status: 'pending',
  invoice_link: '#mock-payment-link',
  created_at: new Date().toISOString(),
}

// ── Leaderboard (used for mock seeding localStorage cache) ────────────────────
export const MOCK_LEADERBOARD: Array<{
  telegram_id: number
  first_name: string
  username: string | null
  photo_url: string | null
  total_xp: number
  focus_seconds: number
  level: number
  quizzes_completed: number
  app_online_at: string | null
}> = [
  { telegram_id: 999_001, first_name: "Dev",      username: "dev_tester",      photo_url: "https://ui-avatars.com/api/?name=Dev+Tester&background=F15929&color=fff",      total_xp: 4200,  focus_seconds: 72000, level: 8,  quizzes_completed: 12, app_online_at: new Date().toISOString() },
  { telegram_id: 100_001, first_name: "Alisher",  username: "alisher_uz",      photo_url: null,                                                                            total_xp: 3850,  focus_seconds: 63000, level: 7,  quizzes_completed: 10, app_online_at: null },
  { telegram_id: 100_002, first_name: "Barno",    username: "barno_code",      photo_url: "https://ui-avatars.com/api/?name=Barno&background=EC4899&color=fff",            total_xp: 3200,  focus_seconds: 54000, level: 7,  quizzes_completed: 8,  app_online_at: null },
  { telegram_id: 100_003, first_name: "Dilshod",  username: "dilshod99",       photo_url: null,                                                                            total_xp: 2800,  focus_seconds: 45000, level: 6,  quizzes_completed: 7,  app_online_at: null },
  { telegram_id: 100_004, first_name: "Kamola",   username: "kamola_learns",   photo_url: "https://ui-avatars.com/api/?name=Kamola&background=10B981&color=fff",           total_xp: 2200,  focus_seconds: 38000, level: 5,  quizzes_completed: 5,  app_online_at: new Date(Date.now()-300_000).toISOString() },
  { telegram_id: 100_005, first_name: "Jahongir", username: null,              photo_url: null,                                                                            total_xp: 1900,  focus_seconds: 29000, level: 4,  quizzes_completed: 4,  app_online_at: null },
  { telegram_id: 100_006, first_name: "Zulfiya",  username: "zulfiya_study",   photo_url: "https://ui-avatars.com/api/?name=Zulfiya&background=8B5CF6&color=fff",          total_xp: 1500,  focus_seconds: 23000, level: 4,  quizzes_completed: 3,  app_online_at: null },
  { telegram_id: 100_007, first_name: "Nodir",    username: "nodir_dev",       photo_url: null,                                                                            total_xp: 1100,  focus_seconds: 18000, level: 3,  quizzes_completed: 2,  app_online_at: null },
  { telegram_id: 100_008, first_name: "Mohira",   username: "mohira_22",       photo_url: "https://ui-avatars.com/api/?name=Mohira&background=3B82F6&color=fff",           total_xp: 800,   focus_seconds: 12000, level: 2,  quizzes_completed: 1,  app_online_at: null },
  { telegram_id: 100_009, first_name: "Sherzod",  username: null,              photo_url: null,                                                                            total_xp: 500,   focus_seconds:  8000, level: 2,  quizzes_completed: 1,  app_online_at: null },
]

// ══════════════════════════════════════════════════════════════════════════════
// SOCIAL ECOSYSTEM MOCK DATA
// ══════════════════════════════════════════════════════════════════════════════

// ── Social user profiles (UserIdentityUser shape) ────────────────────────────
const _socialUser = (id: number) => MOCK_LEADERBOARD.find(u => u.telegram_id === id)

/** Helper — build an author object matching PostData.author shape */
function mkAuthor(tid: number): {
  telegram_id: number; full_name: string; username: string | null
  photo_url: string | null; role: string; level: number; xp: number
} {
  const u = _socialUser(tid)
  return {
    telegram_id: tid,
    full_name: u?.first_name ?? 'Unknown',
    username: u?.username ?? null,
    photo_url: u?.photo_url ?? null,
    role: tid === 999_001 ? 'admin' : tid === 100_001 ? 'teacher' : 'student',
    level: u?.level ?? 1,
    xp: u?.total_xp ?? 0,
  }
}

// ── Posts ─────────────────────────────────────────────────────────────────────
let _postId = 0
function mkPost(
  authorId: number, content: string, imageUrl?: string,
  likes = 0, comments = 0, hoursAgo = 1, isLiked = false,
) {
  return {
    id: ++_postId,
    author: mkAuthor(authorId),
    content,
    image_url: imageUrl ?? null,
    likes_count: likes,
    comments_count: comments,
    is_liked: isLiked,
    created_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  }
}

export const MOCK_POSTS = [
  mkPost(100_001, "Bugun yangi React 19 hujjatlarini o'qib chiqdim. Server Components haqiqatan ham kuchli ekan! 🚀\n\nhttps://react.dev/blog/2024/12/05/react-19",
    undefined, 14, 3, 2, true),
  mkPost(999_001, "SAHIFALAB yangi social funksiya ishga tushdi! Endi bir-biringiz bilan bog'lanishingiz mumkin 🎉",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80", 28, 7, 5),
  mkPost(100_002, "Python bilan machine learning loyihamni tugatdim. Accuracy 94% ga yetdi! 🤖\n\n#machinelearning #python #datascience",
    "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&q=80", 21, 5, 8, true),
  mkPost(100_004, "IELTS Writing Task 2 uchun yangi strategiya topdim — OREO metodi:\n\n📌 Opinion\n📌 Reason\n📌 Example\n📌 Opinion (repeat)\n\nJuda samarali!",
    undefined, 35, 12, 12),
  mkPost(100_003, "Matematika olimpiadasi natijalarim chiqdi — 2-o'rin! 🏆 Tayyorgarlik jarayoni juda qiyin bo'ldi lekin natija juda yaxshi.",
    undefined, 18, 4, 18),
  mkPost(100_006, "Bugungi kitob tavsiyam: \"Deep Work\" — Cal Newport. Chuqur diqqat to'plash san'ati haqida eng yaxshi kitob! 📚",
    "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80", 9, 2, 24),
  mkPost(100_007, "FastAPI + PostgreSQL bilan REST API yozdim. Swagger dokumentatsiya avtomatik generatsiya bo'lyapti — ajoyib! 💪",
    undefined, 11, 3, 30),
  mkPost(100_001, "Yangi loyihamni open-source qildim!\n\nhttps://github.com/example/uzbek-nlp\n\nO'zbek tili uchun NLP kutubxonasi. Tokenizer, stemmer, va sentiment analysis.",
    undefined, 42, 8, 48, true),
  mkPost(100_005, "DSA o'rganish uchun roadmap:\n\n1️⃣ Arrays & Strings\n2️⃣ Linked Lists\n3️⃣ Trees & Graphs\n4️⃣ Dynamic Programming\n5️⃣ System Design\n\nHar kuniga 2 ta masala hal qiling!",
    undefined, 27, 6, 60),
  mkPost(100_008, "Birinchi Python dasturim ishga tushdi! 'Hello World' dan boshlab, endi hisob-kitob dasturi yozdim 😄\n\n#beginner #python",
    undefined, 15, 4, 72),
  mkPost(100_002, "Tailwind CSS 4.0 alpha chiqqan ekan! Yangi @theme directive va zero-config — juda kuchli yangilanish.",
    "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80", 19, 3, 96),
  mkPost(100_009, "Fizika fanidan 85 ball oldim! Kvant mexanikasi qismi eng qiyin bo'ldi ⚛️",
    undefined, 7, 1, 120),
]

// ── Public profiles (for /api/v1/social/users/:id/profile) ───────────────────
export function MOCK_PUBLIC_PROFILE(targetId: number, myId: number) {
  const u = _socialUser(targetId)

  // If not found in social users, try to find in MOCK_TEACHERS (for teacher profiles)
  if (!u) {
    const teacher = MOCK_TEACHERS.find(t => t.telegram_id === targetId)
    if (!teacher) return null
    return {
      telegram_id: targetId,
      full_name: `${teacher.first_name} ${teacher.last_name ?? ''}`.trim(),
      first_name: teacher.first_name,
      username: teacher.username,
      photo_url: teacher.photo_url,
      role: 'teacher' as const,
      level: 10,
      xp: 9600,
      bio: teacher.bio ?? null,
      followers_count: Math.floor(Math.random() * 80) + 20,
      following_count: Math.floor(Math.random() * 15) + 5,
      is_following: false,
    }
  }

  return {
    telegram_id: targetId,
    full_name: u.first_name,
    first_name: u.first_name,
    username: u.username,
    photo_url: u.photo_url,
    role: targetId === 999_001 ? 'admin' : targetId === 100_001 ? 'teacher' : 'student',
    level: u.level,
    xp: u.total_xp,
    bio: targetId === 100_001
      ? "10 yillik tajriba. Python, FastAPI, React, DevOps. Open-source loyihalar muallifi."
      : targetId === 100_002
        ? "Data Science & ML enthusiast. Python, TensorFlow, PyTorch. Barno codes 💻"
        : targetId === 100_004
          ? "IELTS 7.5 | Ingliz tili o'qituvchisi | Study tips & motivation 📝"
          : "SAHIFALAB foydalanuvchisi",
    followers_count: Math.floor(Math.random() * 50) + 5,
    following_count: Math.floor(Math.random() * 30) + 3,
    is_following: [100_001, 100_002, 100_004].includes(targetId) && myId === 999_001,
  }
}

// ── Own profile (flat ProfileData shape for /api/profile/:username own user) ──
export const MOCK_OWN_PROFILE = {
  telegram_id:        MOCK_USER.telegram_id,
  username:           MOCK_USER.username,
  first_name:         MOCK_USER.first_name,
  photo_url:          MOCK_USER.photo_url,
  cover_image_url:    'https://images.unsplash.com/photo-1517134191118-9d595e4c8c2b?w=1200&q=80',
  headline:           'Full-stack dasturchi & SAHIFALAB admin | Python · React · FastAPI',
  bio:                "To'liq stack dasturchi, open-source loyihalarga hissa qo'shaman. SAHIFALAB platformasini quruvchilardan biriman. Python, FastAPI, React, PostgreSQL va DevOps sohalari bo'yicha tajribaga egaman.",
  location_city:      'Toshkent',
  website_url:        'https://github.com/dev_tester',
  account_type:       'admin',
  is_verified:        true,
  level:              MOCK_USER.level,
  level_name:         'Senior Developer',
  total_xp:           MOCK_USER.total_xp,
  next_level_xp:      5_000,
  xp_percent:         84,
  focus_hours:        120,
  profile_views:      347,
  profile_views_week: 42,
  connections_count:  28,
  mutual_connections: 0,
  courses_enrolled:   5,
  courses_completed:  3,
  certificates_count: 3,
  connection_status:  'own' as const,
  connection_id:      null,
  profile_completeness: 92,
  skills: [
    { id: 1, skill_name: 'Python',     is_verified: true,  endorsement_count: 12, endorsed_by_viewer: false, display_order: 0 },
    { id: 2, skill_name: 'FastAPI',    is_verified: true,  endorsement_count: 8,  endorsed_by_viewer: false, display_order: 1 },
    { id: 3, skill_name: 'React',      is_verified: true,  endorsement_count: 9,  endorsed_by_viewer: false, display_order: 2 },
    { id: 4, skill_name: 'TypeScript', is_verified: false, endorsement_count: 6,  endorsed_by_viewer: false, display_order: 3 },
    { id: 5, skill_name: 'PostgreSQL', is_verified: true,  endorsement_count: 5,  endorsed_by_viewer: false, display_order: 4 },
    { id: 6, skill_name: 'Docker',     is_verified: false, endorsement_count: 3,  endorsed_by_viewer: false, display_order: 5 },
  ],
  certificates: [
    {
      id: 1,
      course_title: "Python dasturlash — boshlang'ichdan mutaxassisgacha",
      score: 96,
      issued_at: '2025-12-10T10:00:00Z',
      share_token: 'mock-share-abc123',
      skill_tags: ['Python', 'Backend', 'Automation'],
    },
    {
      id: 2,
      course_title: 'Ingliz tili: IELTS 7.0 ga tayyorlanish',
      score: 88,
      issued_at: '2026-01-22T10:00:00Z',
      share_token: 'mock-share-def456',
      skill_tags: ['IELTS', 'English'],
    },
    {
      id: 3,
      course_title: 'React va TypeScript: Professional kurs',
      score: 93,
      issued_at: '2026-02-15T10:00:00Z',
      share_token: 'mock-share-ghi789',
      skill_tags: ['React', 'TypeScript', 'Frontend'],
    },
  ],
  active_courses: [
    {
      id: 4,
      title: 'Data Science va Machine Learning',
      thumbnail_url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=400&q=80',
      progress_percent: 62,
      teacher_name: 'Barno Yusupova',
    },
    {
      id: 5,
      title: 'DevOps: Docker, CI/CD va Kubernetes',
      thumbnail_url: 'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=400&q=80',
      progress_percent: 35,
      teacher_name: 'Jahongir Nazarov',
    },
  ],
  recent_activity: [
    { activity_type: 'certificate_earned',   created_at: new Date(Date.now() - 1_296_000_000).toISOString(), metadata: { course_title: 'React va TypeScript: Professional kurs' } },
    { activity_type: 'level_up',             created_at: new Date(Date.now() - 2_592_000_000).toISOString(), metadata: { level_name: 'Senior Developer' } },
    { activity_type: 'skill_added',          created_at: new Date(Date.now() - 3_456_000_000).toISOString(), metadata: { skill_name: 'Docker' } },
    { activity_type: 'course_enrolled',      created_at: new Date(Date.now() - 4_320_000_000).toISOString(), metadata: { course_title: 'DevOps: Docker, CI/CD va Kubernetes' } },
    { activity_type: 'certificate_earned',   created_at: new Date(Date.now() - 5_184_000_000).toISOString(), metadata: { course_title: 'Ingliz tili: IELTS 7.0 ga tayyorlanish' } },
    { activity_type: 'connection_made',      created_at: new Date(Date.now() - 6_912_000_000).toISOString(), metadata: {} },
    { activity_type: 'post_created',         created_at: new Date(Date.now() - 8_640_000_000).toISOString(), metadata: {} },
    { activity_type: 'achievement_unlocked', created_at: new Date(Date.now() - 10_368_000_000).toISOString(), metadata: { achievement_name: 'Kurs ustasi' } },
  ],
}

// ── Discover users (users the current user does NOT follow) ──────────────────
export function MOCK_DISCOVER_USERS(myId: number) {
  return MOCK_LEADERBOARD
    .filter(u => u.telegram_id !== myId)
    .map(u => ({
      telegram_id: u.telegram_id,
      full_name: u.first_name,
      first_name: u.first_name,
      username: u.username,
      photo_url: u.photo_url,
      role: u.telegram_id === 999_001 ? 'admin' : u.telegram_id === 100_001 ? 'teacher' : 'student',
      level: u.level,
      xp: u.total_xp,
    }))
}

// ── Conversations ────────────────────────────────────────────────────────────
export const MOCK_CONVERSATIONS = [
  {
    id: 1,
    other_user: mkAuthor(100_001),
    last_message: {
      id: 105,
      conversation_id: 1,
      sender_id: 100_001,
      content: "FastAPI loyihangni ko'rdim, juda yaxshi yozilgan! 👏",
      is_read: false,
      created_at: new Date(Date.now() - 1_800_000).toISOString(), // 30 min ago
    },
    unread_count: 2,
    last_message_at: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    id: 2,
    other_user: mkAuthor(100_002),
    last_message: {
      id: 204,
      conversation_id: 2,
      sender_id: 999_001,
      content: "ML loyihang uchun qaysi dataset ishlatding?",
      is_read: true,
      created_at: new Date(Date.now() - 7_200_000).toISOString(), // 2h ago
    },
    unread_count: 0,
    last_message_at: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 3,
    other_user: mkAuthor(100_004),
    last_message: {
      id: 301,
      conversation_id: 3,
      sender_id: 100_004,
      content: "IELTS Writing strategiyasi haqida gaplashamizmi?",
      is_read: true,
      created_at: new Date(Date.now() - 86_400_000).toISOString(), // 1 day ago
    },
    unread_count: 0,
    last_message_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
]

// ── Direct Messages (per conversation) ───────────────────────────────────────
const MY_ID = 999_001

function mkMsg(id: number, convId: number, senderId: number, content: string, hoursAgo: number, isRead = true) {
  return {
    id,
    conversation_id: convId,
    sender_id: senderId,
    content,
    is_read: isRead,
    created_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  }
}

export const MOCK_MESSAGES: Record<number, ReturnType<typeof mkMsg>[]> = {
  // Conversation 1: Dev ↔ Alisher
  1: [
    mkMsg(101, 1, MY_ID,    "Salom Alisher! React 19 haqidagi postingni o'qidim, juda foydali ekan 🔥", 3),
    mkMsg(102, 1, 100_001,  "Rahmat! Hozir Server Components ustida ishlayapman, natijalar ajoyib", 2.5),
    mkMsg(103, 1, MY_ID,    "Men ham sinab ko'rmoqchiman. Qaysi tutorial ishlatding?", 2),
    mkMsg(104, 1, 100_001,  "React rasmiy hujjatlaridan boshla:\nhttps://react.dev/reference/rsc/server-components", 1),
    mkMsg(105, 1, 100_001,  "FastAPI loyihangni ko'rdim, juda yaxshi yozilgan! 👏", 0.5, false),
  ],
  // Conversation 2: Dev ↔ Barno
  2: [
    mkMsg(201, 2, 100_002,  "Salom! ML loyiham haqida yozdim, ko'rdingmi?", 5),
    mkMsg(202, 2, MY_ID,    "Ha, 94% accuracy — juda yaxshi! Qaysi model ishlatding?", 4),
    mkMsg(203, 2, 100_002,  "Random Forest + XGBoost ensemble. Feature engineering ko'p yordam berdi", 3),
    mkMsg(204, 2, MY_ID,    "ML loyihang uchun qaysi dataset ishlatding?", 2),
  ],
  // Conversation 3: Dev ↔ Kamola
  3: [
    mkMsg(301, 3, 100_004,  "IELTS Writing strategiyasi haqida gaplashamizmi?", 24),
  ],
}

