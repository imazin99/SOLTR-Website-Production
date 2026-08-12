/* ═══════════════════════════════════════════════════
   SOLTR — frontend/js/config.js

   Single source of truth for the backend API and image base URLs.
   Load this BEFORE every other page script (see the <script> order
   in each HTML file) — every page reads window.SOLTR_CONFIG.API /
   .IMG instead of hardcoding a URL itself.

   Auto-detects local development (page served from localhost/127.0.0.1)
   vs. production by hostname, so this exact file works unmodified on
   your machine and after deployment — no build step, no per-environment
   file swap needed.

   ─────────────────────────────────────────────────────────────────
   ACTION REQUIRED BEFORE DEPLOYING:
   Replace PRODUCTION_API_BASE / PRODUCTION_IMG_BASE below with your
   actual deployed backend URL once the backend is live. Until then,
   this file is correct for local development only.
   ─────────────────────────────────────────────────────────────────
════════════════════════════════════════════════════ */

(function () {
  const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  const LOCAL_API_BASE = 'http://localhost:5000/api';
  const LOCAL_IMG_BASE = 'http://localhost:5000';

  // TODO: set these to your deployed backend's real URL before going live.
  const PRODUCTION_API_BASE = 'https://YOUR-BACKEND-DOMAIN.example.com/api';
  const PRODUCTION_IMG_BASE = 'https://YOUR-BACKEND-DOMAIN.example.com';

  window.SOLTR_CONFIG = {
    API: isLocal ? LOCAL_API_BASE : PRODUCTION_API_BASE,
    IMG: isLocal ? LOCAL_IMG_BASE : PRODUCTION_IMG_BASE,
  };
})();
