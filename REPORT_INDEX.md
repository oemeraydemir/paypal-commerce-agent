# Report Index — AI Café / paypal-commerce-agent review package

Read the reports in this order. `CURRENT` = describes the code in this ZIP. `HISTORICAL` = earlier
snapshot kept for context (its findings are already superseded — do not read it as current status).

## Start here
| Report | Class | Why it matters |
|---|---|---|
| `README.md` (root) + `apps/backend/README.md` + `apps/flutter_app/README.md` | CURRENT | How to install, run and test each part. |
| `apps/backend/ARCHITECTURE.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `DEPLOY_AND_DEMO_RUNBOOK.md`, `DEMO_CHECKLIST.md` | CURRENT | Runtime architecture, env vars, deploy + demo steps. |
| `SPRINT_RECOVERY_06_REPORT.md` | **CURRENT (primary)** | The change under review: the CSP fix, file-by-file rationale, test counts, known unverified behaviour. |
| `RECOVERY_06_VERIFICATION_AND_ZIP_REPORT.md` | **CURRENT (primary)** | Independent browser verification of the fix, the four-point consistency check, the emulator run, and the ZIP scope. |

## Change history (context for the current diff)
| Report | Class | Why it matters |
|---|---|---|
| `SPRINT_PAYPAL_CHECKOUT_RECOVERY_01..05_REPORT.md` | CURRENT | The recovery chain that RECOVERY-06 completes (checkout return/cancel, approval gating). |
| `SPRINT_A1_9A_REPORT.md` | CURRENT | Explains the release-HTTPS / debug-only-cleartext change referenced by RECOVERY-06 §F5. |
| `SPRINT_A1_5_REPORT.md` | CURRENT | Explains the A1.5 backend changes that appear as pre-existing working-tree modifications. |
| `SPRINT_A1_1`, `A1_2`, `A1_3`, `A1_4_LOCAL_AUDIT`, `A1_6`, `A1_7`, `A1_8`, `SPRINT_A1_REPAIR.md` | HISTORICAL | Development/audit history of the same branch. Useful for provenance; intermediate states. |
| `apps/backend/S11_VALIDATION_REPORT.md`, `apps/backend/STEP1_AUDIT_REPORT.md` | CURRENT | Prior validation + the Step-1 audit that gates delivery. |

## Validation / evidence
| Report | Class | Why it matters |
|---|---|---|
| `FINAL_VALIDATION_REPORT.md` | CURRENT | Last fully-run local validation (backend 249, Flutter 32, analyze 1 info). |
| `E2E_VERIFICATION_REPORT.md` | HISTORICAL | Earlier end-to-end verification against the deployed service. |
| `PAYPAL_ENV_CONFIG_REPORT.md` | CURRENT | `PAYPAL_ENABLED` / `PAYPAL_ENV` semantics and live sandbox impact. |
| `EMULATOR_E2E_TEST_REPORT.md` | HISTORICAL | Emulator flow results (launch, catalogue, cart, 503 error surfaces). |
| `EMULATOR_STRESS_TEST_REPORT.md` | HISTORICAL | **Superseded finding:** its P0 ("checkout return page is a manual-click page") was fixed by RECOVERY-02/03 — the return/cancel pages now auto-redirect. Kept only for the live sandbox ID-correlation evidence. |
| `verification-evidence/` | CURRENT | Raw evidence: `ev2_browser_result.json`, `dashboard.png`, emulator screenshots, `e2e-evidence/*.png|json`. |

## Deliberately NOT included
- `EXIT_REPORT.md`, `EXIT_REPORT_S2/S3/S4/S5/S8.md` — superseded early-sprint status summaries
  (pre-A1 states). Keeping them next to the current reports would present contradictory status.
- `*.log`, `step1-test-output.log`, `flutter_*.log`, `ev_*.txt`, `ev_*.mjs`, `ev_*.cjs`,
  `ev_browser_result.json`, `diff-check.txt` — temporary validation scratch.
- `e2e-evidence/*.txt` — raw log captures (the PNG/JSON evidence is retained instead).
- `.env*` (except the secret-free `*.example` templates), `node_modules/`, `dist/`, `coverage/`,
  Flutter `build/`, `.dart_tool/`, `.gradle/`, `.kotlin/`, `local.properties`.
