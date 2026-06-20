/**
 * PasswordStrengthIndicator — shows a strength bar + per-rule checklist.
 * Used in signup and password-change forms.
 */
import React from 'react'

interface StrengthResult {
  level: 'weak' | 'medium' | 'strong' | 'very_strong'
  label: string
  color: string
  widthPct: number
}

export interface PasswordValidation {
  isValid: boolean
  errors: string[]
  strength: StrengthResult
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []
  if (password.length < 8)       errors.push("Kamida 8 ta belgi bo'lishi kerak")
  if (!/[A-Z]/.test(password))   errors.push("Kamida 1 ta katta harf (A-Z)")
  if (!/[a-z]/.test(password))   errors.push("Kamida 1 ta kichik harf (a-z)")
  if (!/[0-9]/.test(password))   errors.push("Kamida 1 ta raqam (0-9)")
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:',.<>?/]/.test(password))
    errors.push("Kamida 1 ta maxsus belgi (!@#$...)")

  let score = 0
  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*()_+\-=\[\]{}|;:',.<>?/]/.test(password)) score++

  const strength: StrengthResult =
    score <= 2 ? { level: 'weak',       label: "Kuchsiz",      color: '#ef4444', widthPct: 25  } :
    score <= 3 ? { level: 'medium',     label: "O'rtacha",     color: '#f59e0b', widthPct: 50  } :
    score <= 4 ? { level: 'strong',     label: "Kuchli",       color: '#22c55e', widthPct: 75  } :
                 { level: 'very_strong',label: "Juda kuchli",  color: '#22c55e', widthPct: 100 }

  return { isValid: errors.length === 0, errors, strength }
}

const RULES = [
  { key: 'len',     test: (p: string) => p.length >= 8,               label: "Kamida 8 ta belgi" },
  { key: 'upper',   test: (p: string) => /[A-Z]/.test(p),             label: "Katta harf (A-Z)" },
  { key: 'lower',   test: (p: string) => /[a-z]/.test(p),             label: "Kichik harf (a-z)" },
  { key: 'digit',   test: (p: string) => /[0-9]/.test(p),             label: "Raqam (0-9)" },
  { key: 'special', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{}|;:',.<>?/]/.test(p), label: "Maxsus belgi (!@#$...)" },
]

interface Props {
  password: string
}

const PasswordStrengthIndicator: React.FC<Props> = ({ password }) => {
  if (!password) return null
  const { strength } = validatePassword(password)

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${strength.widthPct}%`, backgroundColor: strength.color }}
          />
        </div>
        <span className="text-[11px] font-semibold shrink-0" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>

      {/* Per-rule checklist */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {RULES.map(rule => {
          const met = rule.test(password)
          return (
            <div key={rule.key} className="flex items-center gap-1 text-[11px]">
              <span style={{ color: met ? '#22c55e' : '#6b7280' }}>{met ? '✓' : '○'}</span>
              <span style={{ color: met ? '#22c55e' : '#9ca3af' }}>{rule.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PasswordStrengthIndicator
