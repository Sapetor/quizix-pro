/**
 * @jest-environment jsdom
 *
 * Characterization tests for StatisticsManager (extracted from game-manager.js).
 * Pins the percentage math and stat-bar DOM output so the mechanical move is honest.
 */

import { StatisticsManager } from '../../public/js/game/modules/statistics-manager.js';
import { dom } from '../../public/js/utils/dom.js';

/** Minimal host stats grid: N stat items, each with id-bearing count/fill children. */
function buildHostStatsDom(optionCount = 4) {
  let items = '';
  for (let i = 0; i < optionCount; i++) {
    items += `
      <div class="stat-item" id="stat-item-${i}">
        <span class="option-label"></span>
        <span class="stat-count" id="stat-count-${i}">0</span>
        <span class="stat-fill" id="stat-fill-${i}" style="width:0%"></span>
      </div>`;
  }
  document.body.innerHTML = `
    <div id="answer-statistics" class="hidden">
      <span id="responses-count">0</span>
      <span id="total-players">0</span>
      <span id="host-header-total">0</span>
      <span id="disconnected-indicator" class="hidden"></span>
      <div id="stats-grid">${items}</div>
    </div>
    <div id="answer-options"></div>`;
}

function hostStateManager() {
  return { getGameState: () => ({ isHost: true }) };
}

describe('StatisticsManager', () => {
  beforeEach(() => {
    dom.clearCache();
    document.body.innerHTML = '';
  });

  describe('updateStatItem (percentage + stat bar)', () => {
    test('computes fill width as count/total * 100 and mirrors onto option tile', () => {
      document.body.innerHTML = `
        <span id="stat-count-0">0</span>
        <span id="stat-fill-0" style="width:0%"></span>
        <div id="answer-options">
          <div class="option-display" data-option="0"></div>
        </div>`;
      const sm = new StatisticsManager(hostStateManager());

      sm.updateStatItem(0, 2, 4);

      expect(document.getElementById('stat-count-0').textContent).toBe('2');
      expect(document.getElementById('stat-fill-0').style.width).toBe('50%');

      const tile = document.querySelector('.option-display[data-option="0"]');
      expect(tile.getAttribute('data-pct')).toBe('50');
      expect(tile.getAttribute('data-count')).toBe('2');
    });

    test('zero answered yields 0% width, no divide-by-zero', () => {
      document.body.innerHTML = `
        <span id="stat-count-0">0</span>
        <span id="stat-fill-0" style="width:9%"></span>`;
      const sm = new StatisticsManager(hostStateManager());

      sm.updateStatItem(0, 0, 0);

      expect(document.getElementById('stat-fill-0').style.width).toBe('0%');
    });
  });

  describe('createNumericStatisticsDisplay', () => {
    test('renders bars ordered by count with rounded percentages', () => {
      document.body.innerHTML = '<div id="stats-grid"></div>';
      const sm = new StatisticsManager(hostStateManager());

      // total = 4; "10" -> 75%, "20" -> 25%
      sm.createNumericStatisticsDisplay({ '10': 3, '20': 1 }, ['10', '20']);

      const display = document.getElementById('numeric-stats-display');
      expect(display).not.toBeNull();

      const bars = display.querySelectorAll('.answer-bar');
      expect(bars.length).toBe(2);
      // Sorted by count desc: "10" (75%) first
      expect(bars[0].style.width).toBe('75%');
      expect(bars[1].style.width).toBe('25%');

      const counts = [...display.querySelectorAll('.answer-count')].map(n => n.textContent);
      expect(counts).toEqual(['3', '1']);
    });

    test('empty answer set shows a no-answers placeholder', () => {
      document.body.innerHTML = '<div id="stats-grid"></div>';
      const sm = new StatisticsManager(hostStateManager());

      sm.createNumericStatisticsDisplay({}, []);

      const display = document.getElementById('numeric-stats-display');
      expect(display.querySelector('.no-answers')).not.toBeNull();
    });
  });

  describe('updateAnswerStatistics (multiple-choice distribution)', () => {
    test('writes response totals and per-option fills for a known distribution', () => {
      buildHostStatsDom(4);
      const sm = new StatisticsManager(hostStateManager());

      sm.updateAnswerStatistics({
        questionType: 'multiple-choice',
        optionCount: 4,
        answeredPlayers: 4,
        totalPlayers: 5,
        answerCounts: { 0: 2, 1: 1, 2: 1, 3: 0 }
      });

      expect(document.getElementById('responses-count').textContent).toBe('4');
      expect(document.getElementById('total-players').textContent).toBe('5');

      expect(document.getElementById('stat-count-0').textContent).toBe('2');
      expect(document.getElementById('stat-fill-0').style.width).toBe('50%');
      expect(document.getElementById('stat-fill-1').style.width).toBe('25%');
      expect(document.getElementById('stat-fill-3').style.width).toBe('0%');

      // Container revealed (counting-only removed, hidden removed)
      const container = document.getElementById('answer-statistics');
      expect(container.classList.contains('hidden')).toBe(false);
      expect(container.classList.contains('counting-only')).toBe(false);
    });

    test('ignores updates when not host', () => {
      buildHostStatsDom(4);
      const sm = new StatisticsManager({ getGameState: () => ({ isHost: false }) });

      sm.updateAnswerStatistics({
        questionType: 'multiple-choice',
        optionCount: 4,
        answeredPlayers: 4,
        answerCounts: { 0: 2, 1: 1, 2: 1, 3: 0 }
      });

      expect(document.getElementById('responses-count').textContent).toBe('0');
    });
  });

  describe('hideAnswerStatistics', () => {
    test('hides the container and clears counting-only', () => {
      document.body.innerHTML =
        '<div id="answer-statistics" class="counting-only"></div>';
      const sm = new StatisticsManager(hostStateManager());

      sm.hideAnswerStatistics();

      const container = document.getElementById('answer-statistics');
      expect(container.classList.contains('hidden')).toBe(true);
      expect(container.classList.contains('counting-only')).toBe(false);
    });
  });
});
