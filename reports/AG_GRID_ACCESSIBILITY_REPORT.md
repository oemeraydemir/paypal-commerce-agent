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
| `source/apps/backend/public/dashboard.js` | Keyboard open of the detail dialog; focus moved into / trapped in / restored from the dialog; Escape to close; `getCellAria` labels for semantic columns; loading / empty / error state handling with accessible overlays + live regions; AG Grid `ensureDomOrder` + `suppressGroupRowsSticky`; explicit high-contrast `accentColor`. |
| `source/apps/backend/tests/integration/dashboard.test.ts` | Added 2 marker tests asserting the a11y wiring is present in the served HTML/JS. |
| `source/apps/backend/tests/unit/dashboard-a11y.test.ts` | **New.** Dependency-free behavioral test: executes the real `dashboard.js` against a tiny DOM shim + mocked AG Grid to verify keyboard open, focus move/restore, Escape, close button, `getCellAria`, and the error live region. |

No changes to `ops-copilot.js`, backend routes, policy/orders/capture/webhook/MCP
code, or the Flutter app.

---

## 2. Checklist — what was actually checked

| Requirement | Status | Evidence / notes |
|---|---|---|
| Keyboard navigation & focus order | ⚠️ | AG Grid cells are focusable by default; added `onCellKeyDown` so **Enter/Space on a focused cell** opens the detail dialog (previously mouse-only). Behavioral test proves the handler opens the dialog and moves focus. Real arrow/Tab traversal inside AG Grid was **not** exercised in a browser. |
| Visible focus indicator | ⚠️ | Added `:focus-visible` (3px, 2px offset) for native controls in both themes (`--focus` #1d4ed8 light / #93c5fd dark) and set AG Grid `accentColor` to a high-contrast blue for the focused-cell border. Not visually verified in a browser. |
| Column headers & accessible labels | ✅ / ⚠️ | All columns keep `headerName`; AG Grid supplies `role="columnheader"` + `aria-sort`. Added `getCellAria` so compact chips are announced as “Origin: AI agent”, “Status: PAID”, “Decision: Blocked” (unit-tested). Real screen-reader announcement **not** verified. |
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

AG Grid v33 API was verified against the actual CDN bundle
(`ag-grid-community@33.0.0`): `getCellAria`, `ensureDomOrder`,
`suppressGroupRowsSticky`, `overlayNoRowsTemplate`, `overlayLoadingTemplate`,
`showLoadingOverlay`, `showNoRowsOverlay`, `hideOverlay` are all present.
`onCellKeyDown` is derived from the `cellKeyDown` event (same mechanism as the
already-working `onRowClicked`, whose literal name is likewise absent from the
bundle).

New tests:

- `tests/integration/dashboard.test.ts` → asserts the served HTML/JS contains the
  dialog roles, focus styles, live regions, contrast tokens, `getCellAria`,
  `onCellKeyDown`, overlays, `ensureDomOrder`/`suppressGroupRowsSticky`.
- `tests/unit/dashboard-a11y.test.ts` → executes the real script and asserts:
  Enter/Space opens the dialog and moves focus in; Escape closes it and restores
  focus to the opener; the close button dismisses it; `getCellAria` returns the
  expected labels; a failed refresh shows a `role="alert"` message.

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
