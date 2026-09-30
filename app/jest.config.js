module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns:
    require('jest-expo/jest-preset').transformIgnorePatterns.map((pattern) =>
      pattern.replace('node_modules/(?!', 'node_modules/(?!@formatjs/|'),
    ),
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  watchman: false,
};
