module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup-tests.js'],
  testPathIgnorePatterns: ['/node_modules/', '/coverage/', '/tests/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  collectCoverageFrom: [
    'app.js',
    'routes/**/*.js',
    'services/**/*.js',
    'integrations/**/*.js'
  ]
};
