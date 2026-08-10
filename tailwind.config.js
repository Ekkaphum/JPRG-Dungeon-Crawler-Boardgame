/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        bg: { deep: '#0b0e14', panel: '#141a26', panel2: '#1b2333' },
        gold: { DEFAULT: '#d4a94a', dim: '#8a6f2f', bright: '#f0d27a' },
        boss: '#c0392b',
        front: '#4a90d9',
        back: '#6ab04c',
        gem: { red: '#e04a4a', yellow: '#e8c04a', blue: '#4a9ce0' },
      },
      fontFamily: {
        display: ['Georgia', 'Cinzel', 'serif'],
        body: ['system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(212,169,74,0.6), 0 0 18px rgba(212,169,74,0.15)',
      },
    },
  },
  plugins: [],
};
