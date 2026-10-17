/**
 * CSV export of whatever analytics view is open — built client-side from the
 * JSON the view already loaded, so it always matches what's on screen.
 * One file per view; each table is a titled section separated by a blank
 * row (Excel and Google Sheets both open this fine). UTF-8 with BOM so
 * Excel shows Uzbek apostrophes and emoji correctly.
 *
 * The per-user list (Auditoriya → "Foydalanuvchilar ro'yxati") is a separate
 * server-side export: /api/admin/feature-analytics/audience/export.
 */
import type { AiUsageData, AudienceData, DailyQuizData, FlashcardsData, OverviewData } from './types'

type Cell = string | number | null | undefined
interface Section { title: string; head: string[]; rows: Cell[][] }

const esc = (v: Cell) => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(meta: string, sections: Section[]): string {
  const lines: string[] = [esc(meta), '']
  for (const s of sections) {
    lines.push(esc(s.title), s.head.map(esc).join(','))
    for (const r of s.rows) lines.push(r.map(esc).join(','))
    lines.push('')
  }
  return lines.join('\r\n')
}

const kv = (title: string, pairs: [string, Cell][]): Section =>
  ({ title, head: ["Ko'rsatkich", 'Qiymat'], rows: pairs.map(([k, v]) => [k, v]) })

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']
const RATING_LABELS: Record<number, string> = { 1: 'Unutdim', 2: 'Qiyin', 3: 'Yaxshi', 4: 'Oson' }
const STATUS_LABELS: Record<string, string> = { new: 'Yangi', learning: "O'rganilmoqda", reviewing: 'Takrorlanmoqda', mastered: "O'zlashtirilgan" }

function overview(d: OverviewData): Section[] {
  const t = d.totals
  return [
    kv('Umumiy ko\'rsatkichlar', [
      ['Faol foydalanuvchilar', t.active_users], ['Faol (oldingi davr)', t.active_users_prev], ["O'zgarish %", t.active_users_delta],
      ["Yangi ro'yxatdan o'tganlar", t.new_users], ['Yangi (oldingi davr)', t.new_users_prev], ["O'zgarish %", t.new_users_delta],
      ["O'rtacha kunlik faol (DAU)", t.dau_avg], ['Oxirgi 7 kun faol (WAU)', t.wau], ['Yopishqoqlik %', t.stickiness_pct],
      ['Fokus daqiqalari', t.focus_minutes], ['Ilovani ochganlar', t.seen_in_app], ['Jami foydalanuvchilar', t.registered],
    ]),
    {
      title: 'Xususiyatlar reytingi',
      head: ['Xususiyat', 'Foydalanuvchi', 'Oldingi davr', "O'zgarish %", 'Faollar ulushi %', 'Harakatlar', 'Birlik', 'Oldingi davr harakatlar', '1 kishiga'],
      rows: d.features.map(f => [f.label, f.users, f.users_prev, f.users_delta, f.adoption_pct, f.actions, f.unit, f.actions_prev, f.actions_per_user]),
    },
    {
      title: 'Kunlik faollik (foydalanuvchilar soni)',
      head: ['Sana', 'Faol', 'Yangi', ...d.features.map(f => f.label)],
      rows: d.daily.map((day, i) => [day.date, day.active_users, day.new_users, ...d.features.map(f => f.daily[i]?.users ?? 0)]),
    },
    {
      title: 'Nechta xususiyatdan foydalanadi',
      head: ['Xususiyatlar soni', 'Foydalanuvchi'],
      rows: d.depth.map(x => [x.features >= 4 ? '4+' : x.features, x.users]),
    },
    {
      title: 'Birga ishlatiladigan xususiyatlar',
      head: ['Xususiyat A', 'Xususiyat B', 'Foydalanuvchi', 'Faollar ulushi %'],
      rows: d.combos.map(c => [c.a_label, c.b_label, c.users, c.pct]),
    },
    {
      title: 'Faollik vaqti (Toshkent, harakatlar soni)',
      head: ['Kun', ...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)],
      rows: d.heatmap.map((row, i) => [WEEKDAYS[i], ...row]),
    },
  ]
}

function flashcards(d: FlashcardsData): Section[] {
  const p = d.period
  return [
    kv("Umumiy ko'rsatkichlar", [
      ["Jami to'plamlar", d.totals.decks], ['Jami kartalar', d.totals.cards], ["To'plam egalari", d.totals.owners],
      ["Ochiq to'plamlar", d.totals.public_decks], ["O'zlashtirilgan kartalar", d.totals.mastered_cards],
      ["O'rtacha karta / to'plam", d.totals.avg_cards_per_deck],
      ['Takrorlashlar (davr)', p.reviews.value], ['Takrorlashlar (oldingi davr)', p.reviews.prev], ["O'zgarish %", p.reviews.delta],
      ['Takrorlovchilar (davr)', p.reviewers.value], ['Takrorlovchilar (oldingi davr)', p.reviewers.prev],
      ['Yangi kartalar (davr)', p.new_cards.value], ['Yangi kartalar (oldingi davr)', p.new_cards.prev],
      ["Yangi to'plamlar (davr)", p.new_decks.value], ["Yangi to'plamlar (oldingi davr)", p.new_decks.prev],
      ["To'plam yaratganlar (davr)", p.creators], ['Sessiya-kunlar (davr)', p.sessions.value],
      ['Eslab qolish %', p.recall_pct], ['1 kartaga vaqt (s)', p.avg_seconds_per_card],
    ]),
    {
      title: "To'plamlar manbasi (barcha vaqt)",
      head: ['Manba', "To'plam", 'Karta', 'Kishi', "Davrda yangi to'plam", 'Davrda yangi karta', 'Takrorlash (davr)'],
      rows: d.sources.map(s => [s.label, s.decks, s.cards, s.users, s.new_decks, s.new_cards, s.reviews]),
    },
    {
      title: 'Mavzular',
      head: ['Mavzu', "To'plam", 'Karta', 'Kishi', "Davrda yangi to'plam", 'Davrda yangi karta', 'Takrorlash (davr)', "AI to'plamlar"],
      rows: d.themes.map(t => [t.label, t.decks, t.cards, t.users, t.new_decks, t.new_cards, t.reviews, t.ai_decks]),
    },
    kv('AI bilan karta yaratish (davr)', [
      ["So'rovlar", d.ai.requests], ['Muvaffaqiyatli', d.ai.succeeded], ['Xato', d.ai.failed], ['Kesh', d.ai.cache_hits],
      ['Foydalanuvchilar', d.ai.users], ["Saqlangan to'plamlar", d.ai.saved_decks], ['Saqlangan kartalar', d.ai.saved_cards],
      ['Matndan', d.ai.saved_from_text], ['Rasmdan', d.ai.saved_from_image], ['Saqlash darajasi %', d.ai.save_rate_pct],
      ['Pullik generatsiya', d.ai.paid_generations], ['Sarflangan tanga', d.ai.tanga_spent], ['API xarajati (USD)', d.ai.cost_usd],
    ]),
    { title: 'Javob sifati (davr)', head: ['Baho', 'Soni', '%'], rows: d.ratings.map(r => [RATING_LABELS[r.rating] ?? r.rating, r.count, r.pct]) },
    { title: 'Kartalar holati', head: ['Holat', 'Soni'], rows: d.card_status.map(s => [STATUS_LABELS[s.status] ?? s.status, s.count]) },
    kv('Karta turi', [
      ['Jami', d.card_format.total], ["So'z / ibora (≤25 belgi)", d.card_format.word], ['Savol (26–90)', d.card_format.question],
      ['Uzun matn (90+)', d.card_format.long_text], ['Rasmli', d.card_format.with_image], ['Orqa tomon o\'rtacha uzunligi', d.card_format.avg_back_len],
    ]),
    { title: "To'plam hajmi", head: ['Kartalar soni', "To'plamlar"], rows: d.deck_sizes.map(s => [s.bucket, s.decks]) },
    {
      title: 'Ommaviy kutubxona — eng ko\'p nusxalangan',
      head: ["To'plam", 'Muallif', 'Mavzu', 'Karta', 'Nusxa', 'Reyting', 'Baholar'],
      rows: d.library.top.map(x => [x.title, x.owner.name, x.theme, x.cards, x.clones, x.rating, x.ratings]),
    },
    {
      title: "Eng ko'p o'qilgan to'plamlar (davr)",
      head: ["To'plam", 'Muallif', 'Mavzu', 'Manba', 'Karta', 'Takrorlash', "O'quvchi", 'Ochiq'],
      rows: d.top_decks.map(x => [x.title, x.owner.name, x.theme, x.source, x.cards, x.reviews, x.learners, x.is_public ? 'ha' : "yo'q"]),
    },
    {
      title: 'Eng faol yaratuvchilar',
      head: ['Foydalanuvchi', 'ID', "To'plam", 'Karta', "AI to'plam", 'Nusxa', 'Takrorlash (davr)', 'Mavzular'],
      rows: d.top_creators.map(c => [c.name, c.id, c.decks, c.cards, c.ai_decks, c.cloned, c.reviews, c.top_themes.join(' | ')]),
    },
    {
      title: 'Kunlik dinamika',
      head: ['Sana', 'Takrorlashlar', 'Takrorlovchilar', 'Yangi kartalar', 'AI generatsiya'],
      rows: d.daily.map(x => [x.date, x.reviews, x.reviewers, x.new_cards, x.ai_generations]),
    },
  ]
}

function dailyQuiz(d: DailyQuizData): Section[] {
  const t = d.totals
  return [
    kv("Umumiy ko'rsatkichlar", [
      ['Viktorinalar', t.quizzes], ["O'yinchilar", t.players], ["O'yinchilar (oldingi davr)", t.players_prev], ["O'zgarish %", t.players_delta],
      ['Boshlangan', t.started], ['Yakunlangan', t.finished], ['Yakunlangan (oldingi davr)', t.finished_prev],
      ['Oxirigacha yechganlar %', t.completion_pct], ["O'rtacha ball (5 dan)", t.avg_score], ["O'rtacha vaqt, server (s)", t.avg_seconds], ["O'rtacha faol vaqt (s)", t.avg_active_seconds], ['Faol vaqt namunalari', t.active_samples],
      ['5/5 ulushi %', t.perfect_pct], ["Qaytib o'ynaganlar %", t.returning_pct], ["Kun / o'yinchi", t.avg_days_per_player],
      ['Berilgan tanga', t.tanga_awarded],
    ]),
    { title: 'Ballar taqsimoti', head: ["To'g'ri javoblar", "O'yinlar"], rows: d.score_distribution.map(s => [s.score, s.count]) },
    {
      title: 'Kunlar',
      head: ['Sana', 'Raqam', 'Kategoriya', 'Mavzu', 'Holat', 'Ochgan', 'Yechgan', "O'rtacha ball"],
      rows: d.days.map(x => [x.date, x.quiz_number, x.theme_label, x.sub_topic, x.status, x.started, x.finished, x.avg_score]),
    },
    {
      title: 'Kategoriyalar',
      head: ['Kategoriya', 'Kunlar', "O'yinchi / kun", "O'rtacha ball"],
      rows: d.categories.map(c => [c.label, c.days, c.players_per_day, c.avg_score]),
    },
    { title: "Sodiqlik (davrda o'ynagan kunlar)", head: ['Kunlar', 'Kishi'], rows: d.loyalty.map(x => [x.bucket, x.users]) },
    { title: 'Faol streaklar', head: ['Kunlar', 'Kishi'], rows: d.streaks.map(x => [x.bucket, x.users]) },
    { title: "O'ynash vaqti (Toshkent)", head: ['Soat', "O'yinlar"], rows: d.hours.map((v, h) => [`${String(h).padStart(2, '0')}:00`, v]) },
    {
      title: 'Eng qiyin savollar',
      head: ['Savol', 'Sana', 'Kategoriya', 'Javoblar', "To'g'ri %"],
      rows: d.hardest.map(q => [q.question, q.date, q.theme_label, q.answers, q.correct_pct]),
    },
    { title: 'Shikoyatlar', head: ['Sabab', 'Soni'], rows: d.reports.map(r => [r.reason, r.count]) },
  ]
}

function ai(d: AiUsageData): Section[] {
  return [
    kv("Umumiy ko'rsatkichlar", [
      ['Davr (kun)', d.window_days], ['API xarajati (USD)', d.total_api_cost_usd], ['Qaytarilgan tanga', d.total_tanga_refunded],
    ]),
    {
      title: "Xususiyatlar bo'yicha",
      head: ['Xususiyat', 'Chaqiruv', 'Muvaffaqiyatli', 'Xato', 'Bepul', 'Pullik', 'Tanga', 'Kesh', 'Kesh %', 'API xarajati (USD)', "O'rtacha kechikish (ms)"],
      rows: d.features.map(f => [f.feature, f.calls, f.successes, f.failures, f.free_actions, f.paid_actions, f.tanga_spent,
        f.cache_hits, Math.round(f.cache_hit_rate * 1000) / 10, f.api_cost_usd, f.avg_latency_ms]),
    },
  ]
}

function audience(d: AudienceData): Section[] {
  const dist = (title: string, rows: { label: string; users: number; pct?: number }[]): Section =>
    ({ title, head: ['Qiymat', 'Kishi', '%'], rows: rows.map(r => [r.label, r.users, r.pct]) })
  const mf = d.motivation_features
  return [
    kv("Umumiy ko'rsatkichlar", [
      ['Jami foydalanuvchilar', d.totals.users], ['Davrda faol', d.totals.active], ['Davrda yangi', d.totals.new],
      ["Onboarding to'ldirgan", d.totals.onboarded], ["Onboarding to'ldirgan %", d.totals.onboarded_pct], ['Kartasi borlar', d.totals.with_decks],
    ]),
    dist('Faollik segmentlari', d.segments),
    {
      title: "Haqiqiy qiziqishlar (kartalar mavzusi)",
      head: ['Mavzu', 'Kishi', 'Yaratgan', "O'qigan (davr)", '%'],
      rows: d.flashcard_themes.map(t => [t.label, t.users, t.creators, t.learners, t.pct]),
    },
    {
      title: 'Onboardingda tanlangan qiziqishlar',
      head: ['Kategoriya', 'Kishi', 'Davrda faol', '%'],
      rows: d.interests.map(i => [i.label, i.users, i.active_users, i.pct]),
    },
    dist('Maqsadi', d.motivation),
    dist('Darajasi', d.experience),
    dist("Qayerdan keldi", d.registered_via),
    dist('Rol', d.roles),
    dist('Kunlik maqsad', d.daily_goal),
    dist('Shaharlar', d.cities),
    dist('Vaqt zonalari', d.timezones),
    {
      title: 'Maqsad × xususiyat (faollar ichida %)',
      head: ['Maqsad', 'Faol', ...mf.features.map(f => f.label)],
      rows: mf.rows.map(r => [r.label, r.users, ...mf.features.map(f => r.features[f.key] ?? 0)]),
    },
  ]
}

export type ExportView = 'overview' | 'flashcards' | 'daily_quiz' | 'ai' | 'audience'

const VIEW_TITLES: Record<ExportView, string> = {
  overview: 'umumiy', flashcards: 'flesh_kartalar', daily_quiz: '5_savol', ai: 'ai', audience: 'auditoriya',
}

export function downloadAnalyticsCsv(view: ExportView, data: unknown, days: number) {
  const builders: Record<ExportView, (d: any) => Section[]> = {
    overview, flashcards, daily_quiz: dailyQuiz, ai, audience,
  }
  const win = (data as { window?: { start: string; end: string } }).window
  const range = win ? `${win.start} — ${win.end}` : `oxirgi ${days} kun`
  const csv = toCsv(`SAHIFALAB analitika · ${VIEW_TITLES[view]} · ${range}`, builders[view](data))
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sahifalab_${VIEW_TITLES[view]}_${win?.end ?? new Date().toISOString().slice(0, 10)}_${days}k.csv`
  a.click()
  URL.revokeObjectURL(url)
}
