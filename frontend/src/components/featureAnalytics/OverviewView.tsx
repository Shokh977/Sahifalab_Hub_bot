import React, { useState } from 'react'
import type { OverviewData } from './types'
import { BarList, Card, Delta, Heatmap, StatTile, Table, TrendChart, fmt } from './charts'

export default function OverviewView({ data }: { data: OverviewData }) {
  const { totals, features } = data
  const [selected, setSelected] = useState<string>(features[0]?.key ?? '')
  const current = features.find(f => f.key === selected) ?? features[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile label="Faol foydalanuvchilar" value={fmt(totals.active_users)} delta={totals.active_users_delta} showDelta
          hint="Davr ichida kamida bitta xususiyatdan foydalanganlar (karta, taymer, 5 Savol, kurs…)" />
        <StatTile label="Yangi ro'yxatdan o'tganlar" value={fmt(totals.new_users)} delta={totals.new_users_delta} showDelta />
        <StatTile label="O'rtacha kunlik faol (DAU)" value={fmt(totals.dau_avg, 1)} sub={`Oxirgi 7 kun: ${fmt(totals.wau)}`} />
        <StatTile label="Yopishqoqlik" value={`${fmt(totals.stickiness_pct, 1)}%`}
          hint="DAU ÷ davrdagi faol foydalanuvchilar. Yuqori bo'lsa — odamlar har kuni qaytib keladi." />
        <StatTile label="Fokus daqiqalari" value={fmt(totals.focus_minutes)} delta={totals.focus_minutes_delta} showDelta />
        <StatTile label="Ilovani ochganlar" value={fmt(totals.seen_in_app)} sub={`Jami: ${fmt(totals.registered)}`}
          hint="Davr ichida ilovaga kirganlar (oxirgi onlayn vaqti bo'yicha) — hech narsa qilmagan bo'lsa ham." />
      </div>

      <Card title="Kunlik faol foydalanuvchilar" subtitle="Har kuni kamida bitta xususiyatdan foydalanganlar soni">
        <TrendChart data={data.daily.map(d => ({ date: d.date, value: d.active_users }))} label="faol" />
      </Card>

      <Card title="Xususiyatlar reytingi"
        subtitle="Qaysi xususiyatdan nechta odam foydalanadi — qatorni bosing, pastda kunlik grafigi chiqadi"
        hint="Ulush = xususiyatdan foydalanganlar ÷ davrdagi barcha faol foydalanuvchilar. O'zgarish oldingi teng davrga nisbatan.">
        <Table
          align={['left', 'right', 'left', 'right', 'right', 'right']}
          head={['Xususiyat', 'Foydalanuvchi', 'Faollar ulushi', 'Harakatlar', '1 kishiga', "O'zgarish"]}
          rows={features.map(f => [
            <button key="n" onClick={() => setSelected(f.key)}
              className={`flex items-center gap-2 text-left ${f.key === current?.key ? 'font-semibold text-sahifa-600 dark:text-sahifa-400' : ''}`}>
              <span>{f.emoji}</span>{f.label}
            </button>,
            fmt(f.users),
            <div key="s" className="flex items-center gap-2 min-w-[120px]">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--fa-track)' }}>
                <div className="h-full rounded-full" style={{ width: `${f.adoption_pct}%`, background: 'var(--fa-s1)' }} />
              </div>
              <span className="tabular-nums w-11 text-right">{f.adoption_pct}%</span>
            </div>,
            <span key="a" title={f.unit}>{fmt(f.actions)}</span>,
            fmt(f.actions_per_user, 1),
            <Delta key="d" value={f.users_delta} />,
          ])}
        />
      </Card>

      {current && (
        <Card title={`${current.emoji} ${current.label} — kunlik`}
          subtitle={`${fmt(current.users)} foydalanuvchi · ${fmt(current.actions)} ${current.unit}`}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Foydalanuvchilar</p>
              <TrendChart data={current.daily.map(d => ({ date: d.date, value: d.users }))} label="kishi" height={140} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Harakatlar ({current.unit})</p>
              <TrendChart data={current.daily.map(d => ({ date: d.date, value: d.actions }))} label={current.unit} height={140} />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nechta xususiyatdan foydalanadi" subtitle="Faol foydalanuvchilar, davr ichida"
          hint="1 ta — faqat bitta narsa uchun keladi. 3+ — ilovaning chuqur foydalanuvchilari.">
          <BarList items={data.depth.map(d => ({
            key: String(d.features), label: d.features >= 4 ? '4 va undan ko\'p' : `${d.features} ta xususiyat`,
            value: d.users, sub: totals.active_users ? `${((d.users / totals.active_users) * 100).toFixed(0)}%` : undefined,
          }))} />
        </Card>
        <Card title="Birga ishlatiladigan xususiyatlar" subtitle="Ikkala xususiyatdan ham foydalanganlar"
          hint="Kross-promo uchun: masalan, 5 Savol o'ynaydiganlarga kartalarni taklif qilish.">
          <BarList empty="Hali kombinatsiyalar yo'q" items={data.combos.map(c => ({
            key: `${c.a}-${c.b}`, label: `${c.a_emoji} ${c.a_label} + ${c.b_emoji} ${c.b_label}`, value: c.users, sub: `${c.pct}%`,
          }))} />
        </Card>
      </div>

      <Card title="Faollik vaqti" subtitle="Hafta kuni × soat (Toshkent vaqti), barcha xususiyatlar"
        hint="Push-bildirishnoma va reklama vaqtini tanlash uchun: eng to'q kataklar — eng faol paytlar.">
        <Heatmap grid={data.heatmap} />
      </Card>
    </div>
  )
}
