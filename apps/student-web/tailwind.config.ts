import type { Config } from 'tailwindcss';
import preset from '@edrion/tailwind-config';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
