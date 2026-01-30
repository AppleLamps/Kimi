/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kimi-dark': '#0f0f0f',
        'kimi-darker': '#0a0a0a',
        'kimi-gray': '#1a1a1a',
        'kimi-light-gray': '#2a2a2a',
        'kimi-border': '#333333',
        'kimi-blue': '#3b82f6',
        'kimi-green': '#22c55e',
        'kimi-red': '#ef4444',
        'kimi-yellow': '#eab308',
      },
    },
  },
  plugins: [],
}
