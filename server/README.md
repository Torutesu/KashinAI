# KashinAI Server (hosted inference)

The backend that lets the desktop app generate without the user pasting an API key (Growth #14).
Thin by design: **authenticate → meter usage → proxy the model stream**. It never stores screen
text or generated output.

Runs on Cloudflare Workers (Hono). Isolated from the Electron app — its own `package.json`,
`node_modules`, typecheck, and tests.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness |
| POST | `/auth/token` | auth provider | Mint a signed plan token for the verified user |
| POST | `/webhooks/stripe` | Stripe signature | Subscription events → plan updates (idempotent) |
| GET | `/v1/entitlement` | Bearer JWT | Current plan + daily usage/remaining |
| POST | `/v1/billing/checkout` | Bearer JWT | Create a Stripe Checkout session (subscribe) → `{ url }` |
| POST | `/v1/inference` | Bearer JWT | Quota-checked SSE inference proxy (Anthropic) |

`/v1/inference` request body: `{ "system": string, "user": string, "temperature"?: number, "model"?: string }`.
Response is `text/event-stream` — the same SSE frames the app already parses (`src/shared/sse.ts`).
When the free daily quota is exhausted it returns `429 { "error": "quota_exceeded", ... }`, which the
app maps to the paywall (Growth #15).

## Auth & billing (#15)

### Default model: anonymous device (cheapest, no auth provider)

`/v1/*` accepts **device credentials** — the desktop app sends `x-device-id` + `x-device-secret`
(a random id + secret it generates once). First sight registers the secret hash (trust-on-first-use,
`src/device.ts`); later requests must match. No login, no email, no Clerk/Supabase — free to run.

Pro is tied to the **device id**: `POST /v1/billing/checkout` opens Stripe Checkout with the device
id as `client_reference_id`, and `POST /webhooks/stripe` (signature-verified, idempotent) sets
`plan:<deviceId>` in KV. The next request for that device sees `plan: pro`.

### Optional: JWT / web login (future)

`/v1/*` also accepts a `Bearer` HS256 JWT (`JWT_SECRET`), and `POST /auth/token` mints one — but
only once an auth-provider adapter (`verifyIdentity`) is wired in `index.ts`. Not needed for the
device model above; add it later if you want cross-device accounts or a web dashboard.

## Cheapest launch (all free tiers)

1. `wrangler kv namespace create USAGE_KV` → put the id in `wrangler.toml`.
2. `wrangler secret put JWT_SECRET` (any random string), `wrangler secret put ANTHROPIC_API_KEY`.
3. `wrangler deploy`.
4. In the app: Settings → Hosted account → Backend URL = your Worker URL. Free generation works
   immediately (device auto-registers).
5. To enable Pro: create a Stripe product/price, then
   `wrangler secret put STRIPE_SECRET_KEY`, set `STRIPE_PRICE_ID`, add a Stripe webhook to
   `/webhooks/stripe` and `wrangler secret put STRIPE_WEBHOOK_SECRET`.

Cloudflare Workers + KV and Stripe both have free tiers, so there's no fixed monthly cost to start.

## Local dev / tests

```bash
cd server
pnpm install --ignore-workspace
pnpm typecheck      # tsc over src (Workers libs)
pnpm test           # node --test contract suite (auth, quota, app)
```

## Deploy

```bash
wrangler kv namespace create USAGE_KV      # then fill the id in wrangler.toml
wrangler secret put JWT_SECRET
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

## Next integration steps

- **App-side client**: add a hosted path in the desktop app that POSTs to `/v1/inference` with the
  account token and streams the response through the existing SSE parser (drop-in once accounts exist).
- **Billing (#15)**: the account service verifies Stripe subscription state and mints `plan: 'pro'`
  tokens; on `quota_exceeded` the app shows the paywall.
- **Provider routing**: extend `Upstream` to pick a fast model for the tap path and a stronger model
  for panel/action requests (the request already implies purpose via which prompt is sent).
