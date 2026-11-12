import { forwardStorefront } from './server/storefront.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/storefront') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 })
      }
      return forwardStorefront(await request.text(), env.SHOPIFY_STOREFRONT_TOKEN)
    }
    // /products/<handle> all share one page; product.js reads the handle from the URL.
    // "/product" (not "/product.html") so html_handling serves the file instead of redirecting.
    if (/^\/products\/[^/]+\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/product', url), request))
    }
    return env.ASSETS.fetch(request)
  },
}
