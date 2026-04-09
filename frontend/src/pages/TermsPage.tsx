/**
 * TermsPage — Foydalanish shartlari (Terms of Use)
 * Full Uzbek-language terms covering: platform purpose, user obligations,
 * content policy, XP/gamification, intellectual property, data, disclaimers.
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronDown, Scale, ArrowLeft } from 'lucide-react'
import PageWrapper from '../components/PageWrapper'

const EFFECTIVE_DATE = '09-aprel, 2026'

interface Section {
  id: string
  emoji: string
  title: string
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: '1',
    emoji: '📌',
    title: 'Umumiy qoidalar',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Ushbu Foydalanish shartlari ("Shartlar") SAHIFALAB platformasi ("Platforma", "Biz") va
          uning barcha xizmatlari — veb-sayt, Telegram Mini-ilova, mobil versiya — orqali
          taqdim etiladigan mazmun va funksiyalardan foydalanishni tartibga soladi.
        </p>
        <p>
          Platforma orqali ro'yxatdan o'tish, tizimga kirish yoki xizmatlardan foydalanib, siz
          ushbu Shartlarni to'liq o'qib chiqqaningizni va ularga roziligingizni tasdiqlab
          hisoblaysiz. Agar siz Shartlarga rozi bo'lmasangiz, platformadan foydalanishingizni
          darhol to'xtatishingizni so'raymiz.
        </p>
        <p>
          Platforma O'zbekiston Respublikasi qonunchiligiga muvofiq ishlaydi. Barcha
          nizolar O'zbekiston Respublikasining amaldagi qonunlari asosida ko'rib chiqiladi.
        </p>
      </div>
    ),
  },
  {
    id: '2',
    emoji: '👤',
    title: 'Ro\'yxatdan o\'tish va hisob',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          SAHIFALAB platformasidan foydalanish uchun siz <strong className="text-slate-700 dark:text-slate-300">kamida 13 yoshda</strong> bo'lishingiz
          lozim. 13 yoshdan 18 yoshgacha bo'lgan foydalanuvchilar ota-onasining yoki
          qonuniy vasiyining ruxsati bilan ro'yxatdan o'tishi kerak.
        </p>
        <p>Hisob yaratar ekansiz, siz:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Haqiqiy va to'g'ri ma'lumotlarni kiritishga majbursiz.</li>
          <li>Hisobingiz xavfsizligini ta'minlashga javobgarsiz.</li>
          <li>Hisobingizdan uchinchi shaxslar tomonidan amalga oshirilgan barcha harakatlar uchun mas'uliyat o'z zimmangizga olasiz.</li>
          <li>Bir foydalanuvchi uchun faqat bitta hisob yaratish ruxsat etiladi.</li>
        </ul>
        <p>
          Buzilish, zararli faoliyat yoki Shartlarga rioya etilmasligi aniqlanganda
          SAHIFALAB har qanday hisobni ogohlantirishsiz bloklash yoki o'chirish huquqini
          o'zida saqlaydi.
        </p>
      </div>
    ),
  },
  {
    id: '3',
    emoji: '📚',
    title: 'Platformaning maqsadi va xizmatlar',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>SAHIFALAB quyidagi xizmatlarni taqdim etadi:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong className="text-slate-700 dark:text-slate-300">Kurslar</strong> — video darslar, testlar va sertifikatlar.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Ish joyi (Workspace)</strong> — Kanban reja, fokus taymer, qaydlar.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Kitoblar</strong> — raqamli kitob do'koni va umumiy xulosa (AI).</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Testlar (Quiz)</strong> — o'z-o'zini tekshirish vositalari.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Ijtimoiy lenta</strong> — o'quvchilar va o'qituvchilar orasidagi muloqot.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">SAHIFALAB AI</strong> — sun'iy intellekt yordamida o'qish ko'magi.</li>
          <li><strong className="text-slate-700 dark:text-slate-300">Birga o'qish (Fokus)</strong> — jamoa bo'lib o'qish va motivatsiya.</li>
        </ul>
        <p>
          Ba'zi xizmatlar (masalan, premium kurslar yoki kitoblar) to'lov talab qilishi mumkin.
          To'lov amalga oshirilgandan so'ng, qaytarib berish siyosati alohida ko'rib
          chiqiladi va har bir holat uchun individual hal qilinadi.
        </p>
      </div>
    ),
  },
  {
    id: '4',
    emoji: '✅',
    title: 'Foydalanuvchi majburiyatlari',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>Platforma orqali siz quyidagilarga rozilik bildirasiz:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Faqat qonuniy maqsadlar uchun foydalanish.</li>
          <li>Boshqa foydalanuvchilar, o'qituvchilar yoki jamoa a'zolarini haqorat qilmaslik.</li>
          <li>Yolg'on, chalg'ituvchi yoki aldamchi ma'lumot tarqatmaslik.</li>
          <li>Mualliflik huquqi bilan himoyalangan materiallarni ruxsatsiz nusxalash yoki tarqatmaslik.</li>
          <li>Platformaning texnik tizimlariga ruxsatsiz kirish yoki ularni buzmaslik (hacking, scraping).</li>
          <li>Boshqa foydalanuvchilarning shaxsiy ma'lumotlarini to'plamaslik yoki oshkor etmaslik.</li>
          <li>Spam, reklama yoki keraksiz reklama xabarlarini yubormaslik.</li>
          <li>XP, ball yoki reyting tizimini sun'iy manipulyatsiya qilmaslik.</li>
        </ul>
        <p>
          Ushbu qoidalarni buzish hisobingizni to'xtatib qo'yish yoki o'chirishga, hamda
          zarur bo'lsa huquqiy javobgarlikka sabab bo'lishi mumkin.
        </p>
      </div>
    ),
  },
  {
    id: '5',
    emoji: '🏆',
    title: 'XP, Gamifikatsiya va Mukofotlar',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          SAHIFALAB o'qishni qiziqarli qilish uchun tajriba ballari (XP), darajalar,
          liderlar taxtasi va sertifikatlar tizimini qo'llaydi.
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>XP va darajalar faqat platformadagi faoliyat asosida avtomatik hisoblanadi.</li>
          <li>XP ni real pul, tovar yoki boshqa moddiy boyliklarга almashtirish mumkin emas — bu faqat o'quv progress ko'rsatkichidir.</li>
          <li>Sertifikatlar kurs talablarini to'liq bajargach beriladi va faqat SAHIFALAB kursini tugatganlikni tasdiqlaydi.</li>
          <li>SAHIFALAB XP yig'ish formulalarini, bonus tizimini yoki darajalar chegarasini oldindan ogohlantirmasdan o'zgartirish huquqini o'zida saqlaydi.</li>
          <li>Soxta yoki avtomatlashtirilgan usul bilan XP to'plash aniqlangan taqdirda hisob bloklanadi.</li>
        </ul>
        <p>
          Reyting taxtasidagi o'rin faqat ma'lumot sifatida beriladi va hech qanday
          qonuniy da'vo yoki imtiyoz kafolatlamaydi.
        </p>
      </div>
    ),
  },
  {
    id: '6',
    emoji: '📝',
    title: 'Foydalanuvchi tomonidan joylashtirilgan kontent',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Siz ijtimoiy lentaga, izohlar bo'limiga, messenjerdagi xabarlarga yoki
          boshqa joyga kontent (matn, rasm, fayl) joylashtirganda:
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Ushbu kontentning muallifligi va qonuniyligini o'zingiz kafolatlaysiz.</li>
          <li>SAHIFALABga ushbu kontentni platformada ko'rsatish, targ'ib qilish va texnik maqsadlarda foydalanish uchun royaltisiz litsenziya berasiz.</li>
          <li>Quyidagi kontent qat'iyan taqiqlangan:
            <ul className="list-circle list-inside ml-4 mt-1 space-y-0.5">
              <li>Pornografik, zo'ravonlik yoki nafrat uyg'otuvchi materiallar</li>
              <li>Boshqa shaxslarning shaxsiy ma'lumotlarini tarqatish</li>
              <li>Terrorchilik, ekstremizm yoki noqonuniy faoliyatga chaqirish</li>
              <li>Mualliflik huquqi buzilgan kontent</li>
            </ul>
          </li>
        </ul>
        <p>
          SAHIFALAB moderatsiya huquqiga ega bo'lib, qoidabuzar kontentni ogohlantirmasdan
          o'chirishi yoki yashirishi mumkin.
        </p>
      </div>
    ),
  },
  {
    id: '7',
    emoji: '🔒',
    title: 'Maxfiylik va ma\'lumotlar',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          SAHIFALAB foydalanuvchilarning shaxsiy ma'lumotlarini quyidagi maqsadlar uchun
          to'playdi:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Hisob yaratish va autentifikatsiya</li>
          <li>O'quv progressini saqlash (XP, kurs holati, focus vaqti)</li>
          <li>Platformani yaxshilash uchun statistik tahlil (anonim)</li>
          <li>Muhim yangiliklar va bildirishnomalarni yuborish</li>
        </ul>
        <p>
          Biz foydalanuvchilarning shaxsiy ma'lumotlarini uchinchi shaxslarga
          <strong className="text-slate-700 dark:text-slate-300"> sotmaymiz</strong>.
          Ma'lumotlar faqat platformaning ishlashi uchun zarur bo'lgan xizmat
          provayderlariga (masalan, Supabase, Bunny CDN) uzatilishi mumkin.
        </p>
        <p>
          Telegram Mini-ilovasi orqali kirganda Telegram foydalanuvchi nomi,
          ID raqami va profil rasmiga ruxsatimiz bo'ladi — bu Telegram platforma
          shartlari asosida amalga oshiriladi.
        </p>
        <p>
          Hisobingizni o'chirish uchun <strong className="text-slate-700 dark:text-slate-300">@Sahifalab_hub_bot</strong> orqali
          yoki qo'llab-quvvatlash guruhi orqali murojaat qiling.
          Ma'lumotlar o'chirilgandan so'ng qayta tiklab bo'lmaydi.
        </p>
      </div>
    ),
  },
  {
    id: '8',
    emoji: '©️',
    title: 'Intellektual mulk',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          Platformadagi barcha kontent — darslar, testlar, dizayn elementlari, logotiplar,
          dasturiy ta'minot kodi va boshqalar — SAHIFALAB yoki uning litsenziya beruvchilariga
          tegishli bo'lib, O'zbekiston va xalqaro mualliflik huquqi qonunlari bilan himoyalangan.
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>
            <strong className="text-slate-700 dark:text-slate-300">Ruxsat etiladi:</strong> Shaxsiy o'qish maqsadida
            kurs materiallarini ko'rib chiqish; platformadan olingan sertifikatlarni shaxsiy
            portfolio yoki LinkedIn sahifasida ko'rsatish.
          </li>
          <li>
            <strong className="text-slate-700 dark:text-slate-300">Taqiqlanadi:</strong> Kurs videolari, matnlari
            yoki materiallarini oldindan yozma ruxsat olmay nusxalash, tarqatish, sotish
            yoki tijorat maqsadlarida foydalanish.
          </li>
        </ul>
        <p>
          Mualliflik huquqingiz buzilgani haqida xabar berish uchun
          <strong className="text-slate-700 dark:text-slate-300"> @Sahifalab_hub_bot</strong> ga murojaat qiling.
        </p>
      </div>
    ),
  },
  {
    id: '9',
    emoji: '⚠️',
    title: 'Javobgarlik chegaralari',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>SAHIFALAB quyidagi holatlar uchun javobgar emas:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Texnik nosozliklar, server uzilishlari yoki uchinchi tomon xizmatlarining ishdan chiqishi natijasida yuzaga kelgan yo'qotishlar.</li>
          <li>Foydalanuvchilar tomonidan joylashtirilgan kontentning to'g'riligi yoki qonuniyligiga kafolat berilmaydi.</li>
          <li>Internet ulanishi yoki qurilma muammolari tufayli platformadan foydalana olmaslik.</li>
          <li>XP yoki progress ma'lumotlarining texnik xato tufayli yo'qolishi (bunday holatlarda qayta tiklash imkoniyati cheklangan bo'lishi mumkin).</li>
        </ul>
        <p>
          Platforma "<em>mavjud holda</em>" taqdim etiladi. Biz ma'lum bir maqsad uchun
          yaroqlilik yoki uzluksiz ishlashni kafolatlamaymiz.
        </p>
      </div>
    ),
  },
  {
    id: '10',
    emoji: '🔄',
    title: 'Shartlarning o\'zgarishi',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          SAHIFALAB ushbu Shartlarni istalgan vaqtda o'zgartirish huquqini o'zida saqlaydi.
          Muhim o'zgarishlar amalga oshirilganda:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Yangilanish sanasi sahifa yuqorisida ko'rsatiladi.</li>
          <li>Muhim o'zgarishlar haqida Telegram bot orqali bildirishnoma yuborilishi mumkin.</li>
          <li>O'zgarishlardan so'ng platformadan davom etib foydalanish yangi Shartlarga rozilikni bildiradi.</li>
        </ul>
        <p>
          Shartlarning oxirgi versiyasi doimo ushbu sahifada mavjud bo'ladi.
          Sizni muntazam ravishda ushbu sahifani ko'rib chiqishga taklif etamiz.
        </p>
      </div>
    ),
  },
  {
    id: '11',
    emoji: '📬',
    title: 'Bog\'lanish',
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>Ushbu Shartlarga oid savollar, shikoyatlar yoki takliflar uchun:</p>
        <ul className="list-none space-y-2 ml-2">
          <li>
            <span className="font-semibold text-slate-700 dark:text-slate-300">Telegram Bot:</span>{' '}
            <a href="https://t.me/Sahifalab_hub_bot" target="_blank" rel="noopener noreferrer"
              className="text-sahifa-500 hover:text-sahifa-600 underline underline-offset-2">
              @Sahifalab_hub_bot
            </a>
          </li>
          <li>
            <span className="font-semibold text-slate-700 dark:text-slate-300">Telegram kanal:</span>{' '}
            <a href="https://t.me/sahifalab" target="_blank" rel="noopener noreferrer"
              className="text-sahifa-500 hover:text-sahifa-600 underline underline-offset-2">
              @sahifalab
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

// ── Accordion Item ─────────────────────────────────────────────────────────────

const AccordionItem: React.FC<{ section: Section; defaultOpen?: boolean }> = ({
  section,
  defaultOpen = false,
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
        <span className="text-xl flex-shrink-0">{section.emoji}</span>
        <span className="flex-1 text-sm font-bold text-slate-800 dark:text-white leading-snug">
          {section.id}. {section.title}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
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

// ── Page ───────────────────────────────────────────────────────────────────────

const TermsPage: React.FC = () => {
  const [allOpen, setAllOpen] = useState(false)

  return (
    <PageWrapper>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sahifa-500 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Bosh sahifaga qaytish
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sahifa-400 to-sahifa-600 flex items-center justify-center flex-shrink-0 shadow-glow-sm">
            <Scale className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Foydalanish shartlari
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Kuchga kirgan sana: <span className="font-semibold">{EFFECTIVE_DATE}</span>
            </p>
          </div>
        </div>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-5 p-4 rounded-2xl bg-sahifa-500/5 border border-sahifa-500/15 dark:bg-sahifa-500/8 dark:border-sahifa-500/20"
        >
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-sahifa-600 dark:text-sahifa-400">Qisqacha:</span>{' '}
            SAHIFALAB — o'zbek tilida ta'lim beruvchi platforma. Biz foydalanuvchilarimizning
            huquqlarini hurmat qilamiz va ulardan ham bir xil munosabatni kutamiz.
            Quyidagi shartlar sizning va bizning huquq va majburiyatlarimizni belgilaydi.
            Savollaringiz bo'lsa — <strong>@Sahifalab_hub_bot</strong> orqali murojaat qiling.
          </p>
        </motion.div>
      </motion.div>

      {/* Expand/Collapse all */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setAllOpen(o => !o)}
          className="text-xs font-semibold text-sahifa-500 hover:text-sahifa-600 dark:hover:text-sahifa-400 transition-colors"
        >
          {allOpen ? 'Hammasini yig\'ish ↑' : 'Hammasini ochish ↓'}
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {SECTIONS.map((section, i) => (
          <AccordionItem
            key={section.id}
            section={section}
            defaultOpen={allOpen || i === 0}
          />
        ))}
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-10 pt-6 border-t border-slate-200 dark:border-white/[0.06] text-center space-y-2"
      >
        <p className="text-xs text-slate-400 dark:text-slate-500">
          © 2026 SAHIFALAB. Barcha huquqlar himoyalangan.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Telegram: <a href="https://t.me/sahifalab1" className="text-sahifa-500 hover:underline" target="_blank" rel="noopener noreferrer">@sahifalab</a>
          {' · '}
          Bot: <a href="https://t.me/Sahifalab_hub_bot" className="text-sahifa-500 hover:underline" target="_blank" rel="noopener noreferrer">@Sahifalab_hub_bot</a>
        </p>
      </motion.div>
    </PageWrapper>
  )
}

export default TermsPage
