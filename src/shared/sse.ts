import type { LlmProvider } from './types'

/**
 * Provider-agnostic Server-Sent-Events parsing for streaming LLM responses.
 *
 * The byte stream arrives in arbitrary chunks that can split a line anywhere, so the parser buffers
 * the trailing partial line across `push` calls. Each provider frames text deltas differently; only
 * the text delta is extracted (control/usage events yield an empty string and are ignored).
 */

/** Extracts the incremental text from one parsed SSE `data:` JSON payload for a given provider. */
export function extractDelta(provider: LlmProvider, data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const obj = data as Record<string, unknown>

  if (provider === 'anthropic') {
    if (obj.type !== 'content_block_delta') return ''
    const delta = obj.delta as { type?: string; text?: string } | undefined
    return delta?.type === 'text_delta' && typeof delta.text === 'string' ? delta.text : ''
  }

  if (provider === 'openai') {
    const choices = obj.choices as Array<{ delta?: { content?: string } }> | undefined
    const content = choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : ''
  }

  // gemini
  const candidates = obj.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  const parts = candidates?.[0]?.content?.parts
  return parts?.map((part) => (typeof part.text === 'string' ? part.text : '')).join('') ?? ''
}

/**
 * Stateful line-buffering SSE parser. `push` accepts a raw chunk and returns the text deltas that
 * completed within it; incomplete trailing lines are held until the next chunk. Pure aside from the
 * internal buffer, so it can be unit tested with hand-written chunk sequences.
 */
export function createSseParser(provider: LlmProvider) {
  let buffer = ''

  function parseLine(line: string): string {
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('data:')) return ''
    const payload = trimmed.slice('data:'.length).trim()
    if (!payload || payload === '[DONE]') return ''
    try {
      return extractDelta(provider, JSON.parse(payload))
    } catch {
      return ''
    }
  }

  return {
    push(chunk: string): string[] {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const deltas: string[] = []
      for (const line of lines) {
        const delta = parseLine(line)
        if (delta) deltas.push(delta)
      }
      return deltas
    },
    /** Flushes any complete data line left in the buffer at stream end. */
    flush(): string[] {
      const remaining = buffer
      buffer = ''
      const delta = parseLine(remaining)
      return delta ? [delta] : []
    }
  }
}
