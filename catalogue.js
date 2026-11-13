// Catalogue page (/catalogue): category list + a two-column, staggered product grid on
// computers; a swipeable category row + one column on phones. Categories are the shop's
// Shopify collections (the automatic "frontpage" one is left out); ?c=<handle> picks one.
import { gql, text, cardHtml, CARD_FIELDS, fadeInWhenLoaded, revealOnScroll, prefersReducedMotion } from './lib.js'

const CARD_SIZES = '(max-width: 760px) calc(100vw - 56px), 36vw'

async function fetchCatalogue() {
  const data = await gql(`query Catalogue {
    collections(first: 30) { edges { node { title handle } } }
    products(first: 100, sortKey: CREATED_AT, reverse: true) {
      edges { node {
        ${CARD_FIELDS}
        collections(first: 20) { edges { node { handle } } }
      } }
    }
  }`)
  const products = data.products.edges.map((edge) => ({
    ...edge.node,
    inCollections: edge.node.collections.edges.map((item) => item.node.handle),
  }))
  // Only categories that hold at least one product are offered.
  const categories = data.collections.edges.map((edge) => edge.node)
    .filter((collection) => collection.handle !== 'frontpage')
    .filter((collection) => products.some((product) => product.inCollections.includes(collection.handle)))
  return { products, categories }
}

export async function renderCatalogue(main) {
  const filters = main.querySelector('.cat-filters')
  const grid = main.querySelector('.cat-grid')
  const { products, categories } = await fetchCatalogue()
  const known = new Set(categories.map((category) => category.handle))
  let current = new URLSearchParams(location.search).get('c')
  if (!known.has(current)) current = null

  const link = (handle, title) => '<a href="/catalogue' + (handle ? '?c=' + encodeURIComponent(handle) : '') + '"' +
    ' data-c="' + text(handle || '') + '"' + ((handle || null) === current ? ' aria-current="true"' : '') + '>' + text(title) + '</a>'
  filters.innerHTML = link(null, 'All') + categories.map((category) => link(category.handle, category.title)).join('')

  const draw = () => {
    const shown = current ? products.filter((product) => product.inCollections.includes(current)) : products
    grid.innerHTML = shown.length
      ? shown.map((product, index) => cardHtml(product, CARD_SIZES, index)).join('')
      : '<p class="status">Nothing here yet.</p>'
    grid.removeAttribute('aria-busy')
    const cards = [...grid.querySelectorAll('.card')]
    fadeInWhenLoaded(grid.querySelectorAll('.card-img:not(.card-img-alt)'))
    revealOnScroll(cards)
  }
  draw()

  // Switching category happens in place (no reload): the grid fades out, redraws, fades in.
  filters.addEventListener('click', async (event) => {
    const choice = event.target.closest('a[data-c]')
    if (!choice) return
    event.preventDefault()
    const next = choice.dataset.c || null
    if (next === current) return
    current = next
    filters.querySelectorAll('a').forEach((item) => {
      if ((item.dataset.c || null) === current) item.setAttribute('aria-current', 'true')
      else item.removeAttribute('aria-current')
    })
    history.replaceState(null, '', choice.getAttribute('href'))
    if (!prefersReducedMotion()) {
      await grid.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished
    }
    draw()
    grid.getAnimations().forEach((animation) => animation.cancel())
  })
}
