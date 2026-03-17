/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── Premium Orange palette ─────────────────────────────────── */
        sahifa: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F26722',   /* ← Brand orange */
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
          950: '#431407',
        },
        /* ── Deep Slate backgrounds ─────────────────────────────────── */
        slate: {
          950: '#0F172A',
          925: '#111827',
          900: '#131C2E',
          850: '#162033',
          800: '#1E293B',
        },
        telegram: '#0088cc',
        gold:    '#FFD700',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow-sm':   '0 0 10px rgba(242, 103, 34, 0.25)',
        'glow':      '0 0 20px rgba(242, 103, 34, 0.3)',
        'glow-lg':   '0 0 30px rgba(242, 103, 34, 0.4)',
        'glow-gold': '0 0 20px rgba(255, 215, 0, 0.3)',
        'card':      '0 4px 24px rgba(0, 0, 0, 0.12)',
        'card-hover':'0 8px 40px rgba(242, 103, 34, 0.15)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-mesh': 'linear-gradient(135deg, rgba(242,103,34,0.12) 0%, rgba(234,88,12,0.06) 50%, transparent 100%)',
      },
      animation: {
        'shimmer':    'shimmer 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float':      'float 6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
