# Translation Missing Keys Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all missing translation keys across 9 language files so no user sees raw key names.

**Architecture:** Each language file (`public/js/utils/translations/*.js`) gets missing keys appended before the closing `};`. Keys are grouped by feature area with comments. One task per language file for parallel execution.

**Tech Stack:** Plain JS ES6 modules, no build step needed for translation files.

---

## Summary of Gaps

| Category | Count | Description |
|---|---|---|
| en.js-only keys | 85 | Added to en.js but never propagated to other 8 languages |
| Code-only keys | 13 | Used in JS code but missing from ALL translation files |
| Cross-language gaps | 9 | Keys in es.js but missing from specific languages |
| Orphan keys | 4 | Keys in language files but unused in code |
| **Total unique keys to add** | **~98 per language** | |

## Master Key Reference (English values)

All keys below exist in en.js (lines 975, 1177-1298) or need to be created. This is the canonical list — every language file must contain all of these.

### Group A: Results Viewer (20 keys)
```
results_viewer_not_available: 'Results viewer not available'
results_refreshed_success: 'Results refreshed successfully'
results_failed_load_detailed: 'Failed to load detailed data for analytics. Please try again.'
results_no_player_data_analytics: 'No player response data available for analytics.'
results_failed_generate_analytics_detail: 'Failed to generate analytics. Please check the console for details.'
results_failed_export_pdf: 'Failed to export PDF'
results_failed_export_excel: 'Failed to export Excel'
results_no_multi_sessions: 'No quizzes with multiple sessions found. Run a quiz multiple times to compare results.'
results_select_at_least_2: 'Please select at least 2 sessions to compare'
results_select_max_5: 'Please select no more than 5 sessions for clarity'
results_not_enough_comparison: 'Could not load enough session data for comparison'
results_failed_comparison_data: 'Could not generate comparison data'
results_failed_comparison: 'Failed to generate comparison'
results_title_suffix: 'Results'
results_no_results_title: 'No Results Found'
results_no_results_message: 'No quiz results match your search criteria.'
results_no_participants_title: 'No Participants'
results_no_participants_message: 'No participant data available for this quiz.'
results_participant_results_header: 'Participant Results'
results_select_export_format: 'Select Export Format'
results_choose_download_format: "Choose how you'd like to download the results:"
results_swipe: 'swipe'
```

### Group B: Analytics (21 keys)
```
analytics_quiz_title: 'Quiz Analytics'
analytics_questions_need_review: 'Questions Need Review'
analytics_click_hint: 'Click a question for detailed breakdown'
analytics_content_review_title: 'Content Review Recommendations'
analytics_no_major_issues: 'No major issues detected. All questions performing well!'
analytics_performance_insights_title: 'Performance Insights'
analytics_quiz_needs_review: 'Quiz needs review'
analytics_may_need_improvement: 'may need improvement'
analytics_question_num_details: 'Question {0} Details'
analytics_all_answers_correct: 'All answers were correct!'
analytics_mastered_label: 'Mastered (80%+)'
analytics_proficient_label: 'Proficient (60-79%)'
analytics_developing_label: 'Developing (40-59%)'
analytics_needs_work_label: 'Needs Work (<40%)'
analytics_show_suggestions: 'Show suggestions'
analytics_study_suggestions: 'Study Suggestions'
analytics_focus_areas: 'Focus Areas'
analytics_strong_areas: 'Strong Areas'
analytics_study_suggestion: 'Study Suggestion'
ai_question_updated: 'Question updated'
```

### Group C: Charts (16 keys)
```
chart_success_rate_by_question: 'Success Rate by Question'
chart_time_vs_success: 'Time vs Success Rate (Red = Problematic)'
chart_avg_time_seconds: 'Average Time (seconds)'
chart_success_rate_pct: 'Success Rate (%)'
chart_numeric_answer_dist: 'Numeric Answer Distribution'
chart_number_of_answers: 'Number of Answers'
chart_answer_range: 'Answer Range'
chart_option_selection_dist: 'Option Selection Distribution'
chart_correct_option: 'Correct Option'
chart_incorrect_option: 'Incorrect Option'
chart_selection_rate: 'Selection Rate (%)'
chart_success_rate_comparison: 'Success Rate Comparison Across Sessions'
chart_session_date: 'Session Date'
chart_overall_average: 'Overall Average'
chart_concept_mastery_levels: 'Concept Mastery Levels'
chart_contains_correct: '(Contains correct answer)'
```

### Group D: Export/PDF/Excel (27 keys)
```
export_most_challenging: 'Most Challenging Question'
export_easiest_question: 'Easiest Question'
export_question_by_question: 'Question-by-Question Analysis'
export_question_text_not_available: 'Question text not available'
export_more_questions_csv: '... and {0} more questions (see CSV export for full data)'
export_page_of: 'Page {0} of {1}'
export_excel_not_loaded: 'Excel export library not loaded. Please refresh and try again.'
export_pdf_downloaded: 'PDF report downloaded: {0}'
export_excel_downloaded: 'Excel report downloaded: {0}'
export_failed_pdf: 'Failed to generate PDF report'
export_failed_excel: 'Failed to generate Excel report'
export_failed_analytics: 'Failed to export analytics report'
export_failed_download: 'Failed to download result'
export_comparison_downloaded: 'Comparison report downloaded: {0}'
export_failed_comparison: 'Failed to generate comparison report'
export_yes: 'Yes'
export_no: 'No'
export_question_analysis: 'Question Analysis'
export_wrong_answers_sheet: 'Wrong Answers'
export_players_sheet: 'Players'
export_summary_sheet: 'Summary'
export_questions_sheet: 'Questions'
export_avg_participants: 'Average Participants'
export_improving: 'Improving'
export_declining: 'Declining'
export_stable: 'Stable'
export_session_details: 'Session Details'
export_question_trends: 'Question Performance Trends'
export_session_label: 'Session {0}'
export_question_num_header: 'Question #'
export_question_text_header: 'Question Text'
```

### Group E: Comparison (4 keys)
```
compare_sessions_title: 'Sessions'
compare_trend_direction: '{0} ({1})'
```

### Group F: Reconnection (3 keys — in en.js)
```
reconnected_successfully: 'Reconnected!'
rejoin_failed: 'Could not rejoin the game'
```

### Group G: Code-only keys (13 keys — missing from ALL files)
```
host_disconnected_waiting: 'Host disconnected. Waiting for reconnection...'
host_preparing_new_game: 'Host is preparing a new game...'
host_reconnected: 'Host reconnected!'
rejoin_timeout: 'Reconnection timed out. Please join a new game.'
auth_check_failed: 'Unable to verify permissions. Please try again.'
failed_export_quiz: 'Failed to export quiz'
failed_import_quiz: 'Failed to import quiz'
invalid_correct_answer: 'Please select a correct answer'
invalid_numeric_answer: 'Please enter a valid numeric answer'
invalid_quiz_format: 'Invalid quiz file format'
quiz_exported_successfully: 'Quiz exported successfully'
quiz_imported_successfully: 'Quiz imported successfully'
select_at_least_one_correct: 'Please select at least one correct answer'
```

### Group H: Cross-language gaps (keys already in es.js, missing from specific languages)
```
quick_start: (missing from pl, fr, de, it, pt, ja, zh)
quick_start_hint: (missing from pl, fr, de, it, pt, ja, zh)
quick_start_select: (missing from pl, fr, de, it, pt, ja, zh)
add_question_preview: (missing from pl only)
enter_question_preview: (missing from pl only)
select_question_preview: (missing from pl only)
click_to_copy: (missing from it, zh)
```

---

## Task 1: Add missing keys to en.js

**Files:**
- Modify: `public/js/utils/translations/en.js`

- [ ] **Step 1: Add Group G keys before closing `};`**

Insert before the last line (`};`) of en.js, after `return_to_menu`:

```javascript
    // Host reconnection messages
    host_disconnected_waiting: 'Host disconnected. Waiting for reconnection...',
    host_preparing_new_game: 'Host is preparing a new game...',
    host_reconnected: 'Host reconnected!',
    rejoin_timeout: 'Reconnection timed out. Please join a new game.',

    // Validation messages
    auth_check_failed: 'Unable to verify permissions. Please try again.',
    invalid_correct_answer: 'Please select a correct answer',
    invalid_numeric_answer: 'Please enter a valid numeric answer',
    invalid_quiz_format: 'Invalid quiz file format',
    select_at_least_one_correct: 'Please select at least one correct answer',

    // Import/Export messages
    failed_export_quiz: 'Failed to export quiz',
    failed_import_quiz: 'Failed to import quiz',
    quiz_exported_successfully: 'Quiz exported successfully',
    quiz_imported_successfully: 'Quiz imported successfully',
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c public/js/utils/translations/en.js`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add public/js/utils/translations/en.js
git commit -m "fix(i18n): add 13 missing translation keys to en.js"
```

---

## Task 2: Add missing keys to es.js

**Files:**
- Modify: `public/js/utils/translations/es.js`

- [ ] **Step 1: Add all missing keys (Groups A-G) before closing `};`**

Insert before the last line (`};`) of es.js. The exact Spanish translations for all ~98 keys must be provided. Reference en.js for the English values and translate each one to Spanish.

Key groups to add:
- Group A: Results Viewer (22 keys)
- Group B: Analytics (21 keys)
- Group C: Charts (16 keys)
- Group D: Export (31 keys)
- Group E: Comparison (2 keys)
- Group F: Reconnection (2 keys — `reconnected_successfully`, `rejoin_failed`)
- Group G: Code-only (13 keys)

- [ ] **Step 2: Remove orphan keys**

Remove `Features` and `Quiz` (PascalCase) if they exist — these are unused legacy keys.

- [ ] **Step 3: Verify no syntax errors**

Run: `node -c public/js/utils/translations/es.js`

- [ ] **Step 4: Commit**

```bash
git add public/js/utils/translations/es.js
git commit -m "fix(i18n): add 98 missing translation keys to es.js"
```

---

## Tasks 3-9: Add missing keys to pl.js, fr.js, de.js, it.js, pt.js, ja.js, zh.js

**One task per language file. All 7 can run in parallel.**

For each language file:

**Files:**
- Modify: `public/js/utils/translations/{lang}.js`

- [ ] **Step 1: Add all missing keys before closing `};`**

Each file needs:
- Groups A-G (same as es.js — ~98 keys)
- Group H cross-language gaps specific to that language:
  - ALL 7 languages: `quick_start`, `quick_start_hint`, `quick_start_select`
  - pl only: `add_question_preview`, `enter_question_preview`, `select_question_preview`
  - it, zh only: `click_to_copy`

Translate all values from English to the target language. Keep `{0}`, `{1}` parameter placeholders as-is. Keep technical terms (PDF, Excel, CSV, PIN) untranslated.

- [ ] **Step 2: Remove orphan keys**

Remove `incorrect` and `submitted` keys if present (unused legacy).
Remove `Features` and `Quiz` (PascalCase) if present.

- [ ] **Step 3: Verify no syntax errors**

Run: `node -c public/js/utils/translations/{lang}.js`

- [ ] **Step 4: Commit**

```bash
git add public/js/utils/translations/{lang}.js
git commit -m "fix(i18n): add missing translation keys to {lang}.js"
```

---

## Task 10: Verification

- [ ] **Step 1: Extract and compare all keys**

Run a bash script that extracts all keys from each file and diffs against en.js:

```bash
for f in public/js/utils/translations/*.js; do
  echo "=== $(basename $f) ==="
  grep -oP '^\s+(\w+):' "$f" | sed 's/^\s*//' | sed 's/:$//' | sort > /tmp/keys_$(basename $f .js).txt
done
for lang in es pl fr de it pt ja zh; do
  diff /tmp/keys_en.txt /tmp/keys_$lang.txt
done
```

Expected: No differences (all files have identical key sets).

- [ ] **Step 2: Syntax check all files**

```bash
for f in public/js/utils/translations/*.js; do
  node -c "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: All OK.

- [ ] **Step 3: Final commit if any fixes needed**

---

## Parallel Execution Strategy

```
Task 1 (en.js) ──┐
                  ├── Tasks 3-9 (pl/fr/de/it/pt/ja/zh) ── Task 10 (verify)
Task 2 (es.js) ──┘
```

Tasks 1 and 2 must complete first (they establish the canonical key set). Tasks 3-9 can all run in parallel. Task 10 runs after all others complete.
