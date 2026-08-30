import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { PaymentMethod } from './PaymentCard'
import { formatAccountNumber, copyLabelFor, numberDisplayMode } from './formatAccountNumber'

export default function CopyRow({ method, onCopied }: { method: PaymentMethod; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false)
  const wrapped = numberDisplayMode(method.accountNumber) === 'wrapped'

  async function handleCopy() {
    const raw = (method.accountNumber || '').replace(/\s+/g, '')
    try {
      await navigator.clipboard.writeText(raw)
    } catch {
      // Fallback for older browsers without the async Clipboard API.
      const el = document.createElement('textarea')
      el.value = raw
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(el)
    }
    setCopied(true)
    onCopied?.()
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCopy}
        aria-label={`Karta raqamidan nusxa oling, ${formatAccountNumber(method.accountNumber, method.numberType)}`}
        className={`flex w-full min-h-[56px] items-center gap-3.5 rounded-[22px] border-[1.5px] px-4 py-[15px] text-left transition-colors duration-200 ${
          copied
            ? 'border-[#2B3B4D] bg-[#2B3B4D] shadow-[0_10px_22px_rgba(43,59,77,.26)]'
            : 'border-[#E8722D]/35 bg-white shadow-[0_6px_18px_rgba(43,59,77,.07)]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className={`text-[9.5px] font-bold uppercase tracking-[.14em] ${copied ? 'text-[#9FE3B8]' : 'text-[#B0663A]'}`}>
            {copied ? "NUSXA OLINDI ✓" : copyLabelFor(method.numberType)}
          </p>
          <p
            className={`font-mono font-bold tracking-[.08em] ${copied ? 'text-white' : 'text-[#2B3B4D]'} ${
              wrapped ? 'text-[15px] leading-[1.45]' : 'truncate text-[17.5px]'
            }`}
          >
            {formatAccountNumber(method.accountNumber, method.numberType)}
          </p>
        </div>
        <div
          className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] text-white transition-colors ${
            copied ? 'bg-[#4ABE7C] shadow-[0_8px_16px_rgba(74,190,124,.34)]' : 'bg-[#E8722D] shadow-[0_8px_16px_rgba(232,114,45,.34)]'
          }`}
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </div>
      </button>
      <p className="text-center text-[11.5px] font-semibold text-[#7A8794]">
        {copied ? "Raqam vaqtinchalik xotiraga olindi — bank ilovasini ochib qo'yishingiz mumkin." : 'Bank ilovasida "O\'tkazma" bo\'limiga qo\'ying'}
      </p>
      {method.swift && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#7A8794]">
          <span className="font-semibold">SWIFT/BIC:</span>
          <span className="font-mono">{method.swift}</span>
        </div>
      )}
    </div>
  )
}
