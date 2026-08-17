/* ═══════════════════════════════════════════════════
   SOLTR — product.js
   Product Details page. Reuses the existing GET /api/products
   endpoint only — no new backend routes. Shares the same cart
   (persisted to localStorage under 'cart') as the rest of the site.
═══════════════════════════════════════════════════ */

const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;
function imgUrl(filename) { return `${IMG}/uploads/products/${filename}`; }

const SWATCH = { White: "#f1efe9", Black: "#1a1a1a", Burgundy: "#6e1423" };
const CART_KEY = 'cart'; // same key checkout.js reads

function fmt(n) { return "LE " + Number(n).toFixed(2); }

/** Escapes HTML-significant characters — prevents XSS from dynamic content */
const esc = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* ════════════════════════════════
   STATE
════════════════════════════════ */
let productsCache = [];   // full catalog — reused for related products + cart lookups
let currentProduct = null;
let selectedSize   = null;
let qty             = 1;

/* Cart persists across pages (index.html / product.html / checkout.html)
   via localStorage, so adding an item here and continuing to shop (or
   checking out) keeps the same bag. */
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }

function findProduct(id) {
  return productsCache.find(p => p._id === id) || null;
}

function stockBadgeHTML(stock, staticClass) {
  const s = Number(stock) || 0;
  if (s === 0) return `<span class="stock-badge stock-badge--out ${staticClass}">OUT OF STOCK</span>`;
  if (s <= 5)  return `<span class="stock-badge stock-badge--low ${staticClass}">LOW STOCK</span>`;
  return '';
}
function getSizeStock(product, size) {
  const inventory = product?.sizeInventory;
  if (inventory && Object.keys(inventory).length) return Number(inventory[size] ?? 0);
  return Number(product?.stock) || 0;
}
function getTotalStock(product, sizes = product?.sizes || []) {
  const inventory = product?.sizeInventory;
  if (inventory && Object.keys(inventory).length) return sizes.reduce((sum, size) => sum + getSizeStock(product, size), 0);
  return Number(product?.stock) || 0;
}
function stockLineText(stock) {
  const s = Number(stock) || 0;
  if (s === 0) return 'Out of stock';
  if (s <= 5)  return `Only ${s} left — order soon`;
  return 'In stock, ready to ship';
}

/* ════════════════════════════════
   URL PARAM
════════════════════════════════ */
function getProductIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

/* ════════════════════════════════
   LOAD + RENDER PRODUCT
════════════════════════════════ */
async function loadProduct() {
  const layout = document.getElementById('pdLayout');
  const id = getProductIdFromURL();

  if (!id) {
    renderNotFound(layout, "No product was specified.");
    return;
  }

  try {
    const res = await fetch(`${API}/products`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    productsCache = await res.json();
  } catch (err) {
    renderNotFound(layout, "Could not load products. Make sure the server is running.");
    return;
  }

  const product = findProduct(id);
  if (!product) {
    renderNotFound(layout, "This product doesn't exist or may have been removed.");
    return;
  }

  currentProduct = product;
  document.title = `SOLTR — ${product.name}`;
  renderProductDetail(product);
  renderRelated(product);
  renderCart(); // reflect any cart items already in localStorage
  loadReviews(product);
  bindReviewForm(product);
}

function renderNotFound(layout, message) {
  layout.innerHTML = `
    <div class="pd-not-found">
      <p>${esc(message)}</p>
      <a href="../index.html#shop" class="btn btn-solid">← Back to Shop</a>
    </div>`;
}

function renderProductDetail(p) {
  const layout   = document.getElementById('pdLayout');
  const images   = (p.images && p.images.length) ? p.images : [];
  const colors   = p.colors || [];
  const sizes    = (p.sizes && p.sizes.length) ? p.sizes : ["S", "M", "L", "XL"];
  const typeLabel = p.category === "Boxy" ? "Boxy Tee" : p.category;
  const stock    = getTotalStock(p, sizes);
  const outOfStock = stock === 0;
  const sku = 'SOLTR-' + p._id.slice(-6).toUpperCase();

  document.getElementById('pdBreadcrumbName').textContent = p.name;

  const mainImg = images[0] ? imgUrl(images[0]) : '';

  layout.innerHTML = `
    <div class="pd-layout">
      <div class="pd-gallery">
        <div class="pd-main-img">
          <img id="pdMainImg" src="${mainImg}" alt="${esc(p.name)}">
          ${stockBadgeHTML(stock, 'pd-badge-static')}
        </div>
        ${images.length > 1 ? `
        <div class="pd-thumbs" id="pdThumbs">
          ${images.map((img, i) => `
            <button class="pd-thumb${i === 0 ? ' active' : ''}" data-src="${imgUrl(img)}">
              <img src="${imgUrl(img)}" alt="">
            </button>`).join('')}
        </div>` : ''}
      </div>

      <div class="pd-info">
        <div class="pd-meta-top">${esc(p.collection || "SS'26")} · ${esc(typeLabel)}</div>
        <h1 class="pd-name">${esc(p.name)}</h1>
        <div class="pd-price">${fmt(p.price)}</div>
        <div class="pd-sku">SKU: ${sku}</div>

        <p class="pd-desc">${esc(p.description || 'A SOLTR staple — heavyweight cotton, boxy cut, zero filler.')}</p>

        ${colors.length ? `
        <div class="pd-block">
          <div class="pd-label">Color — <span id="pdSelectedColor">${esc(colors[0])}</span></div>
          <div class="pd-colors" id="pdColors">
            ${colors.map((c, i) => `
              <button class="pd-color-swatch${i === 0 ? ' active' : ''}" data-color="${esc(c)}"
                      style="background:${SWATCH[c] || '#888'}" title="${esc(c)}" aria-label="${esc(c)}"></button>`).join('')}
          </div>
        </div>` : ''}

        <div class="pd-block">
          <div class="pd-label">Size</div>
          <div class="sizes pd-sizes" id="pdSizes">
            ${sizes.map(s => { const sizeStock = getSizeStock(p, s); return `<button class="size-pill${sizeStock === 0 ? ' unavailable' : ''}" data-size="${esc(s)}" ${sizeStock === 0 ? 'disabled' : ''}>${esc(s)}${sizeStock === 0 ? ' — sold out' : ''}</button>`; }).join('')}
          </div>
        </div>

        <div class="pd-block">
          <div class="pd-label">Quantity</div>
          <div class="pd-qty">
            <button id="pdQtyMinus" aria-label="Decrease quantity" ${outOfStock ? 'disabled' : ''}>−</button>
            <span id="pdQtyVal">1</span>
            <button id="pdQtyPlus" aria-label="Increase quantity" ${outOfStock ? 'disabled' : ''}>+</button>
          </div>
        </div>

        <div class="pd-actions">
          <button class="add-btn pd-add-btn${outOfStock ? ' out-of-stock' : ''}" id="pdAddBtn" ${outOfStock ? 'disabled' : ''}>
            ${outOfStock ? 'OUT OF STOCK' : 'Select a size'}
          </button>
          <button class="pd-icon-btn" id="pdWishlistBtn" aria-label="Add to wishlist" title="Wishlist">♡</button>
          <button class="pd-icon-btn" id="pdShareBtn" aria-label="Share this product" title="Share">⇪</button>
        </div>

        <div class="pd-stock-line${outOfStock ? ' pd-stock-line--out' : ''}">${stockLineText(stock)}</div>
      </div>
    </div>`;

  qty = 1;
  selectedSize = null;
  bindProductDetailEvents(p);
}

/* ════════════════════════════════
   PRODUCT DETAIL INTERACTIONS
════════════════════════════════ */
function bindProductDetailEvents(p) {
  const sizes = (p.sizes && p.sizes.length) ? p.sizes : ['S', 'M', 'L', 'XL'];
  const outOfStock = getTotalStock(p, sizes) === 0;

  /* Thumbnail gallery */
  document.querySelectorAll('.pd-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      document.getElementById('pdMainImg').src = thumb.dataset.src;
    });
  });

  /* Color swatches — informational selector (matches the storefront's
     existing single-color-per-listing model; doesn't change cart data,
     same as the product grid cards elsewhere on the site) */
  document.querySelectorAll('.pd-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.pd-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const label = document.getElementById('pdSelectedColor');
      if (label) label.textContent = sw.dataset.color;
    });
  });

  /* Size selection */
  const addBtn = document.getElementById('pdAddBtn');
  document.querySelectorAll('#pdSizes .size-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#pdSizes .size-pill').forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      selectedSize = pill.dataset.size;
      const available = getSizeStock(p, selectedSize);
      qty = Math.min(qty, Math.max(1, available));
      document.getElementById('pdQtyVal').textContent = qty;
      if (available > 0) {
        addBtn.classList.add('ready');
        addBtn.textContent = `Add — ${fmt(p.price)}`;
        const stockLine = document.querySelector('.pd-stock-line');
        if (stockLine) stockLine.textContent = stockLineText(available);
      }

    });
  });

  /* Quantity stepper */
  const qtyVal = document.getElementById('pdQtyVal');
  document.getElementById('pdQtyMinus')?.addEventListener('click', () => {
    if (qty > 1) { qty -= 1; qtyVal.textContent = qty; }
  });
  document.getElementById('pdQtyPlus')?.addEventListener('click', () => {
    const limit = selectedSize ? getSizeStock(p, selectedSize) : 0;
    if (selectedSize && qty < limit) { qty += 1; qtyVal.textContent = qty; }
  });

  /* Add to cart */
  addBtn?.addEventListener('click', () => {
    if (outOfStock || !selectedSize || qty > getSizeStock(p, selectedSize)) return;
    addToCart(p._id, selectedSize, qty);
    addBtn.classList.add('added');
    addBtn.textContent = 'Added ✓';
    setTimeout(() => {
      addBtn.classList.remove('added');
      addBtn.textContent = `Add — ${fmt(p.price)}`;
    }, 1200);
  });

  /* Wishlist — backend-synced (anonymous visitorId), same as every other page */
  const wishBtn = document.getElementById('pdWishlistBtn');
  wishBtn.dataset.wishlistId = p._id;
  refreshWishlistIcons();
  wishBtn.addEventListener('click', async () => {
    wishBtn.disabled = true;
    const result = await toggleWishlist(p._id);
    wishBtn.disabled = false;
    if (!result.ok) { showToast('Could not update wishlist. Please try again.'); return; }
    showToast(result.saved ? 'Saved to wishlist' : 'Removed from wishlist');
  });

  /* Share — Web Share API where available, clipboard copy otherwise. Never a dead button. */
  document.getElementById('pdShareBtn')?.addEventListener('click', () => shareProduct(p));
}

/* ════════════════════════════════
   VISITOR ID  (same anonymous, persistent-per-browser ID used for
   visit tracking — see script.js's getOrCreateVisitorId(). Duplicated
   here rather than shared via import, matching how this project
   already duplicates small utilities per-page (fmt, esc, SWATCH, etc.)
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

/* ════════════════════════════════
   WISHLIST  (backend-synced via the anonymous visitorId — no customer
   login exists in this project, only a single admin JWT login for the
   dashboard, so gating this behind that would break it for real
   shoppers. See server/models/Wishlist.js for the full rationale.)
════════════════════════════════ */
let wishlistCache = []; // array of productId strings currently wishlisted by this visitor

/** Fetch the current wishlist from the backend and refresh every heart icon + badge on this page. */
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

/** Syncs every heart icon currently rendered on this page (product cards,
    detail page icon, etc.) with wishlistCache — instant, no reload. */
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
   SHARE  — Web Share API where supported, clipboard copy otherwise.
   Three-tier fallback so the button is never a dead end.
════════════════════════════════ */
async function shareProduct(p) {
  const shareData = { title: p.name, text: `Check out ${p.name} on SOLTR`, url: window.location.href };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled the native share sheet — no error toast
      /* Some other share failure — fall through to clipboard copy */
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(window.location.href);
    } else {
      /* Very old browsers / non-HTTPS contexts without Clipboard API */
      const textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('Product link copied!');
  } catch (err) {
    console.error('Share/copy failed:', err);
    showToast('Could not copy the link — please copy it from the address bar.');
  }
}

/* ════════════════════════════════
   TOAST  (small feedback for wishlist/share)
════════════════════════════════ */
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('pdToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ════════════════════════════════
   YOU MAY ALSO LIKE
════════════════════════════════ */
function renderRelated(p) {
  const section = document.getElementById('relatedSection');
  const grid    = document.getElementById('relatedGrid');

  const related = productsCache
    .filter(x => x._id !== p._id && x.category === p.category)
    .slice(0, 4);

  if (!related.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  grid.innerHTML = related.map(r => {
    const img1 = r.images[0] ? imgUrl(r.images[0]) : '';
    const img2 = r.images[1] ? imgUrl(r.images[1]) : img1;
    const color = r.colors[0] || '';
    const typeLabel = r.category === "Boxy" ? "Boxy Tee" : r.category;
    const swatchBg = SWATCH[color] || '#888';
    const stock = Number(r.stock) || 0;

    return `
      <article class="card reveal" data-id="${r._id}">
        <div class="card-media-frame">
          <a href="product.html?id=${r._id}" class="card-media-link">
            <div class="card-media">
              <img class="img-a" src="${img1}" alt="${esc(r.name)}" loading="lazy">
              <img class="img-b" src="${img2}" alt="" loading="lazy">
              <span class="hangtag">${fmt(r.price)}</span>
              <span class="swatch-dot" style="background:${swatchBg}" title="${esc(color)}"></span>
              ${stockBadgeHTML(stock, '')}
            </div>
          </a>
          <button class="wishlist-heart" data-wishlist-id="${r._id}" aria-label="Add to wishlist">♡</button>
        </div>
        <div class="card-info">
          <a href="product.html?id=${r._id}" class="pd-related-name-link"><h3>${esc(r.name)}</h3></a>
          <div class="meta">${esc(color)} · ${esc(typeLabel)}</div>
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('#relatedGrid .wishlist-heart').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      const result = await toggleWishlist(btn.dataset.wishlistId);
      btn.disabled = false;
      if (!result.ok) showToast('Could not update wishlist. Please try again.');
    });
  });

  refreshWishlistIcons();
  observeReveal();
}

/* ════════════════════════════════
   PRODUCT REVIEWS  (live — GET/POST /api/reviews?productId=...)
════════════════════════════════ */
function starString(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

/** "2 days ago" style relative date — same logic as the Home page slider */
function relativeDate(dateStr) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [label, secs] of units) {
    const n = Math.floor(diffSec / secs);
    if (n >= 1) return `${n} ${label}${n === 1 ? '' : 's'} ago`;
  }
  return 'Just now';
}

async function loadReviews(product) {
  const section = document.getElementById('pdReviewsSection');
  try {
    const res  = await fetch(`${API}/reviews?productId=${product._id}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const data = await res.json();
    renderReviewsSection(data);
    section.style.display = '';
  } catch (err) {
    console.error('Reviews fetch error:', err);
    section.style.display = 'none';
  }
}

function renderReviewsSection(data) {
  const { reviews, averageRating, totalCount, distribution } = data;

  document.getElementById('pdReviewsStars').textContent = starString(averageRating);
  document.getElementById('pdReviewsAvg').textContent   = Number(averageRating).toFixed(1);
  document.getElementById('pdReviewsCount').textContent = `Based on ${totalCount} Review${totalCount === 1 ? '' : 's'}`;

  /* Rating distribution bars, 5★ → 1★ */
  const barsEl = document.getElementById('pdRatingBars');
  barsEl.innerHTML = [5, 4, 3, 2, 1].map(star => {
    const count = (distribution && distribution[star]) || 0;
    const pct   = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
    return `
      <div class="pd-rating-bar-row">
        <span class="pd-rating-bar-label">${star}★</span>
        <span class="pd-rating-bar-track"><span class="pd-rating-bar-fill" style="width:${pct}%"></span></span>
        <span class="pd-rating-bar-count">${count}</span>
      </div>`;
  }).join('');

  /* Review list */
  const listEl = document.getElementById('pdReviewList');
  if (!reviews.length) {
    listEl.innerHTML = `<div class="pd-reviews-empty">No reviews yet — be the first to share your thoughts.</div>`;
  } else {
    listEl.innerHTML = reviews.map(r => `
      <div class="pd-review-card">
        <div class="stars">${starString(r.rating)}</div>
        <p class="pd-review-card-text">"${esc(r.text)}"</p>
        <div class="pd-review-card-meta">
          <span class="pd-review-card-name">${esc(r.customerName)}</span>
          ${r.verified ? '<span class="pd-review-card-verified">✓ Verified Purchase</span>' : ''}
          <span>${relativeDate(r.createdAt)}</span>
        </div>
      </div>`).join('');
  }
}

/* ── Add Review form ── */
let selectedReviewRating = 0;

function bindReviewForm(product) {
  const starButtons = document.querySelectorAll('#prStarInput .pd-star-choice');
  const ratingInput = document.getElementById('prRating');

  const paintStars = (value) => {
    starButtons.forEach(btn => btn.classList.toggle('filled', Number(btn.dataset.value) <= value));
  };

  starButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedReviewRating = Number(btn.dataset.value);
      ratingInput.value = selectedReviewRating;
      paintStars(selectedReviewRating);
    });
    btn.addEventListener('mouseenter', () => paintStars(Number(btn.dataset.value)));
  });
  document.getElementById('prStarInput').addEventListener('mouseleave', () => paintStars(selectedReviewRating));

  document.getElementById('pdReviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const msgEl   = document.getElementById('prFormMsg');
    const nameEl  = document.getElementById('prName');
    const textEl  = document.getElementById('prComment');
    const submitBtn = document.getElementById('prSubmitBtn');

    const customerName = nameEl.value.trim();
    const text          = textEl.value.trim();
    const rating        = selectedReviewRating;

    /* Client-side validation (instant feedback — the backend validates again regardless) */
    if (!customerName) { msgEl.textContent = 'Please enter your name.'; msgEl.className = 'pd-review-form-msg error'; return; }
    if (!rating)         { msgEl.textContent = 'Please select a star rating.'; msgEl.className = 'pd-review-form-msg error'; return; }
    if (!text)           { msgEl.textContent = 'Please write a short review.'; msgEl.className = 'pd-review-form-msg error'; return; }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    try {
      const res  = await fetch(`${API}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product._id, customerName, rating, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Server error');

      msgEl.textContent = 'Thanks — your review has been posted!';
      msgEl.className = 'pd-review-form-msg success';

      /* Reset the form */
      nameEl.value = '';
      textEl.value = '';
      selectedReviewRating = 0;
      ratingInput.value = 0;
      paintStars(0);

      /* Refresh average, count, distribution, and the list — no page reload */
      await loadReviews(product);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'pd-review-form-msg error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

/* ════════════════════════════════
   CART  (shared with the rest of the site via localStorage)
════════════════════════════════ */
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(productId, size, quantity = 1) {
  const product = findProduct(productId);
  const available = product ? getSizeStock(product, size) : 0;
  if (!product || available <= 0) return;
  const existing = cart.find(i => i.productId === productId && i.size === size);
  const nextQty = (existing?.qty || 0) + quantity;
  if (nextQty > available) return;
  if (existing) existing.qty = nextQty; else cart.push({ productId, size, qty: quantity });
  renderCart();
  openCart();
}
function changeQty(productId, size, delta) {
  const item = cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;
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
      const p = findProduct(item.productId);
      if (!p) return '';
      const img = p.images[0] ? imgUrl(p.images[0]) : '';
      const color = p.colors[0] || '';
      return `
      <div class="cart-item">
        <img src="${img}" alt="${esc(p.name)}">
        <div class="ci-info">
          <h5>${esc(p.name)} — ${esc(color)}</h5>
          <div class="meta">Size ${esc(item.size)}</div>
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

  persistCart();
}

function openCart()  { document.getElementById("cartDrawer").classList.add("open");    document.getElementById("overlay").classList.add("open"); }
function closeCart() { document.getElementById("cartDrawer").classList.remove("open"); document.getElementById("overlay").classList.remove("open"); }
document.getElementById("cartOpenBtn").addEventListener("click", openCart);
document.getElementById("cartCloseBtn").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);

/* ════════════════════════════════
   HEADER SCROLL + MOBILE MENU  (same behavior as index.html)
════════════════════════════════ */
const headerEl = document.getElementById("siteHeader");
window.addEventListener("scroll", () => {
  headerEl.classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

const mobileMenu = document.getElementById("mobileMenu");
document.getElementById("burgerBtn").addEventListener("click",      () => mobileMenu.classList.add("open"));
document.getElementById("mobileCloseBtn").addEventListener("click", () => mobileMenu.classList.remove("open"));
mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mobileMenu.classList.remove("open")));

/* ════════════════════════════════
   REVEAL-ON-SCROLL  (same pattern as script.js)
════════════════════════════════ */
function observeReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal:not(.in-view)").forEach(el => io.observe(el));
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
loadProduct();
fetchWishlist();
