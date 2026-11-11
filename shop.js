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
            image { url altText }
            product { title handle featuredImage { url altText } }
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
function inkStroke(x1, y1, x2, y2, rand) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const before = 2 + rand() * 4
  const after = 2 + rand() * 4
  const tilt = (rand() - 0.5) * 1.6
  // A long gentle sway plus a finer tremor, both under a pixel or so.
  const waves = [
    [0.5 + rand() * 0.6, rand() * Math.PI * 2, len / (220 + rand() * 160)],
    [0.2 + rand() * 0.25, rand() * Math.PI * 2, len / (45 + rand() * 30)],
  ]
  const total = before + len + after
  const steps = Math.max(2, Math.round(total / 12))
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const s = -before + (total * i) / steps
    const t = s / len
    let off = tilt * t
    for (const [amp, phase, cycles] of waves) off += amp * Math.sin(phase + t * cycles * Math.PI * 2)
    d += `${i ? 'L' : 'M'}${(x1 + ux * s - uy * off).toFixed(1)} ${(y1 + uy * s + ux * off).toFixed(1)}`
  }
  return d
}

// Paths are created once and only their shape is updated on resize, so a resize during the
// draw-in does not restart it.
function inkOutline(sheet) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'bag-outline')
  svg.setAttribute('aria-hidden', 'true')
  const paths = []
  for (let side = 0; side < 4; side++) {
    for (const cls of ['ink', 'ink-echo']) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('class', cls)
      path.setAttribute('pathLength', '100')
      path.style.setProperty('--n', side)
      paths.push(path)
    }
  }
  svg.append(...paths)
  sheet.prepend(svg)
  const draw = () => {
    const w = sheet.clientWidth
    const h = sheet.clientHeight
    if (!w || !h) return
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    const rand = seededRandom(23)
    const m = 8
    const sides = [[m, m, w - m, m], [w - m, m, w - m, h - m], [m, h - m, w - m, h - m], [m, m, m, h - m]]
    paths.forEach((path, i) => path.setAttribute('d', inkStroke(...sides[i >> 1], rand)))
  }
  new ResizeObserver(draw).observe(sheet)
  draw()
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
          featuredImage { url altText width height }
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
      (image ? '<img src="' + text(image.url) + '" alt="' + text(image.altText || product.title) + '"' + size + loading + ' decoding="async">' : '') +
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
    inkOutline(drawer)
    const easeSoft = 'cubic-bezier(.4, 0, .2, 1)'
    const toElement = (html) => {
      const template = document.createElement('template')
      template.innerHTML = html
      return template.content.firstElementChild
    }
    // Fades a line out, then folds its height away so the lines below slide up.
    // Exit animations can start before Shopify answers (see the remove click), so they are
    // remembered and reused instead of restarted; a cancelled one resolves rather than rejects.
    const leaving = new WeakMap()
    const collapseLine = (line) => {
      if (leaving.has(line)) return leaving.get(line)
      const height = line.offsetHeight + 'px'
      const { paddingBottom: pad, opacity } = getComputedStyle(line)
      line.style.overflow = 'hidden'
      const done = line.animate([
        { opacity, height, paddingBottom: pad },
        { opacity: 0, height, paddingBottom: pad, offset: 0.35 },
        { opacity: 0, height: '0px', paddingBottom: '0px' },
      ], { duration: 600, easing: easeSoft, fill: 'forwards' }).finished.catch(() => {})
      leaving.set(line, done)
      return done
    }
    let panelLeaving = null
    const fadePanelOut = () => panelLeaving || (panelLeaving = bagPanel.animate(
      [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: easeSoft, fill: 'forwards' }).finished.catch(() => {}))
    const undoLeaving = (line) => {
      bagPanel.getAnimations().forEach((animation) => animation.cancel())
      panelLeaving = null
      if (!line) return
      line.getAnimations().forEach((animation) => animation.cancel())
      leaving.delete(line)
      line.style.overflow = ''
    }
    // The reverse: opens room for a new line, then lets it settle in.
    const expandLine = (line) => {
      const height = line.offsetHeight + 'px'
      const pad = getComputedStyle(line).paddingBottom
      line.style.overflow = 'hidden'
      line.animate([
        { opacity: 0, height: '0px', paddingBottom: '0px', transform: 'translateY(10px)' },
        { opacity: 0, height, paddingBottom: pad, transform: 'translateY(10px)', offset: 0.45 },
        { opacity: 1, height, paddingBottom: pad, transform: 'none' },
      ], { duration: 900, easing: easeSoft }).finished.then(() => { line.style.overflow = '' })
    }
    // Swaps the whole panel (empty message <-> list) behind a soft fade, easing the sheet height.
    const fadeSwap = async () => {
      await fadePanelOut()
      panelLeaving = null
      const before = drawer.offsetHeight
      drawBag()
      const after = drawer.offsetHeight
      bagPanel.getAnimations().forEach((animation) => animation.cancel())
      if (after !== before) drawer.animate([{ height: before + 'px' }, { height: after + 'px' }], { duration: 750, easing: 'cubic-bezier(.45, 0, .2, 1)' })
      bagPanel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2, .7, .2, 1)' })
    }
    // Brings the open cart up to date in place, so lines that stay keep their images and
    // nothing flashes: removed lines fold away, new ones open up, numbers tick.
    const patchBag = async () => {
      bagPanel.classList.remove('bag-enter')
      if (!isBagOpen() || prefersReducedMotion()) {
        drawBag()
        return
      }
      const lines = linesOf(cart)
      const items = bagPanel.querySelector('.bag-items')
      // Switching between the empty message and the list (incl. removing the last line) is
      // one soft crossfade, so the list and its totals leave together.
      if (!items || !lines.length) {
        await fadeSwap()
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
      lines.forEach((line, index) => {
        let element = lineElement(line.id)
        if (!element) {
          element = toElement(cartLineHtml(line, index))
          const previous = index ? lineElement(lines[index - 1].id) : null
          items.insertBefore(element, previous ? previous.nextSibling : items.firstChild)
          expandLine(element)
          if (element.offsetTop + element.offsetHeight > items.scrollTop + items.clientHeight) {
            items.scrollTo({ top: items.scrollHeight, behavior: 'smooth' })
          }
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
      await Promise.all(gone.map(collapseLine))
      gone.forEach((element) => element.remove())
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
      // Removing starts its exit right away instead of dimming and waiting for Shopify:
      // the last line takes the whole panel with it, any other line folds away.
      const exitNow = remove && line && isBagOpen() && !prefersReducedMotion()
      if (exitNow) {
        if (bagPanel.querySelectorAll('.line').length === 1) fadePanelOut()
        else collapseLine(line)
      } else if (line) line.classList.add('is-busy')
      try {
        if (remove) cart = await removeLine(cart, button.dataset.line)
        else {
          const count = Number(button.parentElement.querySelector('.bag-count').textContent)
          const next = Math.min(99, count + (button.classList.contains('bag-more') ? 1 : -1))
          if (next !== count) cart = await updateLine(cart, button.dataset.line, next)
        }
        await patchBag()
      } catch (error) {
        if (exitNow) undoLeaving(line)
        button.disabled = false
        if (line) line.classList.remove('is-busy')
        const note = bagPanel.querySelector('.note')
        if (note) note.textContent = error.message
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
