/**
 * @jest-environment jsdom
 */

import {
  initHeaderController,
  syncEditorBreadcrumbTitle,
  setThemeIconState,
  setSoundIconState,
  openOverflowMenu,
  closeOverflowMenu
} from '../../public/js/ui/header-controller.js';

function buildHeaderDom() {
  document.body.innerHTML = `
    <header class="app-header">
      <div class="app-header-inner">
        <div class="app-header-left">
          <a class="brand" href="#"></a>
          <div class="editor-breadcrumb" id="editor-breadcrumb" hidden>
            <span class="editor-breadcrumb-title" id="editor-breadcrumb-title"
                  data-translate="header_untitled_quiz">Untitled quiz</span>
          </div>
        </div>
        <div class="app-header-right">
          <div class="app-header-utilities" id="app-header-utilities">
            <button id="theme-toggle" class="iconbtn" data-icon-state="light"></button>
            <button id="sound-toggle" class="iconbtn" data-icon-state="on"></button>
          </div>
          <button id="utility-overflow-toggle" class="iconbtn hidden"
                  aria-haspopup="true" aria-expanded="false"></button>
        </div>
      </div>
    </header>
    <input id="quiz-title" type="text" value="">
  `;
}

describe('header-controller', () => {
  beforeEach(() => buildHeaderDom());

  describe('syncEditorBreadcrumbTitle', () => {
    test('writes quiz-title input value into breadcrumb', () => {
      document.getElementById('quiz-title').value = 'Matemática 4° medio';
      syncEditorBreadcrumbTitle();
      expect(document.getElementById('editor-breadcrumb-title').textContent)
        .toBe('Matemática 4° medio');
    });

    test('falls back to translated placeholder when empty', () => {
      document.getElementById('quiz-title').value = '   ';
      syncEditorBreadcrumbTitle();
      const el = document.getElementById('editor-breadcrumb-title');
      // Placeholder is the existing textContent (set by i18n elsewhere)
      expect(el.textContent.length).toBeGreaterThan(0);
      expect(el.textContent).not.toBe('   ');
    });
  });

  describe('setThemeIconState', () => {
    test('flips data-icon-state on #theme-toggle', () => {
      setThemeIconState('dark');
      expect(document.getElementById('theme-toggle').dataset.iconState).toBe('dark');
      setThemeIconState('light');
      expect(document.getElementById('theme-toggle').dataset.iconState).toBe('light');
    });
  });

  describe('setSoundIconState', () => {
    test('flips data-icon-state on #sound-toggle', () => {
      setSoundIconState('off');
      expect(document.getElementById('sound-toggle').dataset.iconState).toBe('off');
    });
  });

  describe('overflow menu', () => {
    test('openOverflowMenu adds .overflow-open on header and sets aria-expanded', () => {
      openOverflowMenu();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      expect(document.getElementById('utility-overflow-toggle').getAttribute('aria-expanded')).toBe('true');
    });

    test('closeOverflowMenu removes the class and flips aria-expanded', () => {
      openOverflowMenu();
      closeOverflowMenu();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
      expect(document.getElementById('utility-overflow-toggle').getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('initHeaderController', () => {
    test('binds toggle click to open/close overflow', () => {
      initHeaderController();
      const btn = document.getElementById('utility-overflow-toggle');
      btn.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      btn.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('outside click closes an open menu', () => {
      initHeaderController();
      document.getElementById('utility-overflow-toggle').click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      document.body.click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('Escape key closes an open menu', () => {
      initHeaderController();
      document.getElementById('utility-overflow-toggle').click();
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.app-header').classList.contains('overflow-open')).toBe(false);
    });

    test('typing in #quiz-title live-updates the breadcrumb', () => {
      initHeaderController();
      const input = document.getElementById('quiz-title');
      input.value = 'Física I';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.getElementById('editor-breadcrumb-title').textContent).toBe('Física I');
    });
  });
});
