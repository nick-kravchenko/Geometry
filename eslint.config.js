const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'pkg/**', 'target/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      'max-nested-callbacks': ['error', 2],
      'max-depth': ['error', 4],
    },
  },
  {
    // describe/it blocks add two levels of nesting on their own
    files: ['**/*.test.ts'],
    rules: {
      'max-nested-callbacks': ['error', 4],
    },
  },
);
