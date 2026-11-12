// Product page (/products/<handle>). Computers: a column of thumbnails, the large photo and a
// sticky info column. Phones: a swipeable photo carousel, then the info stacked. The fold-out
// sections Product Details / Condition / Dimensions come from the Shopify metafields
// custom.details, custom.condition and custom.dimensions and only show when filled in;
// Shipping always shows (placeholder text until the real copy is written).
import {
  gql, money, text, imageAttrs, IMAGE_FIELDS, cardHtml, CARD_FIELDS, QTY_HTML,
  setQuantity, fadeInWhenLoaded, revealOnScroll, prefersReducedMotion, replay,
} from './lib.js'

const MAIN_SIZES = '(max-width: 760px) 100vw, 46vw'
const CARD_SIZES = '(max-width: 760px) calc(50vw - 40px), 22vw'
const SHIPPING_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Shipping is calculated at checkout.'
const SECTIONS = [['details', 'Product Details'], ['condition', 'Condition'], ['dimensions', 'Dimensions']]

async function fetchProduct(handle) {
  const data = await gql(`query Product($handle: String!) {
    product(handle: $handle) {
      id title handle descriptionHtml
      images(first: 20) { edges { node { ${IMAGE_FIELDS} thumb: url(transform: { maxWidth: 280 }) } } }
      variants(first: 100) { edges { node { id title availableForSale price { amount currencyCode } } } }
      metafields(identifiers: [
        { namespace: "custom", key: "details" },
        { namespace: "custom", key: "condition" },
        { namespace: "custom", key: "dimensions" }
      ]) { key value type }
    }
    products(first: 5, sortKey: CREATED_AT, reverse: true) { edges { node { ${CARD_FIELDS} } } }
  }`, { handle })
  return { product: data.product, others: data.products.edges.map((edge) => edge.node).filter((item) => item.handle !== handle) }
}

// Metafield text: plain/multi-line text keeps its line breaks; Shopify rich text (JSON) is
// reduced to its paragraphs.
function metafieldHtml(field) {
  if (!field || !field.value) return ''
  if (field.type === 'rich_text_field') {
    try {
      const words = (node) => node.value != null ? node.value : (node.children || []).map(words).join('')
      return (JSON.parse(field.value).children || []).map((block) => '<p>' + text(words(block)) + '</p>').join('')
    } catch {
      return ''
    }
  }
  return text(field.value).split(/\n{2,}/).map((part) => '<p>' + part.replace(/\n/g, '<br>') + '</p>').join('')
}

function section(title, body) {
  return '<details class="pd-section"><summary>' + text(title) + '</summary><div class="pd-section-body">' + body + '</div></details>'
}

export async function renderProduct(main, { addToCart }) {
  const handle = decodeURIComponent(location.pathname.replace(/^\/products\//, '').replace(/\/$/, ''))
  const { product, others } = handle ? await fetchProduct(handle) : { product: null, others: [] }
  if (!product) {
    document.title = 'Product not found – Saddi Copenhagen'
    main.innerHTML = '<p class="status">Product not found.</p><p class="pd-back"><a href="/catalogue">Back to the catalogue</a></p>'
    return
  }
  document.title = product.title + ' – Saddi Copenhagen'

  const images = product.images.edges.map((edge) => edge.node)
  const variants = product.variants.edges.map((edge) => edge.node)
  const choosable = variants.length > 1 || (variants[0] && variants[0].title !== 'Default Title')
  let variant = variants.find((item) => item.availableForSale) || variants[0]
  const fields = Object.fromEntries((product.metafields || []).filter(Boolean).map((field) => [field.key, field]))
  // Every slide shares the first photo's proportions, so a set shot alike shows uncropped.
  const ratio = images[0] && images[0].width ? images[0].width + ' / ' + images[0].height : '4 / 5'

  const thumbs = images.length > 1
    ? '<div class="pd-thumbs">' + images.map((image, index) =>
      '<button class="pd-thumb" type="button" data-slide="' + index + '" aria-label="Show photo ' + (index + 1) + '"' +
      (index === 0 ? ' aria-current="true"' : '') + '><img src="' + text(image.thumb || image.url) + '" alt="" loading="lazy" decoding="async"></button>').join('') + '</div>'
    : ''
  const slides = images.map((image, index) =>
    '<div class="pd-slide"><img class="pd-img"' + imageAttrs(image, MAIN_SIZES) + ' alt="' + text(image.altText || product.title) + '"' +
    (index === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"></div>').join('')
  const arrows = images.length > 1
    ? '<div class="pd-arrows"><button class="pd-prev" type="button" aria-label="Previous photo">&larr;</button>' +
      '<span class="pd-count" aria-live="polite">1 / ' + images.length + '</span>' +
      '<button class="pd-next" type="button" aria-label="Next photo">&rarr;</button></div>'
    : ''
  const picker = choosable
    ? '<label class="pd-variant"><span class="visually-hidden">Variant</span><select>' + variants.map((item) =>
      '<option value="' + text(item.id) + '"' + (item === variant ? ' selected' : '') + (item.availableForSale ? '' : ' disabled') + '>' +
      text(item.title) + (item.availableForSale ? '' : ' – sold out') + '</option>').join('') + '</select></label>'
    : ''
  const sections = SECTIONS.map(([key, title]) => {
    const body = metafieldHtml(fields[key])
    return body ? section(title, body) : ''
  }).join('') + section('Shipping', '<p>' + text(SHIPPING_TEXT) + '</p>')

  main.innerHTML =
    '<div class="pd' + (thumbs ? ' has-thumbs' : '') + '">' +
      thumbs +
      '<div class="pd-gallery"><div class="pd-track" style="aspect-ratio:' + ratio + '">' + slides + '</div>' + arrows + '</div>' +
      '<div class="pd-info">' +
        '<h1 class="pd-title">' + text(product.title) + '</h1>' +
        '<p class="pd-price"></p>' +
        '<p class="pd-ship">Shipping calculated at checkout.</p>' +
        picker +
        '<div class="pd-buy">' + QTY_HTML +
          '<button class="pd-add to-basket" type="button"></button>' +
        '</div>' +
        '<p class="note pd-note" role="status"></p>' +
        (product.descriptionHtml ? '<div class="pd-copy">' + product.descriptionHtml + '</div>' : '') +
        '<div class="pd-sections">' + sections + '</div>' +
      '</div>' +
    '</div>' +
    (others.length
      ? '<section class="pd-more"><h2>You may also like</h2><div class="pd-more-grid">' +
        others.slice(0, 4).map((item, index) => cardHtml(item, CARD_SIZES, index + 2)).join('') + '</div></section>'
      : '')

  const price = main.querySelector('.pd-price')
  const add = main.querySelector('.pd-add')
  const note = main.querySelector('.pd-note')
  const qty = main.querySelector('.qty')
  const track = main.querySelector('.pd-track')
  const showVariant = () => {
    price.textContent = variant ? money(variant.price.amount, variant.price.currencyCode) : ''
    const buyable = variant && variant.availableForSale
    add.disabled = !buyable
    add.textContent = buyable ? 'Add to Cart' : 'Sold out'
  }
  showVariant()
  fadeInWhenLoaded(main.querySelectorAll('.pd-img, .card-img:not(.card-img-alt)'))
  revealOnScroll([...main.querySelectorAll('.pd-more .card')])

  const select = main.querySelector('.pd-variant select')
  if (select) select.addEventListener('change', () => {
    variant = variants.find((item) => item.id === select.value) || variant
    showVariant()
    replay(price, 'label-swap')
  })

  // Listeners sit on the + and − buttons only: iOS highlights any element with a click
  // listener when tapped, so one listener on the box made the whole box flash.
  qty.querySelectorAll('.qty-less, .qty-more').forEach((step) => {
    step.addEventListener('click', () => {
      setQuantity(qty, Number(qty.querySelector('.qty-count').textContent) + (step.classList.contains('qty-more') ? 1 : -1))
    })
  })

  let labelTimer = 0
  const label = (value) => {
    add.textContent = value
    replay(add, 'label-swap')
  }
  add.addEventListener('click', async () => {
    if (!variant) return
    clearTimeout(labelTimer)
    add.disabled = true
    add.classList.add('is-busy')
    note.textContent = ''
    label('Adding…')
    try {
      await addToCart(variant.id, Number(qty.querySelector('.qty-count').textContent) || 1)
      setQuantity(qty, 1, false)
      label('Added')
      labelTimer = setTimeout(() => label('Add to Cart'), 1800)
    } catch (error) {
      label('Add to Cart')
      note.textContent = error.message
    }
    add.classList.remove('is-busy')
    add.disabled = false
  })

  // Gallery: one horizontal scroll-snap track for both layouts. Thumbnails (computers) and the
  // arrows (phones) scroll it; swiping works natively; the counter and thumbnails follow.
  const slideCount = images.length
  const at = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
  const go = (index) => {
    const target = Math.max(0, Math.min(slideCount - 1, index))
    track.scrollTo({ left: target * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }
  const counter = main.querySelector('.pd-count')
  const follow = () => {
    const index = at()
    if (counter) counter.textContent = (index + 1) + ' / ' + slideCount
    main.querySelectorAll('.pd-thumb').forEach((thumb) => {
      if (Number(thumb.dataset.slide) === index) thumb.setAttribute('aria-current', 'true')
      else thumb.removeAttribute('aria-current')
    })
  }
  if (slideCount > 1) {
    let frame = 0
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(follow)
    }, { passive: true })
    main.querySelector('.pd-prev').addEventListener('click', () => go(at() - 1))
    main.querySelector('.pd-next').addEventListener('click', () => go(at() + 1))
    main.querySelector('.pd-thumbs').addEventListener('click', (event) => {
      const thumb = event.target.closest('.pd-thumb')
      if (thumb) go(Number(thumb.dataset.slide))
    })
  }
}
