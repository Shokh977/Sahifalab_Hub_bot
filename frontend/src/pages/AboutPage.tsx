import React from 'react'

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          👤 Biz Haqimuzda
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          About SAHIFALAB & Sam's Mission
        </p>
      </div>

      {/* Hero Card */}
      <div className="card bg-gradient-to-br from-pink-50 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30 space-y-4">
        <div className="text-6xl text-center">👋</div>
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
          Welcome to SAHIFALAB
        </h2>
        <p className="text-center text-gray-700 dark:text-gray-300 leading-relaxed">
          SAHIFALAB is a community-driven learning platform dedicated to making quality education
          accessible to everyone. We believe in the power of knowledge to transform lives.
        </p>
      </div>

      {/* Mission */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">🎯 Our Mission</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          To provide a comprehensive, interactive learning platform that combines study tools,
          quality content, and a supportive community to help students achieve their educational goals.
        </p>
      </div>

      {/* Values */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">💎 Our Values</h3>
        <div className="space-y-3">
          {[
            { icon: '🌟', title: 'Quality', desc: 'We never compromise on content quality' },
            { icon: '🤝', title: 'Community', desc: 'Learning together, growing together' },
            { icon: '♿', title: 'Accessibility', desc: 'Education for everyone, everywhere' },
            { icon: '🚀', title: 'Innovation', desc: 'Continuously improving our platform' },
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

      {/* Sam's Story */}
      <div className="card bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 space-y-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">👨‍💼 Sam's Story</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Sam started SAHIFALAB with a simple vision: to make learning fun, interactive, and
          accessible. Having struggled with traditional education methods, Sam discovered the power
          of personalized, tech-enabled learning and decided to share this journey with others.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Today, SAHIFALAB serves thousands of learners across the globe, combining focus techniques,
          interactive quizzes, curated resources, and a supportive community to help everyone reach
          their educational potential.
        </p>
      </div>

      {/* Features Highlight */}
      <div className="card space-y-3">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">✨ What Makes Us Different</h3>
        <ul className="space-y-2">
          {[
            'Pomodoro-based study timer with ambient sounds',
            'Interactive, book-based quizzes',
            'Curated collection of free and premium PDFs',
            'Organized external resources and YouTube links',
            'Community-driven approach to learning',
            'Telegram integration for on-the-go access',
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
        <h3 className="font-bold text-lg">Join Our Learning Community</h3>
        <p className="text-sm opacity-90">
          Start your journey with SAHIFALAB today and unlock your potential!
        </p>
        <div className="flex gap-2 pt-2">
          <button className="flex-1 bg-white text-sahifa-600 font-bold py-2 rounded hover:bg-gray-100 transition">
            📱 Share
          </button>
          <button className="flex-1 bg-white/20 text-white font-bold py-2 rounded hover:bg-white/30 transition">
            💬 Feedback
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="card text-center space-y-2">
        <h3 className="font-bold text-gray-900 dark:text-white">📞 Get in Touch</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Have questions or suggestions? We'd love to hear from you!
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <a
            href="https://twitter.com/sahifalab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Twitter
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="mailto:hello@sahifalab.com"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Email
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="https://instagram.com/sahifalab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Instagram
          </a>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
