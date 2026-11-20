import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'public/bundle.js', 'node_modules/**', 'licenses/**'] },
  js.configs.recommended,

  // Renderer (React, bundled by webpack for electron-renderer)
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, require: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      // Real bugs worth failing on:
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      // Style / hygiene: warn only so the existing code base doesn't block CI.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // Main process + build scripts (CommonJS / Node)
  {
    files: ['main.js', 'scripts/**/*.{js,mjs}', 'webpack.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['warn', { allowEmptyCatch: true }] },
  },
  { files: ['scripts/**/*.mjs'], languageOptions: { sourceType: 'module' } },

  // Tests
  {
    files: ['tests/**/*.js', 'vitest.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
];
