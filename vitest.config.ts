import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ['tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    maxWorkers: 8,
    minWorkers: 4,
    isolate: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
