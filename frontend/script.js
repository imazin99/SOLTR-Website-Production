/* ═══════════════════════════════════════════════════
   SOLTR Storefront — script.js
   Products fetched from Express + MongoDB backend.
   All cart / UI logic unchanged.
═══════════════════════════════════════════════════ */

/* ── API config — change these when you deploy ── */
const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;   // base for uploaded product images

function imgUrl(filename) {
  return window.productImageUrl(filename);
}

/* ── Color swatch map ── */
const SWATCH = { White:"#f1efe9", Black:"#1a1a1a", Burgundy:"#6e1423" };

/* Reviews are now fetched live from the Reviews API — see initReviews() below */

/* ════════════════════════════════
   STATE
════════════════════════════════ */
let productsCache = [];          // fetched once, used for filters + cart lookups
let cart = [];                   // [{ productId, size, qty }]
const selectedSize = {};         // productId → chosen size

/* ════════════════════════════════
   HELPERS
════════════════════════════════ */
const grid = document.getElementById("productGrid");
function fmt(n) { return "LE " + Number(n).toFixed(2); }

/** Escapes HTML-significant characters — prevents XSS from dynamic content (reviews, cart, etc.) */
const esc = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* Find a product in cache by its MongoDB _id */
function findProduct(id) {
  return productsCache.find(p => p._id === id) || null;
}
function getSizeStock(product, size) {
  const inventory = product?.sizeInventory;
  if (inventory && Object.keys(inventory).length) return Number(inventory[size] ?? 0);
  return Number(product?.stock) || 0;
}

/* ════════════════════════════════
   RENDER PRODUCTS (async)
════════════════════════════════ */
async function renderProducts(filter) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
                font-family:var(--mono);font-size:12px;color:var(--smoke);letter-spacing:.06em;">
      Loading products…
    </div>`;

  /* Fetch only on first call — cache for filter changes */
  if (!productsCache.length) {
    try {
      const res = await fetch(`${API}/products`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      productsCache = await res.json();
    } catch (err) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
                    font-family:var(--mono);font-size:12px;color:var(--burgundy-light);">
          ⚠ Could not load products.<br>
          <span style="color:var(--smoke);font-size:10px;">
            Please try again shortly.
          </span>
        </div>`;
      return;
    }
  }

  /* Apply filter from chip */
  let list = [...productsCache];
  if (filter && filter !== "all") {
    const [key, val] = filter.split(":");
    if (key === "type")  list = list.filter(p => p.category === val);
    if (key === "color") list = list.filter(p => p.colors.includes(val));
  }

  grid.innerHTML = "";

  if (!list.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
                  font-family:var(--mono);font-size:12px;color:var(--smoke);">
        No products found.
      </div>`;
    return;
  }

  list.forEach(p => {
    const img1     = p.images[0] ? imgUrl(p.images[0]) : '';
    const img2     = p.images[1] ? imgUrl(p.images[1]) : img1;
    const color    = p.colors[0] || '';
    const typeLabel = p.category === "Boxy" ? "Boxy Tee" : p.category;
    const swatchBg = SWATCH[color] || '#888';
    const sizesDisplay  = (p.sizes && p.sizes.length)  ? p.sizes.join(' · ')  : 'Multiple Sizes Available';
    const colorsDisplay = (p.colors && p.colors.length) ? p.colors.join(' · ') : 'Multiple Colors Available';

    /* ── Stock status — same p.stock value the admin dashboard reads, no duplication ── */
    const stock       = Number(p.stock) || 0;
    const outOfStock  = stock === 0;
    const lowStock     = stock > 0 && stock <= 5;
    const stockBadge  = outOfStock
      ? '<span class="stock-badge stock-badge--out">OUT OF STOCK</span>'
      : lowStock
        ? '<span class="stock-badge stock-badge--low">LOW STOCK</span>'
        : '';

    const card = document.createElement("article");
    card.className = "card reveal";
    card.dataset.id = p._id;
    card.innerHTML = `
      <div class="card-media-frame">
        <a href="products/product.html?id=${esc(p._id)}" class="card-media-link">
          <div class="card-media">
            <img class="img-a" src="${esc(img1)}" alt="${esc(p.name)} | ${esc(color)} ${esc(typeLabel)}" loading="lazy" onerror="handleProductImageError(this)">
            <img class="img-b" src="${esc(img2)}" alt="" loading="lazy" onerror="handleProductImageError(this)">
            <span class="hangtag">${esc(fmt(p.price))}</span>
            <span class="swatch-dot" style="background:${esc(swatchBg)}" title="${esc(color)}"></span>
            ${stockBadge}
          </div>
        </a>
        <button class="wishlist-heart" data-wishlist-id="${esc(p._id)}" aria-label="Add to wishlist">♡</button>
      </div>
      <div class="card-info">
        <a href="products/product.html?id=${esc(p._id)}" class="pd-related-name-link"><h3>${esc(p.name)}</h3></a>
        <div class="meta">${esc(color)} · ${esc(typeLabel)}</div>
        <div class="card-variant-info">
          <div class="variant-row"><span class="variant-label">Sizes</span><span class="variant-value">${esc(sizesDisplay)}</span></div>
          <div class="variant-row"><span class="variant-label">Colors</span><span class="variant-value">${esc(colorsDisplay)}</span></div>
        </div>
        <a href="products/product.html?id=${esc(p._id)}" class="view-product-btn">View Product →</a>
      </div>`;
    grid.appendChild(card);
  });

  bindCardEvents();
  observeReveal();
  refreshWishlistIcons(); // ensures hearts are correct regardless of fetch order vs. fetchWishlist()
}

/* ════════════════════════════════
   CARD EVENTS  (unchanged logic)
════════════════════════════════ */
function bindCardEvents() {
  document.querySelectorAll(".sizes").forEach(sizesEl => {
    const pid = sizesEl.dataset.product;
    sizesEl.querySelectorAll(".size-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        sizesEl.querySelectorAll(".size-pill").forEach(b => b.classList.remove("active"));
        pill.classList.add("active");
        selectedSize[pid] = pill.dataset.size;
        const btn = document.querySelector(`.add-btn[data-product="${pid}"]`);
        const p   = findProduct(pid);
        if (!btn || !p) return;
        btn.classList.add("ready");
        btn.classList.remove("added");
        btn.textContent = `Add — ${fmt(p.price)}`;
      });
    });
  });

  document.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pid  = btn.dataset.product;
      const size = selectedSize[pid];
      if (!size) return;
      addToCart(pid, size);
      btn.classList.add("added");
      btn.textContent = "Added ✓";
      setTimeout(() => {
        const p = findProduct(pid);
        if (btn && p) {
          btn.classList.remove("added");
          btn.textContent = `Add — ${fmt(p.price)}`;
        }
      }, 1200);
    });
  });

  document.querySelectorAll(".wishlist-heart").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); // safety: never let this bubble into the card's product-page link
      btn.disabled = true;
      const result = await toggleWishlist(btn.dataset.wishlistId);
      btn.disabled = false;
      if (!result.ok) console.error('Could not update wishlist.');
    });
  });
}

/* ════════════════════════════════
   FILTERS
════════════════════════════════ */
document.querySelectorAll("#filters .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#filters .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderProducts(chip.dataset.filter);
  });
});

/* ════════════════════════════════
   CART  (unchanged logic)
════════════════════════════════ */
function addToCart(productId, size) {
  const product = findProduct(productId);
  const available = product ? getSizeStock(product, size) : 0;
  if (!product || available <= 0) return;
  const existing = cart.find(i => i.productId === productId && i.size === size);
  if (existing) {
    if (existing.qty >= available) return;
    existing.qty += 1;
  } else { cart.push({ productId, size, qty: 1 }); }
  renderCart();
  openCart();
}
function changeQty(productId, size, delta) {
  const item = cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;
  const product = findProduct(productId);
  const limit = product ? getSizeStock(product, size) : 0;
  if (delta > 0 && item.qty >= limit) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i !== item);
  renderCart();
}
function removeItem(productId, size) {
  cart = cart.filter(i => !(i.productId === productId && i.size === size));
  renderCart();
}

function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subEl   = document.getElementById("cartSubtotal");
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  countEl.textContent = totalQty;

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty">Your bag is empty.<br>Add a tee to get started.</div>`;
  } else {
    itemsEl.innerHTML = cart.map(item => {
      const p    = findProduct(item.productId);
      if (!p) return '';
      const img  = p.images[0] ? imgUrl(p.images[0]) : '';
      const color = p.colors[0] || '';
      return `
      <div class="cart-item">
        <img src="${esc(img)}" alt="${esc(p.name)}" onerror="handleProductImageError(this)">
        <div class="ci-info">
          <h5>${p.name} — ${color}</h5>
          <div class="meta">Size ${item.size}</div>
          <div class="qty-row">
            <button onclick="changeQty('${item.productId}','${item.size}',-1)" aria-label="Decrease">–</button>
            <span>${item.qty}</span>
            <button onclick="changeQty('${item.productId}','${item.size}',1)"  aria-label="Increase">+</button>
            <button class="ci-remove" onclick="removeItem('${item.productId}','${item.size}')">Remove</button>
          </div>
        </div>
        <div class="ci-price">${fmt(p.price * item.qty)}</div>
      </div>`;
    }).join("");
  }

  const subtotal = cart.reduce((s, i) => {
    const p = findProduct(i.productId);
    return p ? s + p.price * i.qty : s;
  }, 0);
  subEl.textContent = fmt(subtotal);
}

function openCart()  { document.getElementById("cartDrawer").classList.add("open");    document.getElementById("overlay").classList.add("open"); }
function closeCart() { document.getElementById("cartDrawer").classList.remove("open"); document.getElementById("overlay").classList.remove("open"); }
document.getElementById("cartOpenBtn").addEventListener("click", openCart);
document.getElementById("cartCloseBtn").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);

/* ════════════════════════════════
   REVIEWS  (dynamic — live API)
════════════════════════════════ */
let reviewsCache  = [];
let reviewIndex   = 0;
const TRANSITION_MS = 280; // must match .review-card transition duration in style.css

/** "5 hours ago" / "2 days ago" / "3 months ago" style relative date */
function relativeDate(dateStr) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  const units = [
    ['year',   31536000],
    ['month',  2592000],
    ['day',    86400],
    ['hour',   3600],
    ['minute', 60],
  ];
  for (const [label, secs] of units) {
    const n = Math.floor(diffSec / secs);
    if (n >= 1) return `${n} ${label}${n === 1 ? '' : 's'} ago`;
  }
  return 'Just now';
}

/** Renders a 1–5 star rating as ★★★★☆-style text */
function starString(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function reviewCardHTML(r) {
  return `
    <div class="stars">${starString(r.rating)}</div>
    <p class="review-text">"${esc(r.text)}"</p>
    <div class="review-name">
      <span class="av">${esc(r.customerName.charAt(0))}</span>${esc(r.customerName)}
      ${r.verified ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
    </div>
    <div class="review-meta">
      <a href="products/product.html?id=${r.productId}" class="review-product-link">${esc(r.productName)}</a> · ${relativeDate(r.createdAt)}
    </div>`;
}

/**
 * Swaps the visible review card, with a fade+slide transition when a
 * direction is given ('next' | 'prev'); no animation on first render.
 */
function renderReviewCard(direction) {
  const card = document.getElementById('reviewCard');
  const r = reviewsCache[reviewIndex];
  if (!card || !r) return;

  if (!direction) {
    card.innerHTML = reviewCardHTML(r);
    return;
  }

  card.classList.add(direction === 'next' ? 'leaving-left' : 'leaving-right');
  setTimeout(() => {
    card.innerHTML = reviewCardHTML(r);
    card.classList.remove('leaving-left', 'leaving-right');
    card.classList.add(direction === 'next' ? 'entering-right' : 'entering-left');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.remove('entering-right', 'entering-left');
      });
    });
  }, TRANSITION_MS);
}

function renderReviewDots() {
  const dotsEl = document.getElementById('reviewDots');
  dotsEl.innerHTML = reviewsCache.map((_, i) =>
    `<button class="review-dot${i === reviewIndex ? ' active' : ''}" data-index="${i}" aria-label="Go to review ${i + 1}"></button>`
  ).join('');
}

function goToReview(newIndex, direction) {
  if (!reviewsCache.length) return;
  reviewIndex = (newIndex + reviewsCache.length) % reviewsCache.length;
  renderReviewCard(direction);
  renderReviewDots();
}

async function initReviews() {
  const section = document.getElementById('reviews');
  try {
    const res  = await fetch(`${API}/reviews?sort=top&limit=10`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const data = await res.json();

    reviewsCache = data.reviews || [];
    if (!reviewsCache.length) {
      section.style.display = 'none'; // no reviews yet — hide the section gracefully
      return;
    }

    document.getElementById('reviewsAvgStars').textContent = starString(data.averageRating);
    document.getElementById('reviewsAvgNum').textContent   = Number(data.averageRating).toFixed(1);
    document.getElementById('reviewsCount').textContent    =
      `Based on ${data.totalCount} Review${data.totalCount === 1 ? '' : 's'}`;

    reviewIndex = 0;
    renderReviewCard();
    renderReviewDots();
    observeReveal();

    /* Prev / Next arrows */
    document.getElementById('reviewPrevBtn').addEventListener('click', () => goToReview(reviewIndex - 1, 'prev'));
    document.getElementById('reviewNextBtn').addEventListener('click', () => goToReview(reviewIndex + 1, 'next'));

    /* Pagination dots (event delegation — dots are re-rendered each time) */
    document.getElementById('reviewDots').addEventListener('click', e => {
      const btn = e.target.closest('.review-dot');
      if (!btn) return;
      const target = Number(btn.dataset.index);
      if (target === reviewIndex) return;
      goToReview(target, target > reviewIndex ? 'next' : 'prev');
    });

    /* Swipe gestures (mobile) */
    const viewport = document.getElementById('reviewViewport');
    let touchStartX = 0;
    viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    viewport.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return; // ignore taps / tiny movements
      if (dx < 0) goToReview(reviewIndex + 1, 'next');
      else        goToReview(reviewIndex - 1, 'prev');
    }, { passive: true });

  } catch (err) {
    console.error('Reviews fetch error:', err);
    section.style.display = 'none';
  }
}

initReviews();

/* ════════════════════════════════
   HEADER SCROLL
════════════════════════════════ */
const headerEl = document.getElementById("siteHeader");
window.addEventListener("scroll", () => {
  headerEl.classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

/* ════════════════════════════════
   MOBILE MENU
════════════════════════════════ */
const mobileMenu = document.getElementById("mobileMenu");
document.getElementById("burgerBtn").addEventListener("click",      () => mobileMenu.classList.add("open"));
document.getElementById("mobileCloseBtn").addEventListener("click", () => mobileMenu.classList.remove("open"));
mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mobileMenu.classList.remove("open")));

/* ════════════════════════════════
   SCROLL REVEAL
════════════════════════════════ */
function observeReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal:not(.in-view)").forEach(el => io.observe(el));
}

/* ════════════════════════════════
   VISITOR TRACKING
   Anonymous unique-visitor counter for the Analytics dashboard.
   A random ID is generated once per browser and reused from
   localStorage on every future visit, so refreshing the page never
   increases the count — the backend only counts genuinely new IDs
   (see server/models/Visitor.js).
════════════════════════════════ */
function getOrCreateVisitorId() {
  const KEY = 'soltr_visitor_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem(KEY, id);
  }
  return id;
}

function registerVisit() {
  const visitorId = getOrCreateVisitorId();
  fetch(`${API}/visitors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId }),
  }).catch(() => {}); // non-critical — never let this block or break the storefront
}

/* ════════════════════════════════
   WISHLIST  (backend-synced via the anonymous visitorId above — no
   customer login exists in this project, only a single admin JWT
   login for the dashboard, so gating this behind that would break it
   for real shoppers. See server/models/Wishlist.js for the full
   rationale, and product.js / wishlist.js for the identical copy of
   this module used on those pages.)
════════════════════════════════ */
let wishlistCache = []; // array of productId strings currently wishlisted by this visitor

async function fetchWishlist() {
  const visitorId = getOrCreateVisitorId();
  try {
    const res = await fetch(`${API}/wishlist?visitorId=${encodeURIComponent(visitorId)}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const data = await res.json();
    wishlistCache = data.map(w => String(w.productId));
  } catch (err) {
    console.error('Wishlist fetch error:', err);
    wishlistCache = [];
  }
  updateWishlistBadge();
  refreshWishlistIcons();
}

function isWishlisted(productId) {
  return wishlistCache.includes(String(productId));
}

/**
 * Adds/removes a product from the backend wishlist and updates every
 * heart icon + the header badge on THIS page immediately — no reload.
 * @returns {{ ok: boolean, saved?: boolean }}
 */
async function toggleWishlist(productId) {
  const visitorId = getOrCreateVisitorId();
  const id = String(productId);
  const wasSaved = isWishlisted(id);

  try {
    if (wasSaved) {
      const res = await fetch(`${API}/wishlist/${id}?visitorId=${encodeURIComponent(visitorId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server ' + res.status);
      wishlistCache = wishlistCache.filter(pid => pid !== id);
    } else {
      const res = await fetch(`${API}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, productId: id }),
      });
      if (!res.ok) throw new Error('Server ' + res.status);
      wishlistCache.push(id);
    }
  } catch (err) {
    console.error('Wishlist toggle error:', err);
    return { ok: false };
  }

  updateWishlistBadge();
  refreshWishlistIcons();
  return { ok: true, saved: !wasSaved };
}

/** Syncs every heart icon currently rendered on this page with wishlistCache — instant, no reload. */
function refreshWishlistIcons() {
  document.querySelectorAll('[data-wishlist-id]').forEach(btn => {
    const saved = isWishlisted(btn.dataset.wishlistId);
    btn.classList.toggle('active', saved);
    btn.textContent = saved ? '♥' : '♡';
  });
}

function updateWishlistBadge() {
  const el = document.getElementById('wishlistCount');
  if (el) el.textContent = wishlistCache.length;
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
renderProducts("all");   // async — fetches from API
renderCart();
registerVisit();         // fire-and-forget — records this browser as a unique visitor
fetchWishlist();         // async — populates hearts + header badge
