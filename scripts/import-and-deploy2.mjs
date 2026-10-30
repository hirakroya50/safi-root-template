#!/usr/bin/env node
// Import a user ZIP or Git URL, confirm it is a static React + TypeScript + Vite
// app, build it in a temp folder, and publish that build as a Vercel deployment
// on the safi-user-import project. The stable production alias is not checked.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = path.join(repoRoot, 'scripts', 'import-page.html')
const api = 'https://api.vercel.com'
const importProject = 'safi-user-import'
const reservedProject = 'safi-root-template'
const uploadLimit = 100 * 1024 * 1024
const unpackLimit = 200 * 1024 * 1024

const requiredPackages = ['react', 'typescript', 'vite']
const serverPackages = ['next', 'nuxt', 'express', 'fastify', '@nestjs/core', '@remix-run/serve', 'astro']
const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs']

let importRunning = false

function parseArgs(argv) {
  const options = { git: '', zip: '', serve: false, port: 8791, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--serve') options.serve = true
    else if (arg === '--git') options.git = argv[++index] ?? ''
    else if (arg === '--zip') options.zip = argv[++index] ?? ''
    else if (arg === '--port') options.port = Number(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be an integer from 1 to 65535.')
  }
  return options
}

function usage() {
  console.log(`Usage:
  node scripts/import-and-deploy2.mjs --serve
  node scripts/import-and-deploy2.mjs --git https://github.com/org/repo.git
  node scripts/import-and-deploy2.mjs --zip ./site.zip

Environment:
  VERCEL_TOKEN                 required to publish, from the shell or template/.env
  VERCEL_IMPORT_PROJECT_NAME   optional, default ${importProject}
  VERCEL_TEAM_ID               optional team id

The page is http://127.0.0.1:8791 while --serve is running.
Deployments use the same Vercel account as import-and-deploy.mjs and the project ${importProject}.
`)
}

async function loadEnvFile(file) {
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const splitAt = trimmed.indexOf('=')
    if (splitAt === -1) continue
    const key = trimmed.slice(0, splitAt).trim()
    let value = trimmed.slice(splitAt + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function projectName() {
  const name = (process.env.VERCEL_IMPORT_PROJECT_NAME || importProject)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!name) throw new Error(`Set VERCEL_IMPORT_PROJECT_NAME to a project other than ${reservedProject}.`)
  if (name === reservedProject) {
    throw new Error(`Refusing to deploy this import onto ${reservedProject}. Leave VERCEL_IMPORT_PROJECT_NAME unset, or pick another name.`)
  }
  return name
}

function assertGitUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Rejected: Git URL must be an https URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Rejected: only https Git URLs are accepted.')
  if (url.username || url.password) throw new Error('Rejected: remove credentials from the Git URL.')
  if (!url.hostname || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    throw new Error('Rejected: Git host is not allowed.')
  }
  return url.toString()
}

function run(command, args, { cwd, env, timeoutMs, onLog }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines = []
    const forward = (stream) => {
      stream.setEncoding('utf8')
      let rest = ''
      stream.on('data', (chunk) => {
        rest += chunk
        const parts = rest.split(/\r?\n/)
        rest = parts.pop() ?? ''
        for (const line of parts) {
          if (!line) continue
          lines.push(line)
          onLog(line)
        }
      })
      stream.on('end', () => {
        if (!rest) return
        lines.push(rest)
        onLog(rest)
      })
    }
    forward(child.stdout)
    forward(child.stderr)
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      const rejected = [...lines].reverse().find((line) => line.startsWith('Rejected:'))
      reject(new Error(rejected || `${command} exited with ${code}`))
    })
  })
}

async function exists(file) {
  try {
    const info = await stat(file)
    return info.isFile()
  } catch {
    return false
  }
}

async function locateProject(directory) {
  if (await exists(path.join(directory, 'package.json'))) return directory
  const entries = await readdir(directory, { withFileTypes: true })
  const dirs = entries.filter((entry) => entry.isDirectory() && entry.name !== '__MACOSX' && !entry.name.startsWith('.'))
  if (dirs.length === 1) {
    const nested = path.join(directory, dirs[0].name)
    if (await exists(path.join(nested, 'package.json'))) return nested
  }
  throw new Error('Rejected: no package.json found in the import.')
}

async function validateStack(root) {
  let pkg
  try {
    pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  } catch {
    throw new Error('Rejected: package.json is not valid JSON.')
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  const missing = requiredPackages.filter((name) => !deps[name])
  if (missing.length) {
    throw new Error(`Rejected: this is not a static React + TypeScript + Vite app. Missing ${missing.join(', ')}.`)
  }
  const servers = serverPackages.filter((name) => deps[name])
  if (servers.length) {
    throw new Error(`Rejected: ${servers.join(', ')} needs a server. Only a static Vite app can be imported.`)
  }
  if (!pkg.scripts || typeof pkg.scripts.build !== 'string' || !pkg.scripts.build.trim()) {
    throw new Error('Rejected: package.json needs a build script.')
  }
  let lock
  try {
    lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  } catch {
    throw new Error('Rejected: package-lock.json is missing or unreadable. npm ci needs an installable lockfile.')
  }
  if (!lock.lockfileVersion) {
    throw new Error('Rejected: package-lock.json is not an installable npm lockfile.')
  }
  for (const name of viteConfigs) {
    if (await exists(path.join(root, name))) return
  }
  throw new Error('Rejected: vite.config.ts (or .js/.mjs) is missing.')
}

async function removeEnvFiles(directory, onLog) {
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = path.join(current, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Rejected: symlink is not allowed (${entry.name}).`)
      }
      if (entry.isDirectory()) {
        await visit(full)
        continue
      }
      if (entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.'))) {
        await rm(full, { force: true })
        onLog(`Removed ${entry.name} before the build`)
      }
    }
  }
  await visit(directory)
}

function buildEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  delete env.VERCEL_TOKEN
  delete env.VERCEL_ORG_ID
  delete env.VERCEL_TEAM_ID
  return env
}

async function unpackZip(zipPath, dest, onLog) {
  const script = `
import os, sys, zipfile
zip_path, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
dest_real = os.path.realpath(dest)
try:
    archive = zipfile.ZipFile(zip_path)
except zipfile.BadZipFile:
    raise SystemExit('Rejected: file is not a ZIP archive.')
with archive:
    infos = archive.infolist()
    if len(infos) > 4000:
        raise SystemExit('Rejected: archive has too many files.')
    total = 0
    for info in infos:
        name = info.filename.replace('\\\\', '/')
        if not name or name.endswith('/'):
            continue
        parts = [part for part in name.split('/') if part not in ('', '.')]
        if name.startswith('/') or any(part == '..' for part in parts):
            raise SystemExit('Rejected: archive path escapes the import folder.')
        mode = (info.external_attr >> 16) & 0o170000
        if mode == 0o120000:
            raise SystemExit('Rejected: archive contains a symlink.')
        total += info.file_size
        if total > ${unpackLimit}:
            raise SystemExit('Rejected: uncompressed archive is over 200 MB.')
        target = os.path.realpath(os.path.join(dest_real, *parts))
        if target != dest_real and not target.startswith(dest_real + os.sep):
            raise SystemExit('Rejected: archive path escapes the import folder.')
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with archive.open(info, 'r') as src, open(target, 'wb') as out:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
`
  await run('python3', ['-c', script, zipPath, dest], { timeoutMs: 60000, onLog }, )
}

async function cloneGit(url, dest, onLog) {
  await run('git', ['clone', '--depth', '1', '--single-branch', url, dest], {
    env: buildEnv(),
    timeoutMs: 120000,
    onLog,
  })
}

async function walk(directory) {
  const files = []
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        await visit(full)
      } else if (entry.isFile()) {
        files.push(path.relative(directory, full))
      }
    }
  }
  await visit(directory)
  return files.sort()
}

async function digestDirectory(directory) {
  const files = await walk(directory)
  const hash = createHash('sha256')
  for (const relative of files) {
    if (path.basename(relative) === '.env' || path.basename(relative).startsWith('.env.')) continue
    hash.update(relative.split(path.sep).join('/'))
    hash.update('\0')
    hash.update(await readFile(path.join(directory, relative)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function findDist(root) {
  for (const name of ['dist', 'build']) {
    if (await exists(path.join(root, name, 'index.html'))) return path.join(root, name)
  }
  throw new Error('Rejected: the build finished without a static index.html. This does not look like a static Vite app.')
}

function teamSearch() {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `?teamId=${encodeURIComponent(team)}` : ''
}

function teamAmp() {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `&teamId=${encodeURIComponent(team)}` : ''
}

async function vercel(pathname, options = {}) {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error('Add VERCEL_TOKEN to template/.env or export it in the shell.')
  let response
  try {
    response = await fetch(`${api}${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.cause?.message || error.message : String(error)
    throw new Error(`Could not reach Vercel: ${reason}`)
  }
  const text = await response.text()
  let body = {}
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { error: { message: text } }
    }
  }
  if (!response.ok) {
    throw new Error(`Vercel ${response.status}: ${body.error?.message || text}`)
  }
  return body
}

async function filesFrom(dist) {
  const names = await walk(dist)
  const files = []
  for (const relative of names) {
    if (relative.endsWith('.map') || path.basename(relative) === '.DS_Store') continue
    const body = await readFile(path.join(dist, relative))
    files.push({
      file: relative.split(path.sep).join('/'),
      body,
      sha: createHash('sha1').update(body).digest('hex'),
      size: body.length,
    })
  }
  return files
}

async function upload(files, onLog) {
  onLog(`Uploading ${files.length} static files`)
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    await vercel(`/v2/files${teamSearch()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': file.sha,
        'Content-Length': String(file.size),
      },
      body: file.body,
    })
    if ((index + 1) % 10 === 0 || index === files.length - 1) {
      onLog(`Uploaded ${index + 1} of ${files.length}`)
    }
  }
}

async function publish(name, files, onLog) {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > 90 * 1024 * 1024) {
    throw new Error('Rejected: static upload is over 90 MB.')
  }
  await upload(files, onLog)
  return vercel(`/v13/deployments?skipAutoDetectionConfirmation=1&forceNew=1${teamAmp()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      target: 'production',
      files: files.map((file) => ({ file: file.file, sha: file.sha, size: file.size })),
      projectSettings: {
        framework: null,
        buildCommand: null,
        devCommand: null,
        installCommand: null,
        outputDirectory: null,
      },
    }),
  })
}

async function waitUntilReady(id, onLog) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 180000) {
    const deployment = await vercel(`/v13/deployments/${id}${teamSearch()}`)
    if (deployment.readyState !== last) {
      last = deployment.readyState
      onLog(`Vercel status ${last}`)
    }
    if (deployment.readyState === 'READY') return deployment
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new Error(`Deployment ${deployment.readyState}: ${deployment.errorMessage || id}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('Timed out waiting for the Vercel deployment')
}

async function runImport({ gitUrl, zipPath, onEvent }) {
  const name = projectName()
  let phase = 'import'
  const log = (message) => onEvent({ type: 'log', step: phase, message })
  const setPhase = (step, message) => {
    phase = step
    if (message) log(message)
  }
  const work = await mkdtemp(path.join(tmpdir(), 'safi-import-'))
  try {
    if (gitUrl) {
      const url = assertGitUrl(gitUrl)
      setPhase('clone', 'Cloning repository')
      await cloneGit(url, work, log)
    } else if (zipPath) {
      setPhase('unpack', 'Unpacking ZIP')
      const info = await stat(zipPath)
      if (!info.isFile()) throw new Error('Rejected: ZIP path is not a file.')
      if (info.size > uploadLimit) throw new Error('Rejected: ZIP is over 100 MB.')
      await unpackZip(zipPath, work, log)
    } else {
      throw new Error('Provide a Git URL or a ZIP file.')
    }

    setPhase('validate', 'Checking React, TypeScript, Vite, and the lockfile')
    const root = await locateProject(work)
    await validateStack(root)
    await removeEnvFiles(root, log)
    log('Stack check passed')
    const sourceSha = await digestDirectory(root)
    log(`Source digest ${sourceSha}`)

    setPhase('install', 'Installing dependencies')
    await run('npm', ['ci'], { cwd: root, env: buildEnv(), timeoutMs: 300000, onLog: log })
    setPhase('build', 'Building static files')
    await run('npm', ['run', 'build'], { cwd: root, env: buildEnv(), timeoutMs: 300000, onLog: log })
    const dist = await findDist(root)
    if (!(await exists(path.join(dist, 'vercel.json')))) {
      const rewrite = {
        rewrites: [{ source: '/((?!assets/|favicon\\.ico).*)', destination: '/index.html' }],
      }
      await writeFile(path.join(dist, 'vercel.json'), JSON.stringify(rewrite))
    }

    setPhase('deploy', `Publishing a Vercel deployment on ${name}`)
    const created = await publish(name, await filesFrom(dist), log)
    const ready = await waitUntilReady(created.id, log)
    const host = String(ready.url || created.url || '').replace(/^https?:\/\//, '')
    if (!host) throw new Error('Vercel did not return a deployment URL.')
    const deploymentUrl = `https://${host}`
    const record = {
      project: name,
      deploymentUrl,
      sha: sourceSha,
      builtAt: new Date().toISOString(),
    }
    await writeFile(path.join(repoRoot, 'scripts', 'last-import-deploy.json'), JSON.stringify(record, null, 2))
    onEvent({ type: 'done', step: 'ready', deploymentUrl, sha: sourceSha, project: name })
    return record
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > uploadLimit) {
        reject(new Error('Rejected: upload is over 100 MB.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '')
  if (!match) throw new Error('Upload is missing a boundary.')
  const boundary = Buffer.from(`--${(match[1] || match[2]).trim()}`)
  const parts = []
  let cursor = buffer.indexOf(boundary)
  while (cursor !== -1) {
    const start = cursor + boundary.length
    const next = buffer.indexOf(boundary, start)
    if (next === -1) break
    let slice = buffer.subarray(start, next)
    if (slice.subarray(0, 2).toString() === '\r\n') slice = slice.subarray(2)
    if (slice.subarray(-2).toString() === '\r\n') slice = slice.subarray(0, -2)
    parts.push(slice)
    cursor = next
  }
  const fields = {}
  let file = null
  for (const part of parts) {
    const splitAt = part.indexOf('\r\n\r\n')
    if (splitAt === -1) continue
    const head = part.subarray(0, splitAt).toString('utf8')
    let body = part.subarray(splitAt + 4)
    const name = /name="([^"]+)"/i.exec(head)?.[1]
    const filename = /filename="([^"]*)"/i.exec(head)?.[1]
    if (!name) continue
    if (filename !== undefined && filename !== '') {
      file = { filename, data: body }
    } else if (filename === undefined) {
      fields[name] = body.toString('utf8')
    }
  }
  return { fields, file }
}

async function handleImport(req, res) {
  if (importRunning) {
    res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'An import is already running.' }))
    return
  }
  importRunning = true
  let zipFile = ''
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  })
  const send = (event) => {
    res.write(`${JSON.stringify(event)}\n`)
  }
  try {
    const body = await readBody(req)
    const type = req.headers['content-type'] || ''
    let gitUrl = ''
    if (type.includes('application/json')) {
      const payload = JSON.parse(body.toString('utf8') || '{}')
      gitUrl = String(payload.gitUrl || '').trim()
    } else if (type.includes('multipart/form-data')) {
      const parsed = parseMultipart(body, type)
      gitUrl = String(parsed.fields.gitUrl || '').trim()
      if (parsed.file) {
        if (!parsed.file.filename.toLowerCase().endsWith('.zip')) {
          throw new Error('Rejected: the file must be a .zip archive.')
        }
        zipFile = path.join(await mkdtemp(path.join(tmpdir(), 'safi-zip-')), 'upload.zip')
        await writeFile(zipFile, parsed.file.data)
      }
    } else {
      throw new Error('Send a Git URL as JSON or a ZIP as form data.')
    }
    if (gitUrl && zipFile) throw new Error('Submit a Git URL or a ZIP, not both.')
    if (!gitUrl && !zipFile) throw new Error('Enter a Git URL or choose a ZIP.')
    const record = await runImport({
      gitUrl,
      zipPath: zipFile,
      onEvent: send,
    })
    send({ type: 'log', step: 'ready', message: `Deployment ${record.deploymentUrl}` })
  } catch (error) {
    send({ type: 'error', step: 'failed', message: error instanceof Error ? error.message : String(error) })
  } finally {
    importRunning = false
    if (zipFile) await rm(path.dirname(zipFile), { recursive: true, force: true })
    res.end()
  }
}

async function serve(port) {
  const html = await readFile(pagePath)
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/import') {
        await handleImport(req, res)
        return
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      res.end(error instanceof Error ? error.message : String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  console.log(`Import page http://127.0.0.1:${port}`)
  console.log(`Vercel project ${projectName()}`)
}

async function main() {
  await loadEnvFile(path.join(repoRoot, 'template', '.env'))
  await loadEnvFile(path.join(repoRoot, '.env'))
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }
  if (options.serve) {
    if (options.git || options.zip) throw new Error('Use --serve on its own. Submit the Git URL or ZIP in the page or in a second command.')
    await serve(options.port)
    return
  }
  if (Boolean(options.git) === Boolean(options.zip)) {
    throw new Error('Provide one of --git or --zip.')
  }
  const record = await runImport({
    gitUrl: options.git,
    zipPath: options.zip ? path.resolve(options.zip) : '',
    onEvent(event) {
      if (event.type === 'log') console.log(`[${event.step}] ${event.message}`)
      if (event.type === 'done') {
        console.log(`[ready] Deployment ${event.deploymentUrl}`)
        console.log(`[ready] Source digest ${event.sha}`)
      }
    },
  })
  console.log(record.deploymentUrl)
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
