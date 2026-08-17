/* ═══════════════════════════════════════════════════
   SOLTR — customer-auth.js
   Customer-facing authentication (register/login/logout/session).
   Completely separate from auth.js (the ADMIN login module used only
   by login.html) — different localStorage keys, different API base
   path segment intent, different backend secret entirely
   (CUSTOMER_JWT_SECRET vs JWT_SECRET, see server/middleware/
   customerAuth.js). A customer token is never valid for admin routes
   and vice versa.

   Loaded on storefront pages (index.html, product.html, wishlist.html,
   customer-login.html, customer-register.html) — never on
   checkout.html, dashboard.html, or login.html (admin).
═══════════════════════════════════════════════════ */

const CUSTOMER_AUTH = (() => {

  const API = window.SOLTR_CONFIG.API;

  /**
   * Computes the correct relative prefix ('' or '../') to reach the
   * frontend root from wherever the CURRENT page actually is.
   *
   * Root-relative paths like href="/auth/customer-login.html" only
   * resolve correctly when the site is served over http(s) from its
   * own domain root. Opened directly via file:// (e.g. double-clicking
   * index.html on Windows), a leading "/" resolves to the filesystem
   * root instead — file:///E:/auth/customer-login.html — which is the
   * exact bug this fixes. Computing the prefix from the current page's
   * own path works correctly under both file:// and real hosting,
   * local dev and after deploying to Vercel.
   */
  function relPrefix() {
    const path = window.location.pathname;
    const depth1Folders = ['/auth/', '/account/', '/checkout/', '/products/', '/wishlist/', '/pages/', '/dashboard/'];
    return depth1Folders.some(folder => path.includes(folder)) ? '../' : '';
  }

  const TOKEN_KEY = 'soltr_customer_token';
  const INFO_KEY  = 'soltr_customer_info'; // { name, email, phone } — display only, never the token itself

  const esc = str => String(str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function _getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  }

  function _setSession(token, customer, remember) {
    /* Clear both first so switching Remember Me on/off never leaves a stale copy */
    localStorage.removeItem(TOKEN_KEY);   localStorage.removeItem(INFO_KEY);
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(INFO_KEY);

    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(INFO_KEY, JSON.stringify(customer || {}));
  }

  function _clearSession() {
    localStorage.removeItem(TOKEN_KEY);   localStorage.removeItem(INFO_KEY);
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(INFO_KEY);
  }

  /** Quick client-side check: does a token exist at all? Fast UX gate only. */
  function isLoggedIn() {
    return !!_getToken();
  }

  /**
   * Register a new customer account.
   * Per spec, this does NOT auto-login — the API does return a token,
   * but the frontend intentionally ignores it here so the flow matches
   * "redirect to login after successful registration".
   * Returns { ok: true } or { ok: false, error }.
   */
  async function register(name, email, phone, password) {
    try {
      const res  = await fetch(`${API}/customers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) return {
        ok: false,
        error: data.message || 'Registration failed.',
        emailDeliveryFailed: data.code === 'EMAIL_DELIVERY_FAILED',
        retryable: data.retryable !== false,
      };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  }

  /**
   * Log in and persist the JWT.
   * @param {boolean} remember - true: localStorage (persists). false: sessionStorage (cleared on tab close).
   * Returns { ok: true } or { ok: false, error }.
   */
  async function login(email, password, remember = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res  = await fetch(`${API}/customers/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe: remember }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          error: data.message || 'Incorrect email or password.',
          emailNotVerified: Boolean(data.emailNotVerified),
          email: data.email || email,
        };
      }

      _setSession(data.token, data.customer, remember);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err?.name === 'AbortError'
          ? 'The login request timed out. Please try again.'
          : 'Could not reach the server. Please try again.',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Clear session, notify the backend (stateless — best-effort only), and go Home. */
  function logout() {
    const token = _getToken();
    _clearSession();
    if (token) {
      fetch(`${API}/customers/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    renderNav();
    window.location.href = `${relPrefix()}index.html`;
  }

  /**
   * Verifies any existing token against the backend — not just its
   * presence. A stale/expired token is cleared rather than silently
   * trusted. Returns the safe customer object, or null.
   */
  async function verifySession() {
    const token = _getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API}/customers/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { _clearSession(); return null; }
      return await res.json();
    } catch {
      return null; // network error — can't confirm, but don't destroy a possibly-valid token
    }
  }

  /** Guard for customer-login.html / customer-register.html — bounces an
      already-logged-in customer back to the storefront home. */
  async function redirectIfLoggedIn() {
    const customer = await verifySession();
    if (customer) window.location.replace(`${relPrefix()}index.html`);
  }

  function _getCachedName() {
    try {
      const raw = localStorage.getItem(INFO_KEY) || sessionStorage.getItem(INFO_KEY);
      const info = JSON.parse(raw);
      return info ? info.name : null;
    } catch {
      return null;
    }
  }

  /**
   * Renders the navbar auth links (#customerNav) — Login/Register when
   * logged out, "Hi, {name}" + Logout when logged in. Call on every
   * storefront page that has a #customerNav element; a no-op elsewhere.
   */
  async function renderNav() {
    const nav = document.getElementById('customerNav');
    if (!nav) return;

    const loggedOutHTML = `
      <a href="${relPrefix()}auth/customer-login.html" class="nav-auth-link">Login</a>
      <a href="${relPrefix()}auth/customer-register.html" class="nav-auth-link">Register</a>`;

    if (!isLoggedIn()) {
      nav.innerHTML = loggedOutHTML;
      return;
    }

    /* Optimistic render from the cached name first (instant, no flash of "Login/Register"),
       then confirm with the backend in case the token has since expired. */
    const cachedName = _getCachedName();
    nav.innerHTML = `
      <a href="${relPrefix()}account/account.html" class="nav-account-name">${cachedName ? 'Hi, ' + esc(cachedName) : 'My Account'}</a>
      <a href="#" class="nav-auth-link" id="customerLogoutLink">Logout</a>`;
    document.getElementById('customerLogoutLink').addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });

    const customer = await verifySession();
    if (!customer) {
      nav.innerHTML = loggedOutHTML; // token turned out to be invalid/expired
    }
  }

  return { isLoggedIn, register, login, logout, redirectIfLoggedIn, verifySession, renderNav };

})();

document.addEventListener('DOMContentLoaded', () => CUSTOMER_AUTH.renderNav());
