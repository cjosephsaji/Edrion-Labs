import { defineConfig } from 'vitest/config';

// Inlined (api is CommonJS and cannot require the ESM shared config). Excludes AppleDouble.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
  },
});
