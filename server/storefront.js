const SHOPIFY_STOREFRONT_URL = 'https://saddi-5u05ncjc.myshopify.com/api/2025-10/graphql.json'
const ALLOWED = new Set(['Products', 'Cart', 'CartCreate', 'CartLinesAdd', 'CartLinesRemove'])
const MAX_BODY = 100_000

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function operationName(query) {
  const match = String(query || '').match(/^\s*(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/)
  return match ? match[1] : ''
}

export async function forwardStorefront(bodyText, token) {
  if (bodyText.length > MAX_BODY) {
    return json({ errors: [{ message: 'Forespørgslen er for stor.' }] }, 413)
  }
  if (!token) {
    return json({ errors: [{ message: 'Shopify er ikke konfigureret.' }] }, 500)
  }

  let payload
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return json({ errors: [{ message: 'Ugyldig forespørgsel.' }] }, 400)
  }

  if (!ALLOWED.has(operationName(payload.query))) {
    return json({ errors: [{ message: 'Den forespørgsel er ikke tilladt.' }] }, 400)
  }

  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({
      query: payload.query,
      variables: payload.variables ?? null,
    }),
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
