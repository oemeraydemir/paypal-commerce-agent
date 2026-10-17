# AG Grid Accessibility Improvement — Report

**Scope:** accessibility of the AG Grid dashboard only (`public/dashboard.html`,
`public/dashboard.js`). Refund, persistent storage and the MCP payment flow were
not touched. No new runtime or dev dependency was added.

**Status key**

- ✅ **Verified** — confirmed by automated test and/or programmatic measurement.
- ⚠️ **Implemented, not manually verified** — code + automated control-flow test
  pass, but a real browser / screen reader was not available to confirm the
  end-user experience.
- ⛔ **Not performed** — could not be done in this environment (stated explicitly).

---

## 1. Files changed

| File | Change |
|---|---|
| `source/apps/backend/public/dashboard.html` | Focus-visible styles; WCAG-AA badge colours (light + dark); per-grid polite/alert live regions; detail panel is now a labelled modal dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`, `tabindex="-1"`). |
| `source/apps/backend/public/dashboard.js` | Keyboard open of the detail dialog; focus moved into / trapped in / restored from the dialog; Escape to close; per-cell `aria-label` on the semantic columns (via the cell renderer's `eGridCell` handle — see §6); loading / empty / error state handling driven by the v33 `loading` grid option + live regions; AG Grid `ensureDomOrder` + `suppressGroupRowsSticky`; explicit high-contrast `accentColor`. |
| `source/apps/backend/tests/integration/dashboard.test.ts` | Added 2 marker tests asserting the a11y wiring is present in the served HTML/JS. |
| `source/apps/backend/tests/unit/dashboard-a11y.test.ts` | **New.** Dependency-free behavioral test: executes the real `dashboard.js` against a tiny DOM shim + mocked AG Grid to verify keyboard open, focus move/restore, Escape, close button, the cell `aria-label`s set through the renderer, and the error live region. |

No changes to `ops-copilot.js`, backend routes, policy/orders/capture/webhook/MCP
code, or the Flutter app.

---

## 2. Checklist — what was actually checked

| Requirement | Status | Evidence / notes |
|---|---|---|
| Keyboard navigation & focus order | ⚠️ | AG Grid cells are focusable by default; added `onCellKeyDown` so **Enter/Space on a focused cell** opens the detail dialog (previously mouse-only). Behavioral test proves the handler opens the dialog and moves focus. Real arrow/Tab traversal inside AG Grid was **not** exercised in a browser. |
| Visible focus indicator | ⚠️ | Added `:focus-visible` (3px, 2px offset) for native controls in both themes (`--focus` #1d4ed8 light / #93c5fd dark) and set AG Grid `accentColor` to a high-contrast blue for the focused-cell border. Not visually verified in a browser. |
| Column headers & accessible labels | ✅ / ⚠️ | All columns keep `headerName`; AG Grid supplies `role="columnheader"` + `aria-sort`. The semantic columns carry an explicit `aria-label` on the cell element itself (“Origin: AI agent”, “Status: PAID”, “Decision: Blocked”), set through the cell renderer's `eGridCell` handle. Verified in a real Chrome DOM (§6). Real screen-reader announcement still **not** verified. |
| Colour contrast & readability | ✅ | Programmatically measured (WCAG relative luminance). Two real failures fixed (see §3). All checked text pairs now meet AA (≥4.5:1). |
| Basic screen-reader compatibility | ⚠️ | Detail panel is a labelled modal (`aria-modal`, `aria-labelledby`), live regions added, semantic cell labels added, AG Grid’s own ARIA kept. **No manual NVDA/JAWS/VoiceOver run.** |
| Loading / empty / error states | ⚠️ | Added polite status regions, assertive `role="alert"` errors, AG Grid loading/no-rows overlays with clearer text. Behavioral test proves a failed refresh produces a visible, announced error. Not verified in a browser. |
| Run existing tests | ✅ | Full suite: **400/400 passed, 30/30 suites**. |
| Add critical a11y tests | ✅ | 2 marker tests + 5 behavioral tests added (20 tests pass across the 3 affected suites). |
| No unnecessary new dependency | ✅ | None added. `jsdom`/`jest-environment-jsdom` are **not** installed; the behavioral test uses a small in-test DOM shim instead. |

---

## 3. Contrast fixes (measured, not guessed)

WCAG contrast ratio of the badge / text colour against its panel background.
The small badge text (~11.8px bold) is **not** “large text”, so it needs ≥ 4.5:1.

| Token / element | Before | Ratio | After | Ratio |
|---|---|---|---|---|
| `--success` (allow / paid badge, light) | `#1f9d62` | 3.47 ❌ | `#15803d` | **5.02** ✅ |
| `--warning` (confirmation badge, light) | `#d97706` | 3.19 ❌ | `#b45309` | **5.02** ✅ |
| `--danger` (block badge, light) | `#dc2626` | 4.83 ✅ | unchanged | 4.83 |
| `--primary` (AI / neutral badge, light) | `#2d6cdf` | 4.86 ✅ | unchanged | 4.86 |
| Muted text (labels, hints, light) | `#6b7280` | 4.83 ✅ | unchanged | 4.83 |
| Badge text on dark panel | danger 3.21 ❌, primary 3.19 ❌, success 4.47 ⚠️ | — | dark-only overrides: `#f87171` 5.61, `#7cb0ff` 7.02, `#34d399` 8.07 | ✅ |

Dark-mode overrides are scoped to `body.dark .badge-*`, so button backgrounds and
other `--primary` uses are unchanged.

---

## 4. Tests & results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** (clean) |
| `node --check public/dashboard.js` | **OK** |
| Full Jest suite (`npx jest --runInBand --silent`) | **30 suites / 400 tests passed** |
| Affected suites (dashboard, e2e, new a11y) | **3 suites / 20 tests passed** |

> **Correction (see §6):** the API check below was too weak. Counting the literal
> `getCellAria` in the bundle matched the *private method* `getCellAriaRole()` of
> the cell controller, not a colDef property — so the code shipped a property that
> AG Grid v33 does not support. It has since been replaced. The rest of the list
> (`ensureDomOrder`, `suppressGroupRowsSticky`, `overlayNoRowsTemplate`,
> `overlayLoadingTemplate`, `onCellKeyDown`) still holds; `showLoadingOverlay` was
> present but **deprecated since v32** and has also been replaced.

AG Grid v33 API was verified against the actual CDN bundle
(`ag-grid-community@33.0.0`): `ensureDomOrder`, `suppressGroupRowsSticky`,
`overlayNoRowsTemplate`, `overlayLoadingTemplate` are all present.
`onCellKeyDown` is derived from the `cellKeyDown` event (same mechanism as the
already-working `onRowClicked`, whose literal name is likewise absent from the
bundle).

New tests:

- `tests/integration/dashboard.test.ts` → asserts the served HTML/JS contains the
  dialog roles, focus styles, live regions, contrast tokens, the renderer-based
  cell labels, `onCellKeyDown`, the `loading` grid option,
  `ensureDomOrder`/`suppressGroupRowsSticky`, and that no invalid/deprecated
  property syntax is passed.
- `tests/unit/dashboard-a11y.test.ts` → executes the real script and asserts:
  Enter/Space opens the dialog and moves focus in; Escape closes it and restores
  focus to the opener; the close button dismisses it; the renderer puts the
  expected label on the cell element; a failed refresh shows a `role="alert"`
  message and clears the loading state.
- `tests/browser/dashboard.browser.test.ts` → **real Chrome** (§6).

---

## 5. Remaining issues / honest limitations

1. ⛔ **No manual screen-reader test.** NVDA, JAWS and VoiceOver were not run —
   this environment has no browser/AT. Screen-reader behaviour is inferred from
   ARIA/AG Grid semantics, not observed.
2. ⛔ **No real-browser keyboard test.** Playwright/Puppeteer are not installed and
   were not added. AG Grid’s internal arrow-key/Tab traversal was not exercised;
   only the dashboard’s own keyboard handler was unit-tested.
3. ⚠️ **Focus restore is best-effort.** If the 5-second refresh replaces the
   focused cell while the dialog is open, focus returns to a detached element and
   falls back to the document body.
4. ⚠️ **AG Grid known limitations** still apply: some screen readers do not
   announce state changes on the currently focused cell; grouped-column names can
   be announced imprecisely.
5. ⚠️ `suppressGroupRowsSticky: true` intentionally stops grouped rows from
   sticking to the top (AG Grid’s documented screen-reader recommendation). This
   is a small, deliberate behaviour change when “Group by” is used.
6. The `role="grid"` attribute on the container divs was left in place (AG Grid
   also manages grid roles); it was not changed to avoid altering existing grid
   wiring.

---

## 6. Flows explicitly left untouched

- Refund handling
- Persistent storage
- MCP payment / checkout flow
- `ops-copilot.js`, backend routes, policy/orders/capture/webhook services

---

## 6. Follow-up: fixing the invalid v33 API and verifying it in a real browser

A real Chrome console showed two warnings on the merged dashboard:

```
AG Grid: invalid colDef property 'getCellAria' did you mean any of these: … cellAriaRole …
AG Grid: Since v32 api.showLoadingOverlay is deprecated.
```

Both were real defects in the earlier work, not false alarms.

### 6.1 What the v33 source actually supports

Verified against `ag-grid-community@33.0.0` (both the minified CDN bundle and the
unminified build), not from memory:

| Claim | Evidence |
|---|---|
| `getCellAria` is **not** a colDef property | The only occurrence in the bundle is the private cell-controller method `getCellAriaRole()`. The colDef property list in the bundle contains no `getCellAria`. AG Grid's own warning lists `cellAriaRole` as the nearest valid name. |
| `cellAriaRole` **is** a colDef property | Present in the bundle's known-colDef-props table; implementation: `getCellAriaRole(){ return this.column.getColDef().cellAriaRole ?? "gridcell" }`. It sets the cell's **role**, not its label. |
| There is no per-cell `ariaLabel` colDef property | All 13 `ariaLabel` occurrences in the bundle are internal popup/editor/tooltip plumbing. |
| The supported way to label a cell is the renderer's `eGridCell` | `ICellRendererParams.eGridCell` is passed to every cell renderer in the bundle (`eGridCell:r` in the params object), so the renderer can set attributes on the real cell element. |
| `showLoadingOverlay()` is deprecated | Bundle deprecation table: `showLoadingOverlay:{version:"v32",message:'… Use the grid option "loading"=true instead or setGridOption("loading", true).'}` |
| `loading` is a real grid option | Present in the grid-option list, with a managed-property listener that re-runs `updateOverlayVisibility()`. |

**Important nuance:** the colDef property validator is compiled out of the
minified production bundle (`containerName` appears 0 times in
`ag-grid-community.min.js`, 4 times in `ag-grid-community.js`). The shipped
dashboard loads the minified build, so the `invalid colDef property` warning is
*invisible* there — which is exactly why a string-marker test passed. The
validator also only runs once AG Grid has inferred column data types, i.e. after
the first rows arrive.

### 6.2 Changes

`public/dashboard.js`

- Removed all four `getCellAria:` colDef entries. Each semantic renderer is now
  wrapped by `withCellLabel(renderer, labelFor)`, which calls the renderer and
  then sets `aria-label` on `params.eGridCell` — the real `role="gridcell"`
  element. Labels: `Origin: AI agent` / `Origin: Human`, `Status: PAID`,
  `Decision: Blocked` / `Auto allow` / `Require confirmation`.
- Removed `showLoadingOverlay()`, `showNoRowsOverlay()` and `hideOverlay()`.
  Both grids now start with `loading: true` and the refresh loop calls
  `setGridOption('loading', false)` on success, on a non-200 and on a thrown
  network error. AG Grid then shows its no-rows overlay by itself when the row
  data is empty, so the empty state needs no manual handling.
- Fixed an inconsistency this exposed: on a failed first load the polite status
  region used to keep saying "Loading orders…" forever. It now says
  "Orders could not be loaded." while the assertive `role="alert"` carries the
  detail. The loading state is also cleared, so a first-load failure can no
  longer leave the grid spinning behind the error.

`tests/integration/dashboard.test.ts` — marker test rewritten to assert the
**absence** of the invalid syntax (`not.toMatch(/getCellAria\s*:/)`,
`not.toMatch(/\.showLoadingOverlay\s*\(/)`, …) plus the presence of
`withCellLabel` / `eGridCell` / `setGridOption('loading'`.

`tests/unit/dashboard-a11y.test.ts` — the mocked grid API no longer provides the
deprecated overlay methods (calling one would now throw). The label test invokes
the real renderer with a fake `eGridCell` and asserts the attribute. New test
covers the loading→error transition through `setGridOption('loading', false)`.

`tests/browser/dashboard.browser.test.ts` (**new**) — real Chrome via CDP,
`npm run test:browser`. Five tests: no invalid-colDef/deprecation warnings; the
aria-labels are present on the real `.ag-cell` elements; the loading overlay
appears and then hides; the no-rows overlay appears on its own; and a
positive/negative control against the **unminified** AG Grid build (the only one
that still contains the validator) which asserts the current colDefs produce no
warning *and* that a colDef carrying `getCellAria` on the same page does produce
one — so the assertion cannot pass merely because the validator is absent.

`jest.config.js` / `jest.browser.config.js` / `package.json` — the browser suite
is excluded from `npm test` (needs a Chrome binary and the AG Grid CDN) and runs
via `npm run test:browser`, following the existing `tests/smoke` precedent.

### 6.3 Commands run and results

```
npx tsc --noEmit
  → exit 0

npx jest --runInBand --silent
  → Test Suites: 32 passed, 32 total
    Tests:       423 passed, 423 total

npm run test:browser
  → √ loads AG Grid from the CDN without an invalid colDef property (1599 ms)
    √ renders the descriptive aria-label on the real grid cells (1035 ms)
    √ shows the loading overlay, then hides it when rows arrive (10982 ms)
    √ shows AG Grid's no-rows overlay on its own when the data is empty (1090 ms)
    √ logs no invalid-colDef or deprecated-overlay warning under the unminified AG Grid build (4925 ms)
    Tests: 5 passed, 5 total

node evidence/scripts/dashboard-console.cjs      # real Chrome 155.0.8059.80
  → before (HEAD dashboard.js): invalid colDef property = true,
                                getCellAria warning = true,
                                showLoadingOverlay deprecation = true
    after  (current dashboard.js): all false, 0 console messages
```

Raw "before" console (real Chrome, unminified AG Grid build, with rows):

```
warning: AG Grid: invalid colDef property 'getCellAria' did you mean any of these:
  … cellAriaRole, headerGroupComponentParams.
If you are trying to annotate colDef with application data, use the 'colDef.context' property instead.
warning: AG Grid: Since v32 api.showLoadingOverlay is deprecated. `showLoadingOverlay` is deprecated.
  Use the grid option "loading"=true instead or setGridOption("loading", true).
```

Raw "after" console: **empty** (`evidence/workbuddy-3/console-after.txt`, 0 bytes).

### 6.4 Verified vs not verified

**Verified**

- No `invalid colDef property` warning for `getCellAria` — proven in real Chrome
  against the unminified v33 build, with a positive control showing the same page
  still detects an invalid property.
- The three semantic columns really do carry `aria-label` on the real
  `role="gridcell"` elements in the DOM (`Origin: AI agent`, `Origin: Human`,
  `Status: PAID`, `Status: PENDING`, `Decision: Require confirmation`,
  `Decision: Blocked`).
- `showLoadingOverlay()` is gone; the `loading` option drives the loading
  overlay, which was observed appearing and then disappearing.
- Empty data still produces the no-rows overlay, now without any manual call.
- Error path clears the loading state and no longer leaves a "Loading…" status.
- `npx tsc --noEmit` clean; 423 backend tests pass; `render.yaml` untouched.

**Not verified**

- **No screen-reader run.** The labels exist in the DOM, but whether NVDA/JAWS/
  VoiceOver announces "Status: PAID" instead of the visible "PAID" chip was not
  tested — no AT is available here.
- **No keyboard traversal / focus-order walk** in the browser beyond the
  `:focus-visible` ring captured earlier.
- **Mobile/touch and dark theme** were not exercised in this round.
- The browser suite depends on the AG Grid CDN and a local Chrome binary; on a
  machine without either it reports the missing prerequisite rather than passing
  silently, but it is excluded from `npm test` by design.

### 6.5 Known limitations left in place

1. **A first-load error still shows the generic no-rows overlay text** ("No data
   to display yet.") underneath the `role="alert"` error, because
   `overlayNoRowsTemplate` is a single static template. Switching it per state
   would need a dynamic template; not done, as it changes visible copy.
2. **`cellAriaRole` is not used.** Cells keep AG Grid's default `gridcell` role,
   which is correct here; the role is not what needed fixing.
3. **`statusBar` remains requested but unavailable** in AG Grid Community (error
   #200). Unrelated to this task and left untouched — see the earlier finding
   that the "group · aggregate" toolbar hint advertises Enterprise-only features.
