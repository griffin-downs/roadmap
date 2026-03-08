import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ['tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts', 'src/tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/node-runner/**'],
    pool: 'forks',
    maxWorkers: 8,
    minWorkers: 4,
    isolate: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/**/types.ts',
      ],
      all: true,
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
  },
});
