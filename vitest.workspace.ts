import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit-node',
      environment: 'node',
      include: [
        'scripts/**/*.test.{ts,mts,mjs}',
        'apps/api/**/*.test.ts',
        'src/core/**/*.test.ts',
      ],
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
      ],
    },
  },
])
