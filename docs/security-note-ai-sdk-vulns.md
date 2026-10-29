# Security note — AI-SDK transitive advisories (accepted risk)

**Date:** 2026-10-29 · **Scope:** backend production deps (`npm audit --omit=dev`)

## Summary
`npm audit --omit=dev` reports **10 advisories (9 high, 1 moderate)** in the
production dependency graph. All of them trace to the **AI-SDK / LangChain
chain pulled in by `@paypal/agent-toolkit`** (a real, used dependency) and to
`zod` / `uuid` (both used directly). **No upstream fix is available** for any
of them without a coordinated, semver-major upgrade (`ai` 5→7, `openai`
4→7, `@langchain/core` major, `zod` 3→4) that the PayPal toolkit does not yet
support.

## Verified usage (evidence)
| Component | Used by us? | Evidence |
|---|---|---|
| `@paypal/agent-toolkit` | ✅ yes | `src/ops/ops-agent.ts:67` `await import('@paypal/agent-toolkit/openai')` |
| `zod` | ✅ yes | `src/config/environment.ts`, `src/ops/config.ts`, `src/ops/ops-tools.ts`, `src/config/business-profile.ts`, `src/routes/ai.ts`, `src/routes/mcp.ts` |
| `uuid` | ✅ yes (v4) | `src/orders/service.ts`, `src/refunds/service.ts` (`v4 as uuidv4`) |
| `langsmith` / tracing | ❌ no | only referenced in `src/config/disable-tracing.ts` to **disable** it |

## Per-advisory risk rationale
- **langsmith ≤0.5.26 (high)** — SSRF via tracing-header injection, prototype
  pollution, output-redaction bypass, untrusted-manifest deserialization.
  **Inert here:** the app deletes all LangSmith/LangChain tracing env vars in
  `disableLangSmithTracing()` before any library can read them
  (`src/config/disable-tracing.ts`); no tracing calls are ever made.
- **zod <4.6.6 (high)** — DoS via oversized constrained collections
  (CWE-770). **Low exposure:** zod is used to validate bounded config/env and
  request bodies, not attacker-controlled unbounded collections with expensive
  constraints.
- **openai 4.55–5.23.2 (high)** — the dan is inherited from `zod`; used only as
  the provider adapter behind the agent toolkit.
- **ai / @ai-sdk/* (high)** — inherited from `@ai-sdk/provider-utils` +
  `zod`; only exercised when the agent toolkit runs an LLM call.
- **uuid <11.1.1 (moderate)** — missing buffer-bounds check in v3/v5/v6 when a
  `buf` is supplied. **Not applicable:** we use `uuidv4()` only.

## Decision
**Accept** as low residual risk for this demo/PoC, with mitigations already in
place:
1. LangSmith tracing disabled at startup (defuses the langsmith advisories).
2. `uuid` used only via v4 (unaffected buffers).
3. zod inputs are bounded server-side.
4. Sandbox-only PayPal (`PAYPAL_ENV=sandbox` enforced).

## Revisit when
- `@paypal/agent-toolkit` ships a version compatible with a patched
  `@langchain/core`/`langsmith` (≥0.6.0) and `zod` ≥4.6.6, or
- the app is promoted past demo into a production deployment with real
  customer data — then perform the coordinated major upgrades and re-run both
  the backend suite (1000 tests) and `npm audit`.
