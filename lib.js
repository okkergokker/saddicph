// Helpers shared by the cart (shop.js) and the catalogue/product pages.

export function money(amount, currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(amount))
}

export function text(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

export async function gql(query, variables) {
  const response = await fetch('/api/storefront', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const payload = await response.json()
  if (!response.ok || payload.errors) {
    const message = payload.errors ? payload.errors.map((error) => error.message).join(' ') : 'Shopify did not respond.'
    throw new Error(message)
  }
  return payload.data
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Re-trigger a CSS animation by removing the class, forcing a reflow and adding it again.
export function replay(element, className, ...others) {
  element.classList.remove(className, ...others)
  void element.offsetWidth
  element.classList.add(className)
}

export function revealOnScroll(elements) {
  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => element.classList.add('is-in'))
    return
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-in')
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })
  elements.forEach((element) => {
    element.classList.add('reveal')
    observer.observe(element)
  })
}

// Images fade in once decoded (CSS: .is-loaded); cached images may already be complete.
export function fadeInWhenLoaded(images) {
  images.forEach((img) => {
    const loaded = () => img.classList.add('is-loaded')
    if (img.complete && img.naturalWidth) loaded()
    else {
      img.addEventListener('load', loaded, { once: true })
      img.addEventListener('error', loaded, { once: true })
    }
  })
}

export function setQuantity(qty, value, animate = true) {
  const next = Math.min(99, Math.max(1, value))
  const count = qty.querySelector('.qty-count')
  const previous = Number(count.textContent)
  count.textContent = String(next)
  if (animate && next !== previous) replay(count, next > previous ? 'tick-up' : 'tick-down', 'tick-up', 'tick-down')
  qty.querySelector('.qty-less').disabled = next <= 1
  qty.querySelector('.qty-more').disabled = next >= 99
}

export const QTY_HTML = '<div class="qty"><button class="qty-less" type="button" aria-label="Decrease quantity" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 12.3c5.4-.5 10.2.4 15.3-.3"/></svg></button><span class="qty-count" aria-live="polite">1</span><button class="qty-more" type="button" aria-label="Increase quantity"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.2c5.2-.4 10.1.3 15.1-.2"/><path d="M12.2 4.3c-.4 5.3.4 10.2-.2 15.2"/></svg></button></div>'

// Shopify-resized versions of a product image, so phones decode an image close to its slot
// instead of the full original. Ask for these fields with IMAGE_FIELDS.
export const IMAGE_FIELDS = `url altText width height
  w480: url(transform: { maxWidth: 480 })
  w720: url(transform: { maxWidth: 720 })
  w960: url(transform: { maxWidth: 960 })
  w1440: url(transform: { maxWidth: 1440 })
  w2048: url(transform: { maxWidth: 2048 })`

export function imageAttrs(image, sizes) {
  const sized = [[480, image.w480], [720, image.w720], [960, image.w960], [1440, image.w1440], [2048, image.w2048]]
    .filter(([width, url]) => url && (!image.width || width < image.width))
  if (image.width) sized.push([image.width, image.url])
  const srcset = sized.map(([width, url]) => text(url) + ' ' + width + 'w').join(', ')
  return ' src="' + text(image.w960 || image.url) + '"' +
    (srcset ? ' srcset="' + srcset + '" sizes="' + sizes + '"' : '') +
    (image.width && image.height ? ' width="' + Number(image.width) + '" height="' + Number(image.height) + '"' : '')
}

export const productUrl = (handle) => '/products/' + encodeURIComponent(handle)

// A catalogue-style card (used by the catalogue and "You may also like"): 4:5 photo, with the
// product's second photo fading in on hover when there is one, then name and price.
export const CARD_FIELDS = `title handle
  priceRange { minVariantPrice { amount currencyCode } }
  images(first: 2) { edges { node { ${IMAGE_FIELDS} } } }`

export function cardHtml(product, sizes, index = 0) {
  const images = product.images.edges.map((edge) => edge.node)
  const price = product.priceRange.minVariantPrice
  const loading = index < 2 ? ' fetchpriority="high"' : ' loading="lazy"'
  const photo = (image, extra) => '<img class="card-img' + extra + '"' + imageAttrs(image, sizes) +
    ' alt="' + (extra ? '' : text(image.altText || product.title)) + '"' + (extra ? ' aria-hidden="true" loading="lazy"' : loading) + ' decoding="async">'
  return '<a class="card" href="' + productUrl(product.handle) + '">' +
    '<span class="card-media">' +
    (images[0] ? photo(images[0], '') : '') +
    (images[1] ? photo(images[1], ' card-img-alt') : '') +
    '</span>' +
    '<span class="card-name">' + text(product.title) + '</span>' +
    '<span class="card-price">' + money(price.amount, price.currencyCode) + '</span>' +
    '</a>'
}
