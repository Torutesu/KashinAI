# KashinAI Server (BYOK license server)

The backend for the **BYOK + subscription** model. Users generate with **their own** LLM API key on
their machine — this service never runs inference and holds no provider key, so the operator's key
can never be spent by end-users. It only:

- authenticates a device (or a JWT),
- reports the device's plan (`free` / `pro`),
- runs Stripe Checkout + webhooks to move a device to Pro.

The free daily generation cap is enforced **client-side** (the app counts locally); Pro unlocks
unlimited use and is verified here via the Stripe-driven plan store.

Runs on Cloudflare Workers (Hono). Isolated from the Electron app — its own `package.json`,
`node_modules`, typecheck, and tests. No fixed monthly cost (Workers + KV + Stripe all have free tiers).

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness |
| POST | `/auth/token` | auth provider | Mint a signed plan token for the verified user (optional web/login path) |
| POST | `/webhooks/stripe` | Stripe signature | Subscription events → plan updates (idempotent) |
| GET | `/v1/license` | device or JWT | Current plan + client-enforced free daily limit → `{ plan, freeDailyLimit }` |
| POST | `/v1/billing/checkout` | device or JWT | Create a Stripe Checkout session (subscribe) → `{ url }` |

There is **no inference endpoint** — generation happens entirely in the app with the user's key.

## Auth & billing

### Default model: anonymous device (cheapest, no auth provider)

`/v1/*` accepts **device credentials** — the desktop app sends `x-device-id` + `x-device-secret`
(a random id + secret it generates once). First sight registers the secret hash (trust-on-first-use,
`src/device.ts`); later requests must match. No login, no email, no Clerk/Supabase — free to run.

Pro is tied to the **device id**: `POST /v1/billing/checkout` opens Stripe Checkout with the device
id as `client_reference_id`, and `POST /webhooks/stripe` (signature-verified, idempotent) sets
`plan:<deviceId>` in KV. The next `/v1/license` for that device sees `plan: pro`.

### Optional: JWT / web login (future)

`/v1/*` also accepts a `Bearer` HS256 JWT (`JWT_SECRET`), and `POST /auth/token` mints one — but
only once an auth-provider adapter (`verifyIdentity`) is wired in `index.ts`. Not needed for the
device model above; add it later if you want cross-device accounts or a web dashboard.

## Cheapest launch (all free tiers)

1. `wrangler kv namespace create LICENSE_KV` → put the id in `wrangler.toml`.
2. `wrangler secret put JWT_SECRET` (any random string).
3. `wrangler deploy`.
4. In the app: Settings → Account → License server URL = your Worker URL. Free use works immediately
   (device auto-registers); the app enforces the free daily limit locally.
5. To enable Pro: create a Stripe product/price, then
   `wrangler secret put STRIPE_SECRET_KEY`, set `STRIPE_PRICE_ID`, add a Stripe webhook to
   `/webhooks/stripe` and `wrangler secret put STRIPE_WEBHOOK_SECRET`.

## Local dev / tests

```bash
cd server
pnpm install --ignore-workspace
pnpm typecheck      # tsc over src (Workers libs)
pnpm test           # node --test contract suite (auth, stripe, billing, app)
```

## Deploy

```bash
wrangler kv namespace create LICENSE_KV    # then fill the id in wrangler.toml
wrangler secret put JWT_SECRET
wrangler deploy
```
