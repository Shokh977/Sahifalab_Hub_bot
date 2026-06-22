import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import PageWrapper from '../components/PageWrapper'

const STEPS = [
  {
    n: 1,
    title: "Telegram orqali murojaat qiling",
    desc: "Quyidagi tugmani bosib, @sahifalab1 Telegram kanaliga o'ting va \"Hisobni o'chirish\" deb yozing.",
  },
  {
    n: 2,
    title: "Ma'lumotlarni tasdiqlang",
    desc: "Jamoamiz siz bilan bog'lanib, so'rovni tasdiqlash uchun hisob ma'lumotlarini so'raydi.",
  },
  {
    n: 3,
    title: "Hisob o'chiriladi",
    desc: "Tasdiqlangandan so'ng 7 ish kuni ichida profil, o'quv ma'lumotlari va barcha shaxsiy ma'lumotlaringiz butunlay o'chiriladi.",
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
          Hisobingizni va barcha ma'lumotlaringizni o'chirish uchun quyidagi ko'rsatmalarga amal qiling.
        </p>

        {/* Warning box */}
        <div className="mb-8 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">Diqqat!</p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Hisobni o'chirish qaytarib bo'lmaydigan jarayon. Barcha kurs progresslari, XP ballari,
            sertifikatlar va shaxsiy ma'lumotlar butunlay o'chiriladi.
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

        {/* CTA */}
        <a
          href="https://t.me/sahifalab1"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-base transition-colors shadow-md shadow-red-200/40 dark:shadow-red-900/30"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.447l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.112z"/>
          </svg>
          Hisobni o'chirish uchun murojaat qiling
        </a>

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
