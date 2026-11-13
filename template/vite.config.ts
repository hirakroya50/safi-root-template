import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const templateRoot = path.dirname(fileURLToPath(import.meta.url))
import { defaultConfig, normalizeConfig, type InstanceConfig } from './src/config.ts'
import { createChatService, type ChatService } from './src/server/chat.ts'
import { createOpenRouterModel } from './src/server/llm.ts'

const examplesDir = path.resolve(templateRoot, '../examples')

function bundleExamples(): Plugin {
  return {
    name: 'safi-bundle-examples',
    closeBundle() {
      const outDir = path.resolve(templateRoot, 'dist/examples')
      fs.mkdirSync(outDir, { recursive: true })
      for (const name of fs.readdirSync(examplesDir)) {
        if (!/^[a-z0-9-]+\.json$/.test(name)) continue
        fs.copyFileSync(path.join(examplesDir, name), path.join(outDir, name))
      }
    },
  }
}

function serveExamples(): Plugin {
  return {
    name: 'safi-examples',
    configureServer(server) {
      server.middlewares.use('/examples', (req, res, next) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\//, '')
        if (!/^[a-z0-9-]+\.json$/.test(name)) {
          next()
          return
        }
        const file = path.resolve(examplesDir, name)
        if (!file.startsWith(`${examplesDir}${path.sep}`) || !fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Example not found')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

const MAX_CHAT_BYTES = 16_384

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
  res.end(JSON.stringify(body))
}

async function readRaw(req: IncomingMessage): Promise<string | 'too_large'> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_CHAT_BYTES) return 'too_large'
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function lotusChat(env: Record<string, string>): Plugin {
  let service: ChatService | undefined

  const chat = () => {
    if (service) return service
    const apiKey = env.OPENROUTER_API_KEY ?? ''
    const model = apiKey.trim()
      ? createOpenRouterModel({
          apiKey,
          model: env.OPENROUTER_MODEL,
          baseUrl: env.OPENROUTER_BASE_URL,
          timeoutMs: numberFrom(env.CHAT_TIMEOUT_MS, 20_000),
          siteUrl: env.CHAT_SITE_URL,
        })
      : null
    service = createChatService({
      model,
      maxMessageChars: numberFrom(env.CHAT_MAX_MESSAGE_CHARS, 2_000),
      rateLimit: numberFrom(env.CHAT_RATE_LIMIT, 20),
      rateWindowMs: numberFrom(env.CHAT_RATE_WINDOW_MS, 60_000),
      timeoutMs: numberFrom(env.CHAT_TIMEOUT_MS, 20_000),
      log: (event) => {
        console.log(JSON.stringify({ source: 'lotus-chat', ...event }))
      },
    })
    return service
  }

  const configFor = (req: IncomingMessage): InstanceConfig => {
    if (env.SAFI_CONFIG_PATH) {
      return normalizeConfig(JSON.parse(fs.readFileSync(path.resolve(env.SAFI_CONFIG_PATH), 'utf8')))
    }
    const referer = req.headers.referer
    const host = req.headers.host
    if (!referer || !host) return defaultConfig
    let name = ''
    try {
      const url = new URL(referer)
      if (url.host !== host) return defaultConfig
      name = url.searchParams.get('example') ?? ''
    } catch {
      return defaultConfig
    }
    if (!/^[a-z0-9-]+$/.test(name)) return defaultConfig
    const file = path.resolve(examplesDir, `${name}.json`)
    if (!file.startsWith(`${examplesDir}${path.sep}`) || !fs.existsSync(file)) return defaultConfig
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')))
  }

  const handle: Plugin['configureServer'] = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0]
      if (pathname !== '/api/chat') {
        next()
        return
      }
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Allow', 'POST')
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, {
          error: { code: 'invalid_message', message: 'Send a message with POST.' },
        })
        return
      }
      try {
        const raw = await readRaw(req)
        if (raw === 'too_large') {
          sendJson(res, 413, {
            error: { code: 'payload_too_large', message: 'That request is too large.' },
          })
          return
        }
        let body: unknown
        try {
          body = raw.trim() ? JSON.parse(raw) : {}
        } catch {
          sendJson(res, 400, {
            error: {
              code: 'invalid_message',
              message: 'That message could not be read. Try a short question.',
            },
          })
          return
        }
        const result = await chat().handle({
          body,
          visitor: req.socket.remoteAddress || 'unknown',
          config: configFor(req),
        })
        sendJson(res, result.status, result.body, result.headers)
      } catch {
        console.log(JSON.stringify({ source: 'lotus-chat', status: 503, code: 'unavailable' }))
        sendJson(res, 503, {
          error: { code: 'unavailable', message: 'Lotus AI Chat is temporarily unavailable.' },
        })
      }
    })
  }

  return {
    name: 'lotus-chat',
    configureServer: handle,
    configurePreviewServer: handle,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), serveExamples(), bundleExamples(), lotusChat(env)],
    base: './',
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})