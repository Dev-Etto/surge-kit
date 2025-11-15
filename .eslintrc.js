module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
  ],
  env: {
    node: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
};