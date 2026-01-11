/**
 * Configuration constants for Quizix Pro
 * Simplified and focused on essential settings
 */

// Development/Production Configuration
export const DEBUG = {
    ENABLED: true, // Set to false for production builds
    LEVELS: {
        ERROR: 1,
        WARN: 2, 
        INFO: 3,
        DEBUG: 4
    },
    CURRENT_LEVEL: 2 // Show errors and warnings only (1=errors only, 2=+warnings, 3=+info, 4=+debug)
};

// Simplified logger - removes emoji overhead and reduces complexity
export const logger = {
    error: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.ERROR) {
            console.error(message, ...args);
        }
    },
    warn: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.WARN) {
            console.warn(message, ...args);
        }
    },
    info: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.INFO) {
            console.log(message, ...args);
        }
    },
    debug: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.DEBUG) {
            console.log(message, ...args);
        }
    }
};

// Timing constants - simplified and consolidated
export const TIMING = {
    // Core gameplay timing
    DEFAULT_QUESTION_TIME: 20,
    GAME_START_DELAY: 2000,
    LEADERBOARD_DISPLAY_TIME: 3000,
    RESULT_DISPLAY_DURATION: 4000,
    
    // Standard delays for UI operations
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 1000,
    DOM_UPDATE_DELAY: 100,
    AUTO_SAVE_DELAY: 5000,
    
    // MathJax rendering (simplified)
    MATHJAX_TIMEOUT: 100,
    MATHJAX_LOADING_TIMEOUT: 10000,
    RENDER_DELAY: (() => {
        // Optimized render delay with mobile LaTeX improvements
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isMobile = window.innerWidth <= 768;
        // Reduced delays due to LaTeX FOUC prevention and loading indicators
        return isAndroid ? 250 : (isMobile ? 150 : 100);
    })()
};

export const SCORING = {
    BASE_POINTS: 100,
    MAX_BONUS_TIME: 10000,
    DEFAULT_NUMERIC_TOLERANCE: 0.1, // Default tolerance for numeric answers (10%)
};

export const LIMITS = {
    MAX_PLAYER_NAME_LENGTH: 20,
    MIN_TIME_LIMIT: 5,
    MAX_TIME_LIMIT: 300,
    MAX_PLAYER_NUMBER: 999,
};

// Semantic color palette for consistent UI
// Use these constants instead of hardcoding colors in components
export const COLORS = {
    // Status colors
    SUCCESS: '#10b981',      // Green - correct answers, success states
    WARNING: '#f59e0b',      // Amber - warnings, medium difficulty
    ERROR: '#ef4444',        // Red - errors, hard difficulty, wrong answers
    INFO: '#3b82f6',         // Blue - information, primary actions

    // Difficulty indicators
    DIFFICULTY: {
        EASY: '#22c55e',     // Green
        MEDIUM: '#f59e0b',   // Amber
        HARD: '#ef4444',     // Red
    },

    // Chart/visualization colors
    CHART: {
        PRIMARY: '#3b82f6',   // Blue
        SECONDARY: '#10b981', // Green
        TERTIARY: '#f59e0b',  // Orange
        QUATERNARY: '#ef4444',// Red
        PURPLE: '#8b5cf6',
        CYAN: '#06b6d4',
    },

    // UI element colors
    BORDER: '#374151',
    OVERLAY: 'rgba(0, 0, 0, 0.5)',
    HIGHLIGHT: 'rgba(255, 215, 0, 0.2)',

    // Answer feedback colors
    CORRECT_ANSWER: '#2ecc71',
    CORRECT_ANSWER_BG: 'rgba(46, 204, 113, 0.2)',

    // AI Generator option colors (for preview display)
    OPTION_COLORS: [
        { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },   // Blue
        { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#10b981' },   // Green
        { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b' },   // Orange
        { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' },    // Red
        { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#8b5cf6' },   // Purple
        { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#06b6d4' }     // Cyan
    ],

    // AI Generator difficulty badge colors
    DIFFICULTY_COLORS: {
        easy: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
        medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
        hard: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' }
    },

    // With opacity variants (for backgrounds)
    withOpacity: (hex, opacity) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
};

// Simplified audio settings
export const AUDIO = {
    QUESTION_START_FREQ: 800,
    SUCCESS_FREQUENCIES: [523, 659, 784], // C, E, G notes
    WRONG_ANSWER_FREQ: 300,
    STANDARD_DURATION: 0.3,
};

// Essential UI constants
export const UI = {
    ANIMATION_DURATION: 300,
    MOBILE_BREAKPOINT: 768,
    FONT_SCALES: {
        small: 0.9,
        medium: 1.0,
        large: 1.3,
        xlarge: 1.6
    },
    INITIAL_SPLIT_RATIO: 50,
    MAX_STAT_ITEMS: 6,        // Maximum stat items shown in statistics grid
    MAX_NUMERIC_DISPLAY: 6,   // Maximum numeric answers to display in stats
    DEFAULT_TIMER_SECONDS: 30, // Default question timer in seconds
};

export const VALIDATION = {
    MIN_QUESTIONS: 1,
    MAX_QUESTIONS: 100,
    MIN_OPTIONS: 2,
    MAX_OPTIONS: 6,
};

export const DEFAULTS = {
    QUESTION_TIME: 20,
    DIFFICULTY: 'medium',
    QUESTION_TYPE: 'multiple-choice',
};

// AI Generation constants
// Note: Ollama endpoints are configurable via window.QUIZIX_CONFIG for K8s deployments
export const AI = {
    DEFAULT_QUESTION_COUNT: 1,
    DEFAULT_TEMPERATURE: 0.7,

    // API endpoints and models (configurable for K8s/Docker deployments)
    OLLAMA_ENDPOINT: window.QUIZIX_CONFIG?.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate',
    OLLAMA_TAGS_ENDPOINT: window.QUIZIX_CONFIG?.OLLAMA_TAGS_ENDPOINT || 'http://localhost:11434/api/tags',
    OLLAMA_DEFAULT_MODEL: 'llama3.2:latest',
    OPENAI_MODEL: 'gpt-4o-mini',
    GEMINI_MODEL: 'gemini-2.0-flash-001',
    GEMINI_MAX_TOKENS: 2048,

    // Content detection patterns - enhanced for smart formatting
    MATH_INDICATORS: /\$[^$]+\$|\\\(.*?\\\)|\\\[.*?\\\]|\\frac\{|\\sqrt\{|\\sum|\\int|\\lim|\\infty|\\alpha|\\beta|\\gamma|\\theta|\\pi|\\sigma|\\Delta|equation|formula|algebra|calculus|geometry|derivative|integral|matrix|vector|polynomial|logarithm|exponential|trigonometry|quadratic|linear equation|probability|statistics|mean|median|variance|standard deviation/i,

    PROGRAMMING_INDICATORS: /\b(def|function|class|import|from|export|const|let|var|return|if|else|for|while|switch|case|try|catch|async|await|yield)\s+\w+|console\.(log|error|warn)|print\(|System\.out|public\s+static|private\s+|protected\s+|\#include|using\s+namespace|SELECT\s+.*FROM|CREATE\s+TABLE|INSERT\s+INTO|UPDATE\s+.*SET|\.map\(|\.filter\(|\.reduce\(|=>|->|\$\{.*\}|f".*\{|`.*\$\{/i,

    PHYSICS_INDICATORS: /velocity|acceleration|force|energy|momentum|gravity|mass|physics|newton|joule|watt|ampere|volt|ohm|frequency|wavelength|photon|quantum|relativity|thermodynamics|entropy|kinetic|potential|electric|magnetic|electromagnetic|optics|nuclear|particle|wave|oscillation|pendulum|friction|torque|angular|pressure|density|buoyancy|refraction/i,

    // Chemistry - removed ambiguous terms like "solution", "base", "bond", "equilibrium", "concentration"
    // that appear in math/economics/general contexts
    CHEMISTRY_INDICATORS: /molecule|atom|chemical|compound|chemical reaction|chemistry|periodic table|electron shell|proton|neutron|ion|covalent|ionic bond|mole\b|molarity|pH level|\bacid\b|\bbase\b.*\bacid|oxidation|reduction|catalyst|organic chemistry|inorganic|polymer|isotope|valence|orbital|electronegativity|stoichiometry|titration|precipitate|enthalpy|H2O|NaCl|CO2|O2|chemical formula|chemical equation/i,

    BIOLOGY_INDICATORS: /cell|DNA|RNA|protein|enzyme|organism|species|evolution|genetics|chromosome|gene|mutation|mitosis|meiosis|photosynthesis|respiration|metabolism|bacteria|virus|ecosystem|biodiversity|anatomy|physiology|neuron|synapse|hormone|immune|antibody|vaccine|pathogen|tissue|organ/i,

    HISTORY_INDICATORS: /century|ancient|medieval|renaissance|revolution|war|empire|dynasty|civilization|king|queen|emperor|president|treaty|battle|independence|colonial|industrial|world\s+war|cold\s+war|democracy|monarchy|republic|constitution|amendment|civil\s+rights|historical/i,

    ECONOMICS_INDICATORS: /economy|GDP|inflation|deflation|supply|demand|market|trade|investment|stock|bond|currency|fiscal|monetary|budget|tax|tariff|subsidy|unemployment|recession|growth|capitalism|socialism|microeconomics|macroeconomics|equilibrium|elasticity|monopoly|oligopoly/i,

    // File content detection patterns
    EXISTING_QUESTIONS_INDICATORS: /\bquestion\s*\d*\s*[:\.]\s*|\bQ\s*\d+\s*[:\.]\s*|\b(correct\s*answer|right\s*answer|answer\s*key)\s*[:\.]\s*|\boption\s*[A-D]\s*[:\.]\s*|\bchoice\s*\d\s*[:\.]/i,

    // Language-specific code patterns for syntax highlighting hints
    CODE_LANGUAGE_HINTS: {
        python: /\bdef\s+\w+\(|\bimport\s+\w+|\bfrom\s+\w+\s+import|\bclass\s+\w+:|\bif\s+__name__\s*==|\bself\.\w+|\bprint\s*\(/i,
        javascript: /\bconst\s+\w+\s*=|\blet\s+\w+\s*=|\bfunction\s+\w+\s*\(|=>\s*\{|\bconsole\.(log|error|warn)|\basync\s+function|\bawait\s+/i,
        java: /\bpublic\s+(static\s+)?(void|class|int|String)|\bprivate\s+|\bprotected\s+|\bSystem\.out\.print/i,
        sql: /\bSELECT\s+.*\bFROM\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b|\bUPDATE\s+.*\bSET\b|\bDELETE\s+FROM\b|\bJOIN\b.*\bON\b/i,
        cpp: /\#include\s*<|\busing\s+namespace\s+std|\bstd::|\bcout\s*<<|\bcin\s*>>|\bint\s+main\s*\(/i,
        html: /<(!DOCTYPE|html|head|body|div|span|p|a|img|table|form|input|button)\b/i,
        css: /\{[^}]*:\s*[^;]+;[^}]*\}|@media\s+|@keyframes\s+|\.[\w-]+\s*\{|#[\w-]+\s*\{/i,
    }
};

// Animation settings (simplified)
export const ANIMATION = {
    CONFETTI_PARTICLE_COUNT: 80, // Reduced from 100 for better performance
    CONFETTI_BURST_PARTICLES: 35, // Added missing definition, moderate count
    CONFETTI_SPREAD: 70,
    CONFETTI_ORIGIN_Y: 0.1,
    PERCENTAGE_CALCULATION_BASE: 100, // For statistics calculations
};

// API endpoints
export const API = {
    SAVE_QUIZ: 'api/save-quiz',
    LOAD_QUIZZES: 'api/quizzes',
    LOAD_QUIZ: 'api/quiz',
    SAVE_RESULTS: 'api/save-results',
    UPLOAD: 'upload',
    QR_CODE: 'api/qr',
    CLAUDE_GENERATE: 'api/claude/generate',
};

// Socket.IO event names
export const SOCKET_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    HOST_JOIN: 'host-join',
    PLAYER_JOIN: 'player-join',
    START_GAME: 'start-game',
    SUBMIT_ANSWER: 'submit-answer',
    NEXT_QUESTION: 'next-question',
    GAME_CREATED: 'game-created',
    GAME_AVAILABLE: 'game-available',
    GAME_STARTING: 'game-starting',
    QUESTION_START: 'question-start',
    QUESTION_END: 'question-end',
    GAME_END: 'game-end',
    SHOW_NEXT_BUTTON: 'show-next-button',
    HIDE_NEXT_BUTTON: 'hide-next-button',
    PLAYER_RESULT: 'player-result',
    ERROR: 'error',
};