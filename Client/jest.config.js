export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(js|jsx)',
    '<rootDir>/src/**/?(*.)(test|spec).(js|jsx)',
    '<rootDir>/src/tests/**/*.test.js',
    // Ensure odontogram tests under features are picked up
    '<rootDir>/src/features/odontogram/test/**/*.test.js'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': '<rootDir>/src/tests/__mocks__/styleMock.js',
    '\\.(svg|png|jpe?g|gif)$': '<rootDir>/src/tests/__mocks__/fileMock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/main.jsx'
  ]
};