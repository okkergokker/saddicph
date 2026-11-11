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

function setQuantity(qty, value) {
  const next = Math.min(99, Math.max(1, value))
  const count = qty.querySelector('.qty-count')
  const previous = Number(count.textContent)
  count.textContent = String(next)
  if (next !== previous) replay(count, next > previous ? 'tick-up' : 'tick-down', 'tick-up', 'tick-down')
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

function renderCart(cart, root) {
  const lines = linesOf(cart)
  if (!lines.length) {
    root.innerHTML = '<p class="status">Your cart is empty.</p>'
    return
  }
  const rows = lines.map((line, index) => {
    const item = line.merchandise
    const image = (item.image && item.image.url) || (item.product.featuredImage && item.product.featuredImage.url) || ''
    const alt = (item.image && item.image.altText) || item.product.title
    const variant = item.title && item.title !== 'Default Title' ? '<p class="meta">Size: ' + text(item.title) + '</p>' : ''
    const less = line.quantity <= 1 ? ' disabled' : ''
    const more = line.quantity >= 99 ? ' disabled' : ''
    return '<article class="line" style="--i:' + Math.min(index, 6) + '">' +
      (image ? '<img src="' + text(image) + '" alt="' + text(alt) + '">' : '<span></span>') +
      '<div><h2>' + text(item.product.title) + '</h2>' + variant +
      '<p class="meta">' + money(item.price.amount, item.price.currencyCode) + '</p>' +
      '<div class="qty-row"><span>quantity:</span><span class="bag-count">' + line.quantity + '</span>' +
      '<button class="bag-qty bag-less" type="button" data-line="' + text(line.id) + '" aria-label="Decrease quantity"' + less + '>−</button>' +
      '<button class="bag-qty bag-more" type="button" data-line="' + text(line.id) + '" aria-label="Increase quantity"' + more + '>+</button></div>' +
      '<button class="bag-remove" type="button" data-line="' + text(line.id) + '">remove</button></div></article>'
  }).join('')
  const total = cart.cost.subtotalAmount || cart.cost.totalAmount
  root.innerHTML = '<div class="bag-items">' + rows + '</div>' +
    '<div class="bag-foot">' +
    '<div class="subtotal"><span>Subtotal</span><span>' + money(total.amount, total.currencyCode) + '</span></div>' +
    '<p class="tax">Taxes included. Shipping calculated at checkout.</p>' +
    '<a class="checkout" href="' + text(cart.checkoutUrl) + '">Check out</a>' +
    '<p class="note" role="status"></p></div>'
}

function scrollHomeMark() {
  const mark = document.querySelector('.logo-s')
  if (!mark) return
  mark.addEventListener('click', (event) => {
    if (window.scrollY <= 0) return
    event.preventDefault()
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
    let bagCloseTimer = 0
    // The page stays scroll-locked until the drawer is fully out, so nothing reflows mid-slide.
    const finishClose = () => {
      clearTimeout(bagCloseTimer)
      if (isBagOpen() || bag.hidden) return
      bag.hidden = true
      document.body.classList.remove('bag-open')
    }
    drawer.addEventListener('transitionend', (event) => {
      if (event.target === drawer && event.propertyName === 'transform') finishClose()
    })
    // fromKeyboard: move focus only for keyboard/assistive use; on touch it can draw a focus ring.
    const setBagOpen = (open, fromKeyboard = false) => {
      clearTimeout(bagCloseTimer)
      bagButton.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) {
        document.body.classList.add('bag-open')
        drawBag(true)
        bag.hidden = false
        void bag.offsetWidth
        bag.classList.add('is-open')
        if (fromKeyboard) bag.querySelector('.bag-close').focus({ preventScroll: true })
        return
      }
      bag.classList.remove('is-open')
      if (bag.contains(document.activeElement)) {
        if (fromKeyboard) bagButton.focus({ preventScroll: true })
        else document.activeElement.blur()
      }
      const closeMs = prefersReducedMotion() ? 0 : (parseFloat(getComputedStyle(bag).getPropertyValue('--bag-close-ms')) || 1400) + 120
      bagCloseTimer = setTimeout(finishClose, closeMs)
    }
    // A click with detail 0 comes from the keyboard or assistive tech, not a pointer.
    bagButton.addEventListener('click', (event) => setBagOpen(!isBagOpen(), event.detail === 0))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isBagOpen()) setBagOpen(false, true)
    })
    bag.addEventListener('click', async (event) => {
      if (event.target.closest('.bag-close, .bag-shade')) {
        setBagOpen(false, event.detail === 0)
        return
      }
      const step = event.target.closest('.bag-qty')
      const remove = event.target.closest('.bag-remove')
      const button = step || remove
      if (!button || !cart) return
      const line = button.closest('.line')
      button.disabled = true
      if (line) line.classList.add('is-busy')
      try {
        if (remove) cart = await removeLine(cart, button.dataset.line)
        else {
          const count = Number(button.parentElement.querySelector('.bag-count').textContent)
          const next = Math.min(99, count + (button.classList.contains('bag-more') ? 1 : -1))
          if (next !== count) cart = await updateLine(cart, button.dataset.line, next)
        }
        drawBag()
      } catch (error) {
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
    const labelTimers = new WeakMap()
    const setLabel = (button, label) => {
      button.textContent = label
      replay(button, 'label-swap')
    }
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
      clearTimeout(labelTimers.get(button))
      button.disabled = true
      button.classList.add('is-busy')
      setLabel(button, 'Adding…')
      if (note) note.textContent = ''
      try {
        cart = await addVariant(cart, button.dataset.variant, quantity)
        setQuantity(details.querySelector('.qty'), 1)
        if (isBagOpen()) drawBag()
        setLabel(button, 'Added')
        replay(bagButton, 'bump')
        labelTimers.set(button, setTimeout(() => setLabel(button, 'Add to cart'), 1800))
      } catch (error) {
        setLabel(button, 'Add to cart')
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
