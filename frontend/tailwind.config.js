/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sahifa: {
          50: '#f8f7ff',
          100: '#f0eeff',
          200: '#e0dbff',
          300: '#d1c8ff',
          400: '#b3a7ff',
          500: '#9485ff',
          600: '#7c63ff',
          700: '#6a52d8',
          800: '#5844ad',
          900: '#3d2f7a',
        },
        telegram: '#0088cc',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
