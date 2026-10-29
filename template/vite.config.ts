import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples')

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

export default defineConfig({
  plugins: [react(), serveExamples()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})