import type { Config } from 'tailwindcss';
import preset from '@edrion/tailwind-config';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Scan the shared UI library so its token-based classes aren't purged.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
