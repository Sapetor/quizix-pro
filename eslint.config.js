/**
 * ESLint Configuration (Flat Config for ESLint 9+)
 * Quizix Pro - Code quality and consistency rules
 */

export default [
    {
        // Global ignores
        ignores: [
            'node_modules/**',
            'public/css/main.bundle.css',
            'test-results/**',
            'playwright-report/**',
            'coverage/**',
            '*.min.js'
        ]
    },
    {
        // Server-side Node.js files
        files: ['server.js', 'services/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals
                console: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                Buffer: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            // Error prevention
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'no-console': 'off', // Allow console in server code

            // Code quality
            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'warn',

            // Style consistency
            'semi': ['error', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'comma-dangle': ['warn', 'never'],
            'no-trailing-spaces': 'warn',
            'no-multiple-empty-lines': ['warn', { max: 2 }]
        }
    },
    {
        // Client-side ES6 module files
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                HTMLElement: 'readonly',
                Element: 'readonly',
                Node: 'readonly',
                NodeList: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                MouseEvent: 'readonly',
                KeyboardEvent: 'readonly',
                TouchEvent: 'readonly',
                FormData: 'readonly',
                FileReader: 'readonly',
                Image: 'readonly',
                Audio: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                URLSearchParams: 'readonly',
                NodeFilter: 'readonly',
                getComputedStyle: 'readonly',
                DOMMatrix: 'readonly',
                MutationObserver: 'readonly',
                ResizeObserver: 'readonly',
                IntersectionObserver: 'readonly',
                performance: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',
                // Web APIs
                speechSynthesis: 'readonly',
                SpeechSynthesisUtterance: 'readonly',
                indexedDB: 'readonly',
                IDBKeyRange: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                Headers: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                crypto: 'readonly',
                Chart: 'readonly',
                // Third-party libraries
                io: 'readonly',
                MathJax: 'readonly',
                confetti: 'readonly',
                Sortable: 'readonly',
                hljs: 'readonly',
                // App-specific window globals (used in onclick handlers and global registry)
                event: 'readonly',
                translationManager: 'readonly',
                showLoadQuizModal: 'readonly',
                saveQuiz: 'readonly',
                startHosting: 'readonly',
                togglePreviewMode: 'readonly',
                updateEditorQuestionCount: 'readonly'
            }
        },
        rules: {
            // Error prevention
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'no-console': 'off', // Using logger but console may be used

            // Code quality
            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'warn',

            // Style consistency
            'semi': ['error', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'comma-dangle': ['warn', 'never'],
            'no-trailing-spaces': 'warn',
            'no-multiple-empty-lines': ['warn', { max: 2 }]
        }
    },
    {
        // Test files (Jest uses CommonJS, Playwright uses ES modules)
        files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals for tests
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                // Jest globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly',
                // Playwright globals
                page: 'readonly',
                browser: 'readonly',
                context: 'readonly',
                // Browser globals for Playwright tests
                document: 'readonly',
                window: 'readonly',
                getComputedStyle: 'readonly',
                HTMLElement: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'no-console': 'off'
        }
    },
    {
        // Service Worker file
        files: ['public/sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Service Worker globals
                self: 'readonly',
                caches: 'readonly',
                fetch: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                Headers: 'readonly',
                console: 'readonly',
                Promise: 'readonly',
                clients: 'readonly',
                registration: 'readonly',
                skipWaiting: 'readonly',
                addEventListener: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-console': 'off'
        }
    }
];
