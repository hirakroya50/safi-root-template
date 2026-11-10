import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultConfig, normalizeConfig } from './src/config.ts'
import { createChatService } from './src/server/chat.ts'
import { createOpenRouterModel } from './src/server/llm.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const MAX_BYTES = 16_384

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

loadEnvFile(path.join(root, '.env'))

const apiKey = process.env.OPENROUTER_API_KEY ?? ''
const service = createChatService({
  model: apiKey.trim()
    ? createOpenRouterModel({
        apiKey,
        model: process.env.OPENROUTER_MODEL,
        baseUrl: process.env.OPENROUTER_BASE_URL,
        timeoutMs: numberFrom(process.env.CHAT_TIMEOUT_MS, 20_000),
        siteUrl: process.env.CHAT_SITE_URL,
      })
    : null,
  maxMessageChars: numberFrom(process.env.CHAT_MAX_MESSAGE_CHARS, 2_000),
  rateLimit: numberFrom(process.env.CHAT_RATE_LIMIT, 20),
  rateWindowMs: numberFrom(process.env.CHAT_RATE_WINDOW_MS, 60_000),
  timeoutMs: numberFrom(process.env.CHAT_TIMEOUT_MS, 20_000),
  log: (event) => {
    console.log(JSON.stringify({ source: 'lotus-chat', ...event }))
  },
})

function siteConfig(): unknown {
  const file = process.env.SAFI_CONFIG_PATH
  if (!file) return defaultConfig
  return normalizeConfig(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')))
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url ?? '').split('?')[0]
  if (pathname !== '/api/chat') {
    send(res, 404, { error: { code: 'invalid_message', message: 'Not found.' } })
    return
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: { code: 'invalid_message', message: 'Send a message with POST.' } })
    return
  }

  try {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BYTES) {
        send(res, 413, { error: { code: 'payload_too_large', message: 'That request is too large.' } })
        return
      }
      chunks.push(buffer)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    let body: unknown
    try {
      body = raw.trim() ? JSON.parse(raw) : {}
    } catch {
      send(res, 400, {
        error: { code: 'invalid_message', message: 'That message could not be read. Try a short question.' },
      })
      return
    }
    const result = await service.handle({
      body,
      visitor: req.socket.remoteAddress || 'unknown',
      config: siteConfig(),
    })
    send(res, result.status, result.body, result.headers)
  } catch {
    console.log(JSON.stringify({ source: 'lotus-chat', status: 503, code: 'unavailable' }))
    send(res, 503, { error: { code: 'unavailable', message: 'Lotus AI Chat is temporarily unavailable.' } })
  }
})

const port = numberFrom(process.env.CHAT_PORT, 8787)
server.listen(port, () => {
  console.log(JSON.stringify({ source: 'lotus-chat', event: 'listen', port }))
})
