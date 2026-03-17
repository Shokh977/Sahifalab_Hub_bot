import React from 'react'

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          👤 Biz Haqimizda
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          SAHIFALAB: Bilim va Diqqat Ekotizimi
        </p>
      </div>

      {/* Hero Card */}
      <div className="card bg-gradient-to-br from-pink-50 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30 space-y-4">
        <div className="text-6xl text-center">👋</div>
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
          SAHIFALAB-ga xush kelibsiz!
        </h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          SAHIFALAB — bu kitoblar olami va zamonaviy texnologiyalar tutashgan nuqta. Biz
          shunchaki ma'lumot bermaymiz, biz mutolaa madaniyatini <strong>"Deep Work"</strong>
          {' '}(Chuqur diqqat) falsafasi bilan birlashtirib, o'rganish jarayonini samarali va
          jozibali qilamiz.
        </p>
      </div>

      {/* Mission */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">🎯 Bizning Missiyamiz</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Kitobxonlarga eng sara asarlarning mag'zini yetkazish va <strong>"Study With Me"</strong>{' '}
          asboblari orqali ularning intellektual salohiyatini maksimal darajaga olib chiqish.
          Bizning maqsadimiz — bilim olishni har kuni bajariladigan yoqimli odatga aylantirish.
        </p>
      </div>

      {/* Values */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">💎 Qadriyatlarimiz</h3>
        <div className="space-y-3">
          {[
            { icon: '🌟', title: 'Sifat', desc: 'Har bir video va xulosa ustida o\'nlab soat ishlanadi.' },
            { icon: '🧠', title: 'Chuqur Diqqat', desc: 'Diqqat — bu 21-asrning yangi valyutasi. Biz uni qadrlaymiz.' },
            { icon: '🚀', title: 'Rivojlanish', desc: 'To\'xtab qolish — bu orqaga ketishdir. Biz doim harakatdamiz.' },
            { icon: '🤝', title: 'Hamjamiyat', desc: 'Birgalikda o\'qiymiz, birgalikda o\'samiz.' },
          ].map((value, index) => (
            <div key={index} className="flex gap-3">
              <div className="text-2xl flex-shrink-0">{value.icon}</div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">{value.title}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{value.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="card bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 space-y-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">📖 SAHIFALAB Tarixi</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          SAHIFALAB YouTube tarmog'ida eng sara kitoblarni qisqa va tushunarli formatda
          umumlashtirish (summarizing) orqali o'z yo'lini boshlagan. Bugungi kunda bu loyiha
          shunchaki kanal emas, balki minglab o'quvchilarni birlashtirgan "Hub" (Markaz)
          hisoblanadi.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Biz Janubiy Koreyaning ilm-fan muhitidan ilhomlanib, xalqaro ta'lim standartlarini o'zbek
          tili muhitiga olib kirdik. SAHIFALAB — bu kitob o'qishni istagan, lekin vaqti kam bo'lgan
          zamonaviy insonlar uchun mukammal yechimdir.
        </p>
      </div>

      {/* Features Highlight */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">✨ Bizning Farqimiz nimada?</h3>
        <ul className="space-y-2">
          {[
            '✅ Kitoblarga asoslangan interaktiv Quizlar: Faqat o\'qimang, bilimingizni sinang!',
            '✅ Deep Work Session: Diqqatni jamlash uchun maxsus taymer va ambient tovushlar.',
            '✅ Eksklyuziv Kutubxona: Tekin va pullik sara PDF materiallar to\'plami.',
            '✅ YouTube Integratsiyasi: Video darslar va xulosalar bir joyda.',
            '✅ Sertifikatlash tizimi: Har bir yutug\'ingizni rasman nishonlaymiz.',
          ].map((item, index) => (
            <li key={index} className="flex gap-2 text-gray-700 dark:text-gray-300">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="card bg-gradient-to-r from-sahifa-600 to-sahifa-700 text-white space-y-3">
        <h3 className="font-bold text-lg">Hamjamiyatimizga qo'shiling!</h3>
        <p className="text-sm opacity-90">
          SAHIFALAB bilan bugun o'z salohiyatingizni kashf qiling va o'qishni yangi darajaga olib chiqing!
        </p>
        <div className="flex gap-2 pt-2">
          <a
            href="https://t.me/sahifalab1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-white text-sahifa-600 font-bold py-2 rounded hover:bg-gray-100 transition text-center"
          >
            📱 Ulashish
          </a>
          <a
            href="mailto:sahifalab@gmail.com"
            className="flex-1 bg-white/20 text-white font-bold py-2 rounded hover:bg-white/30 transition text-center"
          >
            💬 Fikr-mulohaza
          </a>
        </div>
      </div>

      {/* Contact */}
      <div className="card text-center space-y-2">
        <h3 className="font-bold text-gray-900 dark:text-white">📞 Aloqa</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Biron bir savol yoki taklifingiz bormi? Biz sizni eshitishga tayyormiz!
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <a
            href="http://www.youtube.com/@SahifaLab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            YouTube
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="https://www.instagram.com/sahifalab?utm_source=qr&igsh=cGQ1NXNudXZ3NDNj"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Instagram
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="https://t.me/sahifalab1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Telegram
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="https://www.tiktok.com/@sahifalab?_r=1&_t=ZS-94ldMgz986i"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            TikTok
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="mailto:sahifalab@gmail.com"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Email
          </a>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
