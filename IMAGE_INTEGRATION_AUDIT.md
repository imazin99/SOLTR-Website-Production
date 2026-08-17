# SOLTR Image Integration Audit

## Findings before implementation

The intended storage contract is internally consistent on the backend: Multer creates `server/uploads/products` using `path.join(__dirname, '../uploads/products')`, uploaded files are renamed to generated filenames, and product documents store only those filenames in `Product.images`. The product routes append/remove those filenames and delete files under the same directory. The local workspace contains real uploaded files under `server/uploads/products`, including the BSON-backed product filenames.

The local product BSON backup contains 13 product documents and all inspected `images` values are bare filenames such as `1783186882452-303555612.jpg`; no absolute URLs or `/uploads/...` values were found in that backup. The public product API returns product documents without transforming `images`.

The frontend currently has several duplicated URL helpers that blindly produce `${IMG}/uploads/products/${filename}`. This works for bare filenames but breaks backward compatibility if any future/legacy document contains an absolute URL or an existing `/uploads/...` path. The dashboard, storefront, wishlist, policy page, and product page each need a shared-compatible resolver behavior.

`frontend/js/config.js` maps pages served from `localhost`, `127.0.0.1`, or an empty hostname to `http://localhost:5000/api` and `http://localhost:5000`. The empty-hostname branch is intended to support `file://`, but opening HTML directly from `file://` is not a supported frontend serving architecture and can create origin/CORS/browser-policy problems. The project should be served from a local HTTP origin such as Live Server on port 5500.

`server/server.js` serves `/uploads` correctly from the absolute `server/uploads` directory, but Helmet is not explicitly configured with `crossOriginResourcePolicy`. Helmet’s default CORP behavior can produce `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` when an HTTP frontend on port 5500 or another origin loads images from the backend on port 5000. The appropriate fix is to explicitly set `crossOriginResourcePolicy: { policy: 'cross-origin' }` for this intentionally cross-origin static-image architecture, while preserving the rest of the security middleware.

Development CORS currently falls back to `*`, while production uses one configured origin. API fetches from Live Server work in development, but the configuration is unnecessarily broad and does not model the intended local frontend origins explicitly. CORS should allow a small local development allowlist plus the configured production origin, and reject other origins. Static images do not rely on CORS in the same way as fetch requests, so CORP is the key browser image fix.

The backend cannot currently be started end-to-end in this sandbox because there is no local `server/.env`, no local MongoDB binary, and no MongoDB listener. No production database or production environment was accessed.

## Browser verification after implementation

A browser navigation to `http://127.0.0.1:5051/uploads/products/1783186882396-482567739.jpg` through a temporary local Express smoke server displayed the real uploaded 600×901 product image successfully. The smoke server used the same static directory and explicit cross-origin resource policy intended for the project. This confirms the physical file and static URL contract independently of MongoDB availability.
