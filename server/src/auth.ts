/**
 * Minimal HS256 JWT sign/verify built on Web Crypto, so it runs unchanged on Node and Cloudflare
 * Workers. Tokens carry the anonymous/account subject and the plan; the inference proxy trusts only
 * a valid, unexpired signature.
 */

export type Plan = 'free' | 'pro'

export type TokenPayload = {
  sub: string
  plan: Plan
  /** Expiry, seconds since epoch. */
  exp: number
}

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  let result = ''
  for (let i = 0; i < binary.length; i++) result += String.fromCharCode(binary.charCodeAt(i))
  return result
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ])
}

/** Signs a payload. `nowSeconds` is injectable so tests are deterministic. */
export async function signJwt(
  payload: Omit<TokenPayload, 'exp'> & { exp?: number },
  secret: string,
  options: { ttlSeconds?: number; nowSeconds?: number } = {}
): Promise<string> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const exp = payload.exp ?? now + (options.ttlSeconds ?? 3600)
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64UrlEncode(encoder.encode(JSON.stringify({ sub: payload.sub, plan: payload.plan, exp })))
  const data = `${header}.${body}`
  const key = await hmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
  return `${data}.${base64UrlEncode(sig)}`
}

/**
 * Verifies signature and expiry, returning the payload or null. `nowSeconds` is injectable. Never
 * throws on malformed input — a bad token is simply `null`.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  options: { nowSeconds?: number } = {}
): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts
    const key = await hmacKey(secret)
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`)))
    const provided = Uint8Array.from(base64UrlDecodeToString(signature), (c) => c.charCodeAt(0))
    if (!timingSafeEqual(expected, provided)) return null

    const payload = JSON.parse(base64UrlDecodeToString(body)) as Partial<TokenPayload>
    if (typeof payload.sub !== 'string' || (payload.plan !== 'free' && payload.plan !== 'pro')) return null
    if (typeof payload.exp !== 'number') return null
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (payload.exp <= now) return null
    return { sub: payload.sub, plan: payload.plan, exp: payload.exp }
  } catch {
    return null
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Extracts a bearer token from an Authorization header value. */
export function bearerFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}
