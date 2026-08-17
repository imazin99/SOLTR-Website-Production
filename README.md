# SOLTR — Premium Streetwear E-Commerce

A full-stack e-commerce platform: public storefront, customer accounts (with
email verification and password reset), checkout, order management, and an
admin dashboard.

**Stack:** Node.js / Express / MongoDB (Mongoose) backend · vanilla HTML/CSS/JS
frontend (no framework, no build step) · Resend for transactional email · JWT
authentication (two separate trust domains — admin and customer).

---

## Project Structure

```
SOLTR-Website-Production/
│
├── frontend/                  Static site — deploy as-is to any static host
│   ├── assests/                Images (folder name is intentionally spelled
│   │                            this way throughout the codebase — do not
│   │                            "fix" the spelling without updating every
│   │                            reference to it)
│   ├── css/style.css           Shared design system (fonts, colors, components)
│   ├── js/
│   │   ├── config.js           ⭐ Single place the API base URL is configured
│   │   ├── image-url.js         Shared product-image URL resolver/fallback
│   │   └── customer-auth.js    Shared customer session module (nav, login state)
│   ├── index.html + script.js  Homepage
│   ├── auth/                   Login, register, forgot/reset password, verify-email
│   ├── account/                Customer account / order history
│   ├── checkout/               Checkout flow
│   ├── products/                Product detail page
│   ├── wishlist/               Wishlist page
│   ├── pages/                  Footer policy pages, order thank-you page
│   └── dashboard/               Admin dashboard (own login, own auth domain —
│                                 fully self-contained, deploy alongside the
│                                 rest of the frontend or separately)
│
├── server/                     Backend — deploy separately from the frontend
│   ├── controllers/ models/ routes/ services/ middleware/ utils/
│   ├── uploads/products/       Product images uploaded via the admin dashboard
│   ├── server.js               Entry point
│   ├── package.json
│   ├── seed.js / seedPolicies.js / testEmail.js   Utility scripts (see below)
│   └── .env                    Your local secrets — NEVER commit this
│
├── docs/policy-source-text/    Original source text for the footer policy
│                                pages (Return & Refund, Privacy, etc.) — for
│                                your reference only; not read by the app
│                                (policy content lives in MongoDB)
│
├── server/.env.example          Copy to server/.env and fill in real values
├── .gitignore
└── README.md
```

---

## Local Development

### Backend

```bash
cd server
npm install
cp .env.example .env        # then fill in real local values in server/.env
npm run dev                # nodemon, restarts on file changes
```

Runs on `http://localhost:5000` by default (`PORT` in `.env`).

Useful one-off scripts (run from `server/`):
```bash
npm run seed             # seed products/admin/etc.
npm run seed:policies    # seed footer policy page content (Return & Refund, etc.)
npm run test:email       # send a real test email via Resend to confirm it's wired up
```

### Frontend

No build step — it is static files. Serve `frontend/` over HTTP with any
static file server. Do **not** open `frontend/index.html` directly with
`file://`; browser origin and resource-policy behavior is different from the
real frontend/backend integration and can make API and image failures look
like application bugs.

If you use VS Code's Live Server extension on its default port, it matches the
local allowlist and `FRONTEND_URL` convention (`http://localhost:5500`). A
built-in Python server is also sufficient:
```bash
cd frontend
python3 -m http.server 5500
```

`frontend/js/config.js` auto-detects `localhost`/`127.0.0.1` and points at
`http://localhost:5000/api` automatically. `frontend/js/image-url.js` converts
bare product filenames, legacy `/uploads/products/...` paths, Windows-style
paths, and already-qualified image URLs into a safe browser URL.

---

## Environment Variables

See `server/.env.example` for the full list with explanations. Required:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `PORT` | Backend port (most hosts set this for you) |
| `NODE_ENV` | `development` locally, `production` when deployed |
| `CLIENT_ORIGIN` | Deployed frontend origin, for CORS |
| `FRONTEND_URL` | Deployed frontend base URL — used to build email verification/reset links |
| `JWT_SECRET` | Admin auth signing secret |
| `CUSTOMER_JWT_SECRET` | Customer auth signing secret — **must differ from `JWT_SECRET`** |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address, must be a Resend-verified domain |

`server/.env` is gitignored. Never commit it, never hardcode any of these
values in source.

---

## Deployment

### Backend
1. Deploy the `server/` folder to a Node host (Render, Railway, Fly.io, a VPS, etc.).
2. Set every variable from `.env.example` in the host's environment variable
   settings — do not upload `server/.env` itself.
3. Set `CLIENT_ORIGIN` and `FRONTEND_URL` to your deployed frontend's real URL.
4. Set `NODE_ENV=production`.
5. Confirm MongoDB Atlas allows connections from your host (IP allowlist / 0.0.0.0/0
   if the host uses dynamic IPs, per your own security preference).
6. Confirm your `EMAIL_FROM` domain is verified in Resend.

### Frontend
1. Deploy the `frontend/` folder to any static host (Netlify, Vercel, GitHub
   Pages, S3+CloudFront, etc.).
2. Open `frontend/js/config.js` and replace `PRODUCTION_API_BASE` /
   `PRODUCTION_IMG_BASE` with your deployed backend's real URL
   (`https://your-backend.example.com/api` and `https://your-backend.example.com`).
   This is the **only** file that needs a manual edit before deploying the
   frontend — every page reads from it.
3. Deploy from the `frontend/` folder as the site root (so `frontend/index.html`
   becomes your domain's root page, and paths like `/auth/customer-login.html`
   resolve correctly — several scripts rely on root-relative paths for
   navigation that's shared across pages at different folder depths).

### Admin Dashboard
`frontend/dashboard/` is self-contained and deploys as part of the same
frontend static site — reachable at `/dashboard/dashboard.html` once deployed.

---

## What This Does Not Cover

- No CI/CD pipeline is set up — deployment above is manual.
- No automated test suite exists in this project.
- MongoDB Atlas cluster creation and Resend account/domain verification are
  manual steps you complete on those platforms directly.
