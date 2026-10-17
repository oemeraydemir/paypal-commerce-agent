# AG Grid Accessibility — Report

**Scope:** accessibility of the AG Grid dashboard only — `public/dashboard.html`,
`public/dashboard.js`, the tests that cover them, and this report.

**Explicitly out of scope and untouched:** PayPal capture/refund, the MCP payment
flow, order and policy services, persistent storage, `render.yaml`, and the
Flutter app.

**Status key**

- ✅ **Verified in a real browser** — observed in Chrome 155 through CDP, with the
  raw console / DOM / accessibility tree captured under `evidence/`.
- 🔬 **Verified by automated test** — asserted by a unit or integration test, but
  not observed in a browser.
- ⚠️ **Implemented, not manually verified** — code and tests exist; the end-user
  experience (screen reader, keyboard walk-through) was not observed.
- ⛔ **Not performed** — could not be done in this environment, stated plainly.

---

## 1. Files changed

| File | Change |
|---|---|
| `source/apps/backend/public/dashboard.html` | `:focus-visible` ring for native controls in both themes; WCAG-AA badge text colours for light and dark, measured against the **blended** tint; per-grid polite status and assertive error live regions; detail panel is a labelled modal (`role="dialog"`, `aria-modal`, `aria-labelledby`, `tabindex="-1"`). |
| `source/apps/backend/public/dashboard.js` | Keyboard open of the detail dialog (Enter/Space on a focused cell); focus moved into, trapped in, and restored from the dialog; Escape to close; per-cell `aria-label` on Origin / Status / Agent / Decision via the cell renderer's `eGridCell` handle; loading / empty / error states driven by the v33 `loading` grid option plus live regions; `ensureDomOrder`; explicit high-contrast `accentColor`. Enterprise-only options were removed, not faked (see §6.3). |
| `source/apps/backend/tests/integration/dashboard.test.ts` | Marker tests rewritten: they now assert the **absence** of the invalid syntax (`getCellAria:` as a property, `.showLoadingOverlay(`) and the presence of the supported wiring, instead of counting strings that happen to exist. |
| `source/apps/backend/tests/unit/dashboard-a11y.test.ts` | Dependency-free behavioural test: runs the real `dashboard.js` against a small DOM shim and a mocked AG Grid. Covers keyboard open, focus move/restore, Escape, close button, the cell label written through the renderer, and the loading → error transition. |
| `source/apps/backend/tests/unit/dashboard-contrast.test.ts` | Recomputes every badge's contrast from the real CSS in `dashboard.html`, blending the translucent tint over **both** panel colours it can sit on. |
| `source/apps/backend/tests/browser/dashboard.browser.test.ts` | **New.** Real Chrome via CDP. Five tests, including a positive control that proves the colDef validator is actually running. |
| `source/apps/backend/jest.config.js`, `jest.browser.config.js`, `package.json` | The browser suite is excluded from `npm test` (needs Chrome + the AG Grid CDN) and runs via `npm run test:browser`, following the existing `tests/smoke` precedent. |
| `evidence/scripts/dashboard-console.cjs`, `evidence/workbuddy-3/` | Before/after console capture in real Chrome, plus the git snapshot taken before any change. |

No dependency was added to `package.json`. `playwright-core` is installed with
`npm install --no-save` and is deliberately absent from the manifest — see §11.

---

## 2. What was actually verified, and how

The distinction that matters: a test asserting a string exists in a file proves
almost nothing. The rows below say which layer proved what.

| Requirement | Status | Evidence |
|---|---|---|
| Keyboard opens the detail dialog | 🔬 | `dashboard-a11y.test.ts`: Enter and Space on a focused cell call the handler, which opens the panel and moves focus into it. |
| Focus is trapped in / restored from the dialog | 🔬 | Same suite: Tab wraps inside the panel; Escape and the close button both restore focus to the opener. |
| Visible focus indicator | ✅ / ⚠️ | `:focus-visible` (3px, 2px offset) present in both themes; the ring is visible on the "Group by" control in `evidence/dashboard-grid-ax/03-groupby-focused.png`. Focus order across the page was not walked through. |
| Column headers & accessible labels | ✅ / ⚠️ | `headerName` retained on every column, so AG Grid emits `role="columnheader"` + `aria-sort`. The semantic cells carry `aria-label` on the real `role="gridcell"` element — observed in the DOM in Chrome, and still present after a sort rebuilds the cells (§5.1). **Screen-reader announcement not observed.** |
| Colour contrast | ✅ | Measured from the real CSS over the blended tint on both panel colours (§4). All 16 badge/theme combinations pass ≥ 4.5:1. |
| Basic screen-reader compatibility | ⚠️ | Modal semantics, live regions, cell labels and AG Grid's own ARIA are in place. **No NVDA/JAWS/VoiceOver run.** |
| Loading / empty / error states | ✅ / ⚠️ | Real Chrome: the loading overlay appears and then hides; the no-rows overlay appears on its own for empty data. Error path verified by unit test (assertive `role="alert"`, loading cleared, polite status no longer stuck on "Loading…"). The error path was not driven in Chrome. |
| No unnecessary dependency | ✅ | `jsdom`, `jest-environment-jsdom` and Playwright-as-a-dependency were all avoided; the behavioural test uses a hand-written DOM shim. |

---

## 3. Colour contrast — measured, not guessed

### 3.1 Method

Badge backgrounds are **translucent tints**, not solid colours. Measuring the text
against the bare panel colour — which is what the first version of this report
did — overstates the contrast, because the tint sits between the text and the
panel. `tests/unit/dashboard-contrast.test.ts` therefore:

1. parses the real `background: rgba(...)` and `color:` pairs out of
   `dashboard.html` (CSS comments stripped first, so they cannot bleed into
   selectors);
2. composites the tint over each panel the badge can sit on —
   `#ffffff` / `#f8fafc` in light, `#1b2530` / `#16202b` in dark;
3. computes the WCAG 2.x ratio and requires **≥ 4.5:1** for both panels.

The badge text is ~11.8px bold, which is **not** "large text", so 4.5:1 applies,
not 3:1.

### 3.2 Before (initial commit `13eaa54`)

Badges inherited the shared tokens (`--success`, `--warning`, `--danger`,
`--primary`, `--muted`). Worst case of the two panels:

| Badge | Text | Light | Dark |
|---|---|---|---|
| `badge-allow` / `badge-paid` | `#1f9d62` | **2.85** ❌ | **3.71** ❌ |
| `badge-confirm` | `#d97706` | **2.64** ❌ | **4.09** ❌ |
| `badge-block` | `#dc2626` | **3.71** ❌ | **2.97** ❌ |
| `badge-neutral` | `#2d6cdf` | **3.98** ❌ | **2.83** ❌ |
| `badge-ai` | `#2d6cdf` | **3.76** ❌ | **2.73** ❌ |
| `badge-cancelled` | `#6b7280` | **3.79** ❌ | **2.72** ❌ |
| `badge-human` | `#6b7280` | **3.90** ❌ | **2.77** ❌ |

**All 16 combinations failed** (8 badges × 2 themes; `allow` and `paid` share a
colour, so they occupy one row above). Every badge on the dashboard was below AA.

### 3.3 After (current tree)

| Badge | Light text | Light | Dark text | Dark |
|---|---|---|---|---|
| `badge-allow` / `badge-paid` | `#166534` | 5.85 ✅ | `#34d399` | 5.78 ✅ |
| `badge-confirm` | `#92400e` | 5.88 ✅ | `#fbbf24` | 6.48 ✅ |
| `badge-block` | `#b91c1c` | 4.97 ✅ | `#fca5a5` | 6.49 ✅ |
| `badge-neutral` | `#1d4ed8` | 5.49 ✅ | `#7cb0ff` | 5.15 ✅ |
| `badge-ai` | `#1d4ed8` | 5.19 ✅ | `#7cb0ff` | 5.15 ✅ |
| `badge-cancelled` | `#4b5563` | 5.93 ✅ | `#b6c2cf` | 6.01 ✅ |
| `badge-human` | `#374151` | 8.31 ✅ | `#b6c2cf` | 6.01 ✅ |

Dark overrides are scoped to `body.dark .badge-*`, so button backgrounds and other
`--primary` / `--success` uses are unaffected.

### 3.4 A defect this section had been hiding

`badge-human` was written as `color: var(--muted)`. The contrast test's parser only
matched literal `#rrggbb`, so the variant was **silently dropped** from the check —
and its expected-variants list was written to match, with seven light badges
instead of eight. `--muted` is `#6b7280`, which over the blended tint reaches only
**3.90:1** in light theme.

Fixed in this round:

- `.badge-human` now uses an explicit `#374151` (8.31:1) instead of `var(--muted)`.
- The coverage assertion no longer accepts different variant lists per theme: both
  themes must expose the same eight badges, so a variant cannot disappear from one
  theme unnoticed.
- Reverting the colour now fails the suite in two ways: the coverage test (7 ≠ 8)
  and the ratio test.

This is the same class of mistake as the `getCellAria` one in §6: a check that
looked green because it was not looking at the thing it claimed to check.

---

## 4. Loading / empty / error states

The overlay API was rewritten around the v33 `loading` grid option; the manual
`showLoadingOverlay()` / `showNoRowsOverlay()` / `hideOverlay()` calls are gone.

| State | Trigger | What the user sees / hears |
|---|---|---|
| Initial | `loading: true` at grid creation | AG Grid's loading overlay; polite status "Loading orders…" / "Loading policy events…" |
| Rows | successful fetch with data | `setGridOption('loading', false)`; polite status "Showing N orders." |
| Empty | successful fetch, zero rows | `loading: false`; **AG Grid shows its no-rows overlay by itself**; polite status "No orders to display yet." |
| Poll refresh | every 5 s | data replaced without re-showing the loading overlay (only the first load shows it), so the grid does not flicker |
| Connection error | `fetch` throws | `loading: false`; assertive `role="alert"` "Could not load orders (connection error). Retrying automatically."; polite status "Orders could not be loaded." |
| Server error | non-2xx response | same, with "server error" wording |

The status/error split matters for screen readers: the alert is assertive because a
failure needs attention now, while the row count is polite so a 5-second poll does
not interrupt whatever the user is reading.

---

## 5. AG Grid v33 API — verified against the package, not from memory

### 5.1 Claims and evidence

| Claim | Evidence |
|---|---|
| `getCellAria` is **not** a `colDef` property | The only occurrence in the v33.0.0 bundle is the private cell-controller method `getCellAriaRole()`. AG Grid's own warning lists `cellAriaRole` among the nearest valid names, and the property validator rejects `getCellAria`. |
| `cellAriaRole` **is** a `colDef` property, but sets the **role**, not the label | `getCellAriaRole(){ return this.column.getColDef().cellAriaRole ?? "gridcell" }`. Using it would change what the cell *is*, not what it is *called* — not what was needed. |
| There is no per-cell `ariaLabel` `colDef` property | All `ariaLabel` occurrences in the bundle are internal popup / editor / tooltip plumbing. |
| The supported way to label a cell is the renderer's `eGridCell` | `ICellRendererParams.eGridCell` is passed to every cell renderer, so a renderer can set attributes on the real cell element. AG Grid's own `_setAriaLabel` helper is used on widgets — the filter menu button, text inputs — not on `.ag-cell`. Confirmed empirically as well: sorting rebuilds the cell DOM, and the labels are still there afterwards (browser test). |
| `showLoadingOverlay()` is deprecated | Bundle deprecation table: `showLoadingOverlay:{version:"v32", message:'… Use the grid option "loading"=true instead or setGridOption("loading", true).'}` |
| `loading` is a real grid option | Present in the grid-option list, with a managed-property listener that re-runs `updateOverlayVisibility()`. |
| `onCellKeyDown` is a valid option | Derived from the `cellKeyDown` event, exactly like the already-working `onRowClicked` from `rowClicked` — the `on*` names are generated, so their literals are absent from the bundle. |

### 5.2 The reason the bug shipped

The colDef property validator is **compiled out of the minified CDN bundle**:
`containerName` (the identifier the validator uses) appears 0 times in
`ag-grid-community.min.js` and 4 times in `ag-grid-community.js`.

The dashboard loads the minified build. So in production the invalid property could
never be logged — a console that looks clean is not evidence here. Two further
conditions made it easy to miss:

1. The validator only runs after AG Grid has inferred column data types, i.e. once
   **rows exist**. An empty grid never triggers it.
2. The old test counted the literal string `getCellAria` in the bundle. That string
   is present — as `getCellAriaRole()`. The test matched the method, not a
   property, and passed.

### 5.3 How the tests avoid repeating it

`tests/browser/dashboard.browser.test.ts` serves the **unminified** build of the
same version, which still contains the validator, and then:

- asserts the current colDefs produce no `invalid colDef property` warning;
- injects a second grid whose colDef carries `getCellAria` on the *same page* and
  asserts the warning **does** appear.

The second assertion is the point. Without it, the first one could pass simply
because the validator is absent again.

### 5.4 Enterprise options were removed, not faked

The earlier tree passed `rowGroup`, `enableRowGroup`, `aggFunc`, `enableValue`,
`statusBar` and `suppressGroupRowsSticky`. All of these are **Enterprise**
features: AG Grid Community logs error #200 for each and ignores them. They were
removed, along with the "Group by" control that could therefore never group
anything. `suppressGroupRowsSticky` went with them, since there are no group rows
left to make sticky. The grid is now an honest Community grid: sort, filter, pin,
resize, paginate.

Consequence, stated plainly: **the dashboard no longer offers grouping or
aggregation.** That is a visible feature change, and it is deliberate — the
previous control did nothing.

---

## 6. Tests: what each suite proves, and what it cannot

| Suite | Proves | Cannot prove |
|---|---|---|
| `tests/unit/dashboard-a11y.test.ts` | The real `dashboard.js` opens/closes the dialog, moves and restores focus, traps Tab, writes the label through the renderer, and reacts to a failed refresh. Runs against a hand-written DOM shim. | Anything about real AG Grid behaviour, real CSS, or a real screen reader. The shim is not a browser. |
| `tests/unit/dashboard-contrast.test.ts` | Every badge's ratio, from the real CSS, over both panels. | Perceived contrast in the actual rendered page (font smoothing, zoom, OS colour profile). |
| `tests/integration/dashboard.test.ts` | The served HTML/JS contains the accessibility wiring, and does **not** contain the invalid property syntax or the deprecated calls. | That AG Grid accepts the options — it only reads the file. |
| `tests/browser/dashboard.browser.test.ts` | Real Chrome, real AG Grid, real DOM: no validator warning (with positive control), `aria-label` on the real cells and still there after a sort rebuild, loading overlay appears then hides, no-rows overlay appears on its own. | Screen-reader output, keyboard traversal order, dark theme, mobile. |

---

## 7. Commands run and results

All commands from `source/apps/backend` unless stated. Flutter tests were **not**
re-run; no Flutter file was touched in this task.

```
npx tsc --noEmit
  → exit 0

npx jest --runInBand --silent
  → Test Suites: 32 passed, 32 total
    Tests:       423 passed, 423 total

npx jest tests/unit/dashboard-contrast.test.ts --runInBand
  → Tests: 6 passed, 6 total

npm run test:browser
  → √ loads AG Grid from the CDN without an invalid colDef property (chrome ready) (1472 ms)
    √ renders the descriptive aria-label on the real grid cells (1880 ms)
    √ shows the loading overlay, then hides it when rows arrive (10945 ms)
    √ shows AG Grid's no-rows overlay on its own when the data is empty (974 ms)
    √ logs no invalid-colDef or deprecated-overlay warning under the unminified AG Grid build (4065 ms)
    Tests: 5 passed, 5 total

node --check public/dashboard.js
  → OK

node evidence/scripts/dashboard-console.cjs          # BEFORE_REF defaults to HEAD
  → see below; on a tree where the fix is already committed, pass BEFORE_REF
```

**On the test count.** 423 tests / 32 suites is the number measured on the current
tree. An independent run on an earlier tree reported 422 / 32; the one-test
difference is the final test added before this round. No test was added in this
round — only the coverage assertion in the contrast suite was widened — so the
count is unchanged at 423.

**Real Chrome console, before vs after.** Same page, same fixtures, same unminified
AG Grid build; the only difference is which `dashboard.js` is served. Baseline is
`c1c59a7`, the last revision that still contained the invalid property.

```
BEFORE_REF=c1c59a7 node evidence/scripts/dashboard-console.cjs

  chrome: 155.0.8059.80
  beforeRef: c1c59a7
  beforeBaselineContainsInvalidProperty: true
  before: { invalid colDef property: true, getCellAria warning: true,
            showLoadingOverlay deprecation: true }        messages: 3
  after:  { invalid colDef property: false, getCellAria warning: false,
            showLoadingOverlay deprecation: false }       messages: 0
```

Raw "before" (`evidence/workbuddy-3/console-before.txt`):

```
warning: AG Grid: Since v32 api.showLoadingOverlay is deprecated. `showLoadingOverlay` is deprecated.
  Use the grid option "loading"=true instead or setGridOption("loading", true).
warning: AG Grid: invalid colDef property 'getCellAria' did you mean any of these:
  floatingFilterComponentParams, …, cellAriaRole, headerGroupComponentParams.
If you are trying to annotate colDef with application data, use the 'colDef.context' property instead.
warning: AG Grid: to see all the valid colDef properties please check:
  https://www.ag-grid.com/javascript-data-grid/column-properties/
```

Raw "after" (`evidence/workbuddy-3/console-after.txt`): **0 bytes.**

---

## 8. Known limitations

1. ⛔ **No screen-reader test.** NVDA, JAWS and VoiceOver were not run. That the
   labels are in the DOM is verified; that they are *announced* is not.
2. ⛔ **No keyboard walk-through.** Focus order across the page, AG Grid's internal
   arrow-key grid navigation, and the Tab cycle were not traversed by hand. Only the
   dialog's own Tab trap is covered, by unit test.
3. ⛔ **Dark theme and mobile/touch were not exercised** in a browser this round.
   Dark-theme colours are verified arithmetically, not visually.
4. ⚠️ **A first-load error still shows the generic no-rows text** ("No data to
   display yet.") beneath the `role="alert"` message, because
   `overlayNoRowsTemplate` is a single static template. Making it state-dependent
   changes visible copy, so it was left alone.
5. ⚠️ **Focus restore is best-effort.** If the 5-second refresh replaces the focused
   cell while the dialog is open, focus returns to a detached node and falls back to
   `<body>`.
6. ⚠️ **AG Grid's own limitations still apply:** some screen readers do not announce
   state changes on the currently focused cell.
7. ⚠️ **No grouping or aggregation.** Removed rather than faked — see §5.4.
8. ⚠️ **The browser suite depends on the AG Grid CDN and a local Chrome.** It fails
   loudly rather than passing silently when either is missing, but it is excluded
   from `npm test` by design.

---

## 9. Corrections — what this report got wrong earlier

Kept on purpose, so the document is honest about its own history.

| # | Earlier claim | Reality | Fixed |
|---|---|---|---|
| 1 | "AG Grid v33 API verified: `getCellAria` present" | The check counted `getCellAriaRole()`, a private method. `getCellAria` is not a colDef property; the dashboard was shipping an invalid property. | §5 |
| 2 | "All checked text pairs meet AA (≥4.5:1)" | Measured against the **bare panel**, ignoring the translucent tint. With the tint blended in, every badge failed (2.64–3.98 light, 2.72–4.09 dark). | §3.2 |
| 3 | "`badge-human` passes" | `var(--muted)` was invisible to the contrast test's hex parser, so the variant was never measured. It sat at 3.90:1 in light theme. | §3.4 |
| 4 | "400/400 tests, 30 suites" | Stale. Current: 423 / 32. | §7 |
| 5 | "`suppressGroupRowsSticky` deliberately changes grouped-row behaviour" | There is no grouped-row behaviour: `suppressGroupRowsSticky`, the Enterprise options and the "Group by" control were all removed. | §5.4 |
| 6 | "`role="grid"` on the container divs left in place" | Removed. The grid roots are created and labelled by AG Grid. | §5.4 |
| 7 | "`statusBar` remains requested but unavailable (error #200)" | No longer requested. Nothing is passed that AG Grid Community ignores. | §5.4 |
| 8 | Checklist marked browser verification as not performed | Several rows are now verified in Chrome. The table in §2 separates browser-verified, test-verified and not-performed. | §2 |
| 9 | The evidence script's "before" baseline was `HEAD` | Once the fix was committed, `HEAD` became the fixed file and the "before" run silently stopped reproducing anything. It now takes `BEFORE_REF`, reports whether the baseline actually contains the invalid property, and exits non-zero when it does not. | §7, §11 |

---

## 10. Delivery notes

- **`playwright-core` is required for `npm run test:browser` and is not in
  `package.json`.** It is installed with `npm install --no-save`, so a fresh clone
  must run that first; without it the suite reports `playwright-core is not
  installed` instead of running. This is deliberate (no new manifest dependency),
  but it means the browser suite is not reproducible from `npm ci` alone.
- **Chrome location.** Both the browser suite and the evidence script probe a list
  of default paths and honour `CHROME_PATH`, so a non-Windows machine works without
  editing files.
- **Console evidence.** `node evidence/scripts/dashboard-console.cjs` needs a
  running backend (`npm run dev`) and the unminified AG Grid build, which it caches
  in the OS temp directory. Use `BEFORE_REF=<sha>` to pick the baseline; the script
  tells you when the baseline is not actually buggy.
- **`render.yaml` was not modified.** PayPal, MCP, order, policy and storage code
  were not touched. No commit or push was made from this side.
