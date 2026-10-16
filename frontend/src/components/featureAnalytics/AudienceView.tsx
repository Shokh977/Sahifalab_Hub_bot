import React, { useState } from 'react'
import { Download } from 'lucide-react'
import apiService from '../../services/apiService'
import type { AudienceData, DistRow } from './types'
import { BarList, Card, StatTile, fmt } from './charts'

const distItems = (rows: DistRow[]) =>
  rows.map(r => ({ key: String(r.key), label: r.label, value: r.users, sub: `${r.pct}%` }))

export default function AudienceView({ data, days }: { data: AudienceData; days: number }) {
  const t = data.totals
  const [exporting, setExporting] = useState(false)
  const mf = data.motivation_features
  // Only the features someone in the table actually used — keeps the matrix readable.
  const usedFeatures = mf.features.filter(f => mf.rows.some(r => (r.features[f.key] ?? 0) > 0))

  async function exportCsv() {
    setExporting(true)
    try {
      const res = await apiService.client.get('/api/admin/feature-analytics/audience/export', {
        params: { days }, responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sahifalab_auditoriya_${days}k.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.response?.status === 403 || e?.response?.status === 404 ? "Ruxsat yo'q" : "Yuklab bo'lmadi")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl">
          Reklama va kontent uchun: kimlar foydalanadi, nimani o'rganadi, qachon faol. "Haqiqiy qiziqishlar" — odamlar
          o'zi yaratgan va takrorlagan kartalar mavzusidan olinadi, onboardingdagi javobdan aniqroq.
        </p>
        <button onClick={exportCsv} disabled={exporting}
          title="Har bir foydalanuvchi alohida qatorda: qiziqishlari, karta mavzulari, segmenti, faolligi"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sahifa-600 text-white hover:bg-sahifa-700 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Tayyorlanmoqda…' : "Foydalanuvchilar ro'yxati (CSV)"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile label="Jami foydalanuvchilar" value={fmt(t.users)} />
        <StatTile label="Davrda faol" value={fmt(t.active)} sub={t.users ? `${((t.active / t.users) * 100).toFixed(1)}%` : undefined} />
        <StatTile label="Davrda yangi" value={fmt(t.new)} />
        <StatTile label="Onboarding to'ldirgan" value={`${fmt(t.onboarded_pct, 1)}%`} sub={`${fmt(t.onboarded)} kishi`} />
        <StatTile label="Kartasi borlar" value={fmt(t.with_decks)} />
      </div>

      <Card title="Faollik segmentlari" subtitle={`Oxirgi ${days} kunda necha kun biror xususiyatdan foydalangan`}
        hint="Juda faol — davrning yarmidan ko'p kunlari. Muntazam — 20%+. Uxlab qolgan — davrda ilovani ham ochmagan (qayta jalb qilish auditoriyasi).">
        <BarList items={data.segments.map(s => ({ key: s.key, label: s.label, value: s.users, sub: `${s.pct}%` }))} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Haqiqiy qiziqishlar" subtitle="Kartalar mavzusi bo'yicha: yaratgan yoki davrda takrorlagan odamlar"
          hint="Bir kishi bir nechta mavzuda bo'lishi mumkin.">
          <BarList empty="Hali kartalar yo'q" items={data.flashcard_themes.map(th => ({
            key: th.key, emoji: th.emoji, label: th.label, value: th.users, valueLabel: `${fmt(th.users)} kishi`,
            sub: `${th.creators} yaratgan · ${th.learners} o'qigan`,
          }))} />
        </Card>
        <Card title="Onboardingda tanlangan qiziqishlar" subtitle="Ro'yxatdan o'tishda belgilangan kategoriyalar"
          hint="Ulush — onboardingni to'ldirganlar ichida. Qavsda — shulardan davrda faol bo'lganlar.">
          <BarList empty="Hech kim tanlamagan" items={data.interests.map(i => ({
            key: i.label, emoji: i.icon, label: i.label, value: i.users, sub: `${i.pct}% · faol ${i.active_users}`,
          }))} />
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Maqsadi" subtitle="Nega o'rganadi">
          <BarList items={distItems(data.motivation)} />
        </Card>
        <Card title="Darajasi" subtitle="O'zini qanday baholaydi">
          <BarList items={distItems(data.experience)} />
        </Card>
        <Card title="Qayerdan keldi" subtitle="Ro'yxatdan o'tgan platforma">
          <BarList items={distItems(data.registered_via)} />
        </Card>
        <Card title="Kunlik maqsad" subtitle="Belgilangan o'qish vaqti">
          <BarList items={data.daily_goal.map(g => ({ key: g.key, label: g.label, value: g.users }))} />
        </Card>
      </div>

      <Card title="Maqsad × xususiyat" subtitle="Har bir maqsad guruhidagi faol foydalanuvchilarning necha foizi shu xususiyatdan foydalangan"
        hint="Masalan: 'Imtihon' maqsadlilar orasida 5 Savol ulushi yuqori bo'lsa — imtihon mavzusidagi reklama shu xususiyat ichida samaraliroq.">
        {usedFeatures.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Bu davrda ma'lumot yo'q</p>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="px-5 sm:px-6 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Maqsad</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Faol</th>
                  {usedFeatures.map(f => (
                    <th key={f.key} className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400" title={f.label}>
                      <span className="text-base">{f.emoji}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mf.rows.map(r => (
                  <tr key={r.key} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="px-5 sm:px-6 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap">{r.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{fmt(r.users)}</td>
                    {usedFeatures.map(f => {
                      const v = r.features[f.key] ?? 0
                      return (
                        <td key={f.key} className="px-1 py-1" title={`${r.label} → ${f.label}: ${v}%`}>
                          <div className="rounded-md py-1.5 text-center tabular-nums"
                            style={{
                              background: v ? `color-mix(in srgb, var(--fa-s1) ${Math.round(12 + v * 0.75)}%, transparent)` : 'var(--fa-track)',
                              color: v >= 55 ? '#fff' : undefined,
                            }}>
                            <span className={v >= 55 ? '' : 'text-gray-700 dark:text-gray-200'}>{r.users ? `${Math.round(v)}%` : '—'}</span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 sm:px-6 pt-2 text-[11px] text-gray-400">
              {usedFeatures.map(f => `${f.emoji} ${f.label}`).join(' · ')}
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Shaharlar" subtitle="Profilda ko'rsatilgan">
          <BarList empty="Hech kim shahar ko'rsatmagan" items={distItems(data.cities)} />
        </Card>
        <Card title="Vaqt zonalari" subtitle="Qaysi mamlakatdan">
          <BarList items={distItems(data.timezones)} />
        </Card>
      </div>
    </div>
  )
}
