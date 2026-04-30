import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // `docs/**` is the GitHub Pages landing (static HTML + a couple of
    // browser scripts). Linting it under the project's Node-flavoured
    // config would require teaching ESLint about every browser global
    // (window, document, IntersectionObserver, fetch, requestAnimationFrame,
    // FormData, etc.). The landing has its own life cycle, hand-edited
    // and reviewed in the browser, so we keep ESLint focused on the
    // shipped product and let the landing stay outside the lint pass.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'design-cds/**', 'docs/**'],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['chrome/**/*.js'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        atob: 'readonly',
        Blob: 'readonly',
        chrome: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        document: 'readonly',
        ExportalPure: 'readonly',
        fetch: 'readonly',
        history: 'readonly',
        importScripts: 'readonly',
        module: 'readonly',
        performance: 'readonly',
        self: 'readonly',
        requestAnimationFrame: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        TextDecoder: 'readonly',
        Uint8Array: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        window: 'readonly',
        HTMLInputElement: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      'import-x/no-extraneous-dependencies': 'error',
      'import-x/no-unresolved': 'error',
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  prettier,
);
