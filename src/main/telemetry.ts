import { app } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { sanitizeTelemetry } from '../shared/telemetry'
import { getSettings } from './settings'

/**
 * Product analytics, privacy-first:
 * - Opt-out honored on every capture (privacy.telemetryEnabled).
 * - Only allow-listed, primitive, length-capped properties leave the process (sanitizeTelemetry).
 *   Captured screen text, generated output, and API keys can never be sent.
 * - Anonymous, stable install id; no account/PII by default.
 * - The PostHog transport is loaded only when a key is configured; otherwise this is a no-op, so
 *   dev/test/self-hosted runs send nothing.
 */

type TelemetryStore = {
  anonymousId: string | null
  installReported: boolean
}

type Transport = {
  capture(input: { distinctId: string; event: string; properties: Record<string, string | number | boolean> }): void
  shutdown(): Promise<void>
}

const store = new Store<TelemetryStore>({
  name: 'telemetry',
  defaults: { anonymousId: null, installReported: false }
})

let transport: Transport | null = null
let anonymousId = ''

function resolveAnonymousId(): string {
  const existing = store.get('anonymousId')
  if (existing) return existing
  const generated = randomUUID()
  store.set('anonymousId', generated)
  return generated
}

function posthogKey(): string | undefined {
  return process.env.KASHINAI_POSTHOG_KEY || undefined
}

/** Sets up the anonymous id and (when a key is configured) the PostHog transport. Never throws. */
export async function initTelemetry(): Promise<void> {
  try {
    anonymousId = resolveAnonymousId()

    const key = posthogKey()
    if (key) {
      try {
        const { PostHog } = await import('posthog-node')
        const client = new PostHog(key, {
          host: process.env.KASHINAI_POSTHOG_HOST || 'https://us.i.posthog.com',
          flushAt: 1,
          flushInterval: 10000
        })
        transport = {
          capture: (input) => client.capture(input),
          shutdown: () => client.shutdown()
        }
      } catch {
        transport = null
      }
    }

    if (!store.get('installReported')) {
      captureTelemetry('app_installed', {})
      store.set('installReported', true)
    }
    captureTelemetry('app_launched', { version: app.getVersion?.() ?? '' })
  } catch {
    // Telemetry is best-effort; never let it break startup.
  }
}

/**
 * Captures an event after enforcing opt-out and the property allow-list. Safe to call from anywhere
 * in the main process; unknown events and disabled telemetry are silently dropped.
 */
export function captureTelemetry(event: string, properties?: Record<string, unknown>): void {
  try {
    if (!getSettings().privacy.telemetryEnabled) return
    const sanitized = sanitizeTelemetry(event, properties)
    if (!sanitized) return
    transport?.capture({ distinctId: anonymousId, event: sanitized.event, properties: sanitized.properties })
  } catch {
    // Ignore — telemetry must never affect app behavior.
  }
}

export async function shutdownTelemetry(): Promise<void> {
  try {
    await transport?.shutdown()
  } catch {
    // Ignore.
  }
}
