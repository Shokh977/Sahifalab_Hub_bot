import React from 'react'
import type { DailyQuizData } from './types'
import { BarList, Card, Columns, Pill, StatTile, Table, TrendChart, fmt, shortDate } from './charts'

export default function DailyQuizView({ data }: { data: DailyQuizData }) {
  const t = data.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="O'yinchilar" value={fmt(t.players)} delta={t.players_delta} showDelta />
        <StatTile label="Yakunlangan o'yinlar" value={fmt(t.finished)} delta={t.finished_delta} showDelta
          sub={`${fmt(t.quizzes)} viktorina`} />
        <StatTile label="Oxirigacha yechganlar" value={`${fmt(t.completion_pct, 1)}%`}
          hint="Savollarni ochganlarning nechtasi javoblarni yuborgan" />
        <StatTile label="O'rtacha ball" value={t.avg_score != null ? `${t.avg_score} / 5` : '—'}
          sub={`5/5: ${fmt(t.perfect_pct, 1)}%`} />
        <StatTile label="O'rtacha vaqt" value={t.avg_seconds != null ? `${fmt(t.avg_seconds, 1)} s` : '—'} />
        <StatTile label="Qaytib o'ynaganlar" value={`${fmt(t.returning_pct, 1)}%`}
          hint="Davr ichida kamida 2 kun o'ynaganlar ulushi" sub={`~${fmt(t.avg_days_per_player, 1)} kun / o'yinchi`} />
        <StatTile label="Berilgan tanga" value={fmt(t.tanga_awarded)} />
        <StatTile label="Shikoyatlar" value={fmt(data.reports.reduce((s, r) => s + r.count, 0))} />
      </div>

      <Card title="Kunlik o'yinchilar" subtitle="Har bir kungi viktorinani yakunlaganlar">
        <TrendChart data={data.days.map(d => ({ date: d.date, value: d.finished }))} label="o'yinchi" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ballar taqsimoti" subtitle="Nechta to'g'ri javob (0–5)">
          <Columns items={data.score_distribution.map(s => ({ label: String(s.score), value: s.count, tooltip: `${s.score}/5: ${fmt(s.count)} o'yin` }))} />
        </Card>
        <Card title="O'ynash vaqti" subtitle="Soat bo'yicha (Toshkent vaqti)"
          hint="Kunlik eslatmani yuborish uchun eng yaxshi vaqt">
          <Columns showEveryLabel={3} unit="o'yin"
            items={data.hours.map((v, h) => ({ label: String(h), value: v, tooltip: `${String(h).padStart(2, '0')}:00 — ${fmt(v)} o'yin` }))} />
        </Card>
      </div>

      <Card title="Kategoriyalar" subtitle="Qaysi mavzudagi kunlar ko'proq o'ynaladi va qaysi biri qiyin"
        hint="O'yinchi/kun yuqori — mavzu qiziqarli. O'rtacha ball past — savollar qiyin.">
        <Table
          align={['left', 'right', 'right', 'right']}
          head={['Kategoriya', 'Kunlar', "O'yinchi / kun", "O'rtacha ball"]}
          rows={data.categories.map(c => [c.label, fmt(c.days), fmt(c.players_per_day, 1), c.avg_score != null ? `${c.avg_score} / 5` : '—'])}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sodiqlik" subtitle="Davr ichida necha kun o'ynagan">
          <BarList items={data.loyalty.map(l => ({ key: l.bucket, label: l.bucket, value: l.users, valueLabel: `${fmt(l.users)} kishi` }))} />
        </Card>
        <Card title="Faol 5 Savol streaklari" subtitle="Hozir davom etayotgan ketma-ket kunlar">
          <BarList items={data.streaks.map(s => ({ key: s.bucket, label: `${s.bucket} kun`, value: s.users, valueLabel: `${fmt(s.users)} kishi` }))} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Eng qiyin savollar" subtitle="Kamida 3 ta javob berilgan, to'g'ri javob ulushi eng past">
          <Table
            align={['left', 'right', 'right']}
            head={['Savol', 'Javoblar', "To'g'ri"]}
            rows={data.hardest.map(q => [
              <span key="q">{q.question}<br /><span className="text-gray-400">{shortDate(q.date)} · {q.theme_label}</span></span>,
              fmt(q.answers), `${q.correct_pct}%`,
            ])}
          />
        </Card>
        <Card title="Kunlar" subtitle="Har bir viktorina">
          <div className="max-h-[420px] overflow-y-auto">
            <Table
              align={['left', 'left', 'right', 'right', 'right']}
              head={['Sana', 'Mavzu', 'Ochgan', 'Yechgan', 'Ball']}
              rows={data.days.slice().reverse().map(d => [
                <span key="d" className="font-mono">{shortDate(d.date)} <span className="text-gray-400">#{d.quiz_number}</span></span>,
                <span key="t"><Pill>{d.theme_label}</Pill>{d.sub_topic && <span className="ml-1 text-gray-400">{d.sub_topic}</span>}</span>,
                fmt(d.started), fmt(d.finished), d.avg_score != null ? d.avg_score.toFixed(1) : '—',
              ])}
            />
          </div>
        </Card>
      </div>

      {data.reports.length > 0 && (
        <Card title="Savollar bo'yicha shikoyatlar">
          <BarList items={data.reports.map(r => ({ key: r.reason, label: r.reason, value: r.count }))} />
        </Card>
      )}
    </div>
  )
}
