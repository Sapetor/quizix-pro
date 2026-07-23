/**
 * Jest Configuration
 * Quizix Pro - Unit testing configuration
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test file patterns (stress tests excluded — run via `npm run test:stress`)
    testMatch: [
        '**/tests/unit/**/*.test.js',
        '**/tests/unit/**/*.spec.js'
    ],

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/'
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'services/**/*.js',
        'socket/**/*.js',
        '!**/node_modules/**'
    ],

    // Coverage thresholds. Measured global at time of writing (services/** +
    // socket/**): ~68% stmts / 59% branches / 70% funcs / 69% lines. Set below
    // that with headroom so the gate stays green as socket/** test coverage
    // (added separately) fluctuates.
    coverageThreshold: {
        global: {
            branches: 45,
            functions: 55,
            lines: 55,
            statements: 55
        }
    },

    // Module resolution
    moduleFileExtensions: ['js', 'json'],

    // Verbose output
    verbose: true,

    // Clear mocks between tests
    clearMocks: true
};
