/* ═══════════════════════════════════════════════════
   SOLTR — wishlist.js
   Dedicated Wishlist page. Reuses the existing GET /api/products
   endpoint (no duplicate product-fetching endpoint) plus the new
   Wishlist API. Shares the same cart (localStorage 'cart') and the
   same anonymous visitorId as every other page.
═══════════════════════════════════════════════════ */

const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;
function imgUrl(filename) { return `${IMG}/uploads/products/${filename}`; }

const SWATCH = { White: "#f1efe9", Black: "#1a1a1a", Burgundy: "#6e1423" };
const CART_KEY = 'cart'; // same key checkout.js / script.js / product.js read

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
let productsCache = []; // full catalog, fetched once — reused for cart lookups + wishlist display

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

/* ════════════════════════════════
   VISITOR ID  (same anonymous, persistent-per-browser ID used on
   every other page — see script.js's getOrCreateVisitorId())
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
   WISHLIST  (backend-synced via the anonymous visitorId — see
   server/models/Wishlist.js for why this isn't gated behind the
   admin-only JWT login)
════════════════════════════════ */
let wishlistCache = [];

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
   TOAST
════════════════════════════════ */
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('wishlistToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ════════════════════════════════
   RENDER WISHLIST GRID
   Cross-references the wishlisted product IDs against the full
   product catalog already fetched from GET /api/products — no
   separate "get wishlisted products" endpoint needed.
════════════════════════════════ */
function renderWishlistPage() {
  const grid    = document.getElementById('wishlistGrid');
  const emptyEl = document.getElementById('wishlistEmpty');
  const loadEl  = document.getElementById('wishlistLoading');

  loadEl.style.display = 'none';

  const items = wishlistCache
    .map(id => findProduct(id))
    .filter(Boolean); // a wishlisted product that was since deleted from the catalog is silently skipped

  if (!items.length) {
    grid.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  grid.innerHTML = items.map(p => {
    const img1 = p.images[0] ? imgUrl(p.images[0]) : '';
    const img2 = p.images[1] ? imgUrl(p.images[1]) : img1;
    const color = p.colors[0] || '';
    const typeLabel = p.category === "Boxy" ? "Boxy Tee" : p.category;
    const swatchBg = SWATCH[color] || '#888';
    const stock = Number(p.stock) || 0;
    const outOfStock = stock === 0;

    return `
      <article class="card reveal" data-id="${p._id}">
        <div class="card-media-frame">
          <a href="../products/product.html?id=${p._id}" class="card-media-link">
            <div class="card-media">
              <img class="img-a" src="${img1}" alt="${esc(p.name)}" loading="lazy">
              <img class="img-b" src="${img2}" alt="" loading="lazy">
              <span class="hangtag">${fmt(p.price)}</span>
              <span class="swatch-dot" style="background:${swatchBg}" title="${esc(color)}"></span>
              ${stockBadgeHTML(stock, '')}
            </div>
          </a>
          <button class="wishlist-heart active" data-wishlist-id="${p._id}" aria-label="Remove from wishlist" title="Remove from wishlist">♥</button>
        </div>
        <div class="card-info">
          <a href="../products/product.html?id=${p._id}" class="pd-related-name-link"><h3>${esc(p.name)}</h3></a>
          <div class="meta">${esc(color)} · ${esc(typeLabel)}</div>
          <button class="add-btn${outOfStock ? ' out-of-stock' : ''}" data-product="${p._id}" ${outOfStock ? 'disabled' : ''}>
            ${outOfStock ? 'OUT OF STOCK' : 'Add to Cart'}
          </button>
        </div>
      </article>`;
  }).join('');

  /* Remove from wishlist — re-render the grid so the card disappears immediately */
  grid.querySelectorAll('.wishlist-heart').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      const result = await toggleWishlist(btn.dataset.wishlistId);
      if (!result.ok) {
        btn.disabled = false;
        showToast('Could not update wishlist. Please try again.');
        return;
      }
      showToast('Removed from wishlist');
      renderWishlistPage(); // re-render so the removed card disappears without a page reload
    });
  });

  /* Add to Cart directly from the wishlist — quick-add using the product's
     first available size, since there's no per-card size picker here. */
  grid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.product;
      const p   = findProduct(pid);
      if (!p) return;
      const size = (p.sizes && p.sizes[0]) || 'M';
      addToCart(pid, size);
      showToast(`Added to cart — Size ${size}`);
    });
  });

  refreshWishlistIcons();
  observeReveal();
}

/* ════════════════════════════════
   CART  (shared with the rest of the site via localStorage)
════════════════════════════════ */
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(productId, size, quantity = 1) {
  const product = findProduct(productId);
  if (product && (Number(product.stock) || 0) === 0) return; // out of stock — never add
  const existing = cart.find(i => i.productId === productId && i.size === size);
  if (existing) { existing.qty += quantity; } else { cart.push({ productId, size, qty: quantity }); }
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
   HEADER SCROLL + MOBILE MENU  (same behavior as every other page)
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
   REVEAL-ON-SCROLL  (same pattern as script.js / product.js)
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
async function init() {
  renderCart();

  try {
    const res = await fetch(`${API}/products`);
    if (!res.ok) throw new Error('Server ' + res.status);
    productsCache = await res.json();
  } catch (err) {
    console.error('Products fetch error:', err);
    productsCache = [];
  }

  await fetchWishlist();
  renderWishlistPage();
}

init();
