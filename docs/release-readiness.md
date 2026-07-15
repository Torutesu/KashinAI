# Release Readiness

> Snapshot: 2026-07-15. Tracks what is implemented and verified vs. what remains before a public
> macOS release. Companion to `docs/growth-plan.md` (strategy) and Growth Epic #19 (tracking).

## Verification baseline (this repo, CI-enforced)

- `pnpm lint` — 0 errors
- `pnpm typecheck` — clean (main + renderer)
- `pnpm test:unit` — 543 passing
- `pnpm build` — main / preload / renderer all bundle

CI (`.github/workflows/ci.yml`) runs lint + typecheck + test on every push/PR.

## Implemented and tested (app-side, done in this workstream)

| Area | State | Issue |
| --- | --- | --- |
| Option-tap → capture → generate → insert (core flow) | ✅ | #1 |
| First-run onboarding (permissions + API key) | ✅ | #6 |
| Generation history + editable search query | ✅ | #8 |
| Name unification, ESLint, sensitive-text redaction (opt-in) | ✅ | #9 |
| Prompt i18n (EN/JA) + output-language auto-detection | ✅ | #18 |
| Latency instrumentation (capture stages + generation timings) | ✅ | #13 |
| Privacy-first telemetry (allow-list, opt-out, anonymous id) | ✅ | #12 |
| Streaming generation (SSE) + cancellation | ✅ | #16 |
| Hosted-inference backend (Hono/Workers: auth + quota + SSE proxy) — contract-tested | ✅ code (deploy needs account) | #14 |
| App-side hosted client + quota→paywall signal | ✅ | #14, #15 (partial) |
| CI (lint/typecheck/test + server job); packaging/signing config; auto-update wiring | ✅ | #4, #7 |

These are unit/contract-tested (549 app + 19 server), typechecked, and bundle cleanly. Because this environment is headless Linux
with no Electron runtime, **none have had a live macOS end-to-end run** — that is the first item
below.

## Remaining before release

### A. Verifiable on a Mac (no external accounts)

- [ ] **Live E2E smoke on macOS**: install → onboarding → grant permissions → Option-tap generates
      and pastes into a real app; Option+Space panel; streaming renders; history/redaction/telemetry
      toggles behave. (Blocked only by needing a Mac.)
- [ ] **App/tray icon assets** (#7): `build/icon.icns` from a 1024² source + a menu-bar template PNG
      (tray is currently `nativeImage.createEmpty()`). Needs a designed asset + `iconutil`.

### B. Needs external accounts / infrastructure

- [ ] **#17 signed + notarized build**: Apple Developer Program membership + certificate; set the
      `MAC_CSC_*` / `APPLE_*` secrets and run `.github/workflows/release.yml`. Config + workflow are
      ready; only the credentials and a real run remain. Auto-update also requires a signed build.
- [x] **#14 backend MVP** (approved pivot): built + contract-tested in `server/` (Hono/Workers —
      JWT auth + SSE inference proxy + KV usage meter), and the app-side hosted client is wired.
      **Remaining: deploy** — needs a Cloudflare (or Fly) account and an inference-provider key;
      then `wrangler deploy` and set the app's Hosted account URL. See `server/README.md`.
- [~] **#15 accounts + Stripe billing**: mostly built + contract-tested. The app maps `429` to a
      paywall (`quota_exceeded` → upgrade message + `paywall_shown` telemetry); the backend has the
      **Stripe webhook** (signature-verified, idempotent, drives the plan store) and **`/auth/token`
      plan-token minting**. **Remaining (needs accounts/decisions):** wire an auth-provider adapter
      (`verifyIdentity` for Clerk/Supabase), add a Stripe Checkout-session creation endpoint + the
      web subscribe/portal flow, and configure the Stripe webhook + secrets. Prices/quota are config
      (`server/src/quota.ts`).
- [ ] **Sentry crash reporting**: the analytics half of #12 is done; crash reporting still needs
      `@sentry/electron` + a DSN (wire like the guarded updater/telemetry init).
- [ ] **Landing page + Privacy Policy + Terms** (#17): download page with the "Option-tap" demo
      video, pricing, and legally-reviewed policy/ToS covering telemetry + hosted inference.

### C. Test coverage to add (tracked in growth-plan §4)

- [x] LLM eval harness (`pnpm eval:prompts`): builds real prompts from the context fixtures,
      generates live, and scores with deterministic rules (`src/shared/eval.ts`, unit-tested) —
      language match / no-preamble / length / no company-context leakage. Key-gated; run before
      shipping prompt changes.
- [ ] Playwright + Electron E2E on `macos-14`
- [ ] macOS CI job (unit + `swiftc -parse` + `electron-builder dir` smoke)
- [ ] Renderer component tests (App.tsx state transitions)
- [ ] Perf bench asserting P50/P95 soft budgets from the new timings
- [ ] Backend contract tests (auth/quota/SSE/Stripe webhook idempotency)

## Bottom line

The **application is feature-complete and green for a BYOK (bring-your-own-API-key) build**, pending
a Mac E2E pass and an icon. The **hosted-inference backend is built and contract-tested** and only
needs deploying. A **public, monetized release** additionally requires the founder to provision
Apple Developer, cloud (deploy the backend), Stripe, and auth accounts, then build the thin account
service that mints plan tokens (#15) — the app already routes to the backend and surfaces the
paywall on quota. The code and CI are structured so those integrations drop in via secrets/env
without further app refactoring.
