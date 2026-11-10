import { ChatFailure } from './errors.ts'

export interface ModelMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LanguageModel {
  complete(input: { system: string; messages: ModelMessage[]; signal: AbortSignal }): Promise<string>
}

export interface OpenRouterOptions {
  apiKey: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
  siteUrl?: string
  fetchImpl?: typeof fetch
}

const MODEL_PATTERN = /^[a-z0-9_.:/@+-]+$/i

function linkSignal(parent: AbortSignal, controller: AbortController): () => void {
  if (parent.aborted) {
    controller.abort()
    return () => {}
  }
  const onAbort = () => controller.abort()
  parent.addEventListener('abort', onAbort)
  return () => parent.removeEventListener('abort', onAbort)
}

export function createOpenRouterModel(options: OpenRouterOptions): LanguageModel {
  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model && MODEL_PATTERN.test(options.model) ? options.model : 'openai/gpt-4o-mini'
  const baseUrl = (options.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  const timeoutMs = options.timeoutMs ?? 20_000

  return {
    async complete({ system, messages, signal }) {
      if (!options.apiKey.trim()) throw new ChatFailure('unavailable')

      const controller = new AbortController()
      const unlink = linkSignal(signal, controller)
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'Lotus AI Chat',
            ...(options.siteUrl ? { 'HTTP-Referer': options.siteUrl } : {}),
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 400,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
        })

        if (!response.ok) throw new ChatFailure('upstream')
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: unknown } }>
        }
        const content = payload.choices?.[0]?.message?.content
        const reply = typeof content === 'string' ? content.trim() : ''
        if (!reply) throw new ChatFailure('upstream')
        return reply
      } catch (error) {
        if (error instanceof ChatFailure) throw error
        if (timedOut || signal.aborted) throw new ChatFailure('timeout')
        throw new ChatFailure('upstream')
      } finally {
        clearTimeout(timer)
        unlink()
      }
    },
  }
}
