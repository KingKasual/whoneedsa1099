import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import federal from './src/rules/federal-ty2026.json';

process.env.VITE_RULES_VERSION ??= federal.version;
process.env.VITE_SITE_URL ??= 'https://YOURDOMAIN.com';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**/*.ts', 'src/parse/**/*.ts', 'src/export/**/*.ts', 'src/lib/**/*.ts', 'worker/src/**/*.ts'],
      exclude: ['src/lib/download.ts', 'src/lib/config.ts'],
      thresholds: { 'src/rules/**/*.ts': { lines: 90, branches: 90, functions: 90, statements: 90 } },
    },
  },
});
