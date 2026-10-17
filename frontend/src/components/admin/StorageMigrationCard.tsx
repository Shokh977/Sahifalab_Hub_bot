/**
 * StorageMigrationCard — finds files the database still links to Supabase
 * Storage (old book PDFs/covers, sounds, images) and moves them to Bunny.
 * Backend: /api/admin/storage/{supabase-files,migrate} (admin_storage.py).
 *
 * Supabase-hosted files count toward Supabase's egress quota on every view;
 * everything uploaded through the admin panel today already goes to Bunny.
 */
import React, { useState } from 'react'
import apiService from '../../services/apiService'

interface ScanItem { table: string; id: number; column: string; url: string }

const BATCH = 5
const mb = (b: number) => (b / 1024 / 1024).toFixed(1)
const fileName = (url: string) => decodeURIComponent(url.split('?')[0].split('/').pop() ?? url)

export default function StorageMigrationCard() {
  const [items, setItems] = useState<ScanItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function scan() {
    setError(null)
    try {
      const res = await apiService.client.get('/api/admin/storage/supabase-files')
      setItems(res.data.items ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Tekshirib bo'lmadi")
    }
  }

  async function migrate() {
    if (!items?.length) return
    if (!confirm(`${new Set(items.map(i => i.url)).size} ta fayl Bunny.net'ga ko'chiriladi va havolalar yangilanadi. Davom etamizmi?`)) return
    setBusy(true)
    setError(null)
    setLog([])
    let saved = 0
    try {
      // Batches, so one slow download can't hit the request timeout; stop
      // when a batch moves nothing (only failures are left).
      for (let round = 0; round < 40; round++) {
        const res = await apiService.client.post(`/api/admin/storage/migrate?limit=${BATCH}`, null, { timeout: 300_000 })
        const { migrated = [], failed = [], remaining_files = 0, saved_bytes = 0 } = res.data
        saved += saved_bytes
        setLog(l => [
          ...l,
          ...migrated.map((m: any) => `✅ ${fileName(m.old_url)} — ${mb(m.bytes_before)} → ${mb(m.bytes_after)} MB`),
          ...failed.map((f: any) => `❌ ${fileName(f.url)} — ${f.error}`),
        ])
        if (remaining_files === 0 || migrated.length === 0) break
      }
      setLog(l => [...l, `Tayyor. Tejaldi: ${mb(saved)} MB`])
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Xatolik')
    } finally {
      setBusy(false)
      scan()
    }
  }

  const distinct = items ? new Set(items.map(i => i.url)).size : 0

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">🗄 Supabase'dagi fayllar → Bunny.net</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Eski kitob, muqova va tovushlar hali Supabase Storage'da — har ko'rilganda Supabase limitini sarflaydi.
          </p>
        </div>
        <button onClick={scan} disabled={busy}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50">
          Tekshirish
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {items && (
        items.length === 0 ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">✅ Supabase Storage'ga havola qolmadi. Endi Supabase'dagi bucketlarni o'chirishingiz mumkin.</p>
        ) : (
          <>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {distinct} ta fayl ({items.length} ta havola):
            </p>
            <ul className="max-h-40 overflow-y-auto text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              {items.map(i => (
                <li key={`${i.table}.${i.column}.${i.id}`} className="truncate">
                  <span className="font-mono">{i.table}.{i.column}#{i.id}</span> — {fileName(i.url)}
                </li>
              ))}
            </ul>
            <button onClick={migrate} disabled={busy}
              className="w-full py-2 text-sm font-semibold rounded-xl bg-sahifa-600 text-white disabled:opacity-50">
              {busy ? "Ko'chirilmoqda…" : "Bunny.net'ga ko'chirish"}
            </button>
          </>
        )
      )}

      {log.length > 0 && (
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5 max-h-48 overflow-y-auto">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  )
}
