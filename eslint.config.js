const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    // Specify which file extensions should be linted
    files: ['**/*.ts'], // Or you can specify more specific patterns
    languageOptions: {
      parser: typescriptParser, // Use TypeScript parser
      ecmaVersion: 2023,        // ECMAScript version
      sourceType: 'module',     // For ES Modules
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    ignores: [
      "**/node_modules/**",
      '**/wasm/**',
      '**/dist/**',
    ],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      'max-nested-callbacks': ['error', 2],
      'max-depth': ['error', 4],
    }
  }
];
