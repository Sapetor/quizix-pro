/**
 * Jest Configuration
 * Quizix Pro - Unit testing configuration
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '**/tests/unit/**/*.test.js',
        '**/tests/unit/**/*.spec.js'
    ],

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/tests/mobile-quiz-editor-light-mode.spec.js',
        '/tests/code-review-fixes.test.js'
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'services/**/*.js',
        '!**/node_modules/**'
    ],

    // Coverage thresholds (start low, increase over time)
    coverageThreshold: {
        global: {
            branches: 20,
            functions: 20,
            lines: 20,
            statements: 20
        }
    },

    // Module resolution
    moduleFileExtensions: ['js', 'json'],

    // Verbose output
    verbose: true,

    // Clear mocks between tests
    clearMocks: true
};
