module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  clearMocks: true,
  moduleNameMapper: {
    '^@cafeteria/feature-flags$': '<rootDir>/../../packages/feature-flags/src/index.ts',
  },
};
