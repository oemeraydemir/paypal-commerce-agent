# Dependency advisories (audit snapshot 2026-10-18)

`npm audit` on the backend reports **44 advisories overall** and **8 in the production tree**.
No production entry has an in-range fix (`fixAvailable: false`), and the high-severity one is not
reachable in this application's code paths.

| Package | Severity | Scope | Installed | Advisory | Reachable here? |
|---|---|---|---|---|---|
| `langsmith` | high | transitive (`@paypal/agent-toolkit` → `@langchain/core` → `langsmith`) | 0.3.87 | GHSA-v34v-rq6j-cj6p (SSRF via tracing header injection) | **No**: the app never sets `LANGCHAIN_TRACING_V2` / `LANGSMITH_TRACING` and configures no LangSmith client. |
| `@paypal/agent-toolkit` | moderate | direct | 1.11.0 | via `@langchain/core` / `ai` | Used only by the read-only Ops Copilot. |
| `@langchain/core` | moderate | transitive | 0.3.80 (pinned override) | via `langsmith` / `uuid` | No direct app usage. |
| `uuid` | moderate | direct | 9.0.1 / 10.0.0 | GHSA-w5hq-g745-h8pq (buffer bounds when `buf` is provided) | **No**: the app calls `uuidv4()` without a `buf`. |
| `ai` / `@ai-sdk/*` | low | transitive | via the toolkit | resource consumption / filetype whitelist | **No**: the app uses the OpenAI SDK directly, not AI SDK file uploads. |

## Why no dependency change was made

The only high advisory is transitive and becomes reachable only if LangSmith tracing is enabled.
Fixing it requires a `@langchain/core` / `langsmith` major upgrade that is not compatible with
`@paypal/agent-toolkit@1.11.0`; `@langchain/core` is also pinned to `0.3.80` to keep the earlier
GHSA-r399-636x-v7f6 fix. Upgrading would risk the Ops Copilot for no reachable benefit, so the
advisories are documented rather than "fixed" by a breaking change.

## Recommended follow-up

- Re-run `npm audit --omit=dev` after any `@paypal/agent-toolkit` upgrade.
- If LangSmith tracing is ever enabled, upgrade `langsmith` to a fixed release first.
- Do not enable `LANGCHAIN_TRACING_V2` / `LANGSMITH_TRACING` on this deployment.

## Runtime mitigation (added 2026-10-20)

`src/config/disable-tracing.ts` runs at boot, after `dotenv`, and deletes `LANGCHAIN_TRACING`, `LANGCHAIN_TRACING_V2`,
`LANGSMITH_TRACING`, `LANGSMITH_TRACING_V2`, `LANGCHAIN_ENDPOINT`, `LANGSMITH_ENDPOINT` and
`LANGCHAIN_CALLBACKS_BACKGROUND` from `process.env`, logging only the variable names. This removes the configuration the
SSRF advisory needs (tracing plus an endpoint override). It is a mitigation, not a proof: the advisory is still
listed by `npm audit` and the library internals were not reviewed. Test: `tests/unit/disable-tracing.test.ts`.
