/* ═══════════════════════════════════════════════════
   SOLTR — account.js
   Phase 3: Customer Account layout (auth guard, /me header info,
   sidebar tab switching). Phase 4: real My Profile section (view,
   edit name/phone, change password) — see PROFILE module below.
   Orders/Wishlist/Addresses/Settings remain placeholder tabs, per spec.
═══════════════════════════════════════════════════ */

const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;
function imgUrl(filename) { return `${IMG}/uploads/products/${filename}`; }

const WHATSAPP_NUMBER = "201111455086";
const CART_KEY = 'cart'; // same key every other page reads/writes

function fmt(n) { return "LE " + Number(n).toFixed(2); }
const esc = str => String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "January 12, 2026" style date, or "—" if absent */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ════════════════════════════════
   ACCOUNT GUARD + HEADER
   Only authenticated customers may view this page — verified against
   the backend (not just localStorage presence) via the same
   CUSTOMER_AUTH.verifySession() every other page uses.
════════════════════════════════ */
let currentCustomer = null; // populated once the guard resolves; used by the Profile module below

async function initAccountGuard() {
  const customer = await CUSTOMER_AUTH.verifySession();

  if (!customer) {
    window.location.replace('../auth/customer-login.html');
    return;
  }

  currentCustomer = customer;

  document.getElementById('accountAvatar').textContent = (customer.name || '?').charAt(0).toUpperCase();
  document.getElementById('accountUserName').textContent  = customer.name || '—';
  document.getElementById('accountUserEmail').textContent = customer.email || '—';

  renderProfileView(customer);

  document.getElementById('accountLoading').style.display = 'none';
  document.getElementById('accountShell').style.display = '';
}

/* ════════════════════════════════
   SIDEBAR — tab switching + mobile slide-out
════════════════════════════════ */
function initAccountSidebar() {
  const sidebar     = document.getElementById('accountSidebar');
  const toggleBtn   = document.getElementById('accountMenuToggle');
  const overlay     = document.getElementById('accountSidebarOverlay');
  const navItems    = document.querySelectorAll('.account-nav-item[data-section]');
  const tabs        = document.querySelectorAll('.account-tab[data-section]');

  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  });
  overlay.addEventListener('click', closeMobileSidebar);

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;

      navItems.forEach(b => b.classList.toggle('active', b === btn));
      tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.section === section));

      closeMobileSidebar(); // switching sections also closes the mobile slide-out
    });
  });

  document.getElementById('accountLogoutBtn').addEventListener('click', () => {
    CUSTOMER_AUTH.logout();
  });
}

/* ════════════════════════════════
   PROFILE  (Phase 4 — live, backed by PUT /api/customers/me
   and PUT /api/customers/me/password, both via the existing
   customer JWT — no new auth logic, no duplicated hashing)
════════════════════════════════ */
const PHONE_RE = /^\+?[\d\s-]{8,20}$/;
const MIN_PASSWORD_LENGTH = 8;

function renderProfileView(customer) {
  document.getElementById('profileName').textContent       = customer.name || '—';
  document.getElementById('profileEmail').textContent      = customer.email || '—';
  document.getElementById('profilePhone').textContent      = customer.phone || '—';
  document.getElementById('profileCreated').textContent    = formatDate(customer.createdAt);
  document.getElementById('profileLastLogin').textContent  = formatDate(customer.lastLoginAt);

  const statusEl = document.getElementById('profileEmailStatus');
  if (customer.emailVerified) {
    statusEl.innerHTML = `<span style="color:var(--bone);">Verified ✓</span>`;
  } else {
    statusEl.innerHTML = `
      <span style="color:var(--burgundy-light);">Email not verified</span>
      <button type="button" id="profileVerifyEmailBtn" class="btn" style="margin-left:10px; padding:6px 14px; font-size:10.5px;">Verify Email</button>`;

    const btn = document.getElementById('profileVerifyEmailBtn');
    if (btn) btn.addEventListener('click', () => resendVerificationFromProfile(customer.email));
  }
}

async function resendVerificationFromProfile(email) {
  try {
    const res  = await fetch(`${API}/customers/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    showAccountToast(data.message || (res.ok ? 'Verification email sent.' : 'Could not resend verification email.'));
  } catch (err) {
    showAccountToast('Could not reach the server. Please try again.');
  }
}

function enterProfileEditMode() {
  document.getElementById('editName').value = currentCustomer.name || '';
  document.getElementById('editEmailDisabled').value = currentCustomer.email || '';
  document.getElementById('editPhone').value = currentCustomer.phone || '';

  const msgEl = document.getElementById('profileFormMsg');
  msgEl.textContent = '';
  msgEl.className = 'pd-review-form-msg';

  document.getElementById('profileView').style.display = 'none';
  document.getElementById('profileEditForm').style.display = '';
}

function exitProfileEditMode() {
  document.getElementById('profileEditForm').style.display = 'none';
  document.getElementById('profileView').style.display = '';
}

function initProfile() {
  document.getElementById('editProfileBtn').addEventListener('click', enterProfileEditMode);
  document.getElementById('cancelProfileBtn').addEventListener('click', exitProfileEditMode);

  document.getElementById('profileEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name  = document.getElementById('editName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const msgEl = document.getElementById('profileFormMsg');
    const saveBtn = document.getElementById('saveProfileBtn');

    /* Client-side validation (server validates again regardless) */
    if (!name) {
      msgEl.textContent = 'Full name cannot be empty.';
      msgEl.className = 'pd-review-form-msg error';
      return;
    }
    if (phone && !PHONE_RE.test(phone)) {
      msgEl.textContent = 'Please enter a valid phone number.';
      msgEl.className = 'pd-review-form-msg error';
      return;
    }

    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving…';
    msgEl.textContent = '';
    msgEl.className = 'pd-review-form-msg';

    try {
      const token = localStorage.getItem('soltr_customer_token') || sessionStorage.getItem('soltr_customer_token');
      const res = await fetch(`${API}/customers/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update profile');

      currentCustomer = data;
      document.getElementById('accountUserName').textContent = data.name; // sidebar header too, no reload
      renderProfileView(data);

      msgEl.textContent = 'Profile updated successfully!';
      msgEl.className = 'pd-review-form-msg success';

      setTimeout(exitProfileEditMode, 900); // brief pause so the success message is seen
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'pd-review-form-msg error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword     = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    const msgEl   = document.getElementById('passwordFormMsg');
    const saveBtn = document.getElementById('savePasswordBtn');

    if (!currentPassword || !newPassword || !confirmPassword) {
      msgEl.textContent = 'Please fill in all password fields.';
      msgEl.className = 'pd-review-form-msg error';
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      msgEl.textContent = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      msgEl.className = 'pd-review-form-msg error';
      return;
    }
    if (newPassword !== confirmPassword) {
      msgEl.textContent = 'New password and confirmation do not match.';
      msgEl.className = 'pd-review-form-msg error';
      return;
    }

    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Updating…';
    msgEl.textContent = '';
    msgEl.className = 'pd-review-form-msg';

    try {
      const token = localStorage.getItem('soltr_customer_token') || sessionStorage.getItem('soltr_customer_token');
      const res = await fetch(`${API}/customers/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');

      msgEl.textContent = 'Password changed successfully!';
      msgEl.className = 'pd-review-form-msg success';
      document.getElementById('passwordForm').reset();
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'pd-review-form-msg error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/* ════════════════════════════════
   ORDERS  (Phase 5 — live, GET /api/customers/me/orders via the
   existing customer JWT. Matched by email server-side — see
   server/controllers/customerOrderController.js for why there's no
   direct customerId link (checkout was intentionally left untouched).

   Status always reflects the database directly: every time this tab
   is opened, it fetches fresh from the API — no caching layer to
   bust, so an admin dashboard status change appears automatically on
   the customer's very next visit/fetch, with zero extra code needed.
════════════════════════════════ */
let ordersCache = [];

function orderStatusClass(status) {
  return 'order-status--' + String(status || 'pending').toLowerCase();
}

function orderItemsSummary(order) {
  const count = (order.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
  return `${count} item${count === 1 ? '' : 's'}`;
}

function renderOrderCard(order) {
  const itemsHTML = (order.items || []).map(item => {
    const img = item.image ? imgUrl(item.image) : '';
    return `
      <div class="order-item-row">
        ${img ? `<img src="${img}" alt="${esc(item.name)}">` : ''}
        <div>
          <div class="order-item-name">${esc(item.name)} — ${esc(item.color)}</div>
          <div class="order-item-meta">Size ${esc(item.size)} × ${item.quantity}</div>
        </div>
        <div class="order-item-price">${fmt(item.price * item.quantity)}</div>
      </div>`;
  }).join('');

  const c = order.customer || {};
  const shippingHTML = `
    <div class="order-shipping-info">
      <div><strong>Ship to:</strong> ${esc(c.name || '—')}</div>
      <div><strong>Phone:</strong> ${esc(c.phone || '—')}</div>
      ${c.address ? `<div><strong>Address:</strong> ${esc(c.address)}${c.city ? ', ' + esc(c.city) : ''}</div>` : ''}
      ${order.notes ? `<div><strong>Notes:</strong> ${esc(order.notes)}</div>` : ''}
    </div>`;

  return `
    <div class="order-card" data-order-id="${order._id}">
      <div class="order-card-head">
        <div>
          <div class="order-number">${esc(order.orderNumber || order._id)}</div>
          <div class="order-date">${formatDate(order.createdAt)}</div>
        </div>
        <span class="order-status ${orderStatusClass(order.status)}">${esc(order.status)}</span>
      </div>
      <div class="order-card-summary">
        ${orderItemsSummary(order)} · ${esc(order.paymentMethod)} · <span class="order-total">${fmt(order.total)}</span>
      </div>
      <button class="order-toggle-btn" data-order-id="${order._id}">View Details ▾</button>
      <div class="order-details" data-order-id="${order._id}" style="display:none;">
        ${itemsHTML}
        ${shippingHTML}
      </div>
    </div>`;
}

function bindOrderToggles() {
  document.querySelectorAll('.order-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.orderId;
      const details = document.querySelector(`.order-details[data-order-id="${id}"]`);
      const isOpen = details.style.display !== 'none';
      details.style.display = isOpen ? 'none' : '';
      btn.textContent = isOpen ? 'View Details ▾' : 'Hide Details ▴';
    });
  });
}

async function loadOrders() {
  const loadingEl = document.getElementById('ordersLoading');
  const errorEl   = document.getElementById('ordersError');
  const emptyEl   = document.getElementById('ordersEmpty');
  const listEl    = document.getElementById('orderList');

  loadingEl.style.display = '';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  listEl.innerHTML = '';

  try {
    const token = localStorage.getItem('soltr_customer_token') || sessionStorage.getItem('soltr_customer_token');
    const res = await fetch(`${API}/customers/me/orders`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Failed to load orders');
    }

    ordersCache = await res.json();
    loadingEl.style.display = 'none';

    if (!ordersCache.length) {
      emptyEl.style.display = '';
      return;
    }

    listEl.innerHTML = ordersCache.map(renderOrderCard).join('');
    bindOrderToggles();
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.textContent = `⚠ ${err.message}. Please try again.`;
    errorEl.style.display = '';
    console.error('Orders fetch error:', err);
  }
}

function initOrders() {
  /* Refetch every time the Orders tab is opened (not cached) — this is
     precisely what guarantees status always reflects the database:
     if an admin changes an order's status in the dashboard, the very
     next time the customer opens this tab, they see it. No manual
     sync step, no stale cache to invalidate. */
  document.querySelectorAll('.account-nav-item[data-section="orders"]').forEach(btn => {
    btn.addEventListener('click', () => loadOrders());
  });
}

/* ════════════════════════════════
   ADDRESSES  (Phase 7 — live, GET/POST/PUT/DELETE
   /api/customers/me/addresses via the existing customer JWT.
   Same PHONE_RE already defined for Profile — reused, not duplicated.
════════════════════════════════ */
let addressesCache = [];

function authHeaders() {
  const token = localStorage.getItem('soltr_customer_token') || sessionStorage.getItem('soltr_customer_token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function renderAddressList() {
  const listEl  = document.getElementById('addressList');
  const emptyEl = document.getElementById('addressesEmpty');
  const addBtn  = document.getElementById('addAddressBtn');

  if (!addressesCache.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    addBtn.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  addBtn.style.display = '';

  listEl.innerHTML = addressesCache.map(a => `
    <div class="address-card" data-address-id="${a._id}">
      <div class="address-card-head">
        <span class="address-label">${esc(a.label || 'Home')}</span>
        ${a.isDefault ? '<span class="address-default-badge">Default</span>' : ''}
      </div>
      <div class="address-details">
        <div>${esc(a.fullName)}</div>
        <div class="address-phone">${esc(a.phone)}</div>
        <div class="address-line">${esc(a.address)}, ${esc(a.city)}</div>
      </div>
      <div class="address-card-actions">
        ${!a.isDefault ? `<button class="address-action-btn" data-action="default" data-id="${a._id}">Set as Default</button>` : ''}
        <button class="address-action-btn" data-action="edit" data-id="${a._id}">Edit</button>
        <button class="address-action-btn address-action-btn--danger" data-action="delete" data-id="${a._id}">Delete</button>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.address-action-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAddressAction(btn.dataset.action, btn.dataset.id, btn));
  });
}

async function loadAddresses() {
  const loadingEl = document.getElementById('addressesLoading');
  const errorEl   = document.getElementById('addressesError');
  const emptyEl   = document.getElementById('addressesEmpty');
  const listEl    = document.getElementById('addressList');
  const addBtn    = document.getElementById('addAddressBtn');

  loadingEl.style.display = '';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  addBtn.style.display = 'none';
  listEl.innerHTML = '';

  try {
    const res = await fetch(`${API}/customers/me/addresses`, { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Failed to load addresses');
    }
    addressesCache = await res.json();
    loadingEl.style.display = 'none';
    renderAddressList();
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.textContent = `⚠ ${err.message}. Please try again.`;
    errorEl.style.display = '';
    console.error('Addresses fetch error:', err);
  }
}

function showAddressForm(address) {
  const form = document.getElementById('addressForm');
  const msgEl = document.getElementById('addressFormMsg');
  msgEl.textContent = '';
  msgEl.className = 'pd-review-form-msg';

  document.getElementById('addressFormTitle').textContent = address ? 'Edit Address' : 'Add New Address';
  document.getElementById('addressFormId').value    = address ? address._id : '';
  document.getElementById('addrLabel').value        = address ? address.label : '';
  document.getElementById('addrFullName').value     = address ? address.fullName : (currentCustomer ? currentCustomer.name : '');
  document.getElementById('addrPhone').value        = address ? address.phone : (currentCustomer ? currentCustomer.phone : '');
  document.getElementById('addrStreet').value       = address ? address.address : '';
  document.getElementById('addrCity').value         = address ? address.city : '';
  document.getElementById('addrIsDefault').checked  = address ? address.isDefault : addressesCache.length === 0;
  document.getElementById('addrIsDefault').disabled = address ? address.isDefault : false; // already-default address can't un-default itself here — use another address's "Set as Default" instead

  form.style.display = '';
  document.getElementById('addAddressBtn').style.display = 'none';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAddressForm() {
  document.getElementById('addressForm').style.display = 'none';
  if (addressesCache.length) document.getElementById('addAddressBtn').style.display = '';
}

async function handleAddressAction(action, id, btn) {
  if (action === 'edit') {
    const address = addressesCache.find(a => a._id === id);
    if (address) showAddressForm(address);
    return;
  }

  if (action === 'delete') {
    if (!confirm('Delete this address? This cannot be undone.')) return;
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/customers/me/addresses/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete address');

      addressesCache = addressesCache.filter(a => a._id !== id);
      renderAddressList();
      showAccountToast('Address deleted');
    } catch (err) {
      btn.disabled = false;
      showAccountToast(err.message);
    }
    return;
  }

  if (action === 'default') {
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/customers/me/addresses/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ isDefault: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update default address');

      /* Only one default can ever exist — reflect that locally too, instantly */
      addressesCache = addressesCache.map(a => ({ ...a, isDefault: a._id === id }));
      renderAddressList();
      showAccountToast('Default address updated');
    } catch (err) {
      btn.disabled = false;
      showAccountToast(err.message);
    }
  }
}

function initAddresses() {
  document.querySelectorAll('.account-nav-item[data-section="addresses"]').forEach(btn => {
    btn.addEventListener('click', () => loadAddresses());
  });

  document.getElementById('addAddressBtn').addEventListener('click', () => showAddressForm(null));
  document.getElementById('addAddressEmptyBtn').addEventListener('click', () => showAddressForm(null));
  document.getElementById('cancelAddressBtn').addEventListener('click', hideAddressForm);

  document.getElementById('addressForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id        = document.getElementById('addressFormId').value;
    const label     = document.getElementById('addrLabel').value.trim();
    const fullName  = document.getElementById('addrFullName').value.trim();
    const phone     = document.getElementById('addrPhone').value.trim();
    const address   = document.getElementById('addrStreet').value.trim();
    const city      = document.getElementById('addrCity').value.trim();
    const isDefault = document.getElementById('addrIsDefault').checked;
    const msgEl     = document.getElementById('addressFormMsg');
    const saveBtn   = document.getElementById('saveAddressBtn');

    /* Client-side validation (server validates again regardless) */
    if (!fullName)              { msgEl.textContent = 'Full name is required.'; msgEl.className = 'pd-review-form-msg error'; return; }
    if (!PHONE_RE.test(phone))  { msgEl.textContent = 'Please enter a valid phone number.'; msgEl.className = 'pd-review-form-msg error'; return; }
    if (!address)                { msgEl.textContent = 'Street address is required.'; msgEl.className = 'pd-review-form-msg error'; return; }
    if (!city)                   { msgEl.textContent = 'City is required.'; msgEl.className = 'pd-review-form-msg error'; return; }

    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving…';
    msgEl.textContent = '';
    msgEl.className = 'pd-review-form-msg';

    const payload = { label: label || 'Home', fullName, phone, address, city, isDefault };

    try {
      const res = await fetch(
        id ? `${API}/customers/me/addresses/${id}` : `${API}/customers/me/addresses`,
        { method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(payload) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save address');

      if (id) {
        addressesCache = addressesCache.map(a => a._id === id ? data : (payload.isDefault ? { ...a, isDefault: false } : a));
      } else {
        addressesCache = payload.isDefault ? addressesCache.map(a => ({ ...a, isDefault: false })) : addressesCache;
        addressesCache.push(data);
      }

      renderAddressList();
      hideAddressForm();
      showAccountToast(id ? 'Address updated successfully' : 'Address added successfully');
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'pd-review-form-msg error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/* ════════════════════════════════
   CART  (shared drawer — same as every other page)
════════════════════════════════ */
let productsCache = [];
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }

function findProduct(id) { return productsCache.find(p => p._id === id) || null; }

function addToCart(productId, size, quantity = 1) {
  const product = findProduct(productId);
  if (product && (Number(product.stock) || 0) === 0) return; // out of stock — never add
  const existing = cart.find(i => i.productId === productId && i.size === size);
  if (existing) { existing.qty += quantity; } else { cart.push({ productId, size, qty: quantity }); }
  renderCart();
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
function persistCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subEl   = document.getElementById("cartSubtotal");
  countEl.textContent = cart.reduce((s, i) => s + i.qty, 0);

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

  const subtotal = cart.reduce((s, i) => { const p = findProduct(i.productId); return p ? s + p.price * i.qty : s; }, 0);
  subEl.textContent = fmt(subtotal);

  const lines = cart.map(i => {
    const p = findProduct(i.productId);
    return p ? `- ${p.name} (${p.colors[0]}) - Size ${i.size} x ${i.qty} - ${fmt(p.price * i.qty)}` : '';
  }).filter(Boolean).join("\n");
  const msg = cart.length ? `Hey Soltr! I'd like to order:\n${lines}\n\nSubtotal: ${fmt(subtotal)}` : `Hey Soltr! I'd like to place an order.`;
  document.getElementById("checkoutBtn").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  persistCart();
}

function openCart()  { document.getElementById("cartDrawer").classList.add("open");    document.getElementById("overlay").classList.add("open"); }
function closeCart() { document.getElementById("cartDrawer").classList.remove("open"); document.getElementById("overlay").classList.remove("open"); }
document.getElementById("cartOpenBtn").addEventListener("click", openCart);
document.getElementById("cartCloseBtn").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);

/* ════════════════════════════════
   WISHLIST BADGE  (count only — no grid on this page)
════════════════════════════════ */
function getOrCreateVisitorId() {
  const KEY = 'soltr_visitor_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem(KEY, id);
  }
  return id;
}
/* ════════════════════════════════
   WISHLIST  (Phase 6 — full module, reused verbatim from wishlist.js/
   product.js/script.js. Same backend endpoints, same anonymous
   visitorId, same localStorage key — there is only ever ONE wishlist
   collection. The standalone wishlist.html and this Account → Wishlist
   tab are simply two different views onto the exact same data.)
════════════════════════════════ */
const SWATCH = { White: "#f1efe9", Black: "#1a1a1a", Burgundy: "#6e1423" };

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
    if (btn.classList.contains('wishlist-heart')) btn.textContent = saved ? '♥' : '♡';
  });
}

function updateWishlistBadge() {
  const el = document.getElementById('wishlistCount');
  if (el) el.textContent = wishlistCache.length;
}

function stockBadgeHTML(stock) {
  const s = Number(stock) || 0;
  if (s === 0) return `<span class="stock-badge stock-badge--out">OUT OF STOCK</span>`;
  if (s <= 5)  return `<span class="stock-badge stock-badge--low">LOW STOCK</span>`;
  return '';
}

/* ════════════════════════════════
   ACCOUNT → WISHLIST TAB  (Phase 6)
   Cross-references wishlistCache against productsCache — both already
   fetched via the existing endpoints, exactly like wishlist.html does.
   No new "get wishlisted products" endpoint needed.
════════════════════════════════ */
function renderAccountWishlist() {
  const grid    = document.getElementById('accountWishlistGrid');
  const emptyEl = document.getElementById('accountWishlistEmpty');
  if (!grid || !emptyEl) return;

  const items = wishlistCache.map(id => findProduct(id)).filter(Boolean);

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
    /* Sale price: schema has no discount field today — this stays dormant
       and simply never renders until a real sale-price field exists. */
    const priceHTML = p.salePrice && p.salePrice < p.price
      ? `<span class="account-wishlist-sale">${fmt(p.salePrice)}</span> <span class="account-wishlist-was">${fmt(p.price)}</span>`
      : fmt(p.price);

    return `
      <article class="card in-view" data-id="${p._id}">
        <div class="card-media-frame">
          <a href="../products/product.html?id=${p._id}" class="card-media-link">
            <div class="card-media">
              <img class="img-a" src="${img1}" alt="${esc(p.name)}" loading="lazy">
              <img class="img-b" src="${img2}" alt="" loading="lazy">
              <span class="hangtag">${fmt(p.price)}</span>
              <span class="swatch-dot" style="background:${swatchBg}" title="${esc(color)}"></span>
              ${stockBadgeHTML(stock)}
            </div>
          </a>
        </div>
        <div class="card-info">
          <h3>${esc(p.name)}</h3>
          <div class="meta">${esc(color)} · ${esc(typeLabel)}</div>
          <div class="account-wishlist-price">${priceHTML}</div>
          <div class="account-wishlist-actions">
            <a href="../products/product.html?id=${p._id}" class="btn account-wishlist-view-btn">View Product</a>
            <button class="add-btn${outOfStock ? ' out-of-stock' : ''}" data-product="${p._id}" ${outOfStock ? 'disabled' : ''}>
              ${outOfStock ? 'OUT OF STOCK' : 'Add to Cart'}
            </button>
          </div>
          <button class="account-wishlist-remove-btn" data-wishlist-id="${p._id}">Remove from Wishlist</button>
        </div>
      </article>`;
  }).join('');

  /* Remove — updates MongoDB via the existing toggleWishlist(), then
     removes the card immediately and updates the badge everywhere */
  grid.querySelectorAll('.account-wishlist-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const result = await toggleWishlist(btn.dataset.wishlistId);
      if (!result.ok) {
        btn.disabled = false;
        showAccountToast('Could not update wishlist. Please try again.');
        return;
      }
      showAccountToast('Removed from wishlist');
      renderAccountWishlist(); // re-render so the card disappears immediately, no reload
    });
  });

  /* Add to Cart — quick-add using the product's first available size,
     reusing the exact same addToCart() the cart drawer already uses */
  grid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.product;
      const p   = findProduct(pid);
      if (!p) return;
      const size = (p.sizes && p.sizes[0]) || 'M';
      addToCart(pid, size);
      showAccountToast(`Added to cart — Size ${size}`);
    });
  });
}

/** Small toast for Wishlist tab feedback (Remove / Add to Cart) — same
    pattern used across the storefront (fixed bottom, fade in/out). */
let _accountToastTimer = null;
function showAccountToast(msg) {
  let el = document.getElementById('accountToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'accountToast';
    el.className = 'pd-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_accountToastTimer);
  _accountToastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ════════════════════════════════
   HEADER SCROLL + MOBILE SITE MENU  (same as every other page)
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
   INIT
════════════════════════════════ */
async function init() {
  renderCart();

  try {
    const res = await fetch(`${API}/products`);
    if (res.ok) productsCache = await res.json();
  } catch (err) {
    console.error('Products fetch error:', err);
  }
  renderCart(); // re-render now that product data is available for names/images/prices

  await fetchWishlist();
  renderAccountWishlist();
  initAccountSidebar();
  initProfile();
  initOrders();
  initAddresses();
  await initAccountGuard();
}

init();
