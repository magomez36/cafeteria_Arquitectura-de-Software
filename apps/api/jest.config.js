module.exports = {
  resolver: '<rootDir>/jest.workspace-resolver.cjs',
  moduleNameMapper: {
    '^@cafeteria/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@cafeteria/feature-flags$': '<rootDir>/../../packages/feature-flags/src/index.ts',
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  clearMocks: true,
};
