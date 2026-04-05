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

// ── Course reviews ─────────────────────────────────────────────────────────────
export const MOCK_REVIEWS = [
  { id: 1, user_id: 11, rating: 5, review: "Juda yaxshi kurs! Hamma narsani tushuntiradi.", created_at: "2026-01-10T12:00:00Z", user: { first_name: "Alisher", username: "alisher_uz", photo_url: null } },
  { id: 2, user_id: 12, rating: 5, review: "O'qituvchi juda tajribali, amaliy misollar ko'p.", created_at: "2026-01-15T08:30:00Z", user: { first_name: "Barno", username: "barno_code", photo_url: null } },
  { id: 3, user_id: 13, rating: 4, review: "Kurs yaxshi lekin biroz sekinroq tushuntirishsa yaxshi bo'lardi.", created_at: "2026-02-01T14:00:00Z", user: { first_name: "Dilshod", username: "dilshod99", photo_url: null } },
]

// ── Enrollments ───────────────────────────────────────────────────────────────
export const MOCK_ENROLLMENTS = [
  { id: 1, course_id: 1, enrolled_at: "2026-01-05T10:00:00Z", progress_percent: 35, course: MOCK_COURSES[0] },
  { id: 2, course_id: 2, enrolled_at: "2026-01-20T14:00:00Z", progress_percent: 70, course: MOCK_COURSES[1] },
  { id: 3, course_id: 5, enrolled_at: "2026-02-10T09:00:00Z", progress_percent: 10, course: MOCK_COURSES[4] },
]

// ── Books ─────────────────────────────────────────────────────────────────────
export const MOCK_BOOKS = [
  {
    id: 1, title: "Clean Code", author: "Robert C. Martin",
    description: "Dastur kodini qanday toza va o'qilishi oson qilish haqida fundamental asar.",
    cover_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80",
    file_url: "#", price: 25_000, is_paid: true, category: "Dasturlash",
    total_pages: 431, language: "uz", rating_avg: 4.9, rating_count: 128,
    download_count: 342, is_active: true,
  },
  {
    id: 2, title: "Atomic Habits", author: "James Clear",
    description: "Kichik odatlar orqali katta o'zgarishlarga erishish yo'llari.",
    cover_url: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "Motivatsiya",
    total_pages: 320, language: "uz", rating_avg: 4.8, rating_count: 214,
    download_count: 890, is_active: true,
  },
  {
    id: 3, title: "Python Crash Course", author: "Eric Matthes",
    description: "Python tilini tezda o'rganish uchun eng yaxshi amaliy qo'llanma.",
    cover_url: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=400&q=80",
    file_url: "#", price: 35_000, is_paid: true, category: "Dasturlash",
    total_pages: 544, language: "uz", rating_avg: 4.7, rating_count: 98,
    download_count: 255, is_active: true,
  },
  {
    id: 4, title: "The Pragmatic Programmer", author: "David Thomas, Andrew Hunt",
    description: "Professional dasturchilar uchun hayotiy maslahatlar va best practices.",
    cover_url: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&q=80",
    file_url: "#", price: 30_000, is_paid: true, category: "Dasturlash",
    total_pages: 352, language: "uz", rating_avg: 4.8, rating_count: 67,
    download_count: 178, is_active: true,
  },
  {
    id: 5, title: "Thinking, Fast and Slow", author: "Daniel Kahneman",
    description: "Ikkita fikrlash tizimi: tez va sekin. Qarorlar qanday qabul qilinadi.",
    cover_url: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80",
    file_url: "#", price: 0, is_paid: false, category: "Psixologiya",
    total_pages: 499, language: "uz", rating_avg: 4.6, rating_count: 156,
    download_count: 612, is_active: true,
  },
  {
    id: 6, title: "The Art of Problem Solving vol.1", author: "Richard Rusczyk",
    description: "Olimpiada matematikasiga tayyorlanish uchun klassik qo'llanma.",
    cover_url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80",
    file_url: "#", price: 40_000, is_paid: true, category: "Matematika",
    total_pages: 288, language: "uz", rating_avg: 4.9, rating_count: 44,
    download_count: 123, is_active: true,
  },
]

// ── Quizzes ───────────────────────────────────────────────────────────────────
export const MOCK_QUIZZES = [
  { id: 1, title: "Python asoslari", category: "Dasturlash", difficulty: "easy",   question_count: 10, passing_score: 70, xp_reward: 50,  is_active: true, description: "Python sintaksisi va asosiy tushunchalar." },
  { id: 2, title: "Algebra — 9-sinf",  category: "Matematika", difficulty: "medium", question_count: 15, passing_score: 65, xp_reward: 75,  is_active: true, description: "Algebraik ifodalar, tenglamalar, funksiyalar." },
  { id: 3, title: "Ingliz tili: Grammar", category: "Ingliz tili", difficulty: "medium", question_count: 20, passing_score: 60, xp_reward: 80, is_active: true, description: "Tenses, conditionals, passive voice." },
  { id: 4, title: "Umumiy fizika",     category: "Fizika",    difficulty: "hard",   question_count: 12, passing_score: 75, xp_reward: 100, is_active: true, description: "Mexanika, termodinamika, elektr." },
]

// ── Full quiz with questions (quiz id=1) ──────────────────────────────────────
export const MOCK_QUIZ_DETAIL = {
  id: 1, title: "Python asoslari", category: "Dasturlash", difficulty: "easy",
  question_count: 5, passing_score: 70, xp_reward: 50, is_active: true,
  description: "Python sintaksisi va asosiy tushunchalar.",
  questions: [
    {
      id: 1, question_text: "Python — bu qanday dasturlash tili?",
      options: ["Kompilyatsiya qilinadigan", "Interpretatsiya qilinadigan", "Assamblerlik", "Mashina tili"],
      order_index: 1,
    },
    {
      id: 2, question_text: "Python'da ro'yxat (list) qanday e'lon qilinadi?",
      options: ["{ }", "( )", "[ ]", "< >"],
      order_index: 2,
    },
    {
      id: 3, question_text: "Python'da funksiya qanday aniqlanadi?",
      options: ["function foo():", "def foo():", "fun foo():", "void foo():"],
      order_index: 3,
    },
    {
      id: 4, question_text: "len('salom') qanday qiymat qaytaradi?",
      options: ["4", "5", "6", "Xato"],
      order_index: 4,
    },
    {
      id: 5, question_text: "Python'da izoh (comment) qanday yoziladi?",
      options: ["// izoh", "/* izoh */", "# izoh", "-- izoh"],
      order_index: 5,
    },
  ],
}

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
  total_books: 6,
  total_quizzes: 4,
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
