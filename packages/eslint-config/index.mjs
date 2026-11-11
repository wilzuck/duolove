import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Règles communes Crushduo : TypeScript strict, pas de catch vide, pas de any implicite. */
export default tseslint.config(
  { ignores: ['dist', '.next', 'node_modules', 'coverage', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
