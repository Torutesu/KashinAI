import type { Plan } from './auth.ts'

/**
 * Stripe webhook verification and event → plan mapping. Verifies the `Stripe-Signature` header
 * (HMAC-SHA256 over `${t}.${payload}`) within a timestamp tolerance, using Web Crypto so it runs on
 * Workers. No Stripe SDK needed for webhook intake.
 */

const encoder = new TextEncoder()

export function parseStripeSignature(header: string | null | undefined): { t: number; v1: string } | null {
  if (!header) return null
  let t: number | null = null
  let v1: string | null = null
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (k?.trim() === 't') t = Number(v)
    if (k?.trim() === 'v1') v1 = v?.trim() ?? null
  }
  if (t === null || Number.isNaN(t) || !v1) return null
  return { t, v1 }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifies a Stripe webhook signature. Returns true only if the signature matches and the timestamp
 * is within `toleranceSec` of `nowMs`. Never throws.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null | undefined,
  secret: string,
  nowMs: number,
  toleranceSec = 300
): Promise<boolean> {
  try {
    const parsed = parseStripeSignature(signatureHeader)
    if (!parsed) return false
    const nowSec = Math.floor(nowMs / 1000)
    if (Math.abs(nowSec - parsed.t) > toleranceSec) return false

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${parsed.t}.${payload}`)))
    return timingSafeEqualHex(toHex(sig), parsed.v1)
  } catch {
    return false
  }
}

/** Signs a payload the way Stripe would — used by contract tests to build valid webhook headers. */
export async function signStripePayload(payload: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)))
  return `t=${timestamp},v1=${toHex(sig)}`
}

type StripeEvent = {
  id?: string
  type?: string
  data?: { object?: Record<string, unknown> }
}

/** Extracts the subject id a Stripe object references (client_reference_id or metadata.userId). */
function subjectFrom(obj: Record<string, unknown> | undefined): string | null {
  if (!obj) return null
  const ref = obj.client_reference_id
  if (typeof ref === 'string' && ref) return ref
  const metadata = obj.metadata as Record<string, unknown> | undefined
  const metaUser = metadata?.userId
  return typeof metaUser === 'string' && metaUser ? metaUser : null
}

/**
 * Maps a subscription-lifecycle event to a plan change, or null when it is not relevant. Active or
 * trialing subscriptions grant Pro; cancellation/expiry drops back to Free.
 */
export function planFromStripeEvent(event: StripeEvent): { userId: string; plan: Plan } | null {
  const obj = event.data?.object
  const userId = subjectFrom(obj)
  if (!userId) return null

  switch (event.type) {
    case 'checkout.session.completed':
      return { userId, plan: 'pro' }
    case 'customer.subscription.updated': {
      const status = obj?.status
      return { userId, plan: status === 'active' || status === 'trialing' ? 'pro' : 'free' }
    }
    case 'customer.subscription.deleted':
      return { userId, plan: 'free' }
    default:
      return null
  }
}
