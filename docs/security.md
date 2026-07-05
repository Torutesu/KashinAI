# Security & Privacy

This document describes ContextAssistant's privacy stance and MVP security posture, per the technical brief sections 16.3 (privacy policy) and 17.1 (MVP security).

## Privacy Stance (brief §16.3)

To keep the psychological barrier to adoption low, the MVP commits to the following:

- The screen is **not** recorded continuously.
- The app does **not** store a full history of user activity.
- Processing centers on the text the user explicitly selects (plus an explicit clipboard fallback), not passive screen capture.
- Retrieved sources are shown to the user **before** they act on generated output.
- The app never sends anything automatically — there is no auto-send.
- The user always reviews generated content before copying or inserting it anywhere.

## MVP Security (brief §17.1)

The MVP targets self-use or small-team use, so complex multi-tenant permission systems are explicitly out of scope for now. That said, the following are considered from day one:

- API keys are stored locally and securely (OS keychain where available), never in plain config committed to source control.
- The GBrain token is never exposed in plaintext in logs, UI, or generated output.
- The user can review exactly what information is being sent to the LLM (the assembled Context Pack, including retrieved GBrain context) before generation.
- Every generated result displays the GBrain sources it was grounded in (e.g. `customers/customer_a.md`), so provenance is always visible.
- The system prompt explicitly instructs the LLM not to mix internal notes into customer-facing text and not to leak internal context into external-facing drafts (see brief §14.1, and the "社内メモ" sections used throughout `brain/customers/*.md`).

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
