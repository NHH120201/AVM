/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        background: '#111214',
        surface: '#1a1d27',
        card: '#1e2130',
        border: '#2d3148',
        primary: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
        },
        accent: '#22c55e',
        destructive: '#ef4444',
        foreground: '#e2e8f0',
        muted: '#94a3b8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
