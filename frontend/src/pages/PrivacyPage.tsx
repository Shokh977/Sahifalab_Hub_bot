/**
 * PrivacyPage — Maxfiylik siyosati (Privacy Policy)
 * Required by Google Play Console Data Safety form.
 * Public URL: sahifalab.uz/privacy
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronDown, ShieldCheck, ArrowLeft } from 'lucide-react'
import PageWrapper from '../components/PageWrapper'

const EFFECTIVE_DATE = '09-aprel, 2026'

interface Section {
  id:      string
  title:   string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: '1',
    title: 'Biz qanday ma\'lumot to\'playmiz?',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>SAHIFALAB quyidagi ma'lumotlarni to'playdi:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-slate-700 dark:text-slate-300">Hisob ma'lumotlari:</strong> ism, email manzil, parol (shifrlangan holda), profil rasmi.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Telegram ma'lumotlari:</strong> Telegram orqali kirganda — foydalanuvchi ID, ism va profil rasmi (Telegram platformasi orqali).</li>
          <li><strong className="text-slate-700 dark:text-slate-300">O'quv ma'lumotlari:</strong> kurs progressi, test natijalari, fokus seanslar davomiyligi, XP ballari.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Qurilma ma'lumotlari:</strong> push bildirishnoma tokeni (Expo push token).</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Kontent:</strong> Siz joylashtirgan postlar, izohlar va xabarlar.</li>
        </ul>
      </div>
    ),
  },
  {
    id: '2',
    title: 'Ma\'lumotlar nima uchun ishlatiladi?',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Hisobingizni yaratish va autentifikatsiya qilish.</li>
          <li>O'quv progressingizni saqlash va kuzatish (XP, kurs holati, fokus vaqti).</li>
          <li>Streak (seriya) tizimini boshqarish.</li>
          <li>Push bildirishnomalar yuborish (streak eslatmalari, haftalik hisobot).</li>
          <li>Platformani yaxshilash uchun anonim statistik tahlil.</li>
          <li>Sertifikatlar berish va tekshirish.</li>
        </ul>
      </div>
    ),
  },
  {
    id: '3',
    title: 'Ma\'lumotlar kimlar bilan ulashiladi?',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Biz foydalanuvchilarning shaxsiy ma'lumotlarini
          <strong className="text-slate-700 dark:text-slate-300"> uchinchi shaxslarga sotmaymiz.</strong>
        </p>
        <p>Ma'lumotlar faqat quyidagi xizmat provayderlariga uzatilishi mumkin:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-slate-700 dark:text-slate-300">Supabase</strong> — ma'lumotlar bazasi va autentifikatsiya.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Bunny CDN</strong> — video va media kontentni yetkazib berish.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Expo</strong> — push bildirishnomalar yuborish.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Google</strong> — Google orqali kirish (ixtiyoriy).</li>
        </ul>
        <p>Barcha provayderlar tegishli maxfiylik standartlariga rioya qiladi.</p>
      </div>
    ),
  },
  {
    id: '4',
    title: 'Ma\'lumotlar qancha muddat saqlanadi?',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Ma'lumotlar hisobingiz faol bo'lgan davr mobaynida saqlanadi.
          Hisobingizni o'chirganingizdan so'ng barcha shaxsiy ma'lumotlaringiz
          <strong className="text-slate-700 dark:text-slate-300"> 30 kun ichida</strong> butunlay o'chiriladi.
        </p>
        <p>
          Anonimlashtirilan statistik ma'lumotlar (o'quv tendentsiyalari) platformani yaxshilash
          maqsadida saqlanib qolishi mumkin.
        </p>
      </div>
    ),
  },
  {
    id: '5',
    title: 'Foydalanuvchi huquqlari',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>Siz quyidagi huquqlarga egasiz:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li><strong className="text-slate-700 dark:text-slate-300">Ko'rish:</strong> Profilingiz va o'quv ma'lumotlaringizni ilovada ko'rishingiz mumkin.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Tahrirlash:</strong> Profil ma'lumotlaringizni sozlamalar orqali yangilashingiz mumkin.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">O'chirish:</strong> Hisobingizni sozlamalar yoki <a href="mailto:sahifalab@gmail.com" className="text-sahifa-500 hover:underline">sahifalab@gmail.com</a> orqali o'chirishingiz mumkin.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Chiqish:</strong> Istalgan qurilmadan ilovadan chiqishingiz mumkin.</li>
        </ul>
      </div>
    ),
  },
  {
    id: '6',
    title: 'Xavfsizlik',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Ma'lumotlaringizni himoya qilish uchun quyidagi choralar ko'rilgan:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>HTTPS orqali shifrlangan ulanish.</li>
          <li>Parollar bcrypt yordamida shifrlangan holda saqlanadi.</li>
          <li>JWT tokenlar xavfsiz saqlash vositasida (Keychain/Keystore) saqlanadi.</li>
          <li>Supabase Row Level Security (RLS) orqali ma'lumotlarga kirish cheklangan.</li>
        </ul>
      </div>
    ),
  },
  {
    id: '7',
    title: 'Bolalar maxfiyligi',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          SAHIFALAB 13 yoshdan kichik bolalarga mo'ljallanmagan. Agar siz 13 yoshdan kichik
          foydalanuvchi ma'lumotlarini to'plagan bo'lsak, iltimos{' '}
          <a href="mailto:sahifalab@gmail.com" className="text-sahifa-500 hover:underline">sahifalab@gmail.com</a>
          {' '}ga xabar bering — biz ularni zudlik bilan o'chiramiz.
        </p>
      </div>
    ),
  },
  {
    id: '8',
    title: 'Siyosatning o\'zgarishi',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Ushbu Maxfiylik siyosati yangilanishi mumkin. Muhim o'zgarishlar amalga oshirilganda
          sahifa yuqorisidagi sana yangilanadi va ilovada bildirishnoma yuborilishi mumkin.
          Platformadan foydalanishni davom ettirsangiz, yangilangan siyosatga rozisiz deb hisoblanadi.
        </p>
      </div>
    ),
  },
  {
    id: '9',
    title: 'Bog\'lanish',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>Maxfiylik siyosatiga oid savollar uchun:</p>
        <ul className="list-none space-y-2 ml-2">
          <li>
            <span className="font-semibold text-slate-700 dark:text-slate-300">Email:</span>{' '}
            <a href="mailto:sahifalab@gmail.com" className="text-sahifa-500 hover:underline">
              sahifalab@gmail.com
            </a>
          </li>
        </ul>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Murojaatlaringizga 1–3 ish kuni ichida javob berishga harakat qilamiz.
        </p>
      </div>
    ),
  },
]

const AccordionItem: React.FC<{ section: Section; defaultOpen?: boolean }> = ({
  section, defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-200/70 dark:border-white/[0.07] bg-white dark:bg-[#1e1e2a] overflow-hidden shadow-sm"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex-1 text-sm font-bold text-slate-800 dark:text-white leading-snug">
          {section.id}. {section.title}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
              {section.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const PrivacyPage: React.FC = () => (
  <PageWrapper>
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sahifa-500 transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Bosh sahifaga qaytish
      </Link>

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center flex-shrink-0 shadow-glow-sm">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Maxfiylik siyosati
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kuchga kirgan sana: <span className="font-semibold">{EFFECTIVE_DATE}</span>
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="mt-5 p-4 rounded-2xl bg-sahifa-500/5 border border-sahifa-500/15 dark:bg-sahifa-500/8 dark:border-sahifa-500/20"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <span className="font-bold text-sahifa-600 dark:text-sahifa-400">Qisqacha: </span>
          Biz faqat xizmat ko'rsatish uchun zarur bo'lgan ma'lumotlarni to'playmiz.
          Ma'lumotlaringizni sotmaymiz. Istalgan vaqtda hisobingizni o'chirishingiz mumkin.
          Savollar uchun{' '}
          <a href="mailto:sahifalab@gmail.com" className="text-sahifa-500 hover:underline font-semibold">
            sahifalab@gmail.com
          </a>
        </p>
      </motion.div>
    </motion.div>

    <div className="space-y-3">
      {SECTIONS.map((section, i) => (
        <AccordionItem key={section.id} section={section} defaultOpen={i === 0} />
      ))}
    </div>

    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
      className="mt-10 pt-6 border-t border-slate-200 dark:border-white/[0.06] text-center space-y-2"
    >
      <p className="text-xs text-slate-400 dark:text-slate-500">
        © 2026 SAHIFALAB. Barcha huquqlar himoyalangan.
      </p>
    </motion.div>
  </PageWrapper>
)

export default PrivacyPage
