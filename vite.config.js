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

// Shared page parts: <!-- include: header --> in a page is replaced with partials/header.html
// (also head and footer), in dev and in the build, so every page uses the same markup.
function htmlPartials() {
  const partial = (name) => readFileSync(fileURLToPath(new URL(`./partials/${name}.html`, import.meta.url)), 'utf8')
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/<!--\s*include:\s*([\w-]+)\s*-->/g, (_, name) => partial(name)),
    },
    handleHotUpdate({ file, server }) {
      if (file.replace(/\\/g, '/').includes('/partials/')) server.ws.send({ type: 'full-reload' })
    },
  }
}

// Dev server: the same clean URLs as production (worker.js): /catalogue and /products/<handle>.
function cleanUrls() {
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, query = ''] = request.url.split('?')
        const page = path === '/catalogue' || path === '/catalogue/' ? '/catalogue.html'
          : /^\/products\/[^/]+\/?$/.test(path) ? '/product.html'
          : null
        if (page) request.url = page + (query ? '?' + query : '')
        next()
      })
    },
  }
}

const page = (file) => fileURLToPath(new URL(`./${file}`, import.meta.url))

export default defineConfig({
  plugins: [storefrontDevProxy(), htmlPartials(), cleanUrls()],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.dev.vars', '**/.wrangler/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        catalogue: page('catalogue.html'),
        product: page('product.html'),
      },
    },
  },
})
