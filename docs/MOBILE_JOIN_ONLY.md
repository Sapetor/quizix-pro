# Mobile: Join-and-Play Only

**Status:** current as of 2026-08-02 (branch `feat/mobile-join-only`).
**Scope decision:** phones are for *participating* in quizzes. Authoring and
hosting are desktop-only **for now**. A purpose-built mobile editor/hosting
experience may be designed later — this document exists so that work does not
have to reverse-engineer the gate. See [Re-enabling hosting on
mobile](#re-enabling-hosting-on-mobile).

This is a **product scope decision, not a capability judgement**: the previous
mobile editor (a floating action button plus a bottom sheet) was removed because
it was a cramped port of the desktop editor, not because phones cannot host.

---

## What a phone user can do

| Surface | On a phone |
|---|---|
| Landing page | Join-first: PIN card above the fold |
| Join screen, lobby, gameplay, results | Full experience |
| Quiz editor (`host-screen`) | **Unreachable** — redirects to the join screen |
| Host controls (`#host-btn`, `#quick-start-btn`, footer/outro host CTAs) | Hidden |
| Editor chrome (`#horizontal-toolbar`, `#editor-breadcrumb`, `#start-hosting-header-small`) | Hidden |
| Onboarding tutorial | Skipped (its steps walk through the editor) |

Non-host header chrome — theme, sound, font size, fullscreen, language, user
chip — is deliberately untouched.

---

## How the gate works

Two predicates exist and **must not be conflated**:

```js
// public/js/utils/dom.js
isMobile()  // innerWidth <= 768          -> LAYOUT code only
isPhone()   // matchMedia('(pointer: coarse) and (max-width: 768px)')  -> THE GATE only
```

`public/css/mobile-gate.css` contains exactly one media query, byte-identical to
`isPhone()`. Because both sides ask the same question the same way, the CSS gate
and the JS gate cannot disagree.

### Why `pointer: coarse` is load-bearing

A width-only gate strips the editor from a **mouse-driven desktop**: 200% browser
zoom on a 1366px display reports `innerWidth` 683, and a half-snapped window on a
1280px display reports 640. `docs/GOTCHAS.md #5` requires the UI to work at 150%+
zoom. `pointer` reports the *primary* input device, so a desktop stays `false` at
any width.

Verified behaviour:

| Context | `showScreen('host-screen')` lands on |
|---|---|
| iPhone 12 (390px, coarse pointer) | `join-screen` |
| Desktop (1280px, mouse) | `host-screen` |
| Narrow desktop (683px, mouse) | `host-screen` |

### Only `host-screen` is gated

`UIManager.showScreen()` gates **`host-screen` and nothing else**. `game-lobby`
and `host-game-screen` are entered by *server push* (`game-created`,
`game-started`, `game-reset`, `host-rejoin-success` in `socket-manager.js`).
Gating those would eject a live host mid-game and bypass
`resetAndReturnToMenu()` — see `docs/GOTCHAS.md #12` and `#13`.

Gesture entry points that bypass `showScreen()` carry their own `isPhone()`
guards: `startHosting()`, `showQuickStartModal()`, `quickStartQuiz()` in
`public/js/core/app.js`.

### Why `!important` is safe in `mobile-gate.css`

The file is imported with `layer(app)`; `.hidden` / `.visible-flex` /
`.visible-inline-block` live in `layer(utilities)`. The cascade **reverses**
`@layer` order for `!important` declarations, so an `!important` rule in the
earlier `app` layer beats one in `utilities`. That is the point: a stray
`show(el, 'visible-flex')` cannot resurrect a gated host control on a phone.

---

## This is UX gating, NOT security

The server routes are **unchanged and unauthenticated**. `host-join`,
`start-game`, `/api/save-quiz`, everything in `routes/quiz-management.js` and the
AI routes are all still reachable. Requesting the desktop site reports a wide
viewport and bypasses the gate entirely, **by design**.

Do not describe this feature as preventing hosting from a phone, and do not
build access control on top of it. If real authorization is ever needed, it
belongs on the server routes.

### Accepted limitations

- A **landscape phone** reports `innerWidth` > 768 and sees the desktop UI. This
  matches every other mobile feature in the codebase; making the gate disagree
  with the layout breakpoint would be worse than the hole.
- Touchscreen laptops and desktop-size tablets are **not** gated (primary pointer
  is fine / viewport is wide).

---

## Landing page notes

Hiding `#lp-outro` also hides the site footer — `<footer class="lp-footer">` is
nested *inside* that section in `index.html`. That is intended for a join-only
phone landing, but it surprises people, so it is called out here and in the CSS.

The decorative `.lp-pin-name` input is hidden rather than wired up: it has no id
and no listener, and nothing reads it.

---

## Testing

**Do not use `fullPage: true` in a mobile visual test.** In Playwright 1.57 a
full-page screenshot **permanently destroys touch emulation** on a device-emulated
context (`pointer: coarse` flips true→false, `navigator.maxTouchPoints` 1→0).
`toHaveScreenshot()` captures a stabilization pair, so frame 1 is gated and every
later frame is not — and the *ungated* frame is what gets compared. Measured on
the phone landing: 390x1464 on capture 1, 390x8156 on capture 2.

Use `expandViewportToContent()` in `tests/e2e/visual-static.spec.js`, which grows
the viewport to the document height and takes a viewport-only screenshot.
Emulation survives and repeat captures are byte-identical.

Relevant suites:

- `tests/unit/mobile-gating.dom.test.js` — asserts the gate (phone redirects,
  narrow mouse desktop does not, lobby is not gated). jsdom has no `matchMedia`,
  so it stubs the single query `isPhone()` asks.
- `tests/unit/join-enter-key.dom.test.js` — Enter walks PIN → name → submit.
- `tests/e2e/visual-static.spec.js` — `landing-mobile`, `join-mobile` baselines.

---

## Re-enabling hosting on mobile

If a purpose-built mobile authoring/hosting experience is built later, un-gating
is **not** simply deleting the gate. In rough order:

1. **Remove the gate.** Delete the host-hiding rules in section (a) of
   `public/css/mobile-gate.css`; remove the `isPhone() && screenId ===
   'host-screen'` check in `UIManager.showScreen()`; remove the three `isPhone()`
   early returns in `public/js/core/app.js` (`startHosting`,
   `showQuickStartModal`, `quickStartQuiz`).
2. **Re-enable onboarding on phones** in `public/js/main.js`, and revisit
   `onboarding-tutorial.js` — its `mobileSelector` branch is currently
   unreachable at runtime, and three entries were removed because they pointed at
   deleted elements.
3. **Do not restore the old mobile editor.** The FAB and bottom sheet
   (`public/js/utils/mobile-quiz-controls.js` plus its `responsive.css` blocks)
   were deleted in commit `bc6c600`; they are recoverable from git history but
   should be treated as a reference, not a starting point. That surface is the
   reason for this decision.
4. **Update the tests that assert the gate** —
   `tests/unit/mobile-gating.dom.test.js` will fail by design.
5. **Restore mobile editor visual coverage.** The `editor-mobile` baseline and
   `tests/mobile-quiz-editor-light-mode.spec.js` were deleted because they
   asserted a deliberately unreachable editor.
6. **Reconsider the landing trim** — section (c) of `mobile-gate.css` hides the
   marketing/host-facing sections. Deleting that block restores them.
7. **Re-check the touch-target split** in `responsive.css`; editor controls on a
   phone were among the things the old universal rule was sizing.

---

## Related

- `public/css/mobile-gate.css` — the single media query, heavily commented
- `public/css/CLAUDE.md` — CSS specificity and `@layer` rules
- `docs/GOTCHAS.md` — #5 (zoom), #12/#13 (game-screen navigation), #19 (this gate)
