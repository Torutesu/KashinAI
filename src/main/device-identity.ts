import Store from 'electron-store'
import { randomUUID } from 'node:crypto'

/**
 * Anonymous device credentials for the cheapest/simplest hosted-account model: no login, no auth
 * provider. A random device id + secret are generated once and reused; the backend registers the
 * secret on first sight (trust-on-first-use) and ties the Pro plan to the device id via Stripe.
 * Kept out of user settings — this is internal, like the telemetry anonymous id.
 */

type DeviceStore = {
  deviceId: string | null
  deviceSecret: string | null
}

const store = new Store<DeviceStore>({
  name: 'device',
  defaults: { deviceId: null, deviceSecret: null }
})

/** Returns the device credentials, generating and persisting them on first use. */
export function getDeviceCredentials(): { deviceId: string; deviceSecret: string } {
  let deviceId = store.get('deviceId')
  let deviceSecret = store.get('deviceSecret')
  if (!deviceId || !deviceSecret) {
    deviceId = deviceId || randomUUID()
    // 64 hex chars — well above the backend's minimum-length check.
    deviceSecret = deviceSecret || `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
    store.set('deviceId', deviceId)
    store.set('deviceSecret', deviceSecret)
  }
  return { deviceId, deviceSecret }
}
