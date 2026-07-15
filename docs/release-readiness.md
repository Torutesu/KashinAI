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
- [x] **#15 accounts + Stripe billing**: built + contract-tested end-to-end with the **cheapest
      model — anonymous device credentials, no auth provider** (no Clerk/Supabase, no login, no
      email). The app auto-registers a device; the backend meters the free quota; Stripe Checkout →
      signature-verified idempotent webhook → plan store ties **Pro to the device**; the app shows an
      Upgrade button on `quota_exceeded`. **Remaining: deploy + a Stripe product** (set the Stripe
      secrets + webhook). Cloudflare and Stripe both have free tiers → no fixed monthly cost. See
      `server/README.md` → "Cheapest launch". Prices/quota are config (`server/src/quota.ts`).
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
- [x] macOS CI job (unit + `swiftc -parse` + `electron-builder dir` smoke)
- [x] Backend contract tests (auth/quota/SSE/device/Stripe webhook idempotency/checkout) — 42 tests
- [ ] Renderer component tests (App.tsx state transitions)
- [ ] Perf bench asserting P50/P95 soft budgets from the new timings
- [ ] E2E (Playwright + Electron on macos-14)

## Bottom line

The **app and the full hosted-inference + monetization backend are built, contract-tested, and
green** (558 app + 42 server tests). Billing uses the **cheapest model — anonymous device
credentials, no auth provider** — so there is no provider decision left to make. What remains to
ship is operational, not code:

1. **Deploy the backend** — a Cloudflare account (free tier) + an inference key, then `wrangler
   deploy`; set the app's Hosted account URL. Free generation works immediately; add Stripe secrets
   to enable Pro. (`server/README.md` → "Cheapest launch".)
2. **Sign + distribute the app (#17)** — Apple Developer membership + a designed icon; the signing
   config, notarization, release workflow, and auto-update are already wired.
3. **A Mac E2E pass** of the Option-tap flow.

Everything drops in via secrets/env with no further app refactoring.
