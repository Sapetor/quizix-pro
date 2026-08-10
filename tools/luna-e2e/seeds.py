"""Per-flow data seeding, keyed by flow id. Runs after the base seed
(base seed = one playable quiz 'E2E Test Quiz' + user 'lunatester')."""

LATEX_QUIZ = [
    {"question": "Inline math: what is \\(a^2 + b^2\\) for a right triangle's legs?",
     "type": "multiple-choice",
     "options": ["\\(c^2\\)", "\\(2ab\\)", "\\(a+b\\)", "\\(c\\)"],
     "correctAnswer": 0, "difficulty": "easy", "timeLimit": 90,
     "explanation": "Pythagoras: $$a^2 + b^2 = c^2$$"},
    {"question": "Display math: $$\\int_0^1 x^2\\,dx = \\; ?$$",
     "type": "multiple-choice",
     "options": ["1/3", "1/2", "1", "2/3"],
     "correctAnswer": 0, "difficulty": "medium", "timeLimit": 90,
     "explanation": "The antiderivative is x^3/3."},
    {"question": "Edge cases render literally: 3 * 4 * 5 = 60, snake_case_name, a\\* literal asterisk, and <b>angle brackets</b>.",
     "type": "true-false", "options": ["True", "False"],
     "correctAnswer": "true", "difficulty": "easy", "timeLimit": 90,
     "explanation": "None of this should be eaten by a renderer."},
]

SEEDED_RESULTS = {
    "quizTitle": "Seeded History Game",
    "gamePin": "424242",
    # answers use the live-game record shape (services/game.js): option
    # INDEX in `answer`, plus isCorrect/points/timeMs. true-false stores a
    # boolean answer. Analytics normalizes via answer-format.js.
    "results": [
        {"name": "Alice", "score": 1850,
         "answers": [{"answer": 1, "isCorrect": True, "points": 950, "timeMs": 3200},
                     {"answer": False, "isCorrect": False, "points": 0, "timeMs": 7800},
                     {"answer": 1, "isCorrect": True, "points": 900, "timeMs": 4000}]},
        {"name": "Bob", "score": 900,
         "answers": [{"answer": 0, "isCorrect": False, "points": 0, "timeMs": 9100},
                     {"answer": True, "isCorrect": True, "points": 900, "timeMs": 5500},
                     {"answer": 0, "isCorrect": False, "points": 0, "timeMs": 2200}]},
    ],
    "startTime": "2026-08-01T10:00:00.000Z",
    "endTime": "2026-08-01T10:12:00.000Z",
    "questions": [
        {"questionNumber": 1, "text": "Capital of France?",
         "type": "multiple-choice",
         "options": ["London", "Paris", "Berlin", "Madrid"],
         "correctAnswer": 1, "difficulty": "easy", "timeLimit": 30},
        {"questionNumber": 2, "text": "2 + 2 = 4",
         "type": "true-false", "options": ["True", "False"],
         "correctAnswer": "true", "difficulty": "easy", "timeLimit": 30},
        {"questionNumber": 3, "text": "Largest planet?",
         "type": "multiple-choice",
         "options": ["Earth", "Jupiter", "Mars", "Venus"],
         "correctAnswer": 1, "difficulty": "easy", "timeLimit": 30},
    ],
}

EXTRA_QUIZ = [
    {"question": "Placeholder question one?", "type": "multiple-choice",
     "options": ["A", "B", "C", "D"], "correctAnswer": 0,
     "difficulty": "easy", "timeLimit": 30},
]


def seed_render_audit(app, cfg, flow_dir):
    app.save_quiz("LaTeX Render Quiz", LATEX_QUIZ)


def seed_results_analytics(app, cfg, flow_dir):
    app.save_results(SEEDED_RESULTS)


def seed_quiz_management(app, cfg, flow_dir):
    app.save_quiz("Disposable Quiz Alpha", EXTRA_QUIZ)
    app.save_quiz("Disposable Quiz Beta", EXTRA_QUIZ)


SEEDS = {
    "render-audit": seed_render_audit,
    "results-analytics": seed_results_analytics,
    "quiz-management": seed_quiz_management,
}
