import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const frontend = fileURLToPath(new URL('.', import.meta.url));
const rules = { ...js.configs.recommended.rules, curly: ['error', 'all'] };

export default [
  {
    basePath: repository,
    ignores: [
      '**/node_modules/**',
      '.aws-sam/**',
      'src/frontend/build/**',
      'src/frontend/src/config.js',
    ],
  },
  {
    basePath: repository,
    files: ['src/**/*.{js,mjs}', 'test/**/*.{js,mjs}'],
    ignores: ['src/frontend/**'],
    languageOptions: { globals: globals.node },
    rules,
  },
  {
    basePath: frontend,
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
];
