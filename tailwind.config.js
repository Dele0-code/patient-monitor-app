/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', '"Roboto Mono"', 'monospace'],
      },
      animation: {
        'pulse-border': 'pulseBorder 1.5s infinite',
      },
      keyframes: {
        pulseBorder: {
          '0%, 100%': { borderColor: 'rgba(239, 68, 68, 0.4)' },
          '50%': { borderColor: 'rgba(239, 68, 68, 1)' },
        }
      }
    },
  },
  plugins: [],
}
