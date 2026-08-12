/* ═══════════════════════════════════════════════════
   SOLTR — auth.js
   Real backend-verified authentication (JWT). Used only by login.html.
   (dashboard.html has its own equivalent inlined in dashboard.js —
   see the note there for why they're kept separate.)

   All sensitive logic (credential check, password hashing, token
   issuing/verification) lives on the server — see
   server/controllers/authController.js and server/middleware/auth.js.
   This file only stores the token, verifies it against the backend,
   and attaches it to outgoing requests.
═══════════════════════════════════════════════════ */

const AUTH = (() => {

  const API = window.SOLTR_CONFIG.API;

  /* ─── private ─── */
  const TOKEN_KEY = "soltr_admin_token";
  const ADMIN_KEY = "soltr_admin_info"; // { username, name } — display only, never the token itself

  /** Token may live in localStorage (Remember Me) or sessionStorage (this browser tab/session only). */
  function _getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  }

  function _setSession(token, admin, remember) {
    _clearSession(); // avoid a stale copy lingering in the other storage
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(ADMIN_KEY, JSON.stringify(admin || {}));
  }

  function _clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
  }

  /* ─── public ─── */

  /** Quick client-side check: does a token exist at all? Fast UX gate only. */
  function isLoggedIn() {
    return !!_getToken();
  }

  /**
   * Validate credentials against the backend and persist the JWT on success.
   * @param {string}  username
   * @param {string}  password
   * @param {boolean} remember - true: localStorage (persists). false: sessionStorage (cleared when the tab/browser closes).
   * Returns { ok: true } or { ok: false, error: "..." }.
   */
  async function login(username, password, remember = false) {
    try {
      const res  = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Incorrect username or password.' };
      }

      _setSession(data.token, data.admin, remember);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  }

  /** Notify the backend (stateless no-op, kept for API symmetry), clear the session, and redirect. */
  function logout() {
    const token = _getToken();
    _clearSession();
    if (token) {
      fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // best-effort — the client-side clear above is what actually matters
    }
    window.location.replace("login.html");
  }

  /**
   * Guard for dashboard.html.
   * Checks the token actually still WORKS (via GET /api/auth/me), not
   * just that something is present in storage — a stale/expired/
   * tampered token is treated as "not authenticated".
   * Redirects to login.html if not authenticated.
   */
  async function requireAuth() {
    const token = _getToken();
    if (!token) {
      window.location.replace("login.html");
      return;
    }
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('invalid token');
    } catch {
      _clearSession();
      window.location.replace("login.html");
    }
  }

  /**
   * Guard for login.html.
   * Call once at page load — redirects to dashboard.html if already authenticated
   * (verified against the backend, not just "a token exists").
   */
  async function redirectIfLoggedIn() {
    const token = _getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) window.location.replace("dashboard.html");
      else _clearSession();
    } catch {
      /* Can't reach the server — leave the user on the login page rather
         than guessing; they can still try logging in again. */
    }
  }

  /** Returns the stored admin username or null */
  function getUsername() {
    try {
      const raw = sessionStorage.getItem(ADMIN_KEY) || localStorage.getItem(ADMIN_KEY);
      const admin = JSON.parse(raw);
      return admin ? admin.username : null;
    } catch {
      return null;
    }
  }

  /* ── Attach the JWT to every admin-API request automatically, and
     force logout if the backend ever says the token is invalid/expired.
     Only touches requests to this project's own API — never interferes
     with anything else the page might fetch. Storefront pages
     (index.html / checkout.html) never load auth.js, so this has zero
     effect on the public storefront. ── */
  const _nativeFetch = window.fetch;
  window.fetch = function (input, options = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const isApiCall = typeof url === 'string' && url.startsWith(API)
      && !url.startsWith(`${API}/auth/login`);
    const token = _getToken();

    if (isApiCall && token) {
      options = {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
      };
    }

    return _nativeFetch(input, options).then(res => {
      if (isApiCall && res.status === 401) {
        _clearSession();
        window.location.replace("login.html");
      }
      return res;
    });
  };

  return { isLoggedIn, login, logout, requireAuth, redirectIfLoggedIn, getUsername };

})();
