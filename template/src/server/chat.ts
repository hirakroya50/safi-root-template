import { normalizeConfig } from '../config.ts'
import { createConversationStore, trimHistory, type ConversationStore } from './conversation.ts'
import { ChatFailure, visitorMessage, type ChatErrorCode } from './errors.ts'
import type { LanguageModel } from './llm.ts'
import { buildSystemPrompt } from './prompts.ts'
import { buildBusinessContext } from './rank.ts'
import { createRateLimiter, type RateLimiter } from './rate-limit.ts'

export interface ChatRequest {
  body: unknown
  visitor: string
  config: unknown
}

export interface ChatResponse {
  status: number
  headers: Record<string, string>
  body: {
    reply?: string
    conversationId?: string
    error?: { code: ChatErrorCode; message: string }
  }
}

export interface ChatServiceOptions {
  model: LanguageModel | null
  now?: () => number
  maxMessageChars?: number
  historyLimit?: number
  historyCharBudget?: number
  contextCharBudget?: number
  timeoutMs?: number
  rateLimit?: number
  rateWindowMs?: number
  log?: (event: Record<string, unknown>) => void
  store?: ConversationStore
  limiter?: RateLimiter
}

const MAX_MESSAGE = 2_000

function fail(status: number, code: ChatErrorCode, headers: Record<string, string> = {}): ChatResponse {
  return {
    status,
    headers,
    body: { error: { code, message: visitorMessage(code) } },
  }
}

function readMessage(body: unknown, maxChars: number): { message: string; conversationId?: string } | ChatErrorCode {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_message'
  const record = body as Record<string, unknown>
  if (typeof record.message !== 'string') return 'invalid_message'
  const message = record.message.replace(/\u0000/g, '').trim()
  if (!message) return 'empty_message'
  if (message.length > maxChars) return 'message_too_long'
  const conversationId = typeof record.conversationId === 'string' ? record.conversationId : undefined
  return { message, conversationId }
}

export function createChatService(options: ChatServiceOptions) {
  const now = options.now ?? (() => Date.now())
  const maxMessageChars = options.maxMessageChars ?? MAX_MESSAGE
  const historyCharBudget = options.historyCharBudget ?? 4_000
  const contextCharBudget = options.contextCharBudget ?? 3_500
  const timeoutMs = options.timeoutMs ?? 20_000
  const store = options.store ?? createConversationStore(options.historyLimit ?? 8)
  const limiter = options.limiter ?? createRateLimiter(options.rateLimit ?? 20, options.rateWindowMs ?? 60_000)
  const log = options.log ?? (() => {})

  return {
    async handle(request: ChatRequest): Promise<ChatResponse> {
      const started = now()
      const limit = limiter.check(request.visitor || 'unknown', now())
      if (!limit.ok) {
        log({ event: 'chat', status: 429, code: 'rate_limited', durationMs: now() - started })
        return fail(429, 'rate_limited', { 'Retry-After': String(limit.retryAfterSeconds) })
      }

      const parsed = readMessage(request.body, maxMessageChars)
      if (typeof parsed === 'string') {
        log({ event: 'chat', status: 400, code: parsed, durationMs: now() - started })
        return fail(400, parsed)
      }

      if (!options.model) {
        log({ event: 'chat', status: 503, code: 'unavailable', durationMs: now() - started })
        return fail(503, 'unavailable')
      }

      const config = normalizeConfig(request.config)
      const context = buildBusinessContext(config, parsed.message, contextCharBudget)
      const thread = store.begin(request.visitor || 'unknown', parsed.conversationId, now())
      const history = trimHistory(thread.messages, historyCharBudget)
      const system = buildSystemPrompt(context.text)
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      try {
        const reply = await options.model.complete({
          system,
          messages: [...history, { role: 'user', content: parsed.message }],
          signal: controller.signal,
        })
        clearTimeout(timer)
        store.commit(request.visitor || 'unknown', thread.id, parsed.message, reply, now())
        log({
          event: 'chat',
          status: 200,
          durationMs: now() - started,
          messageChars: parsed.message.length,
          passages: context.passageIds.length,
        })
        return {
          status: 200,
          headers: { 'Cache-Control': 'no-store' },
          body: { reply, conversationId: thread.id },
        }
      } catch (error) {
        clearTimeout(timer)
        const code = error instanceof ChatFailure ? error.code : timedOut ? 'timeout' : 'upstream'
        const status = code === 'unavailable' ? 503 : code === 'timeout' ? 504 : 502
        log({ event: 'chat', status, code, durationMs: now() - started })
        return fail(status, code === 'unavailable' || code === 'timeout' || code === 'upstream' ? code : 'upstream')
      }
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
