import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({esbuild:{jsx:'automatic'},resolve:{alias:{'@':resolve(__dirname,'src')}},
 test:{environment:'jsdom',setupFiles:['./vitest.setup.ts'],include:['src/**/*.{test,spec}.{ts,tsx}'],exclude:['**/node_modules/**','**/._*']}});
