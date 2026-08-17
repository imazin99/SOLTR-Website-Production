/* ═══════════════════════════════════════════════════
   SOLTR — policy.js
   Reusable policy page. Driven entirely by ?slug= in the URL (same
   query-param pattern as product.html?id=), so every future footer
   policy page (Shipping, Privacy, Terms, Contact) reuses this exact
   file + policy.html shell — just a new slug and a new footer link,
   no new page needed. Shares the same cart/visitorId/wishlist-badge
   utilities copy-pasted across every other page (see PROJECT_HANDOFF.md
   §2 — this duplication is intentional, not an oversight).
════════════════════════════════════════════════════ */

const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;
function imgUrl(filename) { return window.productImageUrl(filename); }

const CART_KEY = 'cart'; // same key checkout.js / script.js / product.js / wishlist.js read

function fmt(n) { return "LE " + Number(n).toFixed(2); }

/** Escapes HTML-significant characters — prevents XSS from dynamic content */
const esc = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* ════════════════════════════════
   VISITOR ID (same anonymous, persistent-per-browser ID used on
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
   WISHLIST BADGE (count only — this page has no product cards, so
   it just keeps the header icon's number accurate)
════════════════════════════════ */
async function updateWishlistBadge() {
  const visitorId = getOrCreateVisitorId();
  try {
    const res = await fetch(`${API}/wishlist?visitorId=${encodeURIComponent(visitorId)}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const data = await res.json();
    const el = document.getElementById('wishlistCount');
    if (el) el.textContent = data.length;
  } catch (err) {
    console.error('Wishlist fetch error:', err);
  }
}

/* ════════════════════════════════
   PRODUCT CACHE (only needed so cart line items can render — the
   cart is global/shared via localStorage across every page)
════════════════════════════════ */
let productsCache = [];
function findProduct(id) {
  return productsCache.find(p => p._id === id) || null;
}

let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
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
        <img src="${esc(img)}" alt="${esc(p.name)}" onerror="handleProductImageError(this)">
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
   HEADER SCROLL + MOBILE MENU (same behavior as every other page)
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
   POLICY CONTENT
   Renders each non-empty line of `content` as its own paragraph.
   A leading "Label:" segment (text up to the first colon, if short
   enough to plausibly be a label rather than a sentence) is bolded —
   matches the Return & Refund content's "Policy Duration: ...",
   "Item Condition: ..." structure without needing any markup stored
   in the database.
════════════════════════════════ */
function renderPolicyBody(content) {
  const paragraphs = content.split('\n').map(l => l.trim()).filter(Boolean);

  return paragraphs.map(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex <= 40) {
      const label = line.slice(0, colonIndex);
      const rest  = line.slice(colonIndex + 1);
      return `<p><strong>${esc(label)}:</strong>${esc(rest)}</p>`;
    }
    return `<p>${esc(line)}</p>`;
  }).join('');
}

async function loadPolicy() {
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('slug') || '').trim();

  const loadingEl  = document.getElementById('policyLoading');
  const notFoundEl = document.getElementById('policyNotFound');
  const bodyEl     = document.getElementById('policyBody');

  if (!slug) {
    loadingEl.style.display = 'none';
    notFoundEl.style.display = '';
    return;
  }

  try {
    const res = await fetch(`${API}/policies/${encodeURIComponent(slug)}`);
    if (res.status === 404) {
      loadingEl.style.display = 'none';
      notFoundEl.style.display = '';
      return;
    }
    if (!res.ok) throw new Error('Server ' + res.status);

    const policy = await res.json();

    document.title = `SOLTR — ${policy.title}`;
    document.getElementById('policyTitle').textContent = policy.title;
    document.getElementById('policyBreadcrumbName').textContent = policy.title;
    bodyEl.innerHTML = renderPolicyBody(policy.content);

    loadingEl.style.display = 'none';
    bodyEl.style.display = '';
  } catch (err) {
    console.error('Policy fetch error:', err);
    loadingEl.style.display = 'none';
    notFoundEl.textContent = 'Something went wrong loading this page. Please try again later.';
    notFoundEl.style.display = '';
  }
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
  renderCart(); // re-render now that productsCache is populated, so existing cart items show correctly

  updateWishlistBadge();
  loadPolicy();
}

init();
