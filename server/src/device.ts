/**
 * Device-credential auth: the cheapest, simplest account model — no third-party auth provider, no
 * login, no email. The desktop app generates a random `deviceId` + `deviceSecret` once and presents
 * them on every request. First sight of a device registers its secret hash (trust-on-first-use);
 * later requests must match. Pro is tied to the deviceId via Stripe `client_reference_id`.
 */

const encoder = new TextEncoder()

export interface DeviceStore {
  getSecretHash(deviceId: string): Promise<string | null>
  setSecretHash(deviceId: string, hash: string): Promise<void>
}

export class MemoryDeviceStore implements DeviceStore {
  private hashes = new Map<string, string>()

  async getSecretHash(deviceId: string): Promise<string | null> {
    return this.hashes.get(deviceId) ?? null
  }

  async setSecretHash(deviceId: string, hash: string): Promise<void> {
    this.hashes.set(deviceId, hash)
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)))
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifies a device's secret, registering it on first sight (TOFU). Returns false for missing
 * credentials, an obviously-weak secret, or a mismatch against the stored hash.
 */
export async function verifyOrRegisterDevice(
  store: DeviceStore,
  deviceId: string | undefined,
  deviceSecret: string | undefined
): Promise<boolean> {
  if (!deviceId || !deviceSecret || deviceSecret.length < 16) return false
  const hash = await sha256Hex(deviceSecret)
  const existing = await store.getSecretHash(deviceId)
  if (existing === null) {
    await store.setSecretHash(deviceId, hash)
    return true
  }
  return timingSafeEqual(existing, hash)
}
