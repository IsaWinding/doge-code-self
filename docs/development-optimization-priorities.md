# Development Optimization Priorities

This document lists the highest-value engineering improvements for this restored codebase, focusing on developer productivity, configuration reliability, and day-to-day coding quality.

Date: 2026-04-02
Scope: `D:\CC2\doge-code`

## Executive Summary

The most important improvements are not model upgrades. They are consistency fixes in model selection, auth source handling, startup behavior, and configuration visibility.

Today the main risks are:

1. The app can still behave differently from what the UI appears to show.
2. Multiple auth/config sources can override each other in surprising ways.
3. Compatible-model web capabilities depend on secondary configuration that is easy to miss.
4. User-facing docs and prompts still mix `.claude` and `.doge`, which causes real setup mistakes.

If we only do one batch of work, Batch 1 should focus on eliminating silent fallbacks and misleading state.

## Priority 0

### P0-1. Unify runtime model resolution and UI model identity

Problem:
The app has several competing model sources: session overrides, environment variables, saved compatible-model state, and legacy settings. This has already caused sessions to display one model while actually running another.

Why it matters:
This is the highest-impact correctness issue. When the active model is ambiguous, tool gating, prompts, auth behavior, and debugging all become unreliable.

Recommended work:

- Keep one canonical runtime model source.
- Make UI state derive from that source, not from partially separate storage.
- Add a startup sanity check that logs a warning when displayed model and effective model diverge.
- Add a small status line that shows both provider and effective model.

Success criteria:

- No session can display `qwen3.6-plus` while actually running `claude-sonnet-4-6`.
- Tool enablement decisions always use the same effective model the UI shows.

### P0-2. Separate auth namespaces cleanly

Problem:
Anthropic auth token flow and compatible-model API key flow are still partially mixed. Conflict messages can be technically true but operationally misleading.

Why it matters:
This directly blocks usage and creates debugging churn. It also causes invalid retries against the wrong backend.

Recommended work:

- Treat these as distinct auth modes, not just distinct credentials.
- Add an explicit auth-mode state: `anthropic` or `compatible`.
- Prevent mixed-mode startup unless the user deliberately overrides it.
- Update notices to name the real source: environment variable, saved compatible key, helper, or OAuth.

Success criteria:

- No more `Auth conflict` banner for normal compatible-model use.
- A user can tell exactly which credential is active and why.

### P0-3. Prevent partial compatible-model storage writes

Problem:
Compatible-model storage has already fallen into a half-valid state where only `apiKey` remained and `provider/baseURL/model` disappeared.

Why it matters:
This silently pushes the session back to Claude defaults and looks like the model ¡°changed itself.¡±

Recommended work:

- Keep compatible-model state transactional.
- Reject writes that would persist only `apiKey` without `provider/baseURL/model`.
- On read, repair incomplete state from known presets or global config when possible.
- Surface a clear warning when recovery happened.

Success criteria:

- Saved compatible-model state is always complete or clearly marked invalid.
- Silent fallback to Sonnet disappears.

## Priority 1

### P1-1. Make startup preflight provider-aware

Problem:
Initial connectivity checks were designed for Anthropic-first startup and could block compatible-model users before they even reached config.

Why it matters:
This creates a bad first-run experience and makes multi-device setup fragile.

Recommended work:

- Keep Anthropic preflight only when Anthropic auth is actually in use.
- For compatible-model mode, skip Anthropic-only checks.
- If needed later, add provider-specific health checks for compatible endpoints.

Success criteria:

- A new machine configured for Qwen/DeepSeek/Kimi can boot without contacting Anthropic first.

### P1-2. Surface all critical network switches in `/config`

Problem:
Important behavior such as `skipWebFetchPreflight` and search-backend requirements can be hidden unless the user already knows where to look.

Why it matters:
Developers lose time debugging network/tool failures that are really missing config.

Recommended work:

- Keep `Skip WebFetch preflight` in `/config`.
- Add inline descriptions for when to use it.
- Add a clear status row for web-search readiness, for example:
  - `Web search: Ready`
  - `Web search: Missing backend`
  - `Web search: Missing API key`

Success criteria:

- A user can diagnose missing web-search setup without editing files manually.

### P1-3. Improve compatible-model onboarding

Problem:
Compatible models require multiple dependent settings: model preset, API key, optional search backend, optional search API key. The current flow is functional but still easy to misconfigure.

Why it matters:
This is the main path for domestic models, so setup friction directly reduces adoption and trust.

Recommended work:

- Add a first-run compatible-model wizard.
- After selecting a compatible preset, prompt for API key immediately.
- If search backend is missing, show a follow-up prompt instead of failing later.
- Offer a one-command validation flow.

Success criteria:

- A user can go from fresh install to working Qwen + search in one guided flow.

## Priority 2

### P2-1. Clean up `.claude` vs `.doge` path references

Problem:
User-facing docs and prompts still reference `.claude` in places, while runtime defaults use `.doge`.

Why it matters:
This has already caused real user errors and hidden non-functional config changes.

Recommended work:

- Audit user-facing text, setup docs, and `/init` prompts.
- Replace home-directory examples with `.doge` where runtime actually reads from there.
- Keep `.claude` references only where they are intentionally project-local.

Success criteria:

- Setup instructions match actual runtime behavior.

### P2-2. Make web-search fallback behavior explicit

Problem:
Compatible models can have web capability, but only when secondary search-backend config exists. Without it, behavior currently feels like ¡°the model has no internet.¡±

Why it matters:
This creates avoidable confusion and undercuts one of the most important workflow features.

Recommended work:

- Tell the model when `WebSearch` is unavailable and why.
- Show search-backend state in `/config` and possibly in status/help output.
- Add a `/diagnose-web` style command to print effective search state.

Success criteria:

- Missing search configuration is immediately understandable.

### P2-3. Improve observability for support and debugging

Problem:
Many failures require source inspection or ad-hoc scripts to understand the real provider, model, auth source, and search state.

Why it matters:
Low observability slows every future bug report and setup issue.

Recommended work:

- Add a diagnostics command that prints:
  - effective model
  - provider
  - auth source
  - compatible-model storage state
  - search backend state
  - preflight mode
- Add compact startup debug logging behind a flag.

Success criteria:

- Most setup bugs can be diagnosed from one command output.

## Priority 3

### P3-1. Reduce prompt and branding drift

Problem:
The codebase still mixes Claude-first identity, Anthropic-specific assumptions, and compatible-model behavior.

Why it matters:
This is less severe than runtime correctness, but it damages trust and makes the product feel inconsistent.

Recommended work:

- Use model/provider-aware identity text.
- Avoid answering ¡°I am Claude¡± when running on a compatible model.
- Move provider-specific wording behind capability checks.

### P3-2. Add targeted regression coverage

Problem:
There is no consolidated automated test suite at the repo root, and several recent regressions were configuration-state regressions.

Why it matters:
Without narrow regression tests, the same issues will return.

Recommended work:

- Add focused tests near:
  - compatible-model storage normalization
  - auth source resolution
  - search backend readiness checks
  - startup preflight gating
- Prefer fast module-level tests over broad end-to-end coverage first.

## Recommended Execution Plan

### Batch 1

- Finish model/auth/config consistency work.
- Add explicit auth mode.
- Eliminate silent fallback states.

Expected impact:
Highest reliability gain for daily development.

### Batch 2

- Improve `/config` guidance and first-run setup flow.
- Add diagnostics for model/search/auth state.

Expected impact:
Highest productivity gain for setup and troubleshooting.

### Batch 3

- Clean path references and branding drift.
- Add targeted regression tests.

Expected impact:
Lower support burden and more predictable maintenance.

## Immediate Recommendation

If work starts now, prioritize these three items first:

1. Auth mode separation and conflict prevention
2. Transactional compatible-model storage with recovery warnings
3. Provider-aware startup and web-search readiness diagnostics

Those three fixes will remove most of the confusing behavior currently affecting development efficiency.
