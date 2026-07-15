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
| POST | `/v1/inference` | Bearer JWT | Quota-checked SSE inference proxy (Anthropic) |

`/v1/inference` request body: `{ "system": string, "user": string, "temperature"?: number, "model"?: string }`.
Response is `text/event-stream` — the same SSE frames the app already parses (`src/shared/sse.ts`).
When the free daily quota is exhausted it returns `429 { "error": "quota_exceeded", ... }`, which the
app maps to the paywall (Growth #15).

## Auth & billing (#15)

Tokens are HS256 JWTs signed with `JWT_SECRET`, carrying `{ sub, plan, exp }`.

- **Plan source of truth**: `POST /webhooks/stripe` verifies the Stripe signature and updates the
  KV plan store (`plan:<userId>`). It is idempotent by Stripe event id. Set `STRIPE_WEBHOOK_SECRET`
  and point a Stripe webhook (checkout.session.completed, customer.subscription.updated/deleted) at
  this route.
- **Token minting**: `POST /auth/token` mints a token carrying the user's current plan — but only
  once an **auth provider adapter** is wired. Implement `verifyIdentity(headers)` in `index.ts`
  (verify the Clerk/Supabase session from the `Authorization` header) and pass it to `createApp`.
  Until then the route returns `501`.

`src/auth.ts` `signJwt` is used by tests and can seed a local token for manual testing.

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
