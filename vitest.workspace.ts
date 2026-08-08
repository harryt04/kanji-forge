import { configDefaults, defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit-node',
      environment: 'node',
      include: [
        'scripts/**/*.test.{ts,mts,mjs}',
        'src/server/**/*.test.ts',
        'src/core/**/*.test.ts',
      ],
      // build-decks.test.ts asserts against packs/*.sqlite, which are
      // gitignored and only produced by `pnpm packs:refresh` (the monthly
      // refresh pipeline). It lives in its own project below so the default
      // suite (what PR CI runs) never touches it.
      exclude: [
        ...configDefaults.exclude,
        'scripts/build-packs/build-decks.test.ts',
      ],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit-node-decks',
      environment: 'node',
      include: ['scripts/build-packs/build-decks.test.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit-dom',
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: [
        'src/data/**/*.test.{ts,tsx}',
        'src/features/**/*.test.{ts,tsx}',
        'src/auth/**/*.test.{ts,tsx}',
        'src/lib/**/*.test.{ts,tsx}',
        'src/ui/**/*.test.{ts,tsx}',
        'src/pwa/**/*.test.{ts,tsx}',
      ],
    },
  },
])
