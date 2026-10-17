# Evidence — browser-verified accessibility & rule-based fallback

Two claims were checked in a **real Google Chrome** (155.0.8059.80) driven over
CDP, not simulated. This file records exactly what was observed, including the
parts that did **not** match the expected result.

| Folder | What it shows |
|---|---|
| `dashboard-grid-ax/` | Accessibility tree of the AG Grid dashboard before/after using "Group by". |
| `flutter-rulebased/` | The Flutter app rendering a real `mode: "rule-based"` reply. |
| `scripts/` | The Playwright/CDP scripts that produced the images (re-runnable). |
| `backend-rulebased.log` | Backend log of the run that served the rule-based replies. |

---

## 1. Dashboard — "one grid" and "Group by → treegrid"

Run:

```bash
# backend with a deliberately invalid AI key so /api/ai/chat really falls back
OPENAI_API_KEY=sk-evidence-invalid-key AI_PROVIDER_ORDER=openai npm run dev

NODE_PATH=source/apps/backend/node_modules node evidence/scripts/dashboard-ax.cjs
```

### Result: both expectations were **wrong** — measured, not assumed

| Expected | Actually observed |
|---|---|
| "a single grid" | **Two** grids: `Orders` and `Policy events` (`role=grid` × 2). Each `.grid-section` does contain exactly **one** grid root, so there is no duplicated/nested grid — but the page as a whole has two. |
| "Group by → `treegrid`" | The root stays **`role="grid"`**. No group rows are created at all (`groupRows: 0`). |

Evidence files:

- `01-before-groupby.png` — full page, both grids ungrouped.
- `02-after-groupby.png` — full page with `Group by = Origin` and `Group by = Decision` selected; rows are still flat.
- `02b-events-grid-grouped.png` — close-up of the populated Policy events grid: 2 plain rows, no group headers.
- `03-groupby-focused.png` — the `Group by` select with a visible focus ring (the `:focus-visible` rule from the earlier accessibility work).
- `ax-tree-before.json` / `ax-tree-after.json` — role counts from `Accessibility.getFullAXTree`.
- `dom-before.json` / `dom-after.json` — DOM cross-check + per-section state.
- `ax-events-grouped-subtree.json` — AX subtree of the grouped, populated grid.
- `summary.json` — everything above plus the browser console errors.

### Why it stays `grid` — two independent causes

**1. The "Group by" control is a no-op in AG Grid Community.** Selecting a value
re-runs `setGridOption('columnDefs', buildGroupedCols(...))` with `rowGroup: true`,
and AG Grid answers with error #200, captured from the browser console:

```
AG Grid: error #200 Unable to use rowGroup as RowGroupingModule is not registered.
  import { RowGroupingModule } from 'ag-grid-enterprise';
AG Grid: error #200 Unable to use enableRowGroup as RowGroupingModule is not registered.
AG Grid: error #200 Unable to use aggFunc as one of RowGroupingModule, PivotModule, TreeDataModule is not registered.
AG Grid: error #200 Unable to use enableValue as one of RowGroupingModule, PivotModule, TreeDataModule is not registered.
AG Grid: error #200 Unable to use statusBar as StatusBarModule is not registered.
```

**2. AG Grid only switches the root role when grouping is actually active.** From
the v33.0.0 bundle (`ag-grid-community@33.0.0`):

```js
rowGroupColsSvc:e, colModel:t} = this;
let a = this.gos.get("treeData");
if (!a) { const n = t.isPivotMode(); a = (e ? e.columns.length : 0) >= (n ? 2 : 1); }
this.comp.setGridRootRole(a ? "treegrid" : "grid");
```

So `treegrid` requires `treeData: true` **or** at least one *registered* row-group
column. Since the module is missing, the row-group column never registers, `a`
stays false, and the role never changes.

Consequence beyond the role: the toolbar hint advertises
`sort · filter · group · aggregate · pin · paginate`, but **group and aggregate
do nothing**, and `statusBar` is silently dropped on both grids.

**Not fixed here** — removing a visible control / changing the advertised
capability list is a product decision. Options are listed in the report.

---

## 2. Flutter — the rule-based chip

Run:

```bash
# 1. backend that really returns mode="rule-based" (no valid provider key)
OPENAI_API_KEY=sk-evidence-invalid-key AI_PROVIDER_ORDER=openai \
  CORS_ORIGIN=http://127.0.0.1:8080 npm run dev

# 2. web build pointed at that backend (debug/profile so http:// is allowed)
flutter build web --profile --dart-define=API_BASE_URL=http://127.0.0.1:3000

# 3. serve it and drive it in Chrome
python -m http.server 8080 --bind 127.0.0.1 --directory build/web
NODE_PATH=source/apps/backend/node_modules node evidence/scripts/flutter-rulebased.cjs
```

### Result: verified

`03-rulebased-reply.png` shows, from a real screenshot of the running app:

- the chip **“Rule-based answer · no AI”** above the assistant bubble,
- the reply text the backend produced,
- the cart card titled **“Rule-based cart (no AI) · your edits”** with
  `1× Fresh Brewed Coffee · €3.00`.

The exchange recorded at the network layer in the same run:

```json
{ "status": 200, "mode": "rule-based", "checkoutReady": true,
  "preparedCart": { "policyDecision": "AUTO_ALLOW",
                    "requiresExplicitApproval": false,
                    "totalFormatted": "€3.00" } }
```

Other files: `01-empty-chat.png`, `02-typed.png`, `04-semantics-on.png`.

### Caveats

- **`flutter run` was not used.** `flutter devices` / `flutter run` abort in this
  sandbox because the Flutter tool shells out to `reg.exe`, which is blocked by
  the environment's program blacklist. The app was built with
  `flutter build web --profile` and served statically instead — the same widget
  code, rendered by the same engine, in the same Chrome.
- **Flutter's semantics tree could not be enabled** in headless Chrome (the
  "Enable accessibility" placeholder did not activate), so the chip text is
  proven **visually** here and **by assertion** in
  `test/chat_provider_test.dart` / `test/api_service_test.dart`, not by reading
  `flt-semantics` nodes.
- No Android emulator or iOS simulator was available, so no mobile screenshot.

---

## 3. Backend finding worth knowing before demoing

With **no** AI provider configured, `/api/ai/chat` does **not** fall back:

```
POST /api/ai/chat  →  HTTP 503 {"error":"OpenAI not configured"}
```

`src/routes/ai.ts:81` throws before the fallback `try/catch`, so the labelled
rule-based planner is unreachable in the most likely demo configuration (no API
keys). The fallback only engages when at least one provider exists but every
provider is exhausted (`AI_UNAVAILABLE`). That is why the evidence run sets a
deliberately invalid `OPENAI_API_KEY`.

---

## Reproducibility notes

- `playwright-core` was installed with `npm install --no-save`; `package.json`
  and `package-lock.json` are unchanged, so it is **not** a project dependency.
  The scripts resolve it through `NODE_PATH`.
- The HTTP proxy (`127.0.0.1:23044`) must be unset for every command here,
  including `flutter test` and `flutter build web`.
- No application source was modified to produce this evidence except
  `lib/models/cart.dart` (policy metadata parsing, covered by its own tests).
