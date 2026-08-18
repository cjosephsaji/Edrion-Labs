import { base } from './tooling/eslint/index.mjs';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base,
  {
    files: ['apps/*-web/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // These apps use `typeof import('…')` to infer API hook result types; it is already type-only.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
