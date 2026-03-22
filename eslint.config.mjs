import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/temporal.d.ts'] },
  // Conformance layer — strict with any-related exemptions (wraps untyped NAPI)
  {
    files: ['lib/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-constant-condition': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // Config and build files — basic linting without type-aware rules
  // (these files are outside tsconfig rootDir so projectService can't find them)
  {
    files: ['*.ts', '*.mjs'],
    extends: [...tseslint.configs.recommended],
  },
);
