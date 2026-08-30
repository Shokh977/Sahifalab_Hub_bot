/**
 * AdminDonationsTab — admin CRUD for Qo'llab-quvvatlash payment methods
 * (095_donation_payment_methods). Rendered as a tab inside AdminPage.tsx
 * (activeTab === 'donations'), mirroring the existing Bellashuv/Reports
 * tabs' pattern but kept in its own file since AdminPage.tsx is already
 * enormous.
 *
 * Live preview: the SAME PaymentCard component the public donation page
 * renders — an admin sees exactly what a donor will see, truncation
 * included, before saving.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, Sparkles, Copy, TrendingUp } from 'lucide-react'
import apiService from '../../services/apiService'
import PaymentCard, { type PaymentMethod } from './PaymentCard'

interface AdminMethod extends PaymentMethod {
  isActive: boolean
}

interface MethodStats {
  methodId: string
  copies: number
  swipes: number
  bySurface: Record<string, { copies: number; swipes: number }>
}

const EMPTY_FORM = {
  bank_name: '', account_number: '', number_type: 'card' as 'card' | 'account' | 'iban',
  holder_name: '', currency: 'UZS', region: 'uz', swift: '', note: '',
}

export default function AdminDonationsTab() {
  const [methods, setMethods] = useState<AdminMethod[]>([])
  const [stats, setStats] = useState<Record<string, MethodStats>>({})
  const [pageViews, setPageViews] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminMethod | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [methodsRes, statsRes] = await Promise.all([
        apiService.client.get('/api/admin/payment-methods'),
        apiService.client.get('/api/admin/payment-methods/stats', { params: { days: 30 } }).catch(() => null),
      ])
      setMethods(methodsRes.data?.methods ?? [])
      if (statsRes) {
        setPageViews(statsRes.data?.pageViews ?? 0)
        const byId: Record<string, MethodStats> = {}
        for (const s of statsRes.data?.methods ?? []) byId[s.methodId] = s
        setStats(byId)
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(m: AdminMethod) {
    try {
      await apiService.client.patch(`/api/admin/payment-methods/${m.id}`, { is_active: !m.isActive })
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "O'zgartirib bo'lmadi")
    }
  }

  async function remove(m: AdminMethod) {
    if (!confirm(`"${m.bankName}" usulini nofaol qilasizmi? (o'chirilmaydi, faqat yashiriladi)`)) return
    try {
      await apiService.client.delete(`/api/admin/payment-methods/${m.id}`)
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "O'chirib bo'lmadi")
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = methods.findIndex(m => m.id === active.id)
    const newIndex = methods.findIndex(m => m.id === over.id)
    const reordered = arrayMove(methods, oldIndex, newIndex)
    setMethods(reordered)
    try {
      await apiService.client.post('/api/admin/payment-methods/reorder', { ordered_ids: reordered.map(m => m.id) })
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Tartibni saqlab bo'lmadi")
      await load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">💳 Xayriya to'lov usullari</h2>
        <button
          onClick={() => { setCreating(true); setEditing(null) }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white rounded-xl transition-colors"
        >
          <Plus size={15} /> Yangi usul
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {!loading && methods.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">
          <TrendingUp size={14} />
          Oxirgi 30 kun: <span className="font-semibold text-gray-700 dark:text-gray-300">{pageViews}</span> marta sahifa ochilgan,{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {Object.values(stats).reduce((sum, s) => sum + s.copies, 0)}
          </span> marta raqam nusxalangan
        </div>
      )}

      {creating && (
        <MethodForm
          initial={null}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); load() }}
        />
      )}
      {editing && (
        <MethodForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Yuklanmoqda…</div>
      ) : methods.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Hozircha to'lov usullari yo'q</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={methods.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {methods.map(m => (
                <SortableRow
                  key={m.id} method={m} stats={stats[m.id]}
                  onEdit={() => { setEditing(m); setCreating(false) }}
                  onToggle={() => toggleActive(m)}
                  onDelete={() => remove(m)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function SortableRow({ method, stats, onEdit, onToggle, onDelete }: {
  method: AdminMethod; stats?: MethodStats; onEdit: () => void; onToggle: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: method.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
      <button {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical size={18} />
      </button>

      <div className="shrink-0" style={{ transform: 'scale(0.55)', transformOrigin: 'left center', width: 296 * 0.55, height: 187 * 0.55 }}>
        <PaymentCard method={method} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white truncate">{method.bankName}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {method.numberType.toUpperCase()} · {method.currency} · {method.region}
          {!method.isActive && <span className="ml-2 text-amber-500 font-semibold">Nofaol</span>}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <Copy size={11} />
          {stats?.copies ? `${stats.copies} marta nusxalangan (oxirgi 30 kun)` : "Hali nusxalanmagan"}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onToggle} title={method.isActive ? 'Nofaol qilish' : 'Faollashtirish'} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          {method.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button onClick={onEdit} className="p-2 rounded-lg text-gray-400 hover:text-sahifa-600 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Pencil size={16} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

function MethodForm({ initial, onCancel, onSaved }: {
  initial: AdminMethod | null; onCancel: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState(initial ? {
    bank_name: initial.bankName, account_number: initial.accountNumber, number_type: initial.numberType,
    holder_name: initial.holderName, currency: initial.currency, region: initial.region,
    swift: initial.swift ?? '', note: initial.note ?? '',
  } : EMPTY_FORM)
  const [confirmAccountChange, setConfirmAccountChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const previewMethod: PaymentMethod = {
    id: initial?.id ?? 'preview',
    bankName: form.bank_name || 'Bank nomi',
    accountNumber: form.account_number || '0000000000000000',
    numberType: form.number_type,
    holderName: form.holder_name || 'KARTA EGASI',
    currency: form.currency || 'UZS',
    region: form.region || 'uz',
    swift: form.swift || null,
    note: form.note || null,
    order: initial?.order ?? 0,
  }

  const truncationWarn = (label: string, value: string) => value.length > 26 && value.length <= 40
    ? `${label} 26 belgidan uzun — kartada "..." bilan qisqartiriladi` : null

  async function save() {
    setSaving(true)
    setErrorMsg(null)
    setWarnings([])
    try {
      const payload: any = { ...form }
      if (!payload.swift) payload.swift = null
      if (!payload.note) payload.note = null
      if (initial) {
        if (form.account_number !== initial.accountNumber) payload.confirm_account_number_change = confirmAccountChange
        const res = await apiService.client.patch(`/api/admin/payment-methods/${initial.id}`, payload)
        setWarnings(res.data?.warnings ?? [])
        onSaved()
      } else {
        const res = await apiService.client.post('/api/admin/payment-methods', payload)
        setWarnings(res.data?.warnings ?? [])
        onSaved()
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (detail?.code === 'account_number_change_requires_confirmation') {
        setErrorMsg(`Hisob raqami o'zgartirilmoqda: ${detail.old_account_number} → ${detail.new_account_number}. Tasdiqlang va qayta saqlang.`)
        setConfirmAccountChange(true)
      } else if (detail?.errors) {
        setErrorMsg(detail.errors.join('; '))
      } else {
        setErrorMsg(typeof detail === 'string' ? detail : "Saqlab bo'lmadi")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-sahifa-200 dark:border-sahifa-800/40 rounded-2xl p-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <input
            value={form.bank_name}
            onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
            placeholder="Bank nomi"
            className="w-full text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {truncationWarn('Bank nomi', form.bank_name) && (
            <p className="text-xs text-amber-600">{truncationWarn('Bank nomi', form.bank_name)}</p>
          )}

          <div className="flex gap-2">
            <select
              value={form.number_type}
              onChange={e => setForm(f => ({ ...f, number_type: e.target.value as any }))}
              className="text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="card">Karta</option>
              <option value="account">Hisob raqami</option>
              <option value="iban">IBAN</option>
            </select>
            <input
              value={form.account_number}
              onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
              placeholder={form.number_type === 'iban' ? 'IBAN' : form.number_type === 'account' ? 'Hisob raqami' : 'Karta raqami'}
              className="flex-1 text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono"
            />
          </div>

          <input
            value={form.holder_name}
            onChange={e => setForm(f => ({ ...f, holder_name: e.target.value.toUpperCase() }))}
            placeholder="Karta egasi (JOHN DOE)"
            className="w-full text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {truncationWarn('Karta egasi', form.holder_name) && (
            <p className="text-xs text-amber-600">{truncationWarn('Karta egasi', form.holder_name)}</p>
          )}

          <div className="flex gap-2">
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="flex-1 text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {['UZS', 'KRW', 'EUR', 'USD'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={form.region}
              onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
              className="flex-1 text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {['uz', 'kr', 'intl'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <input
            value={form.swift}
            onChange={e => setForm(f => ({ ...f, swift: e.target.value.toUpperCase() }))}
            placeholder="SWIFT/BIC (ixtiyoriy)"
            className="w-full text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono"
          />
          <input
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Izoh (ixtiyoriy, nusxa qatori ostida ko'rinadi)"
            className="w-full text-sm p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />

          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          {warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">⚠ {w}</p>)}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save} disabled={saving}
              className="flex items-center gap-1.5 text-sm font-semibold bg-sahifa-600 hover:bg-sahifa-700 text-white px-4 py-2 rounded-xl disabled:opacity-50"
            >
              <Sparkles size={14} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            <button onClick={onCancel} className="text-sm font-semibold text-gray-500 px-4 py-2">Bekor qilish</button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Jonli ko'rinish</p>
          <PaymentCard method={previewMethod} />
        </div>
      </div>
    </div>
  )
}
