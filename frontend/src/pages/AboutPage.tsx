import React from 'react'
import {
  AcademicCapIcon,
  BoltIcon,
  CheckCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  RocketLaunchIcon,
  SparklesIcon,
  StarIcon,
  UserGroupIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'

const values = [
  {
    icon: StarIcon,
    title: 'Sifat',
    desc: "Har bir video va xulosa ustida o'nlab soat ishlanadi.",
  },
  {
    icon: BoltIcon,
    title: 'Chuqur diqqat',
    desc: 'Diqqat — bu 21-asrning yangi valyutasi. Biz uni qadrlaymiz.',
  },
  {
    icon: RocketLaunchIcon,
    title: 'Rivojlanish',
    desc: "To'xtab qolish — bu orqaga ketishdir. Biz doim harakatdamiz.",
  },
  {
    icon: UserGroupIcon,
    title: 'Hamjamiyat',
    desc: "Birgalikda o'qiymiz, birgalikda o'samiz.",
  },
]

const features = [
  "Kitoblarga asoslangan interaktiv quizlar: faqat o'qimang, bilimingizni sinang.",
  'Deep Work session: diqqatni jamlash uchun maxsus taymer va ambient tovushlar.',
  "Eksklyuziv kutubxona: tekin va pullik sara PDF materiallar to'plami.",
  'YouTube integratsiyasi: video darslar va xulosalar bir joyda.',
  "Sertifikatlash tizimi: har bir yutug'ingizni rasman nishonlaymiz.",
]

export const AboutPage: React.FC = () => {
  return (
    <PageWrapper className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sahifa-500/10 text-sahifa-500 mx-auto">
          <UserIcon className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Biz haqimizda</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          SAHIFALAB: Bilim va diqqat ekotizimi
        </p>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div className="inline-flex items-center gap-2 text-sahifa-500">
          <SparklesIcon className="w-5 h-5" />
          <span className="text-xs uppercase tracking-[0.18em] font-semibold">Platforma</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">SAHIFALAB-ga xush kelibsiz</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          SAHIFALAB — bu kitoblar olami va zamonaviy texnologiyalar tutashgan nuqta. Biz
          shunchaki ma'lumot bermaymiz, biz mutolaa madaniyatini <strong>Deep Work</strong>{' '}
          falsafasi bilan birlashtirib, o'rganish jarayonini samarali va jozibali qilamiz.
        </p>
      </div>

      <div className="surface-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <AcademicCapIcon className="w-5 h-5 text-sahifa-500" />
          <h3 className="text-xl font-bold">Bizning missiyamiz</h3>
        </div>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Kitobxonlarga eng sara asarlarning mag'zini yetkazish va Study With Me asboblari orqali
          ularning intellektual salohiyatini maksimal darajaga olib chiqish. Bizning maqsadimiz —
          bilim olishni har kuni bajariladigan yoqimli odatga aylantirish.
        </p>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <StarIcon className="w-5 h-5 text-sahifa-500" />
          <h3 className="text-xl font-bold">Qadriyatlarimiz</h3>
        </div>

        <div className="space-y-3">
          {values.map((value) => {
            const Icon = value.icon
            return (
              <div key={value.title} className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-[#141414] border border-gray-200/70 dark:border-[#2A2A2A] flex items-center justify-center text-sahifa-500 shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{value.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{value.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <GlobeAltIcon className="w-5 h-5 text-sahifa-500" />
          <h3 className="text-xl font-bold">SAHIFALAB tarixi</h3>
        </div>

        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          SAHIFALAB YouTube tarmog'ida eng sara kitoblarni qisqa va tushunarli formatda
          umumlashtirish orqali o'z yo'lini boshlagan. Bugungi kunda bu loyiha shunchaki kanal
          emas, balki minglab o'quvchilarni birlashtirgan markaz hisoblanadi.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Biz Janubiy Koreyaning ilm-fan muhitidan ilhomlanib, xalqaro ta'lim standartlarini o'zbek
          tili muhitiga olib kirdik. SAHIFALAB — bu kitob o'qishni istagan, lekin vaqti kam bo'lgan
          zamonaviy insonlar uchun amaliy yechimdir.
        </p>
      </div>

      <div className="surface-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <CheckCircleIcon className="w-5 h-5 text-sahifa-500" />
          <h3 className="text-xl font-bold">Bizning farqimiz nimada?</h3>
        </div>

        <ul className="space-y-2">
          {features.map((item) => (
            <li key={item} className="flex gap-2 text-gray-700 dark:text-gray-300">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white space-y-3">
        <h3 className="font-bold text-lg">Hamjamiyatimizga qo'shiling</h3>
        <p className="text-sm opacity-90">
          SAHIFALAB bilan bugun o'z salohiyatingizni kashf qiling va o'qishni yangi darajaga olib chiqing.
        </p>

        <div className="flex gap-2 pt-2">
          <a
            href="https://t.me/sahifalab1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-sahifa-600 font-bold py-2 rounded hover:bg-gray-100 transition text-center"
          >
            <DevicePhoneMobileIcon className="w-5 h-5" />
            Ulashish
          </a>
          <a
            href="mailto:sahifalab@gmail.com"
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white/20 text-white font-bold py-2 rounded hover:bg-white/30 transition text-center"
          >
            <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
            Fikr-mulohaza
          </a>
        </div>
      </div>

      <div className="surface-card p-6 text-center space-y-2">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-sahifa-500/10 text-sahifa-500 mx-auto">
          <EnvelopeIcon className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white">Aloqa</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Biron bir savol yoki taklifingiz bormi? Biz sizni eshitishga tayyormiz.
        </p>
        <div className="flex gap-2 justify-center pt-2 flex-wrap">
          <a href="http://www.youtube.com/@SahifaLab" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">YouTube</a>
          <span className="text-gray-400">•</span>
          <a href="https://www.instagram.com/sahifalab?utm_source=qr&igsh=cGQ1NXNudXZ3NDNj" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Instagram</a>
          <span className="text-gray-400">•</span>
          <a href="https://t.me/sahifalab1" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Telegram</a>
          <span className="text-gray-400">•</span>
          <a href="https://www.tiktok.com/@sahifalab?_r=1&_t=ZS-94ldMgz986i" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">TikTok</a>
          <span className="text-gray-400">•</span>
          <a href="mailto:sahifalab@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Email</a>
        </div>
      </div>
    </PageWrapper>
  )
}

export default AboutPage
