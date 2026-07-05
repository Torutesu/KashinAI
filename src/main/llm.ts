import type { ErrorCode, LlmProvider } from '../shared/types'

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
        messages: [{ role: 'user', content: params.user }]
      })
    })
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach Anthropic API: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error', 'message']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `Anthropic API error (${message}). Check your API key and model name in Settings.`)
  }

  const data = await safeReadJson(response)
  const content = getNested(data, ['content']) as Array<{ type: string; text?: string }> | undefined
  const text = content?.find((block) => block.type === 'text')?.text

  if (typeof text !== 'string') {
    throw new LlmError('llm_request_failed', 'Anthropic returned an unexpected response shape.')
  }

  return text
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
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user }
        ]
      })
    })
  } catch (err) {
    throw new LlmError('llm_request_failed', `Failed to reach OpenAI API: ${(err as Error).message}`)
  }

  if (!response.ok) {
    const errBody = await safeReadJson(response)
    const message = (getNested(errBody, ['error', 'message']) as string) || `status ${response.status}`
    throw new LlmError('llm_request_failed', `OpenAI API error (${message}). Check your API key and model name in Settings.`)
  }

  const data = await safeReadJson(response)
  const text = getNested(data, ['choices', 0, 'message', 'content'])

  if (typeof text !== 'string') {
    throw new LlmError('llm_request_failed', 'OpenAI returned an unexpected response shape.')
  }

  return text
}

async function generateGemini(params: GenerateParams): Promise<string> {
  const model = params.model || 'gemini-1.5-flash'
  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${params.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: [{ role: 'user', parts: [{ text: params.user }] }],
          generationConfig: { temperature: params.temperature }
        })
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

  const data = await safeReadJson(response)
  const text = getNested(data, ['candidates', 0, 'content', 'parts', 0, 'text'])

  if (typeof text !== 'string') {
    throw new LlmError('llm_request_failed', 'Gemini returned an unexpected response shape.')
  }

  return text
}

/**
 * Provider-agnostic text generation. Throws LlmError with a distinct code per brief 20.3 so
 * the renderer can render an actionable message (e.g. "check API key -> open settings").
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
