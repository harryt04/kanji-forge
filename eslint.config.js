import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*'],
              message: 'React and React DOM are not allowed in src/core/** — keep core pure.',
            },
            {
              group: ['fs', 'fs/*', 'path', 'path/*', 'os', 'process', 'buffer', 'stream', 'events', 'util'],
              message: 'Node.js built-ins are not allowed in src/core/** — keep core pure.',
            },
            {
              group: ['document', 'window', 'navigator', 'localStorage', 'sessionStorage'],
              message: 'Browser APIs are not allowed in src/core/** — keep core pure.',
            },
          ],
        },
      ],
    },
  },
];
