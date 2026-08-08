import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    // better-sqlite3's native addon crashes when loaded into a worker_thread
    // (Vitest's default 'threads' pool) on Linux; run tests in child
    // processes instead.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/prototype/**',
        'src/types/**',
        '**/*.config.*',
        'src/app/**/page.tsx',
        'src/core/text/**',
        'src/core/stroke/**',
        'src/core/import/**',
        'src/features/browse/index.ts',
        'src/features/detail/index.ts',
        'src/features/dictionary/index.ts',
        'src/features/history/index.ts',
        'src/features/settings/index.ts',
        'src/features/writing/index.ts',
        'src/pwa/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'test/**',
        'scripts/**',
        'e2e/**',
        '.next/**',
      ],
      // A ratchet, not a ceiling: raise a number whenever it's comfortably exceeded,
      // never lower one. src/core/srs is mandated at 100% by ARCHITECTURE.md §12.
      thresholds: {
        'src/core/srs/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/data/**': {
          lines: 85,
          functions: 85,
          branches: 85,
          statements: 85,
        },
        'src/features/**': {
          lines: 70,
          functions: 70,
          branches: 70,
          statements: 70,
        },
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
