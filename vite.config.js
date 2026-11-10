import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { forwardStorefront } from './server/storefront.js'

function readDevToken() {
  try {
    const file = readFileSync(fileURLToPath(new URL('./.dev.vars', import.meta.url)), 'utf8')
    const line = file.split(/\r?\n/).find((row) => row.startsWith('SHOPIFY_STOREFRONT_TOKEN='))
    if (!line) return ''
    return line.slice('SHOPIFY_STOREFRONT_TOKEN='.length).trim().replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function storefrontDevProxy() {
  return {
    name: 'storefront-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/storefront', async (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }
        const result = await forwardStorefront(await readBody(request), readDevToken())
        response.statusCode = result.status
        result.headers.forEach((value, key) => response.setHeader(key, value))
        response.end(Buffer.from(await result.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [storefrontDevProxy()],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.dev.vars', '**/.wrangler/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
})
