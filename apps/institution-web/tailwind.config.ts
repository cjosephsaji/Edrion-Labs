import type { Config } from 'tailwindcss';
import preset from '@edrion/tailwind-config';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Scan the shared UI library so its token-based classes aren't purged.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1f604a', 600: '#1f604a', 700: '#164f3d' },
        ink: '#25241d',
        muted: '#746d5d',
        line: '#e2d9c8',
        surface: '#fffaf1',
        card: '#ffffff',
        canvas: '#f8f5ee',
        good: '#37825f',
        warn: '#b7821d',
        bad: '#b74833',
      },
      boxShadow: {
        soft: '0 12px 26px -18px rgb(42 38 29 / 0.28), 0 2px 6px -3px rgb(42 38 29 / 0.10)',
      },
      borderRadius: { xl: '14px', '2xl': '18px', '3xl': '24px' },
      maxWidth: { app: '520px' },
    },
  },
};

export default config;
