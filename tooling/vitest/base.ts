import { defineConfig, type UserConfig } from 'vitest/config';

/**
 * Shared vitest config. Critically excludes macOS AppleDouble `._*` files, which this exfat
 * working volume materialises next to every source file and which esbuild cannot parse.
 */
export function defineEdrionVitest(overrides: UserConfig = {}): UserConfig {
  return defineConfig({
    ...overrides,
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
      ...overrides.test,
    },
  });
}

export default defineEdrionVitest();
