/* ═══════════════════════════════════════════════════
   SOLTR ADMIN DASHBOARD — dashboard.js
   Products, Orders, Coupons, Customers: live API (Express + MongoDB)
═══════════════════════════════════════════════════ */

/* ════════════════════════════════
   API CONFIG
════════════════════════════════ */
const API = window.SOLTR_CONFIG.API;
const IMG = window.SOLTR_CONFIG.IMG;
function imgUrl(f) { return f ? IMG + '/uploads/products/' + f : 'assests/images/product/logo.png'; }

/* ════════════════════════════════
   AUTH  (inlined — dashboard.js no longer depends on auth.js)
   Real backend-verified authentication (JWT). All sensitive logic
   (credential check, password hashing, token issuing/verification)
   lives on the server — see server/controllers/authController.js
   and server/middleware/auth.js. This just stores the token and
   attaches it to every outgoing API request.
════════════════════════════════ */
const AUTH_TOKEN_KEY = "soltr_admin_token";
const AUTH_ADMIN_KEY = "soltr_admin_info"; // { username, name } — display only, never the token itself

/** Token may be in localStorage (Remember Me, set at login) or sessionStorage (this tab only). */
function getAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || null;
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ADMIN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_ADMIN_KEY);
}

/**
 * Redirect to login.html if there's no token, OR if the token doesn't
 * actually verify against the backend (GET /api/auth/me) — a stale,
 * expired, or tampered token is treated as "not authenticated", not
 * just "something is present in storage".
 * @returns {Promise<boolean>} true if authenticated, false otherwise (already redirecting)
 */
async function requireAuth() {
  const token = getAuthToken();
  if (!token) {
    window.location.replace("login.html");
    return false;
  }
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('invalid token');
    return true;
  } catch {
    clearAuthSession();
    window.location.replace("login.html");
    return false;
  }
}

/** Notify the backend (stateless no-op, kept for API symmetry), clear the session, and redirect. */
function logout() {
  const token = getAuthToken();
  clearAuthSession();
  if (token) {
    fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {}); // best-effort — the client-side clear above is what actually matters
  }
  window.location.replace("login.html");
}

/* Attach the JWT to every request to this project's API automatically,
   and force logout if the backend ever says the token is invalid/expired. */
(function () {
  const _nativeFetch = window.fetch;
  window.fetch = function (input, options = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const isApiCall = typeof url === 'string' && url.startsWith(API);
    const token = getAuthToken();

    if (isApiCall && token) {
      options = {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
      };
    }

    return _nativeFetch(input, options).then(res => {
      if (isApiCall && res.status === 401) {
        clearAuthSession();
        window.location.replace("login.html");
      }
      return res;
    });
  };
})();

/* ════════════════════════════════
   MOCK DATA  (Orders / Customers / Coupons only)
════════════════════════════════ */
/* MOCK_ORDERS removed — orders now come from MongoDB API */


/* MOCK_CUSTOMERS removed — customers now come from the Customers API (derived from Order data) */

/* MOCK_COUPONS removed — coupons now come from MongoDB API */

/* ANALYTICS_REVENUE / ANALYTICS_ORDERS / ANALYTICS_COLORS / ANALYTICS_SIZES removed
   — Analytics page now fetches everything from /api/analytics (see renderAnalytics()) */

/* Presentation-only color→hex map for the Sales by Color donut chart.
   The backend returns color NAMES + real percentages; hex codes are a
   display concern, not business data, so they stay here (same palette
   used on the storefront's SWATCH map in script.js). */
const COLOR_HEX = { Black: "#1a1a1a", White: "#ece7dd", Burgundy: "#6e1423" };

/* ════════════════════════════════
   HELPERS
════════════════════════════════ */
const fmt = (n) => "LE " + n.toLocaleString("en-EG");

function statusBadge(status) {
  const map = {
    Pending:    'badge-pending',
    Processing: 'badge-processing',
    Confirmed:  'badge-confirmed',
    Shipped:    'badge-shipped',
    Delivered:  'badge-delivered',
    Cancelled:  'badge-cancelled',
    Returned:   'badge-returned',
    Paid:       'badge-confirmed',
    Unpaid:     'badge-pending',
  };
  return `<span class="badge ${map[status] || ''}">${status || '—'}</span>`;
}

/**
 * stockBadge(stock)
 * 🟢 In Stock   — stock > 5
 * 🟠 Low Stock  — stock 1–5
 * 🔴 Out of Stock — stock = 0
 */
function stockBadge(stock) {
  const qty = Number(stock) || 0;
  if (qty === 0)  return `<span class="badge badge-stock-out">🔴 Out of Stock</span>`;
  if (qty <= 5)   return `<span class="badge badge-stock-low">🟠 Low Stock</span>`;
  return `<span class="badge badge-stock-in">🟢 In Stock</span>`;
}

function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
}

/* ════════════════════════════════
   ROUTING
════════════════════════════════ */
const PAGE_TITLES = {
  home:         'Dashboard',
  orders:       'Orders',
  products:     'Products',
  customers:    'Customers',
  coupons:      'Coupons',
  analytics:    'Analytics',
  settings:     'Settings',
  content:      'Content Management',
  'content-edit': 'Edit Policy Page',
  'order-detail': 'Order Details',
};

function goTo(pageId) {
  // pages
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.querySelector(`.page[data-page="${pageId}"]`);
  if (target) target.classList.add("active");

  // nav items
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelectorAll(`.nav-item[data-page="${pageId}"]`).forEach(n => n.classList.add("active"));

  // title
  document.getElementById("pageTitle").textContent = PAGE_TITLES[pageId] || pageId;

  // close mobile sidebar
  closeSidebar();
}

document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goTo(btn.dataset.page));
});

// "View all →" buttons inside dashboard cards
document.querySelectorAll(".text-btn[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goTo(btn.dataset.page));
});

/* ════════════════════════════════
   MOBILE SIDEBAR
════════════════════════════════ */
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("mobOverlay").classList.add("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("mobOverlay").classList.remove("open");
}

document.getElementById("burgerBtn").addEventListener("click", openSidebar);
document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
document.getElementById("mobOverlay").addEventListener("click", closeSidebar);

/* ════════════════════════════════
   TOP DATE
════════════════════════════════ */
function setDate() {
  const now = new Date();
  const opts = { weekday:"short", day:"numeric", month:"short", year:"numeric" };
  document.getElementById("topbarDate").textContent = now.toLocaleDateString("en-GB", opts);
}

/* ════════════════════════════════
   SETTINGS TOGGLES
════════════════════════════════ */
document.querySelectorAll(".toggle").forEach(tog => {
  tog.addEventListener("click", () => tog.classList.toggle("active"));
});

/* ════════════════════════════════
   RENDER: HOME STATS  (live API)
════════════════════════════════ */
async function renderHomeStats() {
  try {
    const res = await fetch(`${API}/orders?limit=1000&sort=newest`);
    if (!res.ok) throw new Error();
    const { orders, total } = await res.json();

    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const pending = orders.filter(o => o.status === 'Pending').length;

    document.getElementById('statRevenue').textContent = fmt(revenue);
    document.getElementById('statOrders').textContent  = total;
    document.getElementById('statPending').textContent = pending;

    document.getElementById('statRevenueDelta').textContent = `from ${total} order${total !== 1 ? 's' : ''}`;
    document.getElementById('statOrdersDelta').textContent  = `${pending} pending`;
    document.getElementById('statPendingDelta').textContent = pending > 0 ? '⚠ Needs attention' : '✓ All clear';
    document.getElementById('statPendingDelta').className   = 'stat-delta ' + (pending > 0 ? 'warn' : 'positive');

    const badge = document.getElementById('pendingBadge');
    badge.textContent    = pending;
    badge.style.display  = pending > 0 ? 'flex' : 'none';
  } catch {
    ['statRevenue','statOrders','statPending'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent === '—') el.textContent = '—';
    });
  }
}

/* ════════════════════════════════
   RENDER: LOW STOCK ALERT  (home)  — live API
   Counts products at or below the Low Stock threshold (<=5),
   which includes Out of Stock (0) — both need restocking.
════════════════════════════════ */
async function renderLowStockAlert() {
  try {
    const res = await fetch(`${API}/products`);
    if (!res.ok) throw new Error();
    const products = await res.json();

    const lowStockCount = products.filter(p => {
      const sizes = p.sizes || [];
      const total = p.sizeInventory && Object.keys(p.sizeInventory).length
        ? sizes.reduce((sum, size) => sum + (Number(p.sizeInventory[size]) || 0), 0)
        : (Number(p.stock) || 0);
      return total <= 5;
    }).length;

    document.getElementById('statLowStock').textContent = lowStockCount;
    document.getElementById('statLowStockDelta').textContent =
      lowStockCount > 0 ? '⚠ Needs restocking' : '✓ All stocked';
    document.getElementById('statLowStockDelta').className =
      'stat-delta ' + (lowStockCount > 0 ? 'warn' : 'positive');
    document.getElementById('statLowStockCard').classList.toggle('highlight', lowStockCount > 0);
  } catch {
    document.getElementById('statLowStock').textContent = '—';
  }
}

/* ════════════════════════════════
   RENDER: RECENT ORDERS (home)  — live API
════════════════════════════════ */
async function renderRecentOrders() {
  const tbody = document.getElementById('recentOrdersTbody');
  try {
    const res = await fetch(`${API}/orders?limit=5&sort=newest`);
    if (!res.ok) throw new Error();
    const { orders } = await res.json();

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--smoke);padding:20px;
        font-family:var(--mono);font-size:11px;">No orders yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td class="order-id">${o.orderNumber}</td>
        <td>${o.customer.name}</td>
        <td><span style="font-family:var(--mono);font-size:12px;">${fmt(o.total)}</span></td>
        <td>${statusBadge(o.status)}</td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--smoke);padding:20px;
      font-family:var(--mono);font-size:11px;">Server offline.</td></tr>`;
  }
}

/* ════════════════════════════════
   RENDER: TOP PRODUCTS (home)  — live API
════════════════════════════════ */
async function renderTopProducts() {
  const list = document.getElementById("topProductsList");
  try {
    const res      = await fetch(API + '/products?limit=5');
    if (!res.ok) throw new Error();
    const products = await res.json();
    if (!products.length) { list.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--smoke);">No products yet.</div>'; return; }
    list.innerHTML = products.map((p, i) => `
      <div class="top-product-row">
        <span class="tp-rank">${i + 1}</span>
        <img class="tp-img" src="${imgUrl(p.images && p.images[0])}" alt="${p.name}" loading="lazy"
             onerror="this.src='assests/images/product/logo.png'">
        <div class="tp-info">
          <div class="tp-name">${p.name}</div>
          <div class="tp-meta">${(p.colors || []).join(', ')} · ${p.category}</div>
        </div>
        <div class="tp-sales">${fmt(p.price)}</div>
      </div>`).join("");
  } catch {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--smoke);">Server offline.</div>';
  }
}

/* Add Product button */
document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));

/* ════════════════════════════════
   RENDER: ORDERS TABLE  (live API)
════════════════════════════════ */
const STATUS_OPTIONS = ['Pending', 'Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
const PAYMENT_BADGE  = { Unpaid:'badge-pending', Paid:'badge-confirmed' };

let currentOrderFilter = 'all';
let _orderSearchTimer  = null;

/* ── Build URLSearchParams from all active UI inputs ── */
function buildOrderParams() {
  const params = new URLSearchParams();

  /* Status chip */
  if (currentOrderFilter && currentOrderFilter !== 'all')
    params.set('status', currentOrderFilter);

  /* Search */
  const search = document.getElementById('orderSearch')?.value.trim();
  if (search) params.set('search', search);

  /* Payment status */
  const payment = document.getElementById('filterPaymentStatus')?.value;
  if (payment) params.set('paymentStatus', payment);

  /* City */
  const city = document.getElementById('filterCity')?.value.trim();
  if (city) params.set('city', city);

  /* Date range */
  const from = document.getElementById('filterDateFrom')?.value;
  const to   = document.getElementById('filterDateTo')?.value;
  if (from) params.set('dateFrom', from);
  if (to)   params.set('dateTo', to);

  /* Sort */
  const sort = document.getElementById('filterSort')?.value || 'newest';
  params.set('sort', sort);

  return params;
}

/* ── Update the result bar below the search input ── */
function updateResultBar(total, params) {
  const bar      = document.getElementById('ordersResultBar');
  const textEl   = document.getElementById('ordersResultText');
  const hasFilter = params.toString().replace('sort=newest','').replace(/&?sort=[^&]*/,'').trim() !== '';

  if (hasFilter) {
    bar.style.display = 'flex';
    textEl.textContent = `${total} order${total !== 1 ? 's' : ''} found`;
  } else {
    bar.style.display = 'none';
  }

  /* Show/hide the clear ✕ inside the search input */
  const searchVal = document.getElementById('orderSearch')?.value || '';
  const clearBtn  = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.opacity = searchVal ? '1' : '0';
}

/* ── Main render function ── */
async function renderOrders(newStatusFilter) {
  if (newStatusFilter !== undefined) currentOrderFilter = newStatusFilter;

  const tbody  = document.getElementById('ordersTbody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--smoke);
    padding:30px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;">Loading…</td></tr>`;

  const params = buildOrderParams();

  try {
    const res = await fetch(`${API}/orders?${params}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const { orders, total } = await res.json();

    updateResultBar(total, params);

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--smoke);
        padding:40px;font-family:var(--mono);font-size:12px;">No orders match your filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const itemsSummary = (o.items || [])
        .map(i => `${i.name} · ${i.size || '—'} ×${i.quantity}`).join(', ');
      const dateStr = new Date(o.createdAt).toLocaleDateString('en-GB',
        { day:'numeric', month:'short', year:'numeric' });
      const statusOpts = STATUS_OPTIONS
        .map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`)
        .join('');

      return `
        <tr data-order-id="${o._id}">
          <td class="order-id" data-label="Order">${o.orderNumber}</td>
          <td data-label="Customer">
            <div class="customer-cell">
              <div class="cust-av">${initials(o.customer.name)}</div>
              <div>
                <div class="cust-name">${o.customer.name}</div>
                <div class="cust-email">${o.customer.phone}</div>
                ${o.customer.city ? `<div class="cust-email" style="font-size:9.5px;">${o.customer.city}</div>` : ''}
              </div>
            </div>
          </td>
          <td data-label="Products" style="font-size:11px;color:var(--smoke);max-width:160px;white-space:normal;line-height:1.4;">${itemsSummary || '—'}</td>
          <td data-label="Total" style="font-family:var(--mono);font-size:12px;">${fmt(o.total)}</td>
          <td data-label="Status">${statusBadge(o.status)}</td>
          <td data-label="Payment"><span class="badge ${PAYMENT_BADGE[o.paymentStatus] || ''}">${o.paymentStatus || '—'}</span></td>
          <td data-label="Date" style="font-family:var(--mono);font-size:11px;color:var(--smoke);white-space:nowrap;">${dateStr}</td>
          <td data-label="Actions">
            <div class="order-actions-cell">
              <select class="status-select" onchange="quickUpdateStatus('${o._id}', this.value)" title="Quick status">
                ${statusOpts}
              </select>
              <button class="action-btn" onclick="openOrderDetail('${o._id}')">View</button>
              <button class="action-btn" onclick="openOrderModal('${o._id}')">Edit</button>
              <button class="action-btn del-btn" onclick="deleteOrderConfirm('${o._id}','${o.orderNumber}')">Del</button>
            </div>
          </td>
        </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--burgundy-light);
      padding:30px;font-family:var(--mono);font-size:12px;">⚠ Failed to load orders.
      <br><span style="color:var(--smoke);font-size:10px;">Please try again shortly.</span></td></tr>`;
    console.error('Orders fetch error:', err);
  }
}

/* ── Search input — 350 ms debounce ── */
document.getElementById('orderSearch').addEventListener('input', function () {
  clearTimeout(_orderSearchTimer);
  document.getElementById('searchClearBtn').style.opacity = this.value ? '1' : '0';
  _orderSearchTimer = setTimeout(() => renderOrders(), 350);
});

/* ── Clear search ✕ button ── */
document.getElementById('searchClearBtn').addEventListener('click', () => {
  document.getElementById('orderSearch').value = '';
  document.getElementById('searchClearBtn').style.opacity = '0';
  renderOrders();
});

/* ── Advanced filter controls ── */
['filterPaymentStatus', 'filterSort'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => renderOrders());
});
['filterCity'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    clearTimeout(_orderSearchTimer);
    _orderSearchTimer = setTimeout(() => renderOrders(), 400);
  });
});
['filterDateFrom', 'filterDateTo'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => renderOrders());
});

/* ── Reset all filters ── */
function resetOrderFilters() {
  document.getElementById('orderSearch').value          = '';
  document.getElementById('searchClearBtn').style.opacity = '0';
  document.getElementById('filterPaymentStatus').value  = '';
  document.getElementById('filterCity').value           = '';
  document.getElementById('filterDateFrom').value       = '';
  document.getElementById('filterDateTo').value         = '';
  document.getElementById('filterSort').value           = 'newest';
  document.getElementById('ordersResultBar').style.display = 'none';
  currentOrderFilter = 'all';
  document.querySelectorAll(".page[data-page='orders'] .chip")
    .forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
  renderOrders('all');
}
document.getElementById('clearAllFiltersBtn').addEventListener('click', resetOrderFilters);
document.getElementById('resultClearBtn').addEventListener('click', resetOrderFilters);

/* Quick status change from the inline dropdown */
async function quickUpdateStatus(id, status) {
  try {
    const res = await fetch(`${API}/orders/${id}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Server ' + res.status);
    showToast(`Status updated to ${status}.`);
    renderHomeStats();
    renderRecentOrders();
    /* Row stays in place — no full re-render to preserve UX */
    /* Update the badge in the cell to reflect the new status */
    const row = document.querySelector(`tr[data-order-id="${id}"]`);
    if (row) {
      const badgeCell = row.cells[4];
      if (badgeCell) badgeCell.innerHTML = statusBadge(status);
    }
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
    renderOrders(currentOrderFilter);
  }
}

/* Delete order with confirmation */
async function deleteOrderConfirm(id, orderNumber) {
  if (!confirm(`Delete order ${orderNumber}? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API}/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server ' + res.status);
    showToast(`Order ${orderNumber} deleted.`);
    renderOrders(currentOrderFilter);
    renderHomeStats();
    renderRecentOrders();
  } catch (err) {
    showToast('Failed to delete order: ' + err.message, 'error');
  }
}

/* Status filter chips on orders page */
document.querySelectorAll(".page[data-page='orders'] .chip").forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll(".page[data-page='orders'] .chip").forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderOrders(chip.dataset.filter);   /* 'all' or a specific status */
  });
});

/* ════════════════════════════════
   ORDER MODAL  (Create / Edit)
════════════════════════════════ */
function openOrderModal(orderId) {
  const overlay = document.getElementById('orderModalOverlay');
  const title   = document.getElementById('orderModalTitle');

  document.getElementById('orderForm').reset();
  document.getElementById('hiddenOrderId').value        = '';
  document.getElementById('orderItemsList').innerHTML   = '';
  document.getElementById('orderValidationMsg').textContent = '';
  document.getElementById('oTotal').value               = '';
  title.textContent = 'Create Order';

  if (orderId) {
    title.textContent = 'Edit Order';
    fetch(`${API}/orders/${orderId}`)
      .then(r => r.json())
      .then(o => {
        document.getElementById('hiddenOrderId').value  = o._id;
        document.getElementById('oName').value          = o.customer.name    || '';
        document.getElementById('oPhone').value         = o.customer.phone   || '';
        document.getElementById('oEmail').value         = o.customer.email   || '';
        document.getElementById('oCity').value          = o.customer.city    || '';
        document.getElementById('oAddress').value       = o.customer.address || '';
        document.getElementById('oShipping').value      = o.shippingFee      || 0;
        document.getElementById('oStatus').value        = o.status           || 'Pending';
        document.getElementById('oPaymentMethod').value = o.paymentMethod    || 'WhatsApp';
        document.getElementById('oNotes').value         = o.notes            || '';
        (o.items || []).forEach(item => addOrderItem(item));
        calcOrderTotal();
      })
      .catch(() => showToast('Failed to load order.', 'error'));
  } else {
    addOrderItem();   /* start with one blank row */
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOrderModal() {
  document.getElementById('orderModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* Add one item row to the form */
function addOrderItem(item = {}) {
  const list = document.getElementById('orderItemsList');
  const row  = document.createElement('div');
  row.className = 'order-item-row';
  row.innerHTML = `
    <input class="field-input" type="text"   data-field="name"     placeholder="Product name *" value="${item.name     || ''}" required>
    <input class="field-input" type="text"   data-field="color"    placeholder="Color"          value="${item.color    || ''}">
    <select class="field-input"              data-field="size">
      ${['XS','S','M','L','XL','XXL'].map(s =>
        `<option value="${s}" ${item.size === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <input class="field-input" type="number" data-field="price"    placeholder="Price *" value="${item.price    || ''}" min="0" required>
    <input class="field-input" type="number" data-field="quantity" placeholder="Qty"     value="${item.quantity || 1}"  min="1" required>
    <button type="button" class="remove-item-btn" title="Remove">✕</button>`;

  row.querySelector('.remove-item-btn').addEventListener('click', () => { row.remove(); calcOrderTotal(); });
  row.querySelectorAll('[data-field="price"],[data-field="quantity"]')
     .forEach(inp => inp.addEventListener('input', calcOrderTotal));

  list.appendChild(row);
  calcOrderTotal();
}

/* Auto-calculate total from item rows + shipping */
function calcOrderTotal() {
  let subtotal = 0;
  document.querySelectorAll('#orderItemsList .order-item-row').forEach(row => {
    const price = parseFloat(row.querySelector('[data-field="price"]').value)    || 0;
    const qty   = parseInt(row.querySelector('[data-field="quantity"]').value)   || 0;
    subtotal += price * qty;
  });
  const shipping = parseFloat(document.getElementById('oShipping').value) || 0;
  document.getElementById('oTotal').value = 'LE ' + (subtotal + shipping).toFixed(2);
}

/* Collect item rows into an array for the API payload */
function collectOrderItems() {
  const items = [];
  document.querySelectorAll('#orderItemsList .order-item-row').forEach(row => {
    const name     = row.querySelector('[data-field="name"]').value.trim();
    const color    = row.querySelector('[data-field="color"]').value.trim();
    const size     = row.querySelector('[data-field="size"]').value;
    const price    = parseFloat(row.querySelector('[data-field="price"]').value)  || 0;
    const quantity = parseInt(row.querySelector('[data-field="quantity"]').value) || 1;
    if (name) items.push({ name, color, size, price, quantity });
  });
  return items;
}

document.getElementById('addOrderItemBtn').addEventListener('click', () => addOrderItem());
document.getElementById('oShipping').addEventListener('input', calcOrderTotal);

/* Form submit — POST (create) or PUT (edit) */
document.getElementById('orderForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const validationMsg = document.getElementById('orderValidationMsg');
  validationMsg.textContent = '';

  const name  = document.getElementById('oName').value.trim();
  const phone = document.getElementById('oPhone').value.trim();
  const items = collectOrderItems();

  if (!name)         { validationMsg.textContent = 'Customer name is required.';       return; }
  if (!phone)        { validationMsg.textContent = 'Customer phone is required.';      return; }
  if (!items.length) { validationMsg.textContent = 'Add at least one item.';           return; }

  const submitBtn = document.getElementById('orderModalSubmitBtn');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  const shipping = parseFloat(document.getElementById('oShipping').value) || 0;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const id       = document.getElementById('hiddenOrderId').value;

  const payload = {
    customer: {
      name,
      phone,
      email:   document.getElementById('oEmail').value.trim(),
      city:    document.getElementById('oCity').value.trim(),
      address: document.getElementById('oAddress').value.trim(),
    },
    items,
    subtotal,
    shippingFee:   shipping,
    total:         subtotal + shipping,
    status:        document.getElementById('oStatus').value,
    paymentMethod: document.getElementById('oPaymentMethod').value,
    notes:         document.getElementById('oNotes').value.trim(),
    source:        id ? undefined : 'dashboard',
  };

  try {
    const url    = id ? `${API}/orders/${id}` : `${API}/orders`;
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Server error'); }

    closeOrderModal();
    showToast(id ? 'Order updated.' : 'Order created.');
    renderOrders(currentOrderFilter);
    renderHomeStats();
    renderRecentOrders();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Save Order';
  }
});

/* Modal close handlers */
document.getElementById('orderModalOverlay').addEventListener('click', function (e) { if (e.target === this) closeOrderModal(); });
document.getElementById('orderModalClose').addEventListener('click',     closeOrderModal);
document.getElementById('orderModalCancelBtn').addEventListener('click', closeOrderModal);

/* Create Order button */
document.getElementById('createOrderBtn').addEventListener('click', () => openOrderModal(null));

/* ════════════════════════════════
   RENDER: PRODUCTS GRID  (live API)
════════════════════════════════ */
async function renderProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;font-family:var(--mono);font-size:12px;color:var(--smoke);">Loading products…</div>`;
  try {
    const res      = await fetch(API + '/products');
    if (!res.ok) throw new Error('Server ' + res.status);
    const products = await res.json();
    if (!products.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;font-family:var(--mono);font-size:12px;color:var(--smoke);">No products yet. Add your first product above.</div>`;
      return;
    }
    grid.innerHTML = products.map(p => {
      const src    = imgUrl(p.images && p.images[0]);
      const colors = (p.colors || []).join(', ');
      const cat    = p.category === 'Boxy' ? 'Boxy Tee' : p.category;
      const sizeInventory = p.sizeInventory && Object.keys(p.sizeInventory).length ? p.sizeInventory : null;
      const stock  = sizeInventory
        ? (p.sizes || []).reduce((sum, size) => sum + (Number(sizeInventory[size]) || 0), 0)
        : (Number(p.stock) || 0);
      const sizeBreakdown = sizeInventory
        ? (p.sizes || []).map(size => {
            const qty = Number(sizeInventory[size]) || 0;
            return `<span class="pa-size-chip${qty === 0 ? ' is-empty' : ''}">${size}<b>${qty}</b></span>`;
          }).join('')
        : '';
      return `
        <div class="product-admin-card" data-id="${p._id}">
          <div class="pa-img"><img src="${src}" alt="${p.name}" loading="lazy" onerror="this.src='assests/images/product/logo.png'"></div>
          <div class="pa-info">
            <div class="pa-name">${p.name}</div>
            <div class="pa-meta">${colors} · ${cat}</div>
            <div class="pa-stock">
              <span class="pa-stock-qty">Stock: ${stock}</span>
              ${stockBadge(stock)}
            </div>
            ${sizeBreakdown ? `<div class="pa-size-breakdown" aria-label="Inventory by size">${sizeBreakdown}</div>` : ''}
            <div class="pa-foot">
              <span class="pa-price">${fmt(p.price)}</span>
              <div style="display:flex;gap:6px;">
                <button class="action-btn" onclick="openProductModal('${p._id}')">Edit</button>
                <button class="action-btn del-btn" onclick="deleteProduct('${p._id}')">Delete</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;font-family:var(--mono);font-size:12px;color:var(--burgundy-light);">
      ⚠ Failed to load products.<br><span style="color:var(--smoke);font-size:10px;">Please try again shortly.</span>
    </div>`;
    console.error('Products fetch error:', err);
  }
}

/* ════════════════════════════════
   DELETE PRODUCT
════════════════════════════════ */
async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    const res = await fetch(API + '/products/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server ' + res.status);
    showToast('Product deleted.');
    renderProducts();
    renderTopProducts();
    renderLowStockAlert();
  } catch (err) {
    alert('Failed to delete product: ' + err.message);
  }
}

/* ════════════════════════════════
   PRODUCT MODAL  (Add / Edit)
════════════════════════════════ */
function renderSizeInventoryFields(inventory = {}, fallbackStock = 0) {
  const container = document.getElementById('sizeInventoryFields');
  if (!container) return;
  const selected = [...document.querySelectorAll('#sizeChecks input:checked')].map(cb => cb.value);
  container.innerHTML = selected.map(size => {
    const value = inventory[size] !== undefined ? inventory[size] : fallbackStock;
    const qty = Number(value) || 0;
    return `<label class="field-label size-stock-field${qty === 0 ? ' is-empty' : ''}" style="font-size:10px;">${size}<input class="field-input size-stock-input" data-size="${size}" type="number" min="0" step="1" value="${qty}"></label>`;
  }).join('');
  container.querySelectorAll('.size-stock-input').forEach(input => {
    input.addEventListener('input', () => {
      input.closest('.size-stock-field')?.classList.toggle('is-empty', Number(input.value) <= 0);
    });
  });
}

document.querySelectorAll('#sizeChecks input').forEach(cb => cb.addEventListener('change', () => renderSizeInventoryFields()));
renderSizeInventoryFields();

function openProductModal(productId) {
  const overlay = document.getElementById('productModalOverlay');
  const title   = document.getElementById('modalTitle');
  const form    = document.getElementById('productForm');

  form.reset();
  document.getElementById('hiddenProductId').value = '';
  document.getElementById('imgPreview').innerHTML = '';
  document.getElementById('existingImages').innerHTML = '';
  renderSizeInventoryFields({}, document.getElementById('pStock').value || 0);
  title.textContent = '+ Add Product';

  if (productId) {
    title.textContent = 'Edit Product';
    fetch(API + '/products/' + productId)
      .then(r => r.json())
      .then(p => {
        document.getElementById('hiddenProductId').value = p._id;
        document.getElementById('pName').value       = p.name        || '';
        document.getElementById('pDesc').value       = p.description || '';
        document.getElementById('pPrice').value      = p.price       || '';
        document.getElementById('pCategory').value   = p.category    || 'Tee';
        document.getElementById('pCollection').value = p.collection  || "SS'26";
        document.getElementById('pStock').value      = p.stock       || 0;
        /* sizes */
        document.querySelectorAll('#sizeChecks input').forEach(cb => {
          cb.checked = p.sizes && p.sizes.includes(cb.value);
        });
        renderSizeInventoryFields(p.sizeInventory || {}, p.stock || 0);
        /* colors */
        document.querySelectorAll('#colorChecks input').forEach(cb => {
          cb.checked = p.colors && p.colors.includes(cb.value);
        });
        /* show existing images */
        if (p.images && p.images.length) {
          document.getElementById('existingImages').innerHTML = `
            <div class="field-label" style="margin-top:10px;">Current Images</div>
            <div class="existing-img-row">
              ${p.images.map(f => `
                <div class="existing-img-item">
                  <img src="${imgUrl(f)}" alt="">
                  <button type="button" class="remove-img-btn" onclick="markImageForRemoval(this,'${f}')">✕</button>
                  <input type="hidden" name="keepImages" value="${f}">
                </div>`).join('')}
            </div>`;
        }
      })
      .catch(() => alert('Failed to load product data.'));
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  document.getElementById('productModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function markImageForRemoval(btn, filename) {
  const item = btn.closest('.existing-img-item');
  item.style.opacity = '.3';
  item.querySelector('input[name="keepImages"]').disabled = true;
  /* Add hidden input to signal removal */
  const inp = document.createElement('input');
  inp.type  = 'hidden';
  inp.name  = 'removeImages';
  inp.value = filename;
  item.appendChild(inp);
  btn.textContent = '↩';
  btn.onclick = () => {
    item.style.opacity = '1';
    item.querySelector('input[name="keepImages"]').disabled = false;
    item.removeChild(inp);
    btn.textContent = '✕';
    btn.onclick = () => markImageForRemoval(btn, filename);
  };
}

/* Image preview on file select */
document.getElementById('pImages').addEventListener('change', function () {
  const preview = document.getElementById('imgPreview');
  preview.innerHTML = '';
  Array.from(this.files).forEach(file => {
    const url = URL.createObjectURL(file);
    preview.innerHTML += `<img src="${url}" alt="${file.name}" class="img-thumb">`;
  });
});

/* Form submit — Add or Edit */
document.getElementById('productForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  /* ── Client-side validation ── */
  const validationMsg = document.getElementById('validationMsg');
  validationMsg.textContent = '';

  const name   = document.getElementById('pName').value.trim();
  const price  = document.getElementById('pPrice').value;
  const colorsCheck = [...document.querySelectorAll('#colorChecks input:checked')];

  if (!name)         { validationMsg.textContent = 'Product name is required.';       return; }
  if (!price || Number(price) < 0) { validationMsg.textContent = 'A valid price is required.'; return; }
  if (!colorsCheck.length){ validationMsg.textContent = 'Select at least one color.';       return; }

  const submitBtn = document.getElementById('modalSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  const id     = document.getElementById('hiddenProductId').value;
  const fd     = new FormData();
  fd.append('name',        document.getElementById('pName').value.trim());
  fd.append('description', document.getElementById('pDesc').value.trim());
  fd.append('price',       document.getElementById('pPrice').value);
  fd.append('category',    document.getElementById('pCategory').value);
  fd.append('collection',  document.getElementById('pCollection').value.trim());
    fd.append('stock',       document.getElementById('pStock').value);
  const sizeInventory = {};
  document.querySelectorAll('.size-stock-input').forEach(input => {
    sizeInventory[input.dataset.size] = Math.max(0, Math.floor(Number(input.value) || 0));
  });
  fd.append('sizeInventory', JSON.stringify(sizeInventory));
  /* sizes */
  const sizes = [...document.querySelectorAll('#sizeChecks input:checked')].map(cb => cb.value);
  fd.append('sizes', JSON.stringify(sizes));

  /* colors */
  const colors = [...document.querySelectorAll('#colorChecks input:checked')].map(cb => cb.value);
  fd.append('colors', JSON.stringify(colors));

  /* images to remove (edit mode) */
  document.querySelectorAll('input[name="removeImages"]').forEach(inp => {
    fd.append('removeImages', inp.value);
  });

  /* new image files */
  const files = document.getElementById('pImages').files;
  for (const file of files) fd.append('images', file);

  try {
    const url    = id ? API + '/products/' + id : API + '/products';
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, body: fd });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Server error');
    }
    closeProductModal();
    showToast(id ? 'Product updated successfully.' : 'Product added successfully.');
    renderProducts();
    renderTopProducts();
    renderLowStockAlert();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Product';
  }
});

/* Close modal on overlay click */
document.getElementById('productModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeProductModal();
});
document.getElementById('modalClose').addEventListener('click', closeProductModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeProductModal);

/* ════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.className    = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ════════════════════════════════
   DRAG & DROP on upload zone
════════════════════════════════ */
(function () {
  const zone    = document.getElementById('uploadZone');
  const input   = document.getElementById('pImages');
  if (!zone || !input) return;

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    /* Assign dropped files to the input via DataTransfer */
    const dt = new DataTransfer();
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
})();

/* ════════════════════════════════
   RENDER: CUSTOMERS TABLE  (live API)
════════════════════════════════ */
let customersCache = [];

async function renderCustomers(query) {
  const tbody = document.getElementById("customersTbody");

  /* Fetch only on first call — cache for search-filter re-renders,
     same pattern as productsCache in script.js */
  if (!customersCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;font-family:var(--mono);font-size:12px;color:var(--smoke);">Loading customers…</td></tr>`;
    try {
      const res = await fetch(`${API}/customers`);
      if (!res.ok) throw new Error('Server ' + res.status);
      customersCache = await res.json();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;font-family:var(--mono);font-size:12px;color:var(--burgundy-light);">⚠ Failed to load customers.</td></tr>`;
      console.error('Customers fetch error:', err);
      return;
    }
  }

  const list = query
    ? customersCache.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.phone || '').includes(query))
    : customersCache;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;font-family:var(--mono);font-size:12px;color:var(--smoke);">No customers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td data-label="Customer">
        <div class="customer-cell">
          <div class="cust-av">${initials(c.name)}</div>
          <div class="cust-name">${c.name}</div>
        </div>
      </td>
      <td data-label="Email" class="cust-email">${c.email || '—'}</td>
      <td data-label="Phone" style="font-family:var(--mono);font-size:11px;color:var(--smoke);">${c.phone}</td>
      <td data-label="Orders" style="font-family:var(--mono);font-size:12px;text-align:center;">${c.totalOrders}</td>
      <td data-label="Total Spent" style="font-family:var(--mono);font-size:12px;">${fmt(c.totalSpent)}</td>
      <td data-label="Joined" style="font-family:var(--mono);font-size:11px;color:var(--smoke);">${new Date(c.joinedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</td>
    </tr>`).join("");
}

document.getElementById("customerSearch").addEventListener("input", function() {
  renderCustomers(this.value.trim());
});

/* ════════════════════════════════
   RENDER: COUPONS TABLE  (live API)
════════════════════════════════ */
let _couponSearchTimer = null;

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function renderCoupons() {
  const tbody = document.getElementById("couponsTbody");
  const search = document.getElementById('couponSearch')?.value.trim() || '';
  const sort   = document.getElementById('couponSort')?.value || 'newest';

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;
    font-family:var(--mono);font-size:12px;color:var(--smoke);">Loading coupons…</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sort)   params.set('sort', sort);

    const res = await fetch(`${API}/coupons?${params.toString()}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const coupons = await res.json();

    if (!coupons.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;
        font-family:var(--mono);font-size:12px;color:var(--smoke);">No coupons found.</td></tr>`;
      return;
    }

    const now = Date.now();

    tbody.innerHTML = coupons.map(c => {
      const expired    = new Date(c.expiryDate).getTime() < now;
      const isActive   = c.active && !expired;
      const remaining  = c.usageLimit > 0 ? Math.max(0, c.usageLimit - c.usedCount) : '∞';
      const discountLabel = c.discountType === 'percentage'
        ? `${c.discountValue}%`
        : `${fmt(c.discountValue)}`;

      let statusLabel = 'Active';
      let statusClass = 'badge-active';
      if (expired)       { statusLabel = 'Expired';  statusClass = 'badge-inactive'; }
      else if (!c.active) { statusLabel = 'Inactive'; statusClass = 'badge-inactive'; }

      return `
        <tr>
          <td data-label="Code" style="font-family:var(--mono);font-size:13px;letter-spacing:.06em;">${c.code}</td>
          <td data-label="Discount" style="font-family:var(--mono);font-size:13px;">${discountLabel}</td>
          <td data-label="Min. Order" style="font-family:var(--mono);font-size:12px;color:var(--smoke);">${c.minimumOrderAmount > 0 ? fmt(c.minimumOrderAmount) : '—'}</td>
          <td data-label="Expires" style="font-family:var(--mono);font-size:11px;color:var(--smoke);">${fmtDate(c.expiryDate)}</td>
          <td data-label="Used" style="font-family:var(--mono);font-size:12px;">${c.usedCount}${c.usageLimit > 0 ? ' / ' + c.usageLimit : ''}</td>
          <td data-label="Remaining" style="font-family:var(--mono);font-size:12px;color:var(--smoke);">${remaining}</td>
          <td data-label="Status"><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td data-label="Actions">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="action-btn" onclick="openCouponModal('${c._id}')">Edit</button>
              <button class="action-btn" onclick="toggleCouponActive('${c._id}', ${c.active})">${c.active ? 'Deactivate' : 'Activate'}</button>
              <button class="action-btn del-btn" onclick="deleteCoupon('${c._id}', '${c.code}')">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--burgundy-light);
      padding:30px;font-family:var(--mono);font-size:12px;">⚠ Failed to load coupons.
      <br><span style="color:var(--smoke);font-size:10px;">Please try again shortly.</span></td></tr>`;
    console.error('Coupons fetch error:', err);
  }
}

document.getElementById('couponSearch').addEventListener('input', function () {
  clearTimeout(_couponSearchTimer);
  _couponSearchTimer = setTimeout(() => renderCoupons(), 350);
});
document.getElementById('couponSort').addEventListener('change', () => renderCoupons());
document.getElementById('addCouponBtn').addEventListener('click', () => openCouponModal(null));

/* ════════════════════════════════
   RENDER: REVIEWS TABLE  (live API)
════════════════════════════════ */
let _reviewSearchTimer = null;
let _reviewProductOptionsLoaded = false;

/** Populates the "All Products" filter dropdown once, from the existing Products API. */
async function loadReviewProductFilter() {
  if (_reviewProductOptionsLoaded) return;
  try {
    const res = await fetch(`${API}/products`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const products = await res.json();
    const select = document.getElementById('reviewProductFilter');
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p._id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    _reviewProductOptionsLoaded = true;
  } catch (err) {
    console.error('Failed to load product filter options:', err);
  }
}

async function renderReviews() {
  const tbody     = document.getElementById("reviewsTbody");
  const search    = document.getElementById('reviewSearch')?.value.trim() || '';
  const productId = document.getElementById('reviewProductFilter')?.value || '';
  const status    = document.getElementById('reviewStatusFilter')?.value || '';

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;
    font-family:var(--mono);font-size:12px;color:var(--smoke);">Loading reviews…</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (search)    params.set('search', search);
    if (productId) params.set('productId', productId);
    if (status)    params.set('status', status);
    params.set('sort', 'newest');

    const res  = await fetch(`${API}/reviews?${params.toString()}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const data = await res.json();
    const reviews = data.reviews || [];

    updateReviewsPendingBadge(reviews);

    if (!reviews.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;
        font-family:var(--mono);font-size:12px;color:var(--smoke);">No reviews found.</td></tr>`;
      return;
    }

    const statusBadgeClass = { pending: 'badge-pending', approved: 'badge-confirmed', rejected: 'badge-cancelled' };

    tbody.innerHTML = reviews.map(r => {
      const snippet = r.text.length > 70 ? r.text.slice(0, 70) + '…' : r.text;
      const reviewStatus = r.status || 'approved'; // legacy safety net — see migrateReviewStatus.js
      const safeName = r.customerName.replace(/'/g, "\\'");

      let actions = '';
      if (reviewStatus === 'pending') {
        actions = `
          <button class="action-btn" onclick="approveReview('${r._id}')">Approve</button>
          <button class="action-btn del-btn" onclick="rejectReview('${r._id}', '${safeName}')">Reject</button>`;
      } else {
        actions = `<button class="action-btn del-btn" onclick="deleteReview('${r._id}', '${safeName}')">Delete</button>`;
      }

      return `
        <tr>
          <td data-label="Reviewer" style="font-size:13px;">${r.customerName}</td>
          <td data-label="Rating" style="font-family:var(--mono);font-size:12px;color:var(--burgundy-light);">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
          <td data-label="Product" style="font-family:var(--mono);font-size:12px;color:var(--smoke);">${r.productName}</td>
          <td data-label="Review" style="font-size:12.5px;color:var(--smoke);max-width:260px;">${snippet}</td>
          <td data-label="Status"><span class="badge ${statusBadgeClass[reviewStatus] || ''}">${reviewStatus.toUpperCase()}</span></td>
          <td data-label="Verified"><span class="badge ${r.verified ? 'badge-active' : 'badge-inactive'}">${r.verified ? 'Verified' : 'Unverified'}</span></td>
          <td data-label="Date" style="font-family:var(--mono);font-size:11px;color:var(--smoke);">${fmtDate(r.createdAt)}</td>
          <td data-label="Actions" style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--burgundy-light);
      padding:30px;font-family:var(--mono);font-size:12px;">⚠ Failed to load reviews.
      <br><span style="color:var(--smoke);font-size:10px;">Please try again shortly.</span></td></tr>`;
    console.error('Reviews fetch error:', err);
  }
}

/** Keeps the sidebar's Reviews pending-count badge in sync with the currently-loaded page of reviews. */
function updateReviewsPendingBadge(reviews) {
  fetch(`${API}/reviews?status=pending`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      const count = data?.reviews?.length ?? 0;
      const badge = document.getElementById('reviewsPendingBadge');
      if (!badge) return;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    })
    .catch(() => {}); // non-critical — badge just won't update this cycle
}

async function approveReview(id) {
  try {
    const res = await fetch(`${API}/reviews/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Server error');
    }
    showToast('Review approved — now visible on the storefront.');
    renderReviews();
  } catch (err) {
    showToast('Failed to approve review: ' + err.message, 'error');
  }
}

async function rejectReview(id, customerName) {
  if (!confirm(`Reject the review from "${customerName}"? It will be hidden from the public store.`)) return;
  try {
    const res = await fetch(`${API}/reviews/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Server error');
    }
    showToast('Review rejected.');
    renderReviews();
  } catch (err) {
    showToast('Failed to reject review: ' + err.message, 'error');
  }
}

async function deleteReview(id, customerName) {
  if (!confirm(`Delete the review from "${customerName}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API}/reviews/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Server error');
    }
    showToast('Review deleted.');
    renderReviews();
  } catch (err) {
    showToast('Failed to delete review: ' + err.message, 'error');
  }
}

document.getElementById('reviewSearch').addEventListener('input', function () {
  clearTimeout(_reviewSearchTimer);
  _reviewSearchTimer = setTimeout(() => renderReviews(), 350);
});
document.getElementById('reviewProductFilter').addEventListener('change', () => renderReviews());
document.getElementById('reviewStatusFilter').addEventListener('change', () => renderReviews());

/* ════════════════════════════════
   TOGGLE / DELETE COUPON
════════════════════════════════ */
async function toggleCouponActive(id, currentlyActive) {
  try {
    const res = await fetch(`${API}/coupons/${id}/status`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ active: !currentlyActive }),
    });
    if (!res.ok) throw new Error('Server ' + res.status);
    showToast(currentlyActive ? 'Coupon deactivated.' : 'Coupon activated.');
    renderCoupons();
  } catch (err) {
    showToast('Failed to update coupon: ' + err.message, 'error');
  }
}

async function deleteCoupon(id, code) {
  if (!confirm(`Delete coupon "${code}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API}/coupons/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server ' + res.status);
    showToast('Coupon deleted.');
    renderCoupons();
  } catch (err) {
    showToast('Failed to delete coupon: ' + err.message, 'error');
  }
}

/* ════════════════════════════════
   COUPON MODAL  (Add / Edit)
════════════════════════════════ */
function openCouponModal(couponId) {
  const overlay = document.getElementById('couponModalOverlay');
  const title   = document.getElementById('couponModalTitle');
  const form    = document.getElementById('couponForm');

  form.reset();
  document.getElementById('hiddenCouponId').value = '';
  document.getElementById('couponValidationMsg').textContent = '';
  document.getElementById('cMinOrder').value    = 0;
  document.getElementById('cMaxDiscount').value = 0;
  document.getElementById('cUsageLimit').value  = 0;
  document.getElementById('cActive').value      = 'true';

  if (couponId) {
    title.textContent = 'Edit Coupon';
    fetch(`${API}/coupons/${couponId}`)
      .then(res => res.json())
      .then(c => {
        document.getElementById('hiddenCouponId').value = c._id;
        document.getElementById('cCode').value           = c.code;
        document.getElementById('cDiscountType').value   = c.discountType;
        document.getElementById('cDiscountValue').value  = c.discountValue;
        document.getElementById('cMinOrder').value       = c.minimumOrderAmount || 0;
        document.getElementById('cMaxDiscount').value    = c.maximumDiscount || 0;
        document.getElementById('cExpiryDate').value     = c.expiryDate ? c.expiryDate.slice(0, 10) : '';
        document.getElementById('cUsageLimit').value     = c.usageLimit || 0;
        document.getElementById('cActive').value         = String(!!c.active);
      })
      .catch(() => showToast('Failed to load coupon.', 'error'));
  } else {
    title.textContent = 'Create Coupon';
  }

  overlay.classList.add('open');
}

function closeCouponModal() {
  document.getElementById('couponModalOverlay').classList.remove('open');
}

document.getElementById('couponForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const validationMsg = document.getElementById('couponValidationMsg');
  validationMsg.textContent = '';

  const code          = document.getElementById('cCode').value.trim();
  const discountType  = document.getElementById('cDiscountType').value;
  const discountValue = parseFloat(document.getElementById('cDiscountValue').value);
  const expiryDate    = document.getElementById('cExpiryDate').value;

  if (!code)                          { validationMsg.textContent = 'Coupon code is required.';    return; }
  if (isNaN(discountValue) || discountValue < 0) { validationMsg.textContent = 'Enter a valid discount value.'; return; }
  if (!expiryDate)                    { validationMsg.textContent = 'Expiry date is required.';     return; }

  const submitBtn = document.getElementById('couponModalSubmitBtn');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  const id = document.getElementById('hiddenCouponId').value;

  const payload = {
    code,
    discountType,
    discountValue,
    minimumOrderAmount: parseFloat(document.getElementById('cMinOrder').value)    || 0,
    maximumDiscount:    parseFloat(document.getElementById('cMaxDiscount').value) || 0,
    expiryDate,
    usageLimit:         parseInt(document.getElementById('cUsageLimit').value, 10) || 0,
    active:             document.getElementById('cActive').value === 'true',
  };

  try {
    const url    = id ? `${API}/coupons/${id}` : `${API}/coupons`;
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Server error'); }

    closeCouponModal();
    showToast(id ? 'Coupon updated.' : 'Coupon created.');
    renderCoupons();
  } catch (err) {
    validationMsg.textContent = err.message;
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Save Coupon';
  }
});

document.getElementById('couponModalOverlay').addEventListener('click', function (e) { if (e.target === this) closeCouponModal(); });
document.getElementById('couponModalClose').addEventListener('click',     closeCouponModal);
document.getElementById('couponModalCancelBtn').addEventListener('click', closeCouponModal);

/* ════════════════════════════════
   RENDER: ANALYTICS CHARTS
════════════════════════════════ */
function renderBarChart(containerId, data, valueKey, labelKey, prefix) {
  const container = document.getElementById(containerId);
  const max = Math.max(...data.map(d => d[valueKey]), 0);
  container.innerHTML = data.map(d => {
    const pct = max > 0 ? Math.round((d[valueKey] / max) * 100) : 0;
    const label = prefix ? prefix + d[valueKey].toLocaleString() : d[valueKey];
    return `
      <div class="bar-col">
        <div class="bar-val">${label}</div>
        <div class="bar-fill" style="height:${pct}%"></div>
        <div class="bar-label">${d[labelKey]}</div>
      </div>`;
  }).join("");
}

function renderHorizontalChart(containerId, data) {
  const container = document.getElementById(containerId);
  container.innerHTML = data.map(d => `
    <div class="bar-col">
      <div class="bar-label">${d.size}</div>
      <div class="bar-fill" style="--pct:${d.pct}%; width:${d.pct}%"></div>
      <div class="bar-val">${d.pct}%</div>
    </div>`).join("");
}

function renderColorChart(data) {
  const container = document.getElementById("colorChart");
  if (!data.length) {
    container.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--smoke);">No sales yet.</div>';
    return;
  }
  container.innerHTML = data.map(c => {
    const hex = COLOR_HEX[c.color] || '#888';
    return `
    <div class="donut-row">
      <div class="donut-swatch" style="background:${hex}; border:1px solid var(--line);"></div>
      <div class="donut-label">${c.color}</div>
      <div class="donut-bar-wrap">
        <div class="donut-bar" style="width:${c.pct}%; background:${hex === "#1a1a1a" ? "var(--bone)" : hex};"></div>
      </div>
      <div class="donut-pct">${c.pct}%</div>
    </div>`;
  }).join("");
}

/* ════════════════════════════════
   RENDER: ANALYTICS PAGE  (live API)
   Fetches /api/analytics once and feeds every chart + stat card
   on the Analytics page with real, backend-computed numbers.
════════════════════════════════ */
async function renderAnalytics() {
  const setStat = (id, deltaId, value, deltaText, deltaClass) => {
    const valEl   = document.getElementById(id);
    const deltaEl = document.getElementById(deltaId);
    if (valEl)   valEl.textContent = value;
    if (deltaEl) {
      deltaEl.textContent = deltaText;
      deltaEl.className   = 'stat-delta' + (deltaClass ? ' ' + deltaClass : '');
    }
  };

  try {
    const res = await fetch(`${API}/analytics`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const a = await res.json();

    /* ── Stat cards ── */
    setStat('statAvgOrder', 'statAvgOrderDelta', fmt(a.avgOrderValue), `from ${a.totalOrders} order${a.totalOrders !== 1 ? 's' : ''}`, 'positive');

    setStat('statTotalOrders', 'statTotalOrdersDelta',
      a.totalOrders, 'All-time', '');

    setStat('statWebsiteVisitors', 'statWebsiteVisitorsDelta',
      a.websiteVisitors, 'Unique visitors', 'positive');

    setStat('statCartAbandon', 'statCartAbandonDelta',
      a.cartAbandonment.value !== null ? a.cartAbandonment.value + '%' : a.cartAbandonment.note,
      a.cartAbandonment.value !== null ? '' : 'Tracking not available yet', '');

    /* ── Charts (same rendering functions, real data) ── */
    renderBarChart('revenueChart', a.revenueLast7Days, 'val', 'day', '');
    renderBarChart('ordersChart',  a.ordersPerDay,      'val', 'day', '');
    renderHorizontalChart('sizesChart', a.bestSellingSizes);
    renderColorChart(a.salesByColor);
  } catch (err) {
    console.error('Analytics fetch error:', err);
    ['statAvgOrder','statTotalOrders','statWebsiteVisitors','statCartAbandon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }
}

/* Pending badge is now updated by renderHomeStats() */

/* ════════════════════════════════
   CONTENT MANAGEMENT PAGE (live API)
   Reusable list+edit pattern: as future phases add Shipping/Privacy/
   Terms/Contact policies (via seedPolicies.js), they appear in this
   same table automatically — no dashboard changes needed per page.
════════════════════════════════ */
let _currentEditSlug = null;

async function renderPolicyList() {
  const tbody = document.getElementById('policyTableBody');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;
    font-family:var(--mono);font-size:12px;color:var(--smoke);">Loading policy pages…</td></tr>`;

  try {
    const res = await fetch(`${API}/policies`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const policies = await res.json();

    if (!policies.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;
        font-family:var(--mono);font-size:12px;color:var(--smoke);">No policy pages found.</td></tr>`;
      return;
    }

    tbody.innerHTML = policies.map(p => `
      <tr>
        <td>${p.title}</td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--smoke);">${p.slug}</td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--smoke);">${fmtDate(p.updatedAt)}</td>
        <td><button class="action-btn" onclick="openPolicyEditor('${p.slug}')">Edit</button></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--burgundy-light);
      padding:30px;font-family:var(--mono);font-size:12px;">⚠ Failed to load policy pages.
      <br><span style="color:var(--smoke);font-size:10px;">Please try again shortly.</span></td></tr>`;
    console.error('Policies fetch error:', err);
  }
}

async function openPolicyEditor(slug) {
  _currentEditSlug = slug;
  goTo('content-edit');

  const titleInput   = document.getElementById('policyEditTitle');
  const contentInput = document.getElementById('policyEditContent');
  titleInput.value = '';
  contentInput.value = '';

  try {
    const res = await fetch(`${API}/policies/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const policy = await res.json();

    document.getElementById('policyEditHeading').textContent = `Edit — ${policy.title}`;
    titleInput.value = policy.title;
    contentInput.value = policy.content;
  } catch (err) {
    showToast('Failed to load policy page.', 'error');
    console.error('Policy fetch error:', err);
  }
}

async function savePolicy() {
  if (!_currentEditSlug) return;
  const btn = document.getElementById('policySaveBtn');

  const title   = document.getElementById('policyEditTitle').value.trim();
  const content = document.getElementById('policyEditContent').value.trim();

  if (!title)   return showToast('Title cannot be empty.', 'error');
  if (!content) return showToast('Content cannot be empty.', 'error');

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/policies/${encodeURIComponent(_currentEditSlug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Server error');

    showToast('Policy page saved successfully.');
    renderPolicyList();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
document.getElementById('policySaveBtn').addEventListener('click', savePolicy);
document.getElementById('policyBackBtn').addEventListener('click', () => goTo('content'));

/* ════════════════════════════════
   SETTINGS PAGE  (live API)
════════════════════════════════ */

/* Mirrors the backend's own validation, for instant feedback before the request goes out */
const SETTINGS_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SETTINGS_PHONE_RE = /^\+?[\d\s-]{8,20}$/;

async function renderSettings() {
  try {
    const [settingsRes, adminRes] = await Promise.all([
      fetch(`${API}/settings`),
      fetch(`${API}/admin`),
    ]);
    if (!settingsRes.ok || !adminRes.ok) throw new Error('Server error');

    const settings = await settingsRes.json();
    const admin    = await adminRes.json();

    document.getElementById('setStoreName').value  = settings.storeName || '';
    document.getElementById('setStoreEmail').value = settings.storeEmail || '';
    document.getElementById('setWhatsapp').value    = settings.whatsappNumber || '';
    document.getElementById('setInstagram').value   = settings.instagramHandle || '';
    document.getElementById('setDescription').value = settings.storeDescription || '';
    document.getElementById('freeShippingToggle').classList.toggle('active', !!settings.freeShipping);
    document.getElementById('codToggle').classList.toggle('active', !!settings.cashOnDelivery);

    document.getElementById('setAdminName').value = admin.name || '';
  } catch (err) {
    console.error('Settings fetch error:', err);
    showToast('Failed to load settings.', 'error');
  }
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');

  const storeName        = document.getElementById('setStoreName').value.trim();
  const storeEmail       = document.getElementById('setStoreEmail').value.trim();
  const whatsappNumber   = document.getElementById('setWhatsapp').value.trim();
  const instagramHandle  = document.getElementById('setInstagram').value.trim();
  const storeDescription = document.getElementById('setDescription').value.trim();
  const freeShipping     = document.getElementById('freeShippingToggle').classList.contains('active');
  const cashOnDelivery   = document.getElementById('codToggle').classList.contains('active');

  /* ── Client-side validation (instant feedback — the backend validates again regardless) ── */
  if (!storeName)                            return showToast('Store Name cannot be empty.', 'error');
  if (!SETTINGS_EMAIL_RE.test(storeEmail))    return showToast('Please enter a valid Store Email.', 'error');
  if (!SETTINGS_PHONE_RE.test(whatsappNumber)) return showToast('Please enter a valid WhatsApp Number.', 'error');

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName, storeEmail, whatsappNumber, instagramHandle, storeDescription, freeShipping, cashOnDelivery }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Server error');

    showToast('Settings saved successfully.');
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

async function updateAccount() {
  const btn = document.getElementById('updateAccountBtn');

  const name            = document.getElementById('setAdminName').value.trim();
  const currentPassword = document.getElementById('setCurrentPassword').value;
  const newPassword     = document.getElementById('setNewPassword').value;

  if (!name)                                 return showToast('Admin Name cannot be empty.', 'error');
  if (newPassword && newPassword.length < 8) return showToast('New password must be at least 8 characters.', 'error');
  if (newPassword && !currentPassword)       return showToast('Enter your current password to set a new one.', 'error');

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const nameRes  = await fetch(`${API}/admin/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const nameData = await nameRes.json();
    if (!nameRes.ok) throw new Error(nameData.message || 'Failed to update name');

    if (newPassword) {
      const pwRes  = await fetch(`${API}/admin/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const pwData = await pwRes.json();
      if (!pwRes.ok) throw new Error(pwData.message || 'Failed to update password');
    }

    document.getElementById('setCurrentPassword').value = '';
    document.getElementById('setNewPassword').value = '';
    showToast('Account updated successfully.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
document.getElementById('updateAccountBtn').addEventListener('click', updateAccount);

/* ════════════════════════════════
   INIT
════════════════════════════════ */
function initDashboard() {
  setDate();
  renderHomeStats();    /* async — real order stats (revenue, totals, pending badge) */
  renderLowStockAlert(); /* async — real product stock counts */
  renderRecentOrders(); /* async — real recent orders */
  renderTopProducts();  /* async — real products */
  renderOrders('all');  /* async — real orders table */
  renderProducts();     /* async — real products grid */
  renderCustomers();    /* live — Customers API (derived from Order data) */
  renderCoupons();      /* live — Coupons API */
  loadReviewProductFilter().then(renderReviews); /* live — Reviews API (product filter options first) */
  renderAnalytics();    /* live — Analytics API (real revenue, orders, best sellers, etc.) */
  renderSettings();     /* live — Settings + Admin API */
  renderPolicyList();   /* live — Content Management (Policies) API */
  goTo('home');
}

/* ════════════════════════════════
   ORDER DETAIL PAGE
════════════════════════════════ */

/* Timeline step order */
const TL_STEPS = ['Pending', 'Processing', 'Confirmed', 'Shipped', 'Delivered'];

/* Build a single timeline step node */
function tlStep(label, dotCls, lblCls) {
  return `
    <div class="od-tl-step">
      <div class="od-tl-dot ${dotCls}"></div>
      <span class="od-tl-label ${lblCls}">${label}</span>
    </div>`;
}

/* Build the full timeline HTML for a given status */
function buildTimeline(status) {
  let html = '';
  const idx = TL_STEPS.indexOf(status);

  if (status === 'Cancelled') {
    html += tlStep('Pending',   'tl-done', 'tl-done');
    html += tlStep('Cancelled', 'tl-term', 'tl-term');
  } else if (status === 'Returned') {
    TL_STEPS.forEach(s => (html += tlStep(s, 'tl-done', 'tl-done')));
    html += tlStep('Returned', 'tl-term', 'tl-term');
  } else {
    TL_STEPS.forEach((s, i) => {
      if      (i < idx)  html += tlStep(s, 'tl-done',    'tl-done');
      else if (i === idx) html += tlStep(s, 'tl-current', 'tl-current');
      else                html += tlStep(s, '',           'tl-future');
    });
  }
  return html;
}

/* Shared row helpers */
function odInfoRow(label, value) {
  return `<div class="od-row"><span class="od-row-lbl">${label}</span><span class="od-row-val">${value}</span></div>`;
}
function odTotRow(label, value, grand = false) {
  return `<div class="od-tot-row${grand ? ' od-tot-grand' : ''}">
    <span class="od-tot-lbl">${label}</span>
    <span class="od-tot-val">${value}</span>
  </div>`;
}

/* Render all sections from an order document */
function renderOrderDetail(order) {
  const c = order.customer || {};

  /* ── Header ── */
  document.getElementById('odOrderNumber').textContent = order.orderNumber;
  document.getElementById('odStatusBadge').innerHTML   = statusBadge(order.status);
  document.getElementById('odMetaRow').innerHTML = `
    <span>${new Date(order.createdAt).toLocaleDateString('en-GB',
      { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</span>
    <span class="od-dot">·</span>
    <span>${order.paymentMethod || '—'}</span>
    <span class="od-dot">·</span>
    <span>${order.source || 'storefront'}</span>`;

  /* ── Customer info ── */
  document.getElementById('odCustomer').innerHTML = [
    odInfoRow('Name',  c.name  || '—'),
    odInfoRow('Phone', c.phone
      ? `<a href="tel:${c.phone}" style="color:var(--bone);text-decoration:none;">${c.phone}</a>`
      : '—'),
    odInfoRow('Email', c.email
      ? `<a href="mailto:${c.email}" style="color:var(--bone);text-decoration:none;">${c.email}</a>`
      : '—'),
  ].join('');

  /* ── Shipping address ── */
  const hasAddr = c.city || c.address;
  document.getElementById('odAddress').innerHTML = hasAddr
    ? [
        c.city    ? odInfoRow('City',    c.city)    : '',
        c.address ? odInfoRow('Address', c.address) : '',
      ].join('')
    : '<div class="od-empty">No shipping address on file.</div>';

  /* ── Ordered products ── */
  document.getElementById('odItems').innerHTML = (order.items || []).map(item => {
    const src = item.image
      ? imgUrl(item.image)
      : 'assests/images/product/logo.png';

    return `
      <div class="od-item">
        <img class="od-item-img" src="${src}" alt="${item.name || ''}"
             onerror="this.src='assests/images/product/logo.png'">
        <div class="od-item-body">
          <div class="od-item-name">${item.name || '—'}</div>
          <div class="od-item-attrs">
            ${item.color ? `<span class="od-attr">Color: ${item.color}</span>` : ''}
            ${item.size  ? `<span class="od-attr">Size: ${item.size}</span>`  : ''}
            <span class="od-attr">Qty: ${item.quantity || 1}</span>
          </div>
        </div>
        <div class="od-item-price">${fmt((item.price || 0) * (item.quantity || 1))}</div>
      </div>`;
  }).join('');

  /* ── Notes ── */
  const notesCard = document.getElementById('odNotesCard');
  const notesBody = document.getElementById('odNotesBody');
  if (order.notes && order.notes.trim()) {
    notesBody.textContent  = order.notes;
    notesCard.style.display = '';
  } else {
    notesCard.style.display = 'none';
  }

  /* ── Summary (status, payment, meta) ── */
  document.getElementById('odSummary').innerHTML = [
    odInfoRow('Order Status',   statusBadge(order.status)),
    odInfoRow('Payment Status', statusBadge(order.paymentStatus || 'Unpaid')),
    odInfoRow('Payment Method', order.paymentMethod || '—'),
    odInfoRow('Inventory', order.stockDeducted
      ? '<span style="color:var(--green-light);">✓ Stock deducted</span>'
      : '<span style="color:var(--smoke);">— Pending deduction</span>'),
  ].join('');

  /* ── Timeline ── */
  document.getElementById('odTimeline').innerHTML = buildTimeline(order.status);

  /* ── Totals ── */
  const shipping = order.shippingFee || 0;
  document.getElementById('odTotals').innerHTML = [
    odTotRow('Subtotal', fmt(order.subtotal || 0)),
    odTotRow('Shipping', shipping > 0 ? fmt(shipping) : 'Free'),
    odTotRow('Total',    fmt(order.total || 0), true),
  ].join('');

  /* ── Edit + Delete buttons ── */
  document.getElementById('odEditBtn').onclick   = () => openOrderModal(order._id);
  document.getElementById('odDeleteBtn').onclick = () => deleteOrderConfirm(order._id, order.orderNumber);
}

/* Fetch order and navigate to the detail page */
async function openOrderDetail(id) {
  goTo('order-detail');

  /* Loading skeleton */
  document.getElementById('odOrderNumber').textContent = 'Loading…';
  document.getElementById('odStatusBadge').innerHTML   = '';
  document.getElementById('odMetaRow').innerHTML       = '';
  ['odCustomer','odAddress','odItems','odSummary','odTimeline','odTotals']
    .forEach(elId => {
      const el = document.getElementById(elId);
      if (el) el.innerHTML = '<div class="od-empty" style="padding:10px 0;">Loading…</div>';
    });
  document.getElementById('odNotesCard').style.display = 'none';

  try {
    const res = await fetch(`${API}/orders/${id}`);
    if (!res.ok) throw new Error('Server ' + res.status);
    const order = await res.json();
    renderOrderDetail(order);
  } catch (err) {
    showToast('Failed to load order details.', 'error');
    goTo('orders');
  }
}

/* Back button */
document.getElementById('odBackBtn').addEventListener('click', () => goTo('orders'));

/* ════════════════════════════════
   BOOT  ·  auth guard runs first
════════════════════════════════ */
(async function boot() {
  const authenticated = await requireAuth();  // verifies the token against the backend; redirects to login.html if invalid/missing
  if (!authenticated) return;                 // already redirecting — don't flash the dashboard or fetch data

  document.getElementById("app").classList.add("visible");  // fade in the dashboard
  document.getElementById("logoutBtn").addEventListener("click", () => logout()); // logout → login.html
  initDashboard();                            // render all pages
})();
