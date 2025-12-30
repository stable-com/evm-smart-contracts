import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: ['typechain-types/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'script',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unreachable': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
