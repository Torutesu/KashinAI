/**
 * Telemetry event catalog and a hard property whitelist.
 *
 * The single most important privacy rule for this product: captured screen text, generated output,
 * and API keys must NEVER be sent. Rather than trusting every call site, the whitelist here is the
 * choke point — only the explicitly-listed, non-sensitive property keys survive `sanitizeTelemetry`,
 * and only primitive values within a small length cap. Unknown events are rejected outright.
 */

export type TelemetryEventName =
  | 'app_installed'
  | 'app_launched'
  | 'onboarding_step_completed'
  | 'onboarding_finished'
  | 'permission_granted'
  | 'first_generation'
  | 'first_paste'
  | 'option_tap'
  | 'generation_completed'
  | 'paste_performed'
  | 'paywall_shown'
  | 'subscribed'
  | 'telemetry_opted_out'

export type TelemetryProperties = Record<string, string | number | boolean>

/** Per-event allow-list of property keys. Every listed key must be non-sensitive by construction. */
const EVENT_PROPERTY_ALLOWLIST: Record<TelemetryEventName, readonly string[]> = {
  app_installed: [],
  app_launched: ['version'],
  onboarding_step_completed: ['step'],
  onboarding_finished: ['skipped'],
  permission_granted: ['kind'],
  first_generation: [],
  first_paste: [],
  option_tap: [],
  generation_completed: [
    'kind',
    'context_kind',
    'provider',
    'model',
    'success',
    'latency_ms',
    'gbrain_ms',
    'llm_ms'
  ],
  paste_performed: ['source'],
  paywall_shown: [],
  subscribed: ['plan'],
  telemetry_opted_out: []
}

/** Defensive cap so a whitelisted-but-unexpectedly-long string can never smuggle content out. */
const MAX_STRING_LENGTH = 120

export function isKnownTelemetryEvent(name: string): name is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PROPERTY_ALLOWLIST, name)
}

/**
 * Returns only the allow-listed, primitive, length-capped properties for `event`. Returns null when
 * the event is unknown (caller should drop it). Never throws.
 */
export function sanitizeTelemetry(
  event: string,
  properties: Record<string, unknown> | undefined
): { event: TelemetryEventName; properties: TelemetryProperties } | null {
  if (!isKnownTelemetryEvent(event)) return null
  const allowed = EVENT_PROPERTY_ALLOWLIST[event]
  const out: TelemetryProperties = {}

  if (properties) {
    for (const key of allowed) {
      const value = properties[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value
      } else if (typeof value === 'boolean') {
        out[key] = value
      } else if (typeof value === 'string' && value.length <= MAX_STRING_LENGTH) {
        out[key] = value
      }
      // Anything else (objects, arrays, long strings, non-allowlisted keys) is silently dropped.
    }
  }

  return { event, properties: out }
}
