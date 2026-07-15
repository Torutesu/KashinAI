import type { ErrorCode, LlmProvider } from '../shared/types'
import { createSseParser } from '../shared/sse'

export class LlmError extends Error {
  code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'LlmError'
  }
}

export type GenerateParams = {
  provider: LlmProvider
  apiKey: string
  model: string
  temperature: number
  system: string
  user: string
  /** Called with each incremental text delta as the response streams in. */
  onDelta?: (text: string) => void
  /** Aborts the in-flight request (e.g. when the user cancels or triggers a new generation). */
  signal?: AbortSignal
}

async function safeReadJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function getNested(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current
}

/**
 * Reads a provider's SSE response body, forwarding each text delta to `onDelta` and returning the
 * accumulated full text. Shared across providers since only the per-provider delta framing differs
 * (handled by createSseParser).
 */
async function consumeStream(
  response: Response,
  provider: LlmProvider,
  onDelta?: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    // No streamable body: fall back to reading the whole payload is not possible here, so surface it.
    throw new LlmError('llm_request_failed', `${provider} returned an empty response stream.`)
  }
  const decoder = new TextDecoder()
  const parser = createSseParser(provider)
  let full = ''

  let read = await reader.read()
  while (!read.done) {
    const chunk = decoder.decode(read.value, { stream: true })
    for (const delta of parser.push(chunk)) {
      full += delta
      onDelta?.(delta)
    }
    read = await reader.read()
  }
  for (const delta of parser.flush()) {
    full += delta
    onDelta?.(delta)
  }

  if (!full) {
    throw new LlmError('llm_request_failed', `${provider} returned an unexpected empty response.`)
  }
  return full
}

async function generateAnthropic(params: GenerateParams): Promise<string> {
  const model = params.model || 'claude-sonnet-4-5'
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: params.temperature,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
        stream: true
      }),
      signal: params.signal
    })
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach Anthropic API: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error', 'message']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `Anthropic API error (${message}). Check your API key and model name in Settings.`)
  }

  return consumeStream(response, 'anthropic', params.onDelta)
}

async function generateOpenAI(params: GenerateParams): Promise<string> {
  const model = params.model || 'gpt-4o-mini'
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature,
        stream: true,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user }
        ]
      }),
      signal: params.signal
    })
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach OpenAI API: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error', 'message']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `OpenAI API error (${message}). Check your API key and model name in Settings.`)
  }

  return consumeStream(response, 'openai', params.onDelta)
}

async function generateGemini(params: GenerateParams): Promise<string> {
  const model = params.model || 'gemini-1.5-flash'
  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${params.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: [{ role: 'user', parts: [{ text: params.user }] }],
          generationConfig: { temperature: params.temperature }
        }),
        signal: params.signal
      }
    )
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach Gemini API: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error', 'message']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `Gemini API error (${message}). Check your API key and model name in Settings.`)
  }

  return consumeStream(response, 'gemini', params.onDelta)
}

export type HostedGenerateParams = {
  hostedUrl: string
  token: string
  model: string
  temperature: number
  system: string
  user: string
  onDelta?: (text: string) => void
  signal?: AbortSignal
}

/**
 * Generates via the KashinAI hosted backend (no user API key). POSTs to /v1/inference with the
 * account token and streams the SSE response through the same parser. Maps a 429 to the
 * 'quota_exceeded' error code so the renderer can surface the paywall.
 */
export async function generateHosted(params: HostedGenerateParams): Promise<string> {
  const base = params.hostedUrl.replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${base}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.token}`
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        system: params.system,
        user: params.user
      }),
      signal: params.signal
    })
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach KashinAI backend: ${(err as Error).message}`)
  }

  if (response.status === 429) {
    throw new LlmError('quota_exceeded', 'You have reached your free daily limit. Upgrade to Pro for unlimited use.')
  }
  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `KashinAI backend error (${message}).`)
  }

  return consumeStream(response, 'anthropic', params.onDelta)
}

/**
 * Provider-agnostic text generation. Streams internally (forwarding deltas to params.onDelta when
 * provided) and returns the full text. Throws LlmError with a distinct code per brief 20.3 so the
 * renderer can render an actionable message (e.g. "check API key -> open settings").
 */
export async function generate(params: GenerateParams): Promise<string> {
  if (!params.apiKey) {
    throw new LlmError(
      'llm_missing_api_key',
      `No API key configured for ${params.provider}. Open Settings and add your ${params.provider} API key.`
    )
  }

  switch (params.provider) {
    case 'anthropic':
      return generateAnthropic(params)
    case 'openai':
      return generateOpenAI(params)
    case 'gemini':
      return generateGemini(params)
    default:
      throw new LlmError('llm_unknown_provider', `Unknown LLM provider: ${String(params.provider)}`)
  }
}
