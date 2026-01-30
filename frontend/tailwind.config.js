/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core backgrounds - refined dark theme with better depth
        'kimi-dark': '#0d0d0d',
        'kimi-darker': '#080808',
        'kimi-gray': '#161616',
        'kimi-light-gray': '#242424',
        'kimi-border': '#2a2a2a',
        'kimi-border-light': '#383838',

        // Primary accent - vibrant blue
        'kimi-blue': '#3b82f6',
        'kimi-blue-hover': '#2563eb',
        'kimi-blue-muted': '#1d4ed8',

        // Success - green
        'kimi-green': '#10b981',
        'kimi-green-hover': '#059669',
        'kimi-green-muted': 'rgba(16, 185, 129, 0.15)',

        // Error/Danger - red
        'kimi-red': '#ef4444',
        'kimi-red-hover': '#dc2626',
        'kimi-red-muted': 'rgba(239, 68, 68, 0.15)',

        // Warning/Tool - amber
        'kimi-yellow': '#f59e0b',
        'kimi-yellow-muted': 'rgba(245, 158, 11, 0.15)',

        // Purple accent for AI/thinking
        'kimi-purple': '#8b5cf6',
        'kimi-purple-muted': 'rgba(139, 92, 246, 0.15)',

        // Text colors
        'kimi-text': '#f5f5f5',
        'kimi-text-secondary': '#a1a1aa',
        'kimi-text-muted': '#71717a',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-green': '0 0 15px rgba(16, 185, 129, 0.25)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.25)',
        'glow-purple': '0 0 15px rgba(139, 92, 246, 0.25)',
        'inner-light': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounceSubtle 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
