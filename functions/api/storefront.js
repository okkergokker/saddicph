import { forwardStorefront } from '../../server/storefront.js'

export async function onRequestPost(context) {
  const body = await context.request.text()
  return forwardStorefront(body, context.env.SHOPIFY_STOREFRONT_TOKEN)
}
