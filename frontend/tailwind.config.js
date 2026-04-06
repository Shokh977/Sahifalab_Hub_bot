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
          50:  '#FFF4EE',
          100: '#FFE4D3',
          200: '#FFC8A8',
          300: '#FFA57A',
          400: '#FF7D44',
          500: '#F15929',   /* ← Brand orange  */
          600: '#E04A1A',
          700: '#C43C12',
          800: '#922C0C',
          900: '#6B1F08',
          950: '#3D0F02',
        },
        /* ── Deep Slate / Dark mode bg ──────────────────────────────── */
        pitch: {
          DEFAULT: '#1C1C22',  /* ← Primary dark bg */
          50:  '#F5F5F7',
          100: '#E8E8EE',
          200: '#C8C8D4',
          300: '#9898A8',
          400: '#606070',
          500: '#3C3C48',
          600: '#2A2A34',
          700: '#222230',
          800: '#1C1C22',
          900: '#14141A',
          950: '#0C0C10',
        },
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
        sans: ['Oxygen', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Oxygen', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow-sm':     '0 10px 24px rgba(241, 89, 41, 0.18)',
        'glow':        '0 14px 32px rgba(241, 89, 41, 0.22)',
        'glow-lg':     '0 18px 40px rgba(241, 89, 41, 0.28)',
        'glow-gold':   '0 0 20px rgba(255, 215, 0, 0.3)',
        'card':        '0 4px 24px rgba(15, 23, 42, 0.06)',
        'card-hover':  '0 8px 36px rgba(15, 23, 42, 0.10)',
        'card-dark':   '0 4px 24px rgba(0, 0, 0, 0.28)',
        'hero':        '0 20px 60px rgba(241, 89, 41, 0.20)',
        'inner-light': 'inset 0 1px 0 rgba(255,255,255,0.10)',
        'glass':       '0 8px 32px rgba(0, 0, 0, 0.18)',
        'glass-lg':    '0 12px 48px rgba(0, 0, 0, 0.24)',
        'bento':       '0 1px 2px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08), 0 12px 36px rgba(0,0,0,0.16)',
        'bento-hover': '0 2px 4px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.20)',
        'elevation-1': '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        'elevation-2': '0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)',
        'elevation-3': '0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10)',
        /* ── Light mode soft shadows ──────────────────────────────── */
        'frost':       '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
        'frost-hover': '0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
        'frost-lg':    '0 4px 12px rgba(0,0,0,0.05), 0 12px 40px rgba(0,0,0,0.08)',
        'frost-xl':    '0 8px 24px rgba(0,0,0,0.06), 0 20px 60px rgba(0,0,0,0.10)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-mesh': 'linear-gradient(135deg, rgba(242,103,34,0.12) 0%, rgba(234,88,12,0.06) 50%, transparent 100%)',
        'glass-card': 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        'glass-card-hover': 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'shimmer':    'shimmer 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float':      'float 6s ease-in-out infinite',
        'slideIn':    'slideIn 0.3s ease-out',
        'fadeIn':     'fadeIn 0.3s ease-out',
        'spin-slow':  'spin 3s linear infinite',
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
        slideIn: {
          '0%':   { transform: 'translateX(400px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
