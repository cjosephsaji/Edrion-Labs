import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared flat ESLint config for the Edrion monorepo.
 * Extend per-package: `export default [...base, { ...overrides }]`.
 */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: [
      'dist/**',
      '.next/**',
      'coverage/**',
      'node_modules/**',
      '**/*.config.*',
      '**/._*',
    ],
  },
];

export default base;
