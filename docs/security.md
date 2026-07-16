# Security & Privacy

This document describes KashinAI's privacy stance and MVP security posture, per the technical brief sections 16.3 (privacy policy) and 17.1 (MVP security).

## Privacy Stance (brief §16.3)

To keep the psychological barrier to adoption low, the MVP commits to the following:

- The screen is **not** recorded continuously.
- The app does **not** store a full history of user activity.
- Processing centers on the text the user explicitly selects (plus an explicit clipboard fallback), not passive screen capture.
- Retrieved sources are shown to the user **before** they act on generated output.
- The app never sends anything automatically — there is no auto-send. Generated text may be
  pasted into the active field, but it is never submitted, emailed, or posted on the user's
  behalf; the user always performs the final send action themselves.
- There are two explicit, user-initiated gestures with different review models:
  - **Option + Space** opens the floating panel so the user can review the generated suggestion
    (and its sources) before copying or inserting it.
  - **A single Option tap** is an opt-in fast path: it reads the current context, generates one
    suggestion, and inserts it directly into the active field without a separate review step.
    This is deliberate for speed; because nothing is auto-sent, the user still reviews the pasted
    text in place and controls whether it is ever sent onward.

## MVP Security (brief §17.1)

The MVP targets self-use or small-team use, so complex multi-tenant permission systems are explicitly out of scope for now. That said, the following are considered from day one:

- API keys are stored locally and securely (OS keychain where available), never in plain config committed to source control.
- The GBrain token is never exposed in plaintext in logs, UI, or generated output.
- The user can review exactly what information is being sent to the LLM (the assembled Context Pack, including retrieved GBrain context) before generation.
- Every generated result displays the GBrain sources it was grounded in (e.g. `customers/customer_a.md`), so provenance is always visible.
- The system prompt explicitly instructs the LLM not to mix internal notes into customer-facing text and not to leak internal context into external-facing drafts (see brief §14.1, and the "社内メモ" sections used throughout `brain/customers/*.md`).

## Anonymous Usage Analytics (opt-out)

KashinAI includes anonymous product analytics to understand the activation funnel and latency
(Settings → Privacy → "Anonymous usage analytics", `privacy.telemetryEnabled`, default **on**).

What is sent:

- A stable, random **anonymous install id** (no account, email, or device identifiers by default).
- A small set of **named events**: install, launch, onboarding step/finish, permission granted,
  first generation/paste, generation completed, paste performed, paywall shown, subscribed.
- For those events, only **allow-listed, non-sensitive properties** — e.g. latency in ms, model
  name, provider, context kind (social/browser/…), onboarding step, plan. Nothing else.

What is **never** sent — enforced structurally, not by convention:

- Captured screen text, Accessibility text, OCR text, selected text, clipboard contents.
- Generated output.
- API keys or the GBrain token.

The choke point is `sanitizeTelemetry()` in `src/shared/telemetry.ts`: every event passes through a
per-event property allow-list that drops unknown keys, non-primitive values, and over-long strings,
and rejects unknown events entirely (covered by unit tests). Transport is off unless a PostHog key
is configured, and every capture re-checks the opt-out. Turning analytics off stops all of it.

## Sensitive-Text Redaction (opt-in)

Because on-screen capture (Accessibility text, screenshot OCR, selection) can contain sensitive
data, KashinAI ships an **opt-in** redaction filter (Settings → Privacy → "Redact sensitive text",
`privacy.redactSensitive`, default **off**).

When enabled, the free-text context fields (`pageText`, `accessibilityText`, `screenText`,
`selectedText`, `clipboardText`, `pageTitle`, `windowTitle`) are passed through
`redactSensitive()` (`src/shared/redaction.ts`) before the Context Pack is built — so masking
happens ahead of both the GBrain search query and the LLM prompt. Structural fields (app name, URL,
capture methods) are left intact.

Current patterns masked:

- Email addresses → `[redacted-email]`
- API-key / bearer-token shapes (e.g. `sk-…`, `ghp_…`) → `[redacted-key]`
- Long digit runs (12+, card/account-like) → `[redacted-number]`
- Phone-like number sequences → `[redacted-phone]`

Design intent and limitations:

- **Default off**: the core use case is sending your *own* screen to your *own* provider, so
  redaction is a deliberate choice, not a surprise. Teams with stricter policies turn it on.
- **Best-effort, not a guarantee**: this is a high-signal regex filter, not DLP. It reduces the most
  common accidental leaks; it does not detect every sensitive value (names, addresses, free-form
  secrets).
- **Future work**: a per-capture consent gate (preview + confirm before send), configurable custom
  patterns, and allow/deny lists per app or domain. Tracked alongside the Phase 2 items below.

## Future Security Considerations (Phase 2+, brief §17.2)

Not built in the MVP, but expected as the product matures:

- Per-user and per-team access permissions
- Per-customer access control (e.g. restricting who can retrieve `customers/customer_b.md`)
- Audit logging of GBrain queries and LLM calls
- Data masking for sensitive fields
- Full OAuth integrations for connected SaaS tools
- An admin dashboard
- SOC2-equivalent controls

## Data Handling Principles Applied to `brain/`

The seed knowledge base itself follows the same discipline the product enforces at runtime:

- Each customer file separates externally-shareable facts from an explicit "社内メモ" (internal memo) section that must never be forwarded verbatim in customer-facing output.
- Pricing, contract, and security policies are kept as their own documents (`brain/company/pricing.md`, `contract_policy.md`, `security_policy.md`) so prompts can be instructed to treat them as authoritative rather than improvising numbers.

## Related Documents

- docs/architecture.md
- brain/company/security_policy.md
- brain/company/contract_policy.md
