module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist/', 'node_modules/', 'ui/', 'playwright-report/', 'test-results/'],
  overrides: [
    {
      files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'prisma/**/*.ts'],
      rules: {},
    },
  ],
};
