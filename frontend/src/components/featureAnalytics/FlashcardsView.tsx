import React, { useState } from 'react'
import type { FlashcardsData } from './types'
import { BarList, Card, Columns, Pill, StackedBar, StatTile, Table, TrendChart, fmt } from './charts'

const RATING_SEGMENTS = [
  { rating: 1, label: 'Unutdim', color: 'var(--fa-neg-strong)' },
  { rating: 2, label: 'Qiyin', color: 'var(--fa-neg-soft)' },
  { rating: 3, label: 'Yaxshi', color: 'var(--fa-pos-soft)' },
  { rating: 4, label: 'Oson', color: 'var(--fa-pos-strong)' },
]
const STATUS_SEGMENTS = [
  { status: 'new', label: 'Yangi', color: 'var(--fa-seq-2)' },
  { status: 'learning', label: "O'rganilmoqda", color: 'var(--fa-seq-3)' },
  { status: 'reviewing', label: 'Takrorlanmoqda', color: 'var(--fa-seq-4)' },
  { status: 'mastered', label: "O'zlashtirilgan", color: 'var(--fa-seq-5)' },
]
const TREND_METRICS = [
  { key: 'reviews', label: 'Takrorlashlar' },
  { key: 'reviewers', label: 'Takrorlovchilar' },
  { key: 'new_cards', label: 'Yangi kartalar' },
  { key: 'ai_generations', label: 'AI generatsiya' },
] as const

export default function FlashcardsView({ data }: { data: FlashcardsData }) {
  const { totals, period, ai, library, card_format: cf } = data
  const [metric, setMetric] = useState<(typeof TREND_METRICS)[number]['key']>('reviews')
  const metricLabel = TREND_METRICS.find(m => m.key === metric)!.label

  return (
    <div className="space-y-6">
      {!data.source_tracking && (
        <p className="text-xs rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-3 py-2">
          ⚠️ 102-migratsiya hali qo'llanmagan: to'plam manbasi taxminiy hisoblanmoqda, AI "matndan / rasmdan" ajratilmaydi.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <StatTile label="Jami to'plamlar" value={fmt(totals.decks)} sub={`${fmt(totals.owners)} egasi`} />
        <StatTile label="Jami kartalar" value={fmt(totals.cards)} sub={`~${fmt(totals.avg_cards_per_deck, 1)} / to'plam`} />
        <StatTile label="Yangi kartalar" value={fmt(period.new_cards.value)} delta={period.new_cards.delta} showDelta />
        <StatTile label="Yangi to'plamlar" value={fmt(period.new_decks.value)} delta={period.new_decks.delta} showDelta />
        <StatTile label="Takrorlashlar" value={fmt(period.reviews.value)} delta={period.reviews.delta} showDelta />
        <StatTile label="Takrorlovchilar" value={fmt(period.reviewers.value)} delta={period.reviewers.delta} showDelta />
        <StatTile label="Eslab qolish" value={`${fmt(period.recall_pct, 1)}%`}
          hint="'Yaxshi' yoki 'Oson' deb baholangan takrorlashlar ulushi" />
        <StatTile label="1 kartaga vaqt" value={`${fmt(period.avg_seconds_per_card, 1)} s`}
          sub={`${fmt(period.sessions.value)} sessiya-kun`} />
      </div>

      <Card title="Kunlik dinamika" subtitle={metricLabel}
        action={
          <div className="flex flex-wrap gap-1">
            {TREND_METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md ${metric === m.key
                  ? 'bg-sahifa-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                {m.label}
              </button>
            ))}
          </div>
        }>
        <TrendChart data={data.daily.map(d => ({ date: d.date, value: d[metric] }))} label={metricLabel.toLowerCase()} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mavzular" subtitle="Kartalar nima haqida — sarlavha va karta yozuvi bo'yicha aniqlanadi"
          hint="Shaxsiy to'plamlarda kategoriya yo'q, shuning uchun mavzu sarlavhadagi kalit so'zlardan (IELTS, ingliz, arab, tibbiyot…) va kartalar alifbosidan (arab, koreys, kirill…) taxmin qilinadi.">
          <BarList items={data.themes.map(t => ({
            key: t.key, emoji: t.emoji, label: t.label, value: t.cards, valueLabel: `${fmt(t.cards)} karta`,
            sub: `${fmt(t.decks)} to'plam · ${fmt(t.users)} kishi`,
          }))} />
        </Card>
        <Card title="To'plamlar qayerdan keladi" subtitle="Yaratilish usuli bo'yicha (barcha vaqt)">
          <Table
            align={['left', 'right', 'right', 'right', 'right', 'right']}
            head={['Manba', "To'plam", 'Karta', 'Kishi', 'Davrda yangi', 'Takrorlash']}
            rows={data.sources.map(s => [s.label, fmt(s.decks), fmt(s.cards), fmt(s.users), fmt(s.new_decks), fmt(s.reviews)])}
          />
        </Card>
      </div>

      <Card title="✨ AI bilan karta yaratish" subtitle="So'rovdan saqlangan to'plamgacha (davr ichida)"
        hint="Saqlash darajasi = saqlangan to'plamlar ÷ muvaffaqiyatli generatsiyalar. Past bo'lsa — AI natijasi foydalanuvchiga yoqmayapti.">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <BarList max={Math.max(1, ai.requests)} items={[
            { key: 'req', label: "So'rovlar", value: ai.requests },
            { key: 'ok', label: 'Muvaffaqiyatli', value: ai.succeeded, sub: `${ai.failed} xato` },
            { key: 'saved', label: "Saqlangan to'plamlar", value: ai.saved_decks, sub: `${ai.save_rate_pct}%` },
          ]} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Metric label="Foydalanuvchilar" value={fmt(ai.users)} />
            <Metric label="Saqlangan kartalar" value={fmt(ai.saved_cards)} />
            <Metric label="Matndan / rasmdan" value={`${fmt(ai.saved_from_text)} / ${fmt(ai.saved_from_image)}`} />
            <Metric label="Kesh (bepul javob)" value={fmt(ai.cache_hits)} />
            <Metric label="Pullik generatsiya" value={fmt(ai.paid_generations)} />
            <Metric label="Sarflangan tanga" value={fmt(ai.tanga_spent)} />
            <Metric label="API xarajati" value={`$${ai.cost_usd.toFixed(3)}`} />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Javob sifati" subtitle="Takrorlashdagi baholar (davr ichida)">
          <StackedBar segments={RATING_SEGMENTS.map(s => ({
            key: String(s.rating), label: s.label, color: s.color,
            value: data.ratings.find(r => r.rating === s.rating)?.count ?? 0,
          }))} />
        </Card>
        <Card title="Kartalar holati" subtitle="Barcha kartalar, SM-2 bosqichi bo'yicha">
          <StackedBar segments={STATUS_SEGMENTS.map(s => ({
            key: s.status, label: s.label, color: s.color,
            value: data.card_status.find(r => r.status === s.status)?.count ?? 0,
          }))} />
        </Card>
        <Card title="Karta turi" subtitle="Old tomondagi matn uzunligi bo'yicha (barcha kartalar)"
          hint="So'z/ibora — 25 belgigacha (lug'at kartalari). Savol — 26–90. Uzun matn — 90+ (konspekt, ta'rif).">
          <BarList max={Math.max(1, cf.total)} items={[
            { key: 'w', label: "So'z / ibora", value: cf.word, sub: pct(cf.word, cf.total) },
            { key: 'q', label: 'Savol / qisqa jumla', value: cf.question, sub: pct(cf.question, cf.total) },
            { key: 'l', label: 'Uzun matn', value: cf.long_text, sub: pct(cf.long_text, cf.total) },
            { key: 'i', label: 'Rasmli kartalar', value: cf.with_image, sub: pct(cf.with_image, cf.total) },
          ]} />
        </Card>
        <Card title="To'plam hajmi" subtitle="Nechta kartali to'plamlar ko'p">
          <Columns items={data.deck_sizes.map(s => ({ label: s.bucket, value: s.decks, tooltip: `${s.bucket} karta: ${fmt(s.decks)} to'plam` }))} />
        </Card>
      </div>

      <Card title="Ommaviy kutubxona"
        subtitle={`${fmt(library.published_total)} ochiq to'plam · davrda: ${fmt(library.published_new)} yangi, ${fmt(library.clones)} nusxa (${fmt(library.cloners)} kishi), ${fmt(library.ratings)} baho${library.avg_rating != null ? ` (o'rtacha ${library.avg_rating}★)` : ''}`}>
        <Table
          align={['left', 'left', 'right', 'right', 'right']}
          head={["To'plam", 'Mavzu', 'Karta', 'Nusxa', 'Reyting']}
          empty="Ochiq to'plamlar yo'q"
          rows={library.top.map(d => [
            <span key="t"><b className="font-medium">{d.title}</b> <span className="text-gray-400">· {d.owner.name}</span></span>,
            <Pill key="p">{d.theme}</Pill>, fmt(d.cards), fmt(d.clones), d.ratings ? `${d.rating}★ (${d.ratings})` : '—',
          ])}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Eng ko'p o'qilgan to'plamlar" subtitle="Davr ichidagi takrorlashlar bo'yicha">
          <Table
            align={['left', 'left', 'right', 'right']}
            head={["To'plam", 'Manba', 'Takrorlash', "O'quvchi"]}
            rows={data.top_decks.map(d => [
              <span key="t"><b className="font-medium">{d.title}</b><br /><span className="text-gray-400">{d.owner.name} · {d.theme}</span></span>,
              <Pill key="s">{d.source}</Pill>, fmt(d.reviews), fmt(d.learners),
            ])}
          />
        </Card>
        <Card title="Eng faol yaratuvchilar" subtitle="Yaratgan kartalari soni bo'yicha (barcha vaqt)">
          <Table
            align={['left', 'right', 'right', 'right', 'left']}
            head={['Foydalanuvchi', "To'plam", 'Karta', 'AI', 'Mavzular']}
            rows={data.top_creators.map(c => [
              c.name, fmt(c.decks), fmt(c.cards), fmt(c.ai_decks),
              <div key="m" className="flex flex-wrap gap-1">{c.top_themes.map(t => <Pill key={t}>{t}</Pill>)}</div>,
            ])}
          />
        </Card>
      </div>
    </div>
  )
}

const pct = (part: number, total: number) => (total ? `${((part / total) * 100).toFixed(0)}%` : undefined)

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-gray-500 dark:text-gray-400 truncate">{label}</p>
    <p className="text-base font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
  </div>
)
