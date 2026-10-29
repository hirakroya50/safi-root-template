#!/usr/bin/env node
// Build the React template in a temporary folder, then publish the static
// dist to a stable Vercel production URL. The Vercel token stays in this
// process and is not passed into the build.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const api = 'https://api.vercel.com'

function parseArgs(argv) {
  const options = { source: path.join(repoRoot, 'template'), dist: '', prepare: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--prepare') options.prepare = true
    else if (arg === '--source') options.source = path.resolve(repoRoot, argv[++index] ?? '')
    else if (arg === '--dist') options.dist = path.resolve(repoRoot, argv[++index] ?? '')
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
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

function usage() {
  console.log(`Usage:
  node scripts/import-and-deploy.mjs
  node scripts/import-and-deploy.mjs --dist template/dist
  node scripts/import-and-deploy.mjs --prepare

Environment:
  VERCEL_TOKEN          required to publish, from the shell or template/.env
  VERCEL_PROJECT_NAME   stable project name, default safi-root-template
  VERCEL_TEAM_ID        optional team id

The production address stays https://<project-name>.vercel.app
`)
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

async function walk(directory, skip) {
  const files = []
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const relative = path.relative(directory, full)
      if (skip(relative, entry.name)) continue
      if (entry.isDirectory()) await visit(full)
      else if (entry.isFile()) files.push(relative)
    }
  }
  await visit(directory)
  return files.sort()
}

function skippedSource(relative) {
  const parts = relative.split(path.sep)
  return parts.includes('node_modules') || parts.includes('dist') || parts.includes('.git') || parts.includes('.env')
}

async function digestDirectory(directory, skip) {
  const files = await walk(directory, skip)
  const hash = createHash('sha256')
  for (const relative of files) {
    hash.update(relative.split(path.sep).join('/'))
    hash.update('\0')
    hash.update(await readFile(path.join(directory, relative)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function buildEnv() {
  const env = { ...process.env }
  delete env.VERCEL_TOKEN
  delete env.VERCEL_ORG_ID
  delete env.VERCEL_TEAM_ID
  return env
}

async function buildSource(source) {
  const work = await mkdtemp(path.join(tmpdir(), 'safi-build-'))
  await cp(source, work, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(source, sourcePath)
      if (!relative) return true
      const parts = relative.split(path.sep)
      return !parts.includes('node_modules') && !parts.includes('dist') && !parts.includes('.git')
    },
  })
  await run('npm', ['ci'], { cwd: work, env: buildEnv() })
  await run('npm', ['run', 'build'], { cwd: work, env: buildEnv() })
  return { work, dist: path.join(work, 'dist') }
}

async function filesFrom(dist) {
  const names = await walk(dist, (relative, name) => name === '.DS_Store' || relative.endsWith('.map'))
  const files = []
  for (const relative of names) {
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

function teamQuery() {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `&teamId=${encodeURIComponent(team)}` : ''
}

async function vercel(pathname, options = {}) {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error('Add VERCEL_TOKEN to template/.env or export it in the shell. Create one at https://vercel.com/account/tokens')
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

async function upload(files) {
  for (const file of files) {
    await vercel(`/v2/files?${teamQuery().replace(/^&/, '')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': file.sha,
        'Content-Length': String(file.size),
      },
      body: file.body,
    })
  }
}

async function publish(projectName, files) {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > 90 * 1024 * 1024) {
    throw new Error('Static upload is over 90 MB. The free Hobby limit is 100 MB.')
  }
  await upload(files)
  const deployment = await vercel(`/v13/deployments?skipAutoDetectionConfirmation=1&forceNew=1${teamQuery()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
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
  return deployment
}

async function waitUntilReady(id) {
  const started = Date.now()
  while (Date.now() - started < 180000) {
    const deployment = await vercel(`/v13/deployments/${id}${teamQuery().replace('&', '?')}`)
    if (deployment.readyState === 'READY') return deployment
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new Error(`Deployment ${deployment.readyState}: ${deployment.errorMessage || id}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('Timed out waiting for the Vercel deployment')
}

async function verify(url, sha) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 90000) {
    try {
      const response = await fetch(`${url}/?check=${Date.now()}`)
      const html = await response.text()
      last = `${response.status} ${html.slice(0, 90).replace(/\s+/g, ' ')}`
      if (response.ok && html.includes(sha)) return
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error(`Live site did not serve this release (${last})`)
}

async function main() {
  await loadEnvFile(path.join(repoRoot, 'template', '.env'))
  await loadEnvFile(path.join(repoRoot, '.env'))
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const projectName = (process.env.VERCEL_PROJECT_NAME || 'safi-root-template')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
  const sourceSha = await digestDirectory(options.source, skippedSource)
  let cleanup = async () => {}
  let dist = options.dist

  if (!dist) {
    const built = await buildSource(options.source)
    dist = built.dist
    cleanup = () => rm(built.work, { recursive: true, force: true })
  }

  try {
    const info = await stat(path.join(dist, 'index.html'))
    if (!info.isFile()) throw new Error('dist is missing index.html')
    const release = { sha: sourceSha, builtAt: new Date().toISOString(), project: projectName }
    await writeFile(path.join(dist, 'release.json'), JSON.stringify(release, null, 2))
    const indexPath = path.join(dist, 'index.html')
    const indexHtml = await readFile(indexPath, 'utf8')
    const marked = indexHtml.includes('name="safi-release"')
      ? indexHtml.replace(/<meta name="safi-release" content="[^"]*">/, `<meta name="safi-release" content="${sourceSha}">`)
      : indexHtml.replace('<head>', `<head>\n    <meta name="safi-release" content="${sourceSha}">`)
    await writeFile(indexPath, marked)
    const rewrite = {
      rewrites: [{ source: '/((?!assets/|release\\.json|favicon\\.ico).*)', destination: '/index.html' }],
    }
    await writeFile(path.join(dist, 'vercel.json'), JSON.stringify(rewrite, null, 2))

    if (options.prepare) {
      console.log('Build succeeded')
      console.log(`Source SHA ${sourceSha}`)
      return
    }

    const created = await publish(projectName, await filesFrom(dist))
    const ready = await waitUntilReady(created.id)
    const deploymentHost = String(ready.url || '').replace(/^https?:\/\//, '')
    const deploymentUrl = deploymentHost ? `https://${deploymentHost}` : ''
    const stableUrl = `https://${projectName}.vercel.app`
    try {
      await verify(stableUrl, sourceSha)
    } catch (error) {
      if (!deploymentUrl) throw error
      await verify(deploymentUrl, sourceSha)
    }

    const record = {
      project: projectName,
      url: stableUrl,
      deploymentUrl,
      sha: sourceSha,
      builtAt: release.builtAt,
    }
    await writeFile(path.join(repoRoot, 'scripts', 'last-deploy.json'), JSON.stringify(record, null, 2))
    console.log(`Published ${record.url}`)
    console.log(`Source SHA ${sourceSha}`)
  } finally {
    await cleanup()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
