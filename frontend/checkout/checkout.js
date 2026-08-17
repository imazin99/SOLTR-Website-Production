/**
 * SOLTR — checkout.js
 *
 * Responsibilities (this phase):
 *   1. Load cart + product cache from localStorage (written by script.js)
 *   2. Render order summary (items, qty controls, remove, totals)
 *   3. Keep totals live as quantities change
 *   4. Validate the customer form on submit
 *
 * NOT in this file:
 *   – POST /api/orders  (added in the next phase)
 *   – Payment gateway   (future phase)
 */

'use strict';

/* ═══════════════════════════════════════════════════
   CONFIG
   Single source of truth — change values here only.
═══════════════════════════════════════════════════ */
const CO = {
  /** Flat shipping fee in LE.  0 = free. */
  SHIPPING_FEE : 0,

  /** API base — used by the submit phase; defined here so it's ready. */
  API          : window.SOLTR_CONFIG.API,

  /** Image server base */
  IMG          : window.SOLTR_CONFIG.IMG,

  /** localStorage key — must match the key written by script.js */
  CART_KEY     : 'cart',

  /** Fallback when a product image is missing */
  FALLBACK_IMG : 'assests/images/product/logo.png',
};


/* ═══════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════ */

/** Array of { productId, size, qty } — mirrors script.js cart shape */
let _cart = [];

/** Cached product objects fetched from the API in script.js */
let _products = [];

/** Currently applied coupon: { code, discountType, discountValue, discountAmount } | null */
let _coupon = null;


/* ═══════════════════════════════════════════════════
   PURE UTILITIES
   No DOM access — easy to test in isolation.
═══════════════════════════════════════════════════ */

/**
 * Format a number as Egyptian Pounds.
 * @param {number} n
 * @returns {string}  "LE 1,300.00"
 */
const fmt = n =>
  'LE ' + Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Build the full image URL from a stored filename.
 * @param {string|undefined} filename  e.g. "1719000000000-abc.jpg"
 * @returns {string}
 */
const imgUrl = filename =>
  filename
    ? `${CO.IMG}/uploads/products/${filename}`
    : CO.FALLBACK_IMG;

/**
 * Shorthand for document.getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
const $el = id => document.getElementById(id);

/**
 * Escape a string for safe injection into an HTML attribute.
 * Prevents XSS from product names stored in localStorage.
 * @param {string} str
 * @returns {string}
 */
const esc = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');


/* ═══════════════════════════════════════════════════
   STATE HELPERS
═══════════════════════════════════════════════════ */

/**
 * Find a product object by MongoDB _id.
 * Returns null if not found (e.g. product was deleted after cart was saved).
 * @param {string} id
 * @returns {object|null}
 */
const findProduct = id => _products.find(p => p._id === id) ?? null;

/**
 * Write the current cart back to localStorage so it survives
 * a page refresh or browser back-navigation.
 */
const persistCart = () =>
  localStorage.setItem(CO.CART_KEY, JSON.stringify(_cart));


/* ═══════════════════════════════════════════════════
   LOAD STATE
═══════════════════════════════════════════════════ */

/**
 * Read the cart from localStorage (written by script.js) and fetch
 * the current product catalog from the API — mirrors how script.js
 * builds `productsCache`. Products are never cached in localStorage.
 */
async function loadState() {
  try {
    const rawCart = localStorage.getItem(CO.CART_KEY);
    _cart = rawCart ? JSON.parse(rawCart) : [];
  } catch (e) {
    /* Corrupt localStorage — start with empty cart */
    console.warn('[checkout] Failed to parse cart from localStorage:', e.message);
    _cart = [];
  }

  try {
    const res = await fetch(`${CO.API}/products`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    _products = await res.json();
  } catch (e) {
    console.warn('[checkout] Failed to fetch products:', e.message);
    _products = [];
  }

  /* Remove cart entries whose product no longer exists in the catalog */
  _cart = _cart.filter(item => findProduct(item.productId) !== null);
}


/* ═══════════════════════════════════════════════════
   RENDERING — ORDER SUMMARY
═══════════════════════════════════════════════════ */

/**
 * Full re-render of items + totals + submit button state.
 * Call this after every cart mutation.
 */
function renderSummary() {
  renderItems();
  renderTotals();
  syncSubmitButton();
}

/* ── Items list ──────────────────────────────────────────── */

/** Render all product rows inside #co-items */
function renderItems() {
  const container = $el('co-items');
  if (!container) return;

  if (_cart.length === 0) {
    container.innerHTML = buildEmptyCartHTML();
    return;
  }

  container.innerHTML = _cart.map(buildItemRowHTML).join('');
  bindItemControls();
}

/**
 * Build the HTML string for a single cart item row.
 * @param {{ productId: string, size: string, qty: number }} item
 * @returns {string}
 */
function buildItemRowHTML(item) {
  const p = findProduct(item.productId);
  if (!p) return ''; /* product disappeared — skip */

  const src       = imgUrl(p.images?.[0] ?? '');
  const color     = p.colors?.[0] ?? '';
  const lineTotal = p.price * item.qty;
  const pid       = esc(p._id);
  const size      = esc(item.size);
  const name      = esc(p.name);

  return `
    <div class="co-item" data-pid="${pid}" data-size="${size}">

      <img
        class="co-item-img"
        src="${esc(src)}"
        alt="${name}"
        loading="lazy"
        onerror="this.src='${CO.FALLBACK_IMG}'">

      <div class="co-item-info">
        <div class="co-item-name">${name}</div>
        <div class="co-item-meta">
          ${color ? `<span>${esc(color)}</span>` : ''}
          <span>Size ${size}</span>
        </div>
        <button
          class="co-item-remove"
          data-pid="${pid}"
          data-size="${size}"
          aria-label="Remove ${name} from cart"
          type="button">Remove</button>
      </div>

      <div class="co-item-right">
        <div class="co-qty-row"
             role="group"
             aria-label="Quantity for ${name}">
          <button
            class="co-qty-btn"
            data-pid="${pid}"
            data-size="${size}"
            data-delta="-1"
            type="button"
            aria-label="Decrease quantity">−</button>

          <span class="co-qty-num" aria-live="polite">${item.qty}</span>

          <button
            class="co-qty-btn"
            data-pid="${pid}"
            data-size="${size}"
            data-delta="1"
            type="button"
            aria-label="Increase quantity">+</button>
        </div>
        <div class="co-item-price">${fmt(lineTotal)}</div>
      </div>

    </div>`;
}

/** HTML for the empty-cart state inside the summary box */
function buildEmptyCartHTML() {
  return `
    <div class="co-empty">
      <p>Your cart is empty.</p>
      <a href="../index.html" class="btn btn-solid">← Continue Shopping</a>
    </div>`;
}

/* ── Event binding — must re-run after every render ─────── */

/**
 * Attach click handlers to qty +/- buttons and remove buttons.
 * Called after renderItems() replaces the DOM.
 */
function bindItemControls() {
  /* Quantity buttons */
  document.querySelectorAll('.co-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { pid, size, delta } = btn.dataset;
      changeQty(pid, size, parseInt(delta, 10));
    });
  });

  /* Remove buttons */
  document.querySelectorAll('.co-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeItem(btn.dataset.pid, btn.dataset.size);
    });
  });
}


/* ═══════════════════════════════════════════════════
   CART MUTATIONS
═══════════════════════════════════════════════════ */

/**
 * Increment or decrement a line item's quantity.
 * Automatically removes the item when qty reaches 0.
 * @param {string} productId
 * @param {string} size
 * @param {number} delta  +1 or -1
 */
function changeQty(productId, size, delta) {
  const item = _cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;

  item.qty += delta;

  if (item.qty <= 0) {
    _cart = _cart.filter(i => !(i.productId === productId && i.size === size));
  }

  persistCart();
  renderSummary();
}

/**
 * Remove a line item completely regardless of quantity.
 * @param {string} productId
 * @param {string} size
 */
function removeItem(productId, size) {
  _cart = _cart.filter(i => !(i.productId === productId && i.size === size));
  persistCart();
  renderSummary();
}


/* ═══════════════════════════════════════════════════
   TOTALS
═══════════════════════════════════════════════════ */

/**
 * Compute cart subtotal from current _cart + _products.
 * @returns {number}
 */
function calcSubtotal() {
  return _cart.reduce((sum, item) => {
    const p = findProduct(item.productId);
    return p ? sum + p.price * item.qty : sum;
  }, 0);
}

/**
 * Current discount amount from the applied coupon, if any.
 * Never exceeds the subtotal — prevents a negative total.
 * @returns {number}
 */
function calcDiscount() {
  if (!_coupon) return 0;
  return Math.min(_coupon.discountAmount, calcSubtotal());
}

/**
 * Write computed values into the total DOM elements, including the
 * discount row (shown only when a coupon is applied).
 * Safe to call even if elements are absent.
 */
function renderTotals() {
  const subtotal = calcSubtotal();
  const discount = calcDiscount();
  const total    = Math.max(0, subtotal - discount) + CO.SHIPPING_FEE;

  const subtotalEl    = $el('co-subtotal');
  const shippingEl    = $el('co-shipping');
  const totalEl       = $el('co-total');
  const discountRowEl = $el('co-discount-row');
  const discountEl    = $el('co-discount');
  const discountCodeEl = $el('co-coupon-applied-code');

  if (subtotalEl) subtotalEl.textContent = fmt(subtotal);

  if (shippingEl) {
    shippingEl.innerHTML = CO.SHIPPING_FEE > 0
      ? fmt(CO.SHIPPING_FEE)
      : '<span class="co-free-shipping">Free 🇪🇬</span>';
  }

  if (discountRowEl) {
    discountRowEl.style.display = _coupon ? '' : 'none';
  }
  if (discountEl)     discountEl.textContent     = _coupon ? '-' + fmt(discount) : '—';
  if (discountCodeEl) discountCodeEl.textContent  = _coupon ? `(${esc(_coupon.code)})` : '';

  if (totalEl) totalEl.textContent = fmt(total);
}


/* ═══════════════════════════════════════════════════
   COUPON
═══════════════════════════════════════════════════ */

/**
 * Show a message under the coupon input.
 * @param {string} msg
 * @param {'success'|'error'} type
 */
function showCouponMsg(msg, type = 'error') {
  const el = $el('co-coupon-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'co-coupon-msg' + (type === 'success' ? ' co-coupon-msg--success' : ' co-coupon-msg--error');
}

/**
 * Validate the entered coupon code against the API and, if valid,
 * store it in _coupon and re-render totals.
 */
async function applyCoupon() {
  const input = $el('co-coupon-input');
  const btn   = $el('co-coupon-apply-btn');
  const code  = input?.value.trim();

  if (!code) {
    showCouponMsg('Enter a coupon code.');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    const res  = await fetch(`${CO.API}/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal: calcSubtotal() }),
    });
    const data = await res.json();

    if (!res.ok || !data.valid) {
      _coupon = null;
      showCouponMsg(data.message || 'Invalid coupon code.');
      renderTotals();
      return;
    }

    _coupon = data.coupon;
    showCouponMsg(`Coupon "${_coupon.code}" applied.`, 'success');
    renderTotals();
  } catch (e) {
    _coupon = null;
    showCouponMsg('Could not validate coupon. Please try again.');
    renderTotals();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  }
}

/** Remove the currently applied coupon. */
function removeCoupon() {
  _coupon = null;
  const input = $el('co-coupon-input');
  if (input) input.value = '';
  showCouponMsg('');
  renderTotals();
}

/** Wire up the coupon apply button + Enter key inside the input. */
function bindCouponControls() {
  const btn   = $el('co-coupon-apply-btn');
  const input = $el('co-coupon-input');

  btn?.addEventListener('click', applyCoupon);
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
  });
  /* Clear stale success/error message + applied coupon when the user edits the code */
  input?.addEventListener('input', () => {
    if (_coupon) removeCoupon();
    else showCouponMsg('');
  });
}


/* ═══════════════════════════════════════════════════
   SUBMIT BUTTON STATE
═══════════════════════════════════════════════════ */

/**
 * Keep the Place Order button in sync with cart state.
 * An empty cart disables the button before the user even tries.
 */
function syncSubmitButton() {
  const btn = $el('co-submit-btn');
  if (!btn) return;

  if (_cart.length === 0) {
    btn.disabled    = true;
    btn.textContent = 'Cart is Empty';
  } else {
    btn.disabled    = false;
    btn.textContent = 'Place Order →';
  }
}


/* ═══════════════════════════════════════════════════
   VALIDATION
═══════════════════════════════════════════════════ */

/**
 * Defines every required field.
 * id      — matches the HTML element id AND the error span id (id + '-error')
 * label   — used in the error message text
 * pattern — optional regex the value must satisfy (beyond non-empty)
 * patternMsg — error message when pattern fails
 */
const REQUIRED_FIELDS = [
  { id: 'co-name',    label: 'Full name' },
  { id: 'co-phone',   label: 'Phone number',
    pattern: /^[\d\s+\-()]{7,}$/,
    patternMsg: 'Enter a valid phone number (digits only).' },
  { id: 'co-city',    label: 'City' },
  { id: 'co-address', label: 'Delivery address' },
];

/**
 * Remove all previous error indicators.
 * Called at the start of every validate() call.
 */
function clearErrors() {
  REQUIRED_FIELDS.forEach(({ id }) => {
    const input = $el(id);
    const err   = $el(`${id}-error`);
    if (input) input.classList.remove('co-input-error');
    if (err)   err.textContent = '';
  });
  hideBanner();
}

/**
 * Mark a single field as invalid and show its message.
 * @param {string} id    Field element id
 * @param {string} msg   Message to show below the field
 */
function setFieldError(id, msg) {
  const input = $el(id);
  const err   = $el(`${id}-error`);
  if (input) input.classList.add('co-input-error');
  if (err)   err.textContent = msg;
}

/**
 * Validate the complete checkout form.
 *
 * Rules:
 *   1. Cart must not be empty.
 *   2. Every REQUIRED_FIELDS entry must have a non-empty value.
 *   3. Fields with a pattern must match it.
 *
 * Side-effects:
 *   – Marks invalid fields visually.
 *   – Shows / hides the global error banner.
 *   – Focuses + scrolls to the first invalid field.
 *
 * @returns {boolean}  true = form is valid
 */
function validate() {
  clearErrors();

  let isValid    = true;
  let firstError = null;

  /* ── Rule 1: cart must not be empty ── */
  if (_cart.length === 0) {
    showBanner('Your cart is empty. Please add items before placing an order.');
    return false;
  }

  /* ── Rule 2 & 3: required fields ── */
  REQUIRED_FIELDS.forEach(({ id, label, pattern, patternMsg }) => {
    const input = $el(id);
    if (!input) return;

    const value = input.value.trim();

    if (!value) {
      /* Empty */
      setFieldError(id, `${label} is required.`);
      isValid = false;
      firstError = firstError ?? input;
      return;
    }

    if (pattern && !pattern.test(value)) {
      /* Format error */
      setFieldError(id, patternMsg);
      isValid = false;
      firstError = firstError ?? input;
    }
  });

  /* ── Summarise errors in the banner ── */
  if (!isValid) {
    showBanner('Please fix the highlighted fields before placing your order.');
    firstError?.focus();
    firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return isValid;
}


/* ═══════════════════════════════════════════════════
   BANNER
═══════════════════════════════════════════════════ */

/**
 * Show the global error banner with a message.
 * Also scrolls the banner into view.
 * @param {string} msg
 */
function showBanner(msg) {
  const banner = $el('co-error-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.removeAttribute('hidden');
  banner.style.display = 'block';
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Hide the global error banner */
function hideBanner() {
  const banner = $el('co-error-banner');
  if (!banner) return;
  banner.setAttribute('hidden', '');
  banner.style.display = 'none';
}


/* ═══════════════════════════════════════════════════
   INPUT LISTENERS
   Clear per-field error as soon as user corrects it.
═══════════════════════════════════════════════════ */

function bindInputListeners() {
  REQUIRED_FIELDS.forEach(({ id }) => {
    const input = $el(id);
    if (!input) return;

    input.addEventListener('input', () => {
      if (!input.value.trim()) return; /* still empty — leave error */

      /* User has typed something — optimistically clear the error */
      input.classList.remove('co-input-error');
      const err = $el(`${id}-error`);
      if (err) err.textContent = '';

      /* Hide the banner if all errors are now gone */
      const anyError = REQUIRED_FIELDS.some(f => {
        const inp = $el(f.id);
        return inp && inp.classList.contains('co-input-error');
      });
      if (!anyError) hideBanner();
    });
  });
}


/* ═══════════════════════════════════════════════════
   PAYMENT ADAPTER REGISTRY
   ─────────────────────────────────────────────────
   Each adapter describes one payment method.
   To add a real gateway later:
     1. Add its key to the PAYMENT_ADAPTERS object.
     2. Implement beforeSubmit() — open widget, validate token, etc.
     3. Implement getPayload() — return extra fields to merge
        (e.g. { paymentRef: 'PAY-xyz', paymentToken: '...' }).
   The placeOrder() flow calls these hooks automatically.
   No other code needs to change.
═══════════════════════════════════════════════════ */

const PAYMENT_ADAPTERS = {

  COD: {
    label: 'Cash on Delivery',
    /** Map to the existing Order model enum value */
    apiValue: 'COD',
    /**
     * Pre-submit hook — resolve true to continue, false to abort.
     * @returns {Promise<boolean>}
     */
    beforeSubmit: async () => true,
    /** Extra fields merged into the order payload (none for COD). */
    getPayload:   () => ({}),
  },

  VodafoneCash: {
    label: 'Vodafone Cash',
    /*
     * TODO: update Order model enum to include 'VodafoneCash'.
     * Using 'Online' as the closest existing value until then.
     */
    apiValue: 'Online',
    beforeSubmit: async () => true,
    getPayload:   () => ({}),
  },

  InstaPay: {
    label: 'InstaPay',
    /*
     * TODO: update Order model enum to include 'InstaPay'.
     * Using 'Online' as the closest existing value until then.
     */
    apiValue: 'Online',
    beforeSubmit: async () => true,
    getPayload:   () => ({}),
  },
};

/**
 * Read the currently selected payment method from the form.
 * @returns {string}  e.g. 'COD', 'VodafoneCash', 'InstaPay'
 */
function getSelectedPaymentMethod() {
  const checked = document.querySelector('input[name="paymentMethod"]:checked');
  return checked?.value ?? 'COD';
}

/**
 * Resolve the adapter for a payment method key.
 * Falls back to COD if the key is unknown.
 * @param {string} methodKey
 * @returns {object}
 */
function getAdapter(methodKey) {
  return PAYMENT_ADAPTERS[methodKey] ?? PAYMENT_ADAPTERS.COD;
}


/* ═══════════════════════════════════════════════════
   LOADING STATE
═══════════════════════════════════════════════════ */

/**
 * Toggle the Place Order button's loading state.
 * Prevents double-submission and gives visual feedback.
 * @param {boolean} isLoading
 */
function setLoading(isLoading) {
  const btn = $el('co-submit-btn');
  if (!btn) return;

  btn.disabled    = isLoading;
  btn.textContent = isLoading ? 'Placing order…' : 'Place Order →';
}


/* ═══════════════════════════════════════════════════
   BUILD ORDER PAYLOAD
   Constructs the object expected by POST /api/orders.
   Shape must match server/models/Order.js exactly.
═══════════════════════════════════════════════════ */

/**
 * Collect all form values + cart data into the API payload.
 *
 * @param {string} methodKey  Selected payment method key (e.g. 'COD')
 * @param {object} adapter    Resolved PAYMENT_ADAPTERS entry
 * @returns {object}          Ready-to-POST order payload
 */
function buildOrderPayload(methodKey, adapter) {

  /* ── Customer ── */
  const customer = {
    name:    $el('co-name')   ?.value.trim() ?? '',
    phone:   $el('co-phone')  ?.value.trim() ?? '',
    email:   $el('co-email')  ?.value.trim() ?? '',
    city:    $el('co-city')   ?.value.trim() ?? '',
    address: $el('co-address')?.value.trim() ?? '',
  };

  /* ── Line items ── (snapshot of product data at time of purchase) */
  const items = _cart.map(cartItem => {
    const p = findProduct(cartItem.productId);
    if (!p) return null;

    return {
      product:  cartItem.productId,        /* MongoDB ObjectId ref */
      name:     p.name,                    /* snapshot */
      color:    p.colors?.[0] ?? '',       /* snapshot */
      size:     cartItem.size,
      price:    p.price,                   /* snapshot */
      quantity: cartItem.qty,
      image:    p.images?.[0] ?? '',       /* filename only */
    };
  }).filter(Boolean);                      /* drop any null (product vanished) */

  /* ── Totals ── (server re-validates the coupon and recomputes these) */
  const subtotal = calcSubtotal();
  const discount = calcDiscount();
  const total    = Math.max(0, subtotal - discount) + CO.SHIPPING_FEE;

  /* ── Notes ── */
  const notes = $el('co-notes')?.value.trim() ?? '';

  /* ── Payment method: use the adapter's mapped API value ── */
  const paymentMethod = adapter.apiValue;

  /* ── Extra fields from the payment adapter (gateway ref, token, etc.) ── */
  const adapterFields = adapter.getPayload();

  return {
    customer,
    items,
    subtotal,
    shippingFee: CO.SHIPPING_FEE,
    total,
    paymentMethod,
    paymentStatus: 'Unpaid',
    notes,
    source: 'storefront',
    couponCode: _coupon ? _coupon.code : undefined,
    ...adapterFields,                      /* merge any gateway-specific fields */
  };
}


/* ═══════════════════════════════════════════════════
   SUBMIT ORDER
   Single-responsibility: only talks to the API.
═══════════════════════════════════════════════════ */

/**
 * POST the payload to /api/orders.
 *
 * Throws a descriptive Error on any failure so the caller
 * (placeOrder) can handle it uniformly.
 *
 * @param {object} payload   Built by buildOrderPayload()
 * @returns {Promise<object>} The created order document from MongoDB
 */
async function submitOrder(payload) {
  const res = await fetch(`${CO.API}/orders`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  /* Try to parse the response body regardless of status */
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    /* Server returned a structured error — surface its message */
    const msg = data?.message ?? `Server error (${res.status})`;
    throw new Error(msg);
  }

  return data;   /* the saved Order document */
}


/* ═══════════════════════════════════════════════════
   POST-SUCCESS HELPERS
═══════════════════════════════════════════════════ */

/**
 * Remove cart data from localStorage.
 * Called only after a confirmed successful order.
 */
function clearCartStorage() {
  localStorage.removeItem(CO.CART_KEY);
}

/**
 * Navigate to the thank-you page, passing the order number
 * as a URL query parameter so the page can display it.
 * @param {string} orderNumber  e.g. "ORD-1001"
 */
function redirectToThankYou(orderNumber) {
  const params = new URLSearchParams({ order: orderNumber });
  window.location.href = `../pages/thankyou.html?${params}`;
}


/* ═══════════════════════════════════════════════════
   PLACE ORDER  — main orchestrator
   Sequence:
     1. Validate form
     2. Run payment adapter pre-submit hook
     3. Set loading state
     4. Build payload
     5. POST to API
     6. On success → clear cart → redirect
     7. On failure → show error → restore button
═══════════════════════════════════════════════════ */

async function placeOrder() {

  /* ── 1. Validate ── */
  if (!validate()) return;

  /* ── 2. Payment adapter pre-submit hook ── */
  const methodKey = getSelectedPaymentMethod();
  const adapter   = getAdapter(methodKey);

  const canProceed = await adapter.beforeSubmit();
  if (!canProceed) return;   /* adapter aborted (e.g. payment widget cancelled) */

  /* ── 3. Loading state ── */
  setLoading(true);
  hideBanner();

  /* ── 4. Build payload ── */
  const payload = buildOrderPayload(methodKey, adapter);

  /* ── 5. POST ── */
  try {
    const order = await submitOrder(payload);

    /* ── 6. Success ── */
    clearCartStorage();
    redirectToThankYou(order.orderNumber);

  } catch (err) {
    /* ── 7. Failure ── keep cart, show error, restore button ── */
    console.error('[checkout] Order submission failed:', err);
    showBanner(`Could not place your order: ${err.message}. Please try again.`);
    setLoading(false);
  }
}


/* ═══════════════════════════════════════════════════
   SUBMIT HANDLER  — wires the button to placeOrder()
═══════════════════════════════════════════════════ */

function bindSubmit() {
  const btn = $el('co-submit-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    /*
     * placeOrder() is async.  We don't await here because the button
     * click handler must return synchronously; placeOrder manages its
     * own loading / error states internally.
     */
    placeOrder();
  });
}


/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */

async function init() {
  await loadState();      /* localStorage → _cart, API → _products     */
  renderSummary();        /* items + totals + sync submit button       */
  bindInputListeners();   /* clear field errors as user types          */
  bindCouponControls();   /* coupon Apply button + Enter key           */
  bindSubmit();           /* Place Order → placeOrder()               */
}

/* Entry point — run after the DOM is fully parsed */
document.addEventListener('DOMContentLoaded', init);

