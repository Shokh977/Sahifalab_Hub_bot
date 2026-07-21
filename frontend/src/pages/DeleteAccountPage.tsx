import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import PageWrapper from '../components/PageWrapper'

// This page is the public, no-login-required account/data deletion URL (the
// one Google Play requires apps to list, reachable by anyone whether or not
// they still have app access). The app itself also has an instant, self-service
// delete flow at Sozlamalar → Hisobni o'chirish (SettingsPage's DeleteAccountModal,
// DELETE /api/settings/account) which deletes the profile row immediately —
// there's no waiting period. This page must describe the *same* outcome as
// that flow, not a slower/different-sounding one, or a user who finds this
// page first walks away with the wrong expectation.
const STEPS = [
  {
    n: 1,
    title: 'Ilovaga kiring',
    desc: "SAHIFALAB ilovasiga kiring va Sozlamalar bo'limiga o'ting.",
  },
  {
    n: 2,
    title: "\"Hisobni o'chirish\" tugmasini bosing",
    desc: "Sozlamalar oxirida \"Hisobni o'chirish\" tugmasini toping va tasdiqlash so'zini kiriting.",
  },
  {
    n: 3,
    title: "Hisob darhol o'chiriladi",
    desc: "Tasdiqlagach, profilingiz, kurs progressi, XP va barcha shaxsiy ma'lumotlar bazadan darhol va butunlay o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi.",
  },
]

const DeleteAccountPage: React.FC = () => {
  return (
    <PageWrapper>
      <div className="max-w-xl mx-auto px-4 py-10">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Bosh sahifaga qaytish
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-2xl bg-red-100 dark:bg-red-900/30">
            <Trash2 className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Hisobni o'chirish
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          Hisobingizni ilova ichidan darhol o'chirishingiz mumkin — quyidagi qadamlarga amal qiling.
        </p>

        {/* Warning box */}
        <div className="mb-8 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">Diqqat!</p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Hisobni o'chirish qaytarib bo'lmaydigan jarayon. Barcha kurs progresslari, XP ballari,
            sertifikatlar va shaxsiy ma'lumotlar darhol va butunlay o'chiriladi — kutish muddati yo'q.
          </p>
        </div>

        {/* Steps */}
        <ol className="space-y-5 mb-10">
          {STEPS.map(step => (
            <li key={step.n} className="flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center">
                {step.n}
              </span>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">{step.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* CTA — primary path: log in and use the in-app instant-delete flow */}
        <Link
          to="/login"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-base transition-colors shadow-md shadow-red-200/40 dark:shadow-red-900/30"
        >
          <Trash2 className="h-5 w-5" />
          Ilovaga kirish va hisobni o'chirish
        </Link>

        {/* Fallback for people who can't log in at all */}
        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Ilovaga kira olmayapsizmi?
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Agar hisobingizga kirish imkoningiz bo'lmasa, quyidagi Telegram kanali orqali murojaat qiling —
            jamoamiz shaxsingizni tasdiqlagach hisobingizni siz uchun o'chiradi.
          </p>
          <a
            href="https://t.me/sahifalab1"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
            </svg>
            @sahifalab1 orqali murojaat qilish
          </a>
        </div>

        <p className="mt-4 text-xs text-center text-slate-400 dark:text-slate-500">
          Savol yoki muammolar bo'lsa:{' '}
          <a href="mailto:sahifalab@gmail.com" className="underline hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            sahifalab@gmail.com
          </a>
        </p>
      </div>
    </PageWrapper>
  )
}

export default DeleteAccountPage
