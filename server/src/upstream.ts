/**
 * Upstream inference provider. Streams from Anthropic and returns the raw SSE Response so the proxy
 * can pipe the body straight to the client. `fetchImpl` is injectable for contract tests.
 */

export type InferenceRequest = {
  model: string
  system: string
  user: string
  temperature: number
  signal?: AbortSignal
}

export type UpstreamConfig = {
  anthropicApiKey: string
  fetchImpl?: typeof fetch
}

export interface Upstream {
  stream(req: InferenceRequest): Promise<Response>
}

export function createAnthropicUpstream(config: UpstreamConfig): Upstream {
  const doFetch = config.fetchImpl ?? fetch
  return {
    async stream(req: InferenceRequest): Promise<Response> {
      return doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: 2048,
          temperature: req.temperature,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          stream: true
        }),
        signal: req.signal
      })
    }
  }
}
