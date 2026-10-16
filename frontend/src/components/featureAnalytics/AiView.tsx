import React from 'react'
import type { AiUsageData } from './types'
import { BarList, Card, StatTile, Table, fmt } from './charts'

// ai_usage_log.feature values — app/services/ai/* call sites.
const FEATURE_LABELS: Record<string, string> = {
  flashcard_gen: '✨ AI karta generatsiya',
  explanation: '💡 AI tushuntirish',
  tutor_session: '🧑‍🏫 AI repetitor',
  weekly_review: '📊 Haftalik sharh',
  current_week_progress: '📈 Joriy hafta tahlili',
  daily_quiz_gen: '❓ 5 Savol — generatsiya',
  daily_quiz_verify: '❓ 5 Savol — tekshiruv',
  daily_quiz_deepcheck: '❓ 5 Savol — chuqur tekshiruv',
  daily_quiz_format: '❓ 5 Savol — formatlash',
}

export default function AiView({ data, requestedDays }: { data: AiUsageData; requestedDays: number }) {
  const f = data.features
  const calls = f.reduce((s, x) => s + x.calls, 0)
  const tanga = f.reduce((s, x) => s + x.tanga_spent, 0)
  const failures = f.reduce((s, x) => s + x.failures, 0)
  return (
    <div className="space-y-6">
      {requestedDays > data.window_days && (
        <p className="text-xs text-gray-500 dark:text-gray-400">AI jurnali eng ko'pi bilan oxirgi {data.window_days} kunni ko'rsatadi.</p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="AI chaqiruvlari" value={fmt(calls)} sub={`oxirgi ${data.window_days} kun`} />
        <StatTile label="API xarajati" value={`$${data.total_api_cost_usd.toFixed(2)}`} />
        <StatTile label="Foydalanuvchi sarflagan tanga" value={fmt(tanga)} sub={`qaytarilgan: ${fmt(data.total_tanga_refunded)}`} />
        <StatTile label="Xatolar" value={fmt(failures)} sub={calls ? `${((failures / calls) * 100).toFixed(1)}%` : undefined} />
      </div>
      <Card title="Xarajat qayerga ketadi" subtitle="API xarajati, xususiyat bo'yicha (USD)">
        <BarList items={f.map(x => ({
          key: x.feature, label: FEATURE_LABELS[x.feature] ?? x.feature,
          value: x.api_cost_usd, valueLabel: `$${x.api_cost_usd.toFixed(3)}`, sub: `${fmt(x.calls)} chaqiruv`,
        })).sort((a, b) => b.value - a.value)} />
      </Card>
      <Card title="Xususiyatlar bo'yicha" hint="Bepul/pullik: kunlik bepul limit ichida yoki tanga evaziga. Kesh — bir xil so'rovga saqlangan javob (API xarajatisiz).">
        <Table
          align={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
          head={['Xususiyat', 'Chaqiruv', 'Bepul', 'Pullik', 'Tanga', 'Kesh', 'Xato', 'Kechikish']}
          rows={f.map(x => [
            FEATURE_LABELS[x.feature] ?? x.feature, fmt(x.calls), fmt(x.free_actions), fmt(x.paid_actions),
            fmt(x.tanga_spent), `${(x.cache_hit_rate * 100).toFixed(0)}%`, fmt(x.failures), `${fmt(x.avg_latency_ms / 1000, 1)} s`,
          ])}
        />
      </Card>
    </div>
  )
}
