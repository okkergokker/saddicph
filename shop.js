const CART_KEY = 'saddi-cart-id'
const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            image { url(transform: { maxWidth: 240 }) altText }
            product { title handle featuredImage { url(transform: { maxWidth: 240 }) altText } }
            price { amount currencyCode }
          }
        }
      }
    }
  }
`

function money(amount, currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(amount))
}

function text(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

async function gql(query, variables) {
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

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const SVG_NS = 'http://www.w3.org/2000/svg'

// Seeded so the outline keeps the same hand every time it is redrawn.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One slightly uneven stroke from (x1, y1) to (x2, y2) that overshoots both ends a little.
// Its shape depends only on the distance along the stroke in px (and on `ref`, the length its
// tilt is spread over), never on the stroke's own length. So when the sheet grows or shrinks,
// a side stroke just gets longer or shorter at its lower end and the rest stays exactly put:
// it can be redrawn every frame without the line swimming or snapping.
// `fixedAfter` pins the overshoot past (x2, y2); the random value is still drawn so the seeded
// sequence, and with it every stroke's hand, stays the same.
function inkStroke(x1, y1, x2, y2, rand, ref, fixedAfter) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const before = 2 + rand() * 4
  const randomAfter = 2 + rand() * 4
  const after = fixedAfter ?? randomAfter
  const drift = ((rand() - 0.5) * 1.6) / ref
  // A long gentle sway plus a finer tremor, both under a pixel or so (wavelengths in px).
  const waves = [
    [0.5 + rand() * 0.6, rand() * Math.PI * 2, 220 + rand() * 160],
    [0.2 + rand() * 0.25, rand() * Math.PI * 2, 45 + rand() * 30],
  ]
  const point = (s) => {
    let off = drift * s
    for (const [amp, phase, wavelength] of waves) off += amp * Math.sin(phase + (s / wavelength) * Math.PI * 2)
    return `${(x1 + ux * s - uy * off).toFixed(1)} ${(y1 + uy * s + ux * off).toFixed(1)}`
  }
  // Fixed 12px sampling from the start, so a longer stroke only gains points at its end.
  let d = 'M' + point(-before)
  for (let s = -before + 12; s < len + after; s += 12) d += 'L' + point(s)
  return d + 'L' + point(len + after)
}

// Two SVGs: the top and side strokes fill the sheet, while the bottom stroke lives in its own
// short strip pinned to the sheet's bottom edge. When the cart's contents change, the sheet's
// bottom edge glides with transforms only (see morphSheet in boot): the bottom strip rides that
// edge, and the top/side layer is returned so it can be held still with the content.
// Paths are created once and only their shape is updated on resize, so a resize during the
// draw-in does not restart it. The outline is never stretched, and since inkStroke's shape does
// not depend on length, a redraw at a new height only lengthens or shortens the side strokes.
// The side strokes always end exactly INK_TAIL px past the bottom stroke, and the top/side
// layer sits in a frame that clips at that same line and rides the sheet's edge. So during a
// glide (when the side strokes are drawn longer than the visible sheet) and after it, they end
// in the very same place, and the redraw at the end of a glide changes nothing visible.
const INK_BOTTOM_H = 24
const INK_MARGIN = 8
const INK_TAIL = 4
function inkOutline(sheet) {
  const makeSvg = (cls) => {
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', cls)
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('preserveAspectRatio', 'none')
    return svg
  }
  const frame = document.createElement('div')
  frame.className = 'bag-ink'
  frame.style.bottom = INK_MARGIN - INK_TAIL + 'px'
  const svg = makeSvg('bag-outline')
  svg.style.height = `calc(100% + ${INK_MARGIN - INK_TAIL}px)`
  frame.append(svg)
  const bottom = makeSvg('bag-outline bag-outline-bottom')
  const paths = []
  for (let side = 0; side < 4; side++) {
    for (const cls of ['ink', 'ink-echo']) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('class', cls)
      path.setAttribute('pathLength', '100')
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      path.style.setProperty('--n', side)
      paths.push(path)
      ;(side === 2 ? bottom : svg).append(path)
    }
  }
  sheet.prepend(frame, bottom)
  const draw = () => {
    const w = sheet.clientWidth
    const h = sheet.clientHeight
    if (!w || !h) return
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    bottom.setAttribute('viewBox', `0 0 ${w} ${INK_BOTTOM_H}`)
    // All eight strokes come from one seeded sequence in a fixed order, so the hand never changes.
    const rand = seededRandom(23)
    const m = INK_MARGIN
    const yb = INK_BOTTOM_H - m
    // Horizontal strokes spread their tilt over their own (height-independent) length; the
    // side strokes use a fixed reference so a height change never re-tilts them, and a fixed
    // tail past the bottom stroke (see INK_TAIL).
    const sides = [
      [m, m, w - m, m, w - 2 * m],
      [w - m, m, w - m, h - m, 400, INK_TAIL],
      [m, yb, w - m, yb, w - 2 * m],
      [m, m, m, h - m, 400, INK_TAIL],
    ]
    paths.forEach((path, i) => {
      const [x1, y1, x2, y2, ref, tail] = sides[i >> 1]
      path.setAttribute('d', inkStroke(x1, y1, x2, y2, rand, ref, tail))
    })
  }
  // ResizeObserver runs after layout and before paint, so each redraw lands in the same frame
  // as the size change. During a contents change it fires at most at the start and the end.
  new ResizeObserver(draw).observe(sheet)
  draw()
  return svg
}

// The production CSS minifier rewrites times like 1400ms as 1.4s (and may drop the unit on 0).
function cssTimeMs(value, fallback) {
  const match = String(value).trim().match(/^(\d*\.?\d+)(ms|s)?$/)
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback
}

// Re-trigger a CSS animation by removing the class, forcing a reflow and adding it again.
function replay(element, className, ...others) {
  element.classList.remove(className, ...others)
  void element.offsetWidth
  element.classList.add(className)
}

function revealOnScroll(elements) {
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

function revealProducts(root) {
  const products = [...root.querySelectorAll('.product')]
  products.forEach((product) => {
    const img = product.querySelector('img')
    if (!img) return
    const loaded = () => img.classList.add('is-loaded')
    if (img.complete && img.naturalWidth) loaded()
    else {
      img.addEventListener('load', loaded, { once: true })
      img.addEventListener('error', loaded, { once: true })
    }
  })
  revealOnScroll(products)
}

function setQuantity(qty, value, animate = true) {
  const next = Math.min(99, Math.max(1, value))
  const count = qty.querySelector('.qty-count')
  const previous = Number(count.textContent)
  count.textContent = String(next)
  if (animate && next !== previous) replay(count, next > previous ? 'tick-up' : 'tick-down', 'tick-up', 'tick-down')
  qty.querySelector('.qty-less').disabled = next <= 1
  qty.querySelector('.qty-more').disabled = next >= 99
}

function linesOf(cart) {
  return (cart && cart.lines && cart.lines.edges || []).map((edge) => edge.node)
}

function remember(cart) {
  if (cart && cart.id) localStorage.setItem(CART_KEY, cart.id)
  const link = document.getElementById('cart-link')
  if (link) {
    const count = cart && cart.totalQuantity ? cart.totalQuantity : 0
    const badge = link.querySelector('.cart-count')
    if (badge) badge.textContent = String(count)
  }
  return cart
}

async function readCart() {
  const id = localStorage.getItem(CART_KEY)
  if (!id) return null
  const data = await gql('query Cart($id: ID!) { cart(id: $id) { ' + CART_FIELDS + ' } }', { id })
  if (!data.cart) {
    localStorage.removeItem(CART_KEY)
    return null
  }
  return data.cart
}

async function fetchProducts() {
  const data = await gql(`query Products {
    products(first: 20) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          availableForSale
          featuredImage {
            url altText width height
            w480: url(transform: { maxWidth: 480 })
            w720: url(transform: { maxWidth: 720 })
            w960: url(transform: { maxWidth: 960 })
            w1440: url(transform: { maxWidth: 1440 })
            w2048: url(transform: { maxWidth: 2048 })
          }
          priceRange { minVariantPrice { amount currencyCode } }
          variants(first: 20) {
            edges { node { id title availableForSale price { amount currencyCode } } }
          }
        }
      }
    }
  }`)
  return data.products.edges.map((edge) => edge.node)
}

async function addVariant(cart, variantId, quantity) {
  const line = { merchandiseId: variantId, quantity }
  if (!cart) {
    const data = await gql(
      'mutation CartCreate($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { ' + CART_FIELDS + ' } userErrors { message } } }',
      { lines: [line] }
    )
    if (data.cartCreate.userErrors.length) throw new Error(data.cartCreate.userErrors.map((error) => error.message).join(' '))
    return remember(data.cartCreate.cart)
  }
  const data = await gql(
    'mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ' + CART_FIELDS + ' } userErrors { message } } }',
    { cartId: cart.id, lines: [line] }
  )
  if (data.cartLinesAdd.userErrors.length) throw new Error(data.cartLinesAdd.userErrors.map((error) => error.message).join(' '))
  return remember(data.cartLinesAdd.cart)
}

async function updateLine(cart, lineId, quantity) {
  const data = await gql(
    'mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ' + CART_FIELDS + ' } userErrors { message } } }',
    { cartId: cart.id, lines: [{ id: lineId, quantity }] }
  )
  if (data.cartLinesUpdate.userErrors.length) throw new Error(data.cartLinesUpdate.userErrors.map((error) => error.message).join(' '))
  return remember(data.cartLinesUpdate.cart)
}

async function removeLine(cart, lineId) {
  const data = await gql(
    'mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ' + CART_FIELDS + ' } userErrors { message } } }',
    { cartId: cart.id, lineIds: [lineId] }
  )
  if (data.cartLinesRemove.userErrors.length) throw new Error(data.cartLinesRemove.userErrors.map((error) => error.message).join(' '))
  return remember(data.cartLinesRemove.cart)
}

// Product photos come in several Shopify-resized widths, so a phone downloads and decodes an
// image close to its ~320px slot instead of the full original. Smaller decoded images also keep
// scrolling light under the blurred cart sheet, which re-blurs whatever is beneath it.
const PRODUCT_SIZES = '(max-width: 760px) calc(100vw - 56px), min(70vw, 1080px)'
function productImageAttrs(image) {
  const sized = [[480, image.w480], [720, image.w720], [960, image.w960], [1440, image.w1440], [2048, image.w2048]]
    .filter(([width, url]) => url && (!image.width || width < image.width))
  if (image.width) sized.push([image.width, image.url])
  const srcset = sized.map(([width, url]) => text(url) + ' ' + width + 'w').join(', ')
  return ' src="' + text(image.w960 || image.url) + '"' +
    (srcset ? ' srcset="' + srcset + '" sizes="' + PRODUCT_SIZES + '"' : '')
}

function renderFront(products, root) {
  if (!products.length) {
    root.innerHTML = '<p class="status">There are no products yet.</p>'
    return
  }
  root.innerHTML = products.map((product, index) => {
    const image = product.featuredImage
    const size = image && image.width && image.height
      ? ' width="' + Number(image.width) + '" height="' + Number(image.height) + '"'
      : ''
    const loading = index === 0 ? ' fetchpriority="high"' : ' loading="lazy"'
    const price = product.priceRange.minVariantPrice
    const variants = product.variants.edges.map((edge) => edge.node)
    const variant = variants.find((item) => item.availableForSale) || variants[0]
    const buy = variant
      ? '<div class="qty"><button class="qty-less" type="button" aria-label="Decrease quantity" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 12.3c5.4-.5 10.2.4 15.3-.3"/></svg></button><span class="qty-count">1</span><button class="qty-more" type="button" aria-label="Increase quantity"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.2c5.2-.4 10.1.3 15.1-.2"/><path d="M12.2 4.3c-.4 5.3.4 10.2-.2 15.2"/></svg></button></div>' +
        '<button class="to-basket" type="button" data-variant="' + text(variant.id) + '">Add to cart</button>' +
        '<p class="note" role="status"></p>'
      : ''
    return '<article class="product">' +
      (image ? '<img' + productImageAttrs(image) + ' alt="' + text(image.altText || product.title) + '"' + size + loading + ' decoding="async">' : '') +
      '<div class="details"><h1>' + text(product.title) + '</h1>' +
      '<p class="price">' + money(price.amount, price.currencyCode) + '</p>' +
      '<p class="tax">Tax included. Shipping calculated at checkout.</p>' +
      buy +
      (product.descriptionHtml ? '<div class="copy">' + product.descriptionHtml + '</div>' : '') +
      '</div></article>'
  }).join('')
}

function cartLineHtml(line, index) {
  const item = line.merchandise
  const image = (item.image && item.image.url) || (item.product.featuredImage && item.product.featuredImage.url) || ''
  const alt = (item.image && item.image.altText) || item.product.title
  const variant = item.title && item.title !== 'Default Title' ? '<p class="meta">Size: ' + text(item.title) + '</p>' : ''
  const less = line.quantity <= 1 ? ' disabled' : ''
  const more = line.quantity >= 99 ? ' disabled' : ''
  return '<article class="line" data-line="' + text(line.id) + '" style="--i:' + Math.min(index, 6) + '">' +
    (image ? '<img src="' + text(image) + '" alt="' + text(alt) + '">' : '<span></span>') +
    '<div><h2>' + text(item.product.title) + '</h2>' + variant +
    '<p class="meta">' + money(item.price.amount, item.price.currencyCode) + '</p>' +
    '<div class="qty-row"><span>quantity:</span><span class="bag-count">' + line.quantity + '</span>' +
    '<button class="bag-qty bag-less" type="button" data-line="' + text(line.id) + '" aria-label="Decrease quantity"' + less + '>−</button>' +
    '<button class="bag-qty bag-more" type="button" data-line="' + text(line.id) + '" aria-label="Increase quantity"' + more + '>+</button></div>' +
    '<button class="bag-remove" type="button" data-line="' + text(line.id) + '">remove</button></div></article>'
}

function cartTotal(cart) {
  const total = cart.cost.subtotalAmount || cart.cost.totalAmount
  return money(total.amount, total.currencyCode)
}

function renderCart(cart, root) {
  const lines = linesOf(cart)
  if (!lines.length) {
    root.innerHTML = '<p class="status">Your cart is empty.</p>'
    return
  }
  root.innerHTML = '<div class="bag-items">' + lines.map(cartLineHtml).join('') + '</div>' +
    '<div class="bag-foot">' +
    '<div class="subtotal"><span>Subtotal</span><span class="bag-total">' + cartTotal(cart) + '</span></div>' +
    '<p class="tax">Taxes included. Shipping calculated at checkout.</p>' +
    '<a class="checkout" href="' + text(cart.checkoutUrl) + '">Check out</a>' +
    '<p class="note" role="status"></p></div>'
}

function scrollHomeMark() {
  const mark = document.querySelector('.logo-s')
  if (!mark) return
  mark.addEventListener('click', () => {
    if (window.scrollY <= 0) return
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  })
}

async function boot() {
  scrollHomeMark()
  const root = document.getElementById('page')
  const bag = document.getElementById('bag')
  const bagPanel = document.getElementById('bag-panel')
  const bagButton = document.getElementById('cart-link')
  try {
    let cart = await readCart()
    remember(cart)
    // enter=true staggers the lines in; plain redraws (qty/remove) must not replay it.
    const drawBag = (enter = false) => {
      bagPanel.classList.toggle('bag-enter', enter)
      renderCart(cart, bagPanel)
    }
    const isBagOpen = () => bag.classList.contains('is-open')
    const drawer = bag.querySelector('.bag-drawer')
    const inkLayer = inkOutline(drawer)
    const easeSoft = 'cubic-bezier(.4, 0, .2, 1)'
    const easeMorph = 'cubic-bezier(.32, .72, 0, 1)'
    const MORPH_MS = 750
    const toElement = (html) => {
      const template = document.createElement('template')
      template.innerHTML = html
      return template.content.firstElementChild
    }
    // ---- Contents changes, animated like the open/close roll: transform and opacity only ----
    // Nothing animates height or padding (that re-lays out, redraws the ink and re-blurs the
    // glass every frame on a phone). Instead:
    // - The sheet is held at the taller of its old and new height by extra padding-bottom (which
    //   grows the box without moving its children, unlike a fixed height that would stretch the
    //   flex/grid list), slid up behind .bag's top clip so its visible bottom edge sits where it
    //   was, then glides to the new edge. The content and the top/side ink slide down by the
    //   same amount, so they stand still, exactly like the roll. The bottom ink strip rides the
    //   edge.
    // - Every line, the foot and the status message that stays slides from where it was to
    //   where it now sits (FLIP); new ones fade and rise in.
    // The reserve is released and all fill-forwards animations cancelled in the same task when
    // the glide ends, so the hand-over to the plain layout cannot show a jump.
    const pieces = () => [...bagPanel.querySelectorAll('.line, .bag-foot, #bag-panel > .status')]
    let morph = null
    const endMorph = () => {
      if (!morph) return
      const { animations, items } = morph
      morph = null
      drawer.style.paddingBottom = ''
      if (items) items.style.overflow = ''
      animations.forEach((animation) => animation.cancel())
    }
    const morphSheet = (mutate) => {
      if (!isBagOpen() || prefersReducedMotion()) {
        endMorph()
        mutate()
        return Promise.resolve()
      }
      // Where everything is on screen right now, including a morph still in flight.
      const bagTop = bag.getBoundingClientRect().top
      const fromBottom = drawer.getBoundingClientRect().bottom - bagTop
      const from = new Map(pieces().map((el) => [el, el.getBoundingClientRect().top]))
      // While the sheet is still rolling open or shut, its CSS transitions own the transforms
      // (and would override these), so only the pieces glide and the edge simply follows.
      const rolling = [drawer, bagPanel].some((el) => el.getAnimations().some(
        (animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform'))
      endMorph()
      mutate()
      const toBottom = drawer.offsetHeight
      const glideEdge = !rolling && Math.abs(fromBottom - toBottom) > 0.5
      const held = glideEdge ? Math.max(fromBottom, toBottom) : toBottom
      const reserve = held - toBottom
      if (reserve > 0.5) drawer.style.paddingBottom = parseFloat(getComputedStyle(drawer).paddingBottom) + reserve + 'px'
      // The list clips its children; lines sliding up from below must stay visible on the way.
      const items = bagPanel.querySelector('.bag-items')
      const scrolls = items && items.scrollHeight > items.clientHeight + 1
      if (items && !scrolls) items.style.overflow = 'visible'
      // Final layout positions, measured before any new transform is applied.
      const to = new Map(pieces().map((el) => [el, el.getBoundingClientRect().top]))
      const timing = { duration: MORPH_MS, easing: easeMorph, fill: 'forwards' }
      const animations = []
      const lift = (y) => `translateY(${y}px)`
      if (glideEdge) {
        animations.push(drawer.animate([{ transform: lift(fromBottom - held) }, { transform: lift(toBottom - held) }], timing))
        for (const layer of [bagPanel, inkLayer]) {
          animations.push(layer.animate([{ transform: lift(held - fromBottom) }, { transform: lift(held - toBottom) }], timing))
        }
      }
      to.forEach((top, el) => {
        if (from.has(el)) {
          const dy = from.get(el) - top
          if (Math.abs(dy) > 0.5) animations.push(el.animate([{ transform: lift(dy) }, { transform: 'none' }], timing))
        } else {
          // fill 'both' keeps a new piece hidden during its short delay, not just after it.
          animations.push(el.animate(
            [{ opacity: 0, transform: lift(12) }, { opacity: 1, transform: 'none' }],
            { ...timing, delay: 120, fill: 'both' }))
        }
      })
      const current = { animations, items: items && !scrolls ? items : null }
      morph = current
      if (!animations.length) {
        endMorph()
        return Promise.resolve()
      }
      return Promise.all(animations.map((animation) => animation.finished)).then(
        () => { if (morph === current) endMorph() },
        () => {},
      )
    }
    // Exit animations: opacity plus an optional small drift. The drift is composited on top of
    // any transform already running (a glide still in flight), so it never makes a line jump.
    // A cancelled exit resolves rather than rejects.
    const fadeOut = (el, drift = 0) => {
      const opts = { duration: 240, easing: easeSoft, fill: 'forwards' }
      const fade = el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], opts)
      if (drift) el.animate([{ transform: 'translate(0px, 0px)' }, { transform: `translate(${drift}px, -4px)` }], { ...opts, composite: 'add' })
      return fade.finished.catch(() => {})
    }
    const clearPanelFade = () => bagPanel.getAnimations().forEach((animation) => {
      if (animation.effect.getKeyframes().some((keyframe) => 'opacity' in keyframe)) animation.cancel()
    })
    const emptyHtml = '<p class="status">Your cart is empty.</p>'
    // Brings the open cart up to date in place, so lines that stay keep their images and
    // nothing flashes: numbers tick, lines that left fade and the rest glide together, new ones
    // rise in.
    const patchBag = async () => {
      bagPanel.classList.remove('bag-enter')
      if (!isBagOpen() || prefersReducedMotion()) {
        endMorph()
        drawBag()
        return
      }
      const lines = linesOf(cart)
      const items = bagPanel.querySelector('.bag-items')
      // Switching between the empty message and the list: the old content fades, then the
      // sheet glides to the new content's height while it rises in.
      if (!items || !lines.length) {
        if (!items && !lines.length) return
        await fadeOut(bagPanel)
        await morphSheet(() => {
          clearPanelFade()
          drawBag()
        })
        return
      }
      const total = bagPanel.querySelector('.bag-total')
      if (total && total.textContent !== cartTotal(cart)) {
        total.textContent = cartTotal(cart)
        replay(total, 'tick-up', 'tick-down')
      }
      const checkout = bagPanel.querySelector('.checkout')
      if (checkout) checkout.href = cart.checkoutUrl
      const lineElement = (lineId) => [...items.querySelectorAll('.line')].find((node) => node.dataset.line === lineId)
      const keep = new Set(lines.map((line) => line.id))
      const gone = [...items.querySelectorAll('.line')].filter((element) => !keep.has(element.dataset.line))
      const added = []
      lines.forEach((line, index) => {
        const element = lineElement(line.id)
        if (!element) {
          added.push([line, index])
          return
        }
        const count = element.querySelector('.bag-count')
        const previous = Number(count.textContent)
        if (previous !== line.quantity) {
          count.textContent = String(line.quantity)
          replay(count, line.quantity > previous ? 'tick-up' : 'tick-down', 'tick-up', 'tick-down')
        }
        element.querySelector('.bag-less').disabled = line.quantity <= 1
        element.querySelector('.bag-more').disabled = line.quantity >= 99
        element.querySelector('.bag-remove').disabled = false
        element.classList.remove('is-busy')
      })
      if (!gone.length && !added.length) return
      await Promise.all(gone.map((element) => fadeOut(element, 10)))
      let newest = null
      await morphSheet(() => {
        gone.forEach((element) => element.remove())
        added.forEach(([line, index]) => {
          const element = toElement(cartLineHtml(line, index))
          const previous = index ? lineElement(lines[index - 1].id) : null
          items.insertBefore(element, previous ? previous.nextSibling : items.firstChild)
          newest = element
        })
      })
      if (newest && newest.offsetTop + newest.offsetHeight > items.scrollTop + items.clientHeight) {
        items.scrollTo({ top: items.scrollHeight, behavior: 'smooth' })
      }
    }
    // The cart sheet is a non-modal dropdown: the page keeps scrolling and stays usable.
    drawer.setAttribute('aria-modal', 'false')
    // There is no close button, so keyboard opens move focus to the sheet itself.
    drawer.tabIndex = -1
    let bagCloseTimer = 0
    const finishClose = () => {
      clearTimeout(bagCloseTimer)
      if (isBagOpen() || bag.hidden) return
      bag.hidden = true
    }
    drawer.addEventListener('transitionend', (event) => {
      if (event.target === drawer && event.propertyName === 'transform') finishClose()
    })
    // The roll animation slides the sheet and its content by the sheet's own height
    // (see .bag-drawer in site.css). Measured right before each open/close, since adding or
    // removing items changes it. When opening, transitions are frozen while the new height is
    // applied; otherwise the closed position would itself animate from the old height.
    const measureSheet = (freeze = false) => {
      if (freeze) bag.classList.add('is-measuring')
      drawer.style.setProperty('--sheet-h', drawer.offsetHeight + 'px')
      if (freeze) {
        void drawer.offsetHeight
        bag.classList.remove('is-measuring')
      }
    }
    // fromKeyboard: move focus only for keyboard/assistive use; on touch it can draw a focus ring.
    const setBagOpen = (open, fromKeyboard = false) => {
      clearTimeout(bagCloseTimer)
      bagButton.setAttribute('aria-expanded', open ? 'true' : 'false')
      // A contents glide in flight is settled first, so the sheet is measured at its real size.
      endMorph()
      if (open) {
        // Reopening mid-close keeps the current height so the sheet reverses smoothly.
        const fromHidden = bag.hidden
        drawBag(true)
        bag.hidden = false
        if (fromHidden) measureSheet(true)
        void bag.offsetWidth
        bag.classList.add('is-open')
        if (fromKeyboard) drawer.focus({ preventScroll: true })
        return
      }
      measureSheet()
      bag.classList.remove('is-open')
      if (bag.contains(document.activeElement)) {
        if (fromKeyboard) bagButton.focus({ preventScroll: true })
        else document.activeElement.blur()
      }
      const closeMs = prefersReducedMotion() ? 0 : cssTimeMs(getComputedStyle(bag).getPropertyValue('--bag-close-ms'), 1300)
      if (closeMs === 0) finishClose()
      else bagCloseTimer = setTimeout(finishClose, closeMs + 120)
    }
    // A click with detail 0 comes from the keyboard or assistive tech, not a pointer.
    bagButton.addEventListener('click', (event) => setBagOpen(!isBagOpen(), event.detail === 0))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isBagOpen()) setBagOpen(false, true)
    })
    // A tap or click anywhere outside the sheet (other than Cart, which toggles) closes it.
    // Scrolling never fires a click, so the page can be scrolled with the cart open.
    // Adding to the cart (and picking a quantity for it) keeps the cart open to show the change.
    document.addEventListener('click', (event) => {
      if (!isBagOpen() || drawer.contains(event.target) || bagButton.contains(event.target)) return
      if (event.target.closest('.to-basket, .qty')) return
      setBagOpen(false, event.detail === 0)
    })
    bag.addEventListener('click', async (event) => {
      const step = event.target.closest('.bag-qty')
      const remove = event.target.closest('.bag-remove')
      const button = step || remove
      if (!button || !cart) return
      const line = button.closest('.line')
      button.disabled = true
      const showError = (error) => {
        const note = bagPanel.querySelector('.note')
        if (note) note.textContent = error.message
      }
      // Removing is optimistic: the line leaves at once instead of dimming while Shopify answers
      // (waiting would leave a gap). The last line takes the whole panel with it. If Shopify
      // refuses, the line comes back the same way.
      if (remove && line && isBagOpen() && !prefersReducedMotion()) {
        const request = removeLine(cart, button.dataset.line)
        request.catch(() => {})
        const last = bagPanel.querySelectorAll('.line').length === 1
        const parent = line.parentNode
        const next = line.nextSibling
        if (last) {
          await fadeOut(bagPanel)
          morphSheet(() => {
            clearPanelFade()
            bagPanel.innerHTML = emptyHtml
          })
        } else {
          await fadeOut(line, 10)
          morphSheet(() => line.remove())
        }
        try {
          cart = await request
          await patchBag()
        } catch (error) {
          await morphSheet(() => {
            if (last || !parent.isConnected) {
              drawBag()
              return
            }
            parent.insertBefore(line, next && next.parentNode === parent ? next : null)
            // Only after reinserting: a detached element does not list its (finished, filled)
            // exit animations, so cancelling first would leave the line invisible.
            line.getAnimations().forEach((animation) => animation.cancel())
          })
          button.disabled = false
          showError(error)
        }
        return
      }
      if (line) line.classList.add('is-busy')
      try {
        if (remove) cart = await removeLine(cart, button.dataset.line)
        else {
          const count = Number(button.parentElement.querySelector('.bag-count').textContent)
          const next = Math.min(99, count + (button.classList.contains('bag-more') ? 1 : -1))
          if (next !== count) cart = await updateLine(cart, button.dataset.line, next)
        }
        await patchBag()
      } catch (error) {
        button.disabled = false
        if (line) line.classList.remove('is-busy')
        showError(error)
      }
    })
    renderFront(await fetchProducts(), root)
    revealProducts(root)
    const footer = document.querySelector('.site-foot')
    if (footer) revealOnScroll([footer])
    root.addEventListener('click', async (event) => {
      const step = event.target.closest('.qty-more, .qty-less')
      if (step) {
        const qty = step.parentElement
        const count = Number(qty.querySelector('.qty-count').textContent)
        setQuantity(qty, count + (step.classList.contains('qty-more') ? 1 : -1))
        return
      }
      const button = event.target.closest('.to-basket')
      if (!button) return
      const details = button.closest('.details')
      const note = details.querySelector('.note')
      const quantity = Number(details.querySelector('.qty-count').textContent) || 1
      button.disabled = true
      button.classList.add('is-busy')
      if (note) note.textContent = ''
      try {
        cart = await addVariant(cart, button.dataset.variant, quantity)
        setQuantity(details.querySelector('.qty'), 1, false)
        if (isBagOpen()) patchBag()
        replay(bagButton, 'bump')
      } catch (error) {
        if (note) note.textContent = error.message
      }
      button.classList.remove('is-busy')
      button.disabled = false
    })
  } catch (error) {
    root.innerHTML = '<p class="status">' + text(error.message) + '</p>'
  }
}

boot()
