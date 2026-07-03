import type { Config } from 'tailwindcss';

/** Standalone token set for the mobile-first parent PWA (independent of @edrion/ui). */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2563eb', 600: '#2563eb', 700: '#1d4ed8' },
        ink: '#0f172a',
        muted: '#64748b',
        line: '#e2e8f0',
        surface: '#ffffff',
        canvas: '#f8fafc',
        good: '#16a34a',
        warn: '#d97706',
        bad: '#dc2626',
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      maxWidth: { app: '520px' },
    },
  },
  plugins: [],
};

export default config;
