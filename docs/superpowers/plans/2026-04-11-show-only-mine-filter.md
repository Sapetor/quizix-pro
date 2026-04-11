# "Show Only My Quizzes" Filter — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user is logged in, default the quiz editor's file browser to showing only quizzes they own. Let them untick a toggle to also see the public pool when they need to.

**Scope:** Client-side only. Backend already returns `{owned: bool, ownerId, visibility}` on every quiz node in `/api/quiz-tree`, so no server changes needed.

**Tech stack:** Plain JS ES6 modules, existing `FolderTree` component, existing translation manager, existing CSS bundle.

---

## Context

After the optional-accounts feature shipped (2026-04-10), a logged-in user sees the same mixed list of public/legacy quizzes plus their own private ones. The ask: when logged in, the editor should feel like "My Quizzes" — just your own — with an opt-in to browse the public pool.

Backend already emits per-quiz `owned: true/false` in the tree and flat list responses. The filter lives entirely in the browser.

## Design

**A single checkbox** mounted above the folder tree with label `"Show only my quizzes"`:

- **Default state:** checked when `authManager.isAuthenticated`, unchecked when anonymous.
- **Persistence:** `localStorage['file-manager-show-only-mine']` — scoped to the browser, not the account. Simple and matches other UI prefs in this codebase (see `storage-utils.js`).
- **Anonymous behavior:** checkbox is hidden entirely (nothing to filter).
- **Live update:** on `auth-changed` event, re-evaluate whether to show the checkbox and re-render the tree.
- **Apply:** filter happens inside `FolderTree.render()` via a new `filterPredicate` option, not in the data layer. Pruning rules mirror the backend's `getTreeStructure`: drop quizzes that don't match, drop folders whose entire visible subtree is empty.

---

## Files to change

| File | Type | Change |
|---|---|---|
| `public/js/ui/components/folder-tree.js` | modify | Add `filterPredicate` option. Apply in `renderQuizzesIn(folderId)` and `buildFolderTree(parentId)` with empty-folder pruning. |
| `public/js/ui/file-manager.js` | modify | Own the filter state. Build the checkbox in `initTree`. Pass `filterPredicate` to FolderTree. Re-render on toggle and on `auth-changed`. |
| `public/index.html` | modify | Mount point `<div id="quiz-tree-filter-bar"></div>` above the folder tree container. Location: wherever the file manager tree is currently anchored. |
| `public/css/file-manager.css` | modify | Small style block for the toggle bar (label, checkbox, spacing). Keep it theme-aware. |
| `public/js/utils/translations/{de,en,es,fr,it,ja,pl,pt,zh}.js` | modify | Add 2 keys: `filter_show_only_mine`, `filter_show_only_mine_tooltip`. |
| `public/sw.js` | modify | Bump `CACHE_VERSION` to `v20260411-show-only-mine`. |

No new files.

---

## Implementation Steps

### Step 1 — Add `filterPredicate` to FolderTree

- [ ] In `public/js/ui/components/folder-tree.js`, extend `constructor(container, options)` to accept `filterPredicate: options.filterPredicate || null`.
- [ ] In `render()` / `buildFolderTree(parentId)`, wrap the quiz-entry mapping in a filter:
  ```js
  const quizzes = this.treeData.quizzes.filter(q => q.folderId === parentId);
  const visibleQuizzes = this.options.filterPredicate
      ? quizzes.filter(this.options.filterPredicate)
      : quizzes;
  ```
- [ ] After recursing into child folders, prune any folder whose `.quizzes.length === 0 && .children.length === 0`. Match the backend's `getTreeStructure` pruning logic (services/metadata-service.js: `_quizVisibleTo` + empty-folder filter).
- [ ] Add a `setFilterPredicate(predicate)` method that stores the new predicate and calls `this.render()`.

### Step 2 — FileManager owns the filter state

- [ ] In `public/js/ui/file-manager.js` constructor, read initial state:
  ```js
  import { getItem, setItem } from '../utils/storage-utils.js';
  import { authManager } from '../utils/auth-manager.js';
  this.showOnlyMine = getItem('file-manager-show-only-mine', null);
  // If never set, default to true when authenticated, false otherwise.
  if (this.showOnlyMine === null) {
      this.showOnlyMine = authManager.isAuthenticated;
  } else {
      this.showOnlyMine = this.showOnlyMine === 'true' || this.showOnlyMine === true;
  }
  ```
- [ ] Compute a predicate:
  ```js
  _getFilterPredicate() {
      if (!authManager.isAuthenticated) return null;      // anon: no filter
      if (!this.showOnlyMine) return null;                 // toggled off: no filter
      return (quiz) => quiz.owned === true;
  }
  ```
- [ ] In `initTree(container)`, after constructing `FolderTree`, pass `filterPredicate: () => this._getFilterPredicate()?.apply(null, arguments) ?? true` (simpler: pass `this._getFilterPredicate()` directly and call `setFilterPredicate` whenever state changes).
- [ ] Build and mount the toggle bar (see Step 3) inside `initTree` before rendering the tree.
- [ ] On `auth-changed` event, recompute default state (if user never manually toggled) and call `this.folderTree.setFilterPredicate(this._getFilterPredicate())`.

### Step 3 — Build the toggle bar

- [ ] In `initTree`, before attaching the folder tree, create a bar element:
  ```js
  const bar = document.createElement('div');
  bar.id = 'file-manager-filter-bar';
  bar.className = 'file-manager-filter-bar';
  bar.innerHTML = `
    <label class="file-manager-filter-toggle">
      <input type="checkbox" id="file-manager-show-only-mine">
      <span data-translate="filter_show_only_mine">Show only my quizzes</span>
    </label>
  `;
  // Insert bar as the first child of the tree container
  container.parentElement.insertBefore(bar, container);
  ```
- [ ] Wire the change event:
  ```js
  const checkbox = bar.querySelector('#file-manager-show-only-mine');
  checkbox.checked = this.showOnlyMine;
  bar.classList.toggle('hidden', !authManager.isAuthenticated);
  checkbox.addEventListener('change', () => {
      this.showOnlyMine = checkbox.checked;
      setItem('file-manager-show-only-mine', String(this.showOnlyMine));
      this.folderTree.setFilterPredicate(this._getFilterPredicate());
  });
  ```
- [ ] On `auth-changed` also toggle bar visibility:
  ```js
  window.addEventListener('auth-changed', () => {
      bar.classList.toggle('hidden', !authManager.isAuthenticated);
      // … existing tree refresh code
  });
  ```
- [ ] Make sure `translationManager.translateContainer(bar)` runs after mount so the label uses the current language.

### Step 4 — Style the toggle bar

- [ ] In `public/css/file-manager.css`, add:
  ```css
  .file-manager-filter-bar {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.08));
      background: var(--bg-secondary, transparent);
  }
  .file-manager-filter-bar.hidden { display: none !important; }
  .file-manager-filter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--text-secondary, #666);
      user-select: none;
  }
  .file-manager-filter-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: var(--accent-color, #2563eb);
  }
  :not([data-theme="light"]) .file-manager-filter-bar {
      border-bottom-color: rgba(255,255,255,0.08);
  }
  ```
- [ ] Run `npm run build` to regenerate `public/css/main.bundle.css`.

### Step 5 — Translation keys

Add these two keys to **all 9** translation files at `public/js/utils/translations/*.js`:

- [ ] **en.js**
  ```
  filter_show_only_mine: 'Show only my quizzes',
  filter_show_only_mine_tooltip: 'Only show quizzes you created. Uncheck to also see public quizzes.',
  ```
- [ ] **es.js**
  ```
  filter_show_only_mine: 'Mostrar solo los míos',
  filter_show_only_mine_tooltip: 'Mostrar solo los cuestionarios que creaste. Desmarca para ver también los públicos.',
  ```
- [ ] **fr.js**
  ```
  filter_show_only_mine: 'Afficher uniquement les miens',
  filter_show_only_mine_tooltip: 'Afficher uniquement les quiz que vous avez créés. Décochez pour voir aussi les quiz publics.',
  ```
- [ ] **de.js**
  ```
  filter_show_only_mine: 'Nur meine anzeigen',
  filter_show_only_mine_tooltip: 'Nur von dir erstellte Quizze anzeigen. Deaktivieren, um auch öffentliche Quizze zu sehen.',
  ```
- [ ] **it.js**
  ```
  filter_show_only_mine: 'Mostra solo i miei',
  filter_show_only_mine_tooltip: 'Mostra solo i quiz che hai creato. Deseleziona per vedere anche i quiz pubblici.',
  ```
- [ ] **pt.js**
  ```
  filter_show_only_mine: 'Mostrar apenas os meus',
  filter_show_only_mine_tooltip: 'Mostrar apenas os quizzes que criou. Desmarque para ver também os quizzes públicos.',
  ```
- [ ] **pl.js**
  ```
  filter_show_only_mine: 'Pokaż tylko moje',
  filter_show_only_mine_tooltip: 'Pokaż tylko quizy, które utworzyłeś. Odznacz, aby zobaczyć również publiczne.',
  ```
- [ ] **ja.js**
  ```
  filter_show_only_mine: '自分のクイズのみ表示',
  filter_show_only_mine_tooltip: '自分が作成したクイズのみを表示します。チェックを外すと公開クイズも表示されます。',
  ```
- [ ] **zh.js**
  ```
  filter_show_only_mine: '仅显示我的',
  filter_show_only_mine_tooltip: '仅显示您创建的测验。取消勾选以同时查看公开测验。',
  ```

### Step 6 — Cache bust and verify

- [ ] Bump `CACHE_VERSION` in `public/sw.js`:
  ```js
  const CACHE_VERSION = 'v20260411-show-only-mine';
  ```
- [ ] Run `npm run build` to regenerate the CSS bundle.
- [ ] Run `npm test` — all 559 existing tests must still pass. No new tests required.
- [ ] Manual smoke test:
  - [ ] Start server: `PORT=3000 npm start`
  - [ ] Open http://localhost:3000/, confirm file browser shows all legacy quizzes (anonymous — toggle is hidden).
  - [ ] Log in as an existing account; confirm checkbox appears, is **checked by default**, and the tree shows only your private/public quizzes.
  - [ ] Uncheck the box; public/legacy quizzes reappear.
  - [ ] Re-check the box; they disappear again.
  - [ ] Reload the page; checkbox state persists (localStorage).
  - [ ] Log out; checkbox hides, tree shows all public/legacy quizzes again.
  - [ ] Log back in; state persists from your last choice.
  - [ ] Test language switch — the checkbox label translates correctly.

---

## Gotchas

1. **Empty-folder pruning parity.** When the filter hides every quiz inside a folder, that folder must also hide (otherwise you see empty folder shells). The backend already does this in `getTreeStructure`; do the same in `FolderTree.buildFolderTree` after the filter runs. Recursive: a folder is kept iff `visibleQuizzes.length > 0 || children.some(c => keptAfterPrune)`.
2. **Default state only applies when unset.** If the user explicitly unchecks the box, that choice must persist even after logging out and back in. Check `localStorage` first; only fall back to "default on when logged in" if the key is absent. (`getItem('file-manager-show-only-mine', null)` returns `null` when unset.)
3. **Legacy quizzes are not owned.** Even when you're logged in, legacy quizzes have `owned: false`. The filter correctly hides them. If the user ever assigns legacy quizzes to their account (not in scope), that's a separate flow.
4. **Service worker cache.** Forgetting to bump `CACHE_VERSION` means returning users won't see the new JS/CSS. CLAUDE.md calls this out explicitly — it's the #1 reason "my change isn't showing up" in this repo.
5. **Don't filter on the backend.** Resist the temptation to change `getTreeStructure(userId)` to filter out public quizzes when the user is logged in — that would break quick-start hosting of legacy quizzes and the "toggle off to see public" path. Keep all filtering client-side.
6. **Don't forget `data-translate-title` on the checkbox wrapper** if you want the tooltip to translate — apply `title` via `data-translate-title="filter_show_only_mine_tooltip"` on the `<label>` element.

---

## Out of Scope

- Server-side filtering (keep as-is; filter is cosmetic).
- Per-account preference persistence (localStorage only; switching browsers resets).
- A filter dropdown with multiple modes (just the one checkbox).
- Hiding the public pool from quick-start host dialog or from play-by-PIN flow.
- Any change to `/api/quizzes` or `/api/quiz-tree` response shape.

---

## Rollback

Delete the new translation keys, remove the checkbox and `filterPredicate` option, bump `CACHE_VERSION` again. No database or file-format migrations to undo.
