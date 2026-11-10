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
    return env.ASSETS.fetch(request)
  },
}
