import React from 'react'
import { cardThemeFor } from './donationTheme'
import { formatAccountNumber, numberDisplayMode, fieldLabelFor } from './formatAccountNumber'

export interface PaymentMethod {
  id: string
  bankName: string
  accountNumber: string
  numberType: 'card' | 'account' | 'iban'
  holderName: string
  currency: string
  region: string
  swift?: string | null
  note?: string | null
  order: number
}

/**
 * PaymentCard — the one visual source of truth for a payment method, shared
 * by the admin's live edit-preview and the public donation page's deck.
 * Fixed 296:187 aspect ratio (credit-card ratio), never a different box for
 * a "preview" — what the admin sees while editing is exactly what a donor
 * sees.
 */
export default function PaymentCard({ method, dimmed = false }: { method: PaymentMethod; dimmed?: boolean }) {
  const theme = cardThemeFor(method.region)
  const wrapped = numberDisplayMode(method.accountNumber) === 'wrapped'
  const label = fieldLabelFor(method.numberType)

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[26px] transition-transform duration-300"
      style={{
        width: 296, height: 187, maxWidth: '100%', aspectRatio: '296 / 187',
        background: theme.gradient, boxShadow: theme.shadow,
        transform: dimmed ? 'scale(.94)' : 'scale(1)',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {/* Watermark */}
      <span
        aria-hidden
        className="pointer-events-none absolute select-none font-extrabold text-white/[.11]"
        style={{ right: -38, bottom: -64, fontSize: 210, letterSpacing: '-0.06em', lineHeight: 1 }}
      >
        S
      </span>

      {/* Fine texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(120deg, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 1px, transparent 1px, transparent 13px)',
        }}
      />

      {/* Gloss */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-40 w-64 rotate-[22deg] blur-[2px]"
        style={{ background: 'linear-gradient(120deg, rgba(255,255,255,.24), transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative flex h-full flex-col justify-between px-5 py-[19px]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8.5px] font-bold uppercase tracking-[.18em] text-white/60">BANK</p>
            <p className="truncate text-[14.5px] font-bold text-white">{method.bankName}</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/[.28] bg-white/20 px-2.5 py-[5px] font-mono text-[10px] font-bold text-white">
            {method.currency}
          </span>
        </div>

        <div style={{ marginTop: wrapped ? 15 : 26 }}>
          <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[.18em] text-white/60">{label}</p>
          {wrapped ? (
            <p className="font-mono text-[14px] font-bold leading-[1.42] tracking-[.09em] text-white" style={{ maxWidth: 236 }}>
              {formatAccountNumber(method.accountNumber, method.numberType)}
            </p>
          ) : (
            <p className="truncate font-mono text-[17px] font-bold tracking-[.09em] text-white">
              {formatAccountNumber(method.accountNumber, method.numberType)}
            </p>
          )}
        </div>

        <div className="flex items-end justify-between gap-2" style={{ marginTop: wrapped ? 11 : 0 }}>
          <div className="min-w-0">
            <p className="text-[8.5px] font-bold uppercase tracking-[.18em] text-white/60">KARTA EGASI</p>
            <p className="truncate text-[13px] font-bold uppercase tracking-[.03em] text-white">{method.holderName}</p>
          </div>
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[11px] border border-white/30 bg-white/20 font-extrabold text-white">
            S
          </div>
        </div>
      </div>
    </div>
  )
}
