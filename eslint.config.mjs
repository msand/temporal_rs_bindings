import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['lib/**/*.ts'],
  extends: [...tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    // Keep no-unused-vars as error with underscore exceptions
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // This codebase is a JS-to-TS migration wrapping an untyped NAPI binding.
    // `any` is pervasive and intentional for dynamic property bag handling.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',

    // Required: NAPI binding loaded via createRequire
    '@typescript-eslint/no-require-imports': 'off',

    // Intentional patterns in this codebase
    'no-constant-condition': 'off', // while(true) loops in scanning algorithms
    'no-empty': ['error', { allowEmptyCatch: true }], // try/catch{} for optional operations
    'no-fallthrough': 'off', // intentional switch fallthroughs
    '@typescript-eslint/no-non-null-assertion': 'off', // regex match results known to succeed
    '@typescript-eslint/restrict-template-expressions': 'off', // template strings with any-typed values
    '@typescript-eslint/no-unnecessary-condition': 'off', // defensive checks on any-typed values
    '@typescript-eslint/unbound-method': 'off', // methods extracted for .call() pattern with NAPI binding
  },
});
