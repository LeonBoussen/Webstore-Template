# Webstore Template

A full-stack e-commerce webstore template built with a **Flask** (Python) backend and a **React + Vite** frontend. It ships with product/service browsing, a localStorage cart, authentication, an admin panel, a contact form, and PayPal checkout — all wired together out of the box.

> ⚠️ **Template status.** This is a working starting point, not a production-hardened shop. See [Security & known limitations](#security--known-limitations) and [`SECURITY.md`](SECURITY.md) before deploying.

## Table of contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [One-command start](#one-command-start)
- [Environment variables](#environment-variables)
- [Database](#database)
- [API reference](#api-reference)
- [Frontend routes](#frontend-routes)
- [Features](#features)
- [Scripts](#scripts)
- [Security & known limitations](#security--known-limitations)

## Tech stack

| Layer     | Technology                                                                       |
| --------- | -------------------------------------------------------------------------------- |
| Backend   | Python 3.10+, Flask 3, Flask-Cors, SQLite (stdlib `sqlite3`), python-dotenv, colorama |
| Images    | Pillow — required: uploads are re-encoded and metadata-stripped                    |
| Frontend  | React 19, Vite 7, Tailwind CSS 4 (+ typography plugin), React Router 7, Axios, lucide-react |
| Content   | react-markdown + remark-gfm, sanitized with rehype-sanitize (`front/src/lib/markdown.js`) |
| Auth      | PBKDF2-HMAC-SHA256 (200 000 iterations, 16-byte salt), HMAC-SHA256 signed bearer tokens |
| Payments  | PayPal Orders API v2 (raw `urllib`, no SDK), sandbox or live                       |

## Repository layout

```
Webstore-Template/
├── back/                       # Flask backend
│   ├── server.py               # App entry point + every API route
│   ├── init_db.py              # Schema creation/migration + demo-catalog seeding
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Template for the required environment variables
│   ├── shop.db                 # created at runtime (gitignored)
│   ├── server.log              # created at runtime (gitignored)
│   └── static/uploads/         # uploaded images (gitignored, created at runtime)
├── front/                      # React (Vite) frontend
│   ├── src/
│   │   ├── components/         # Navbar
│   │   ├── pages/              # One component per route (Home, Products, Admin, …)
│   │   ├── lib/markdown.js     # Hardened rehype-sanitize schema
│   │   └── api/axios.js        # Shared Axios instance (not imported anywhere yet)
│   ├── README.md               # Frontend-specific notes
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── start.cmd                   # Windows helper: starts backend + frontend
├── SECURITY.md                 # Audit report, remediations and re-tests
└── .gitignore
```

## Prerequisites

- **Node.js** 18+ (developed against Node 24) and npm
- **Python** 3.10+ (developed against Python 3.14) — 3.10 is the floor because the code uses `X | None` type unions
- Optional: a [PayPal developer](https://developer.paypal.com/) account for live checkout testing

## Backend setup

Commands are shown for Windows PowerShell (on macOS/Linux activate the venv with `source .venv/bin/activate`):

```powershell
# 1. Create and activate a virtual environment (from the repository root)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r back/requirements.txt

# 3. Configure the environment
Copy-Item back\.env.example back\.env
# Generate a SECRET_KEY and paste it into back\.env (SECRET_KEY=...):
python -c "import secrets; print(secrets.token_hex(32))"

# 4. Start the API server, from the back/ directory
cd back
python server.py
```

The backend listens on **http://127.0.0.1:5000**. It refuses to start if `SECRET_KEY` or `MAX_UPLOAD_MB` is missing, and prints a message instead.

> 📁 **Working directory matters.** `shop.db`, `server.log` and `static/uploads/` are created relative to the *current working directory*, so run the server from `back/` (as `start.cmd` does). `back/.env` is found either way, because python-dotenv resolves it relative to `server.py`.

> 💡 **First launch:** the first run
> - seeds a **temporary admin account** (`admin` / `admin`) — log in once with it and you are redirected to `/setup`, where you create your own admin account (the temporary one is deleted in that step), and
> - seeds a **demo catalog** (8 products with 15 images + 5 services with 6 images, using `picsum.photos` placeholders and Markdown descriptions) so the shop never looks empty. Delete or edit these in the Admin panel to start with your own content — real data is never overwritten, and the catalog is only ever seeded into a brand-new database file.

## Frontend setup

From the repository root:

```powershell
cd front
npm install
npm run dev
```

The Vite dev server runs on **http://localhost:5173** and calls the API at `http://127.0.0.1:5000/api`. The API base URL is currently a hard-coded `const` in each page (`Login.jsx`, `Admin.jsx`, `Checkout.jsx`, …) — `front/src/api/axios.js` holds a shared instance for that purpose but no page imports it yet.

## One-command start

On Windows you can start both servers at once:

```powershell
.\start.cmd
```

This launches the backend (`py server.py` from `back/`), the frontend (`npm run dev` from `front/`) in separate windows, and opens the site in **Brave** (the browser is hard-coded, and the `py` launcher must be on `PATH`).

## Environment variables

All backend configuration lives in `back/.env` (see `back/.env.example`).

| Variable                    | Required | Default                                       | Description                                                                 |
| --------------------------- | -------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `SECRET_KEY`                | ✅       | –                                             | Secret used to sign auth tokens (use a long random value)                   |
| `MAX_UPLOAD_MB`             | ✅       | –                                             | Max image upload size in megabytes                                          |
| `ALLOWED_ORIGINS`           | ❌       | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allow-list for the API                                 |
| `ENABLE_DEV_DISCOUNT_CODES` | ❌       | `0`                                           | Set `1` to enable the DEV10/STUDENT15/SAVE5 dev codes **server-side**       |
| `PAYPAL_CLIENT_ID`          | ❌       | (empty)                                       | PayPal client ID; empty disables PayPal                                     |
| `PAYPAL_CLIENT_SECRET`      | ❌       | (empty)                                       | PayPal client secret                                                        |
| `PAYPAL_ENV`                | ❌       | `sandbox`                                     | `sandbox` or `live`                                                         |
| `CURRENCY`                  | ❌       | `EUR`                                         | Three-letter ISO currency code                                              |
| `ADMIN_USERNAME`            | ❌       | `LeonBoussen`                                 | Legacy: username promoted to admin **only** when migrating a pre-role database |
| `ADMIN_PASSWORD`            | ❌       | (empty)                                       | Legacy variable, read at startup but unused                                 |

`ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is **not** an environment variable — it is a hard-coded `False` constant in `server.py` (see [Security & known limitations](#security--known-limitations)).

**Auth model.** Passwords are PBKDF2-hashed with a per-user random salt and must be 8–128 characters (enforced server-side). Users log in with their email **or** username. Tokens are `base64url(payload).base64url(HMAC-SHA256 signature)` over `{user_id, role, exp}`, valid for **7 days**, and are sent as `Authorization: Bearer <token>`. Admin rights come from the account's `role` column — never from its username.

**First launch.** A database with no admin at all is seeded with a temporary admin account (`admin` / `admin`, flagged `is_setup_admin=1`). Logging in with it returns `setup_pending: true`; `POST /api/auth/setup` then creates your own admin account and deletes the temporary one in the same transaction, so `admin`/`admin` stops working immediately. Regular signups always create role `user`. `ADMIN_USERNAME` is only used as a one-time migration for databases created before roles existed.

## Database

SQLite (`shop.db`), created and migrated by `init_db.py` on every start — adding missing columns and moving legacy `products.image_path` / `services.image_path` rows into the image tables.

| Table             | Used by the API | Notes                                                             |
| ----------------- | --------------- | ----------------------------------------------------------------- |
| `products`        | ✅              | `almost_sold_out` exists in the schema but is never read or written |
| `services`        | ✅              | Only rows with `active=1` are returned by `GET /api/services`      |
| `product_images`  | ✅              | Ordered by `sort_order`, then `id`; cascade-deleted with its product |
| `service_images`  | ✅              | Same shape as `product_images`                                     |
| `users`           | ✅              | `role` (`user`/`admin`), `is_setup_admin`, `phone`, `address`, `preferred_payment` |
| `contact_messages`| ✅              | Contact-form submissions with a `created_at` timestamp             |
| `orders`          | ❌              | Scaffolded only — no endpoint writes here yet                      |
| `order_items`     | ❌              | Scaffolded only                                                   |
| `discount_codes`  | ❌              | Scaffolded only; checkout uses the hard-coded dev codes instead    |

## API reference

All API endpoints are prefixed with `/api`; uploaded images are served from `/static/uploads/`. Admin routes require a bearer token whose account has the `admin` role; user routes require any valid token. Rate limits are per client IP and in-memory (per process).

| Method | Endpoint                     | Auth        | Description                                                     |
| ------ | ---------------------------- | ----------- | --------------------------------------------------------------- |
| GET    | `/api/catchphrase`           | –           | Random marketing tagline                                         |
| GET    | `/api/products`              | –           | List products (first image as `image_url`)                       |
| GET    | `/api/products/<id>`         | –           | Single product + `images[]` gallery                              |
| POST   | `/api/products`              | admin       | Create product (`name`, `price` required; `images[]` optional)   |
| PUT    | `/api/products/<id>`         | admin       | Update product fields and/or replace `images[]`                  |
| DELETE | `/api/products/<id>`         | admin       | Delete product (images cascade)                                  |
| GET    | `/api/services`              | –           | List active services                                            |
| POST   | `/api/services`              | admin       | Create service                                                  |
| PUT    | `/api/services/<id>`         | admin       | Update service fields and/or replace `images[]`                  |
| DELETE | `/api/services/<id>`         | admin       | Delete service (images cascade)                                  |
| POST   | `/api/auth/signup`           | –           | Register (always role `user`); **10 req / 15 min**               |
| POST   | `/api/auth/login`            | –           | Log in with email or username; **10 req / 15 min**               |
| GET    | `/api/auth/me`               | user        | Current user (`id`, `email`, `username`, `role`, `setup_pending`) |
| GET    | `/api/auth/setup-status`     | –           | Whether the first-launch setup is still pending                  |
| POST   | `/api/auth/setup`            | setup admin | Create the owner's admin account & delete the temporary one      |
| GET    | `/api/user/profile`          | user        | Get profile (`id`, `email`, `username`, `address`)               |
| PUT    | `/api/user/profile`          | user        | Update email/address and/or change password (`current_password` required) |
| POST   | `/api/upload/image`          | admin       | Upload a product/service image (multipart field `image`)         |
| POST   | `/api/contact`               | –           | Submit a contact-form message; **5 req / hour**                  |
| GET    | `/api/paypal/config`         | –           | PayPal client config for the JS SDK (`500` when unconfigured)     |
| POST   | `/api/paypal/create-order`   | –           | Create a PayPal order from `{items:[{id,kind,qty}], discount_code}` |
| POST   | `/api/paypal/capture-order`  | –           | Capture an approved order (`{order_id}`)                         |
| GET    | `/static/uploads/<filename>` | –           | Serve uploaded images                                           |

Authentication endpoints return `{ token, user_id, role }` (login adds `setup_pending`), and the token must be sent as `Authorization: Bearer <token>`. Validations: password 8–128 chars, username 3–32, email format + ≤254 chars, address ≤2000 chars, contact name ≤100 / message ≤5000. Requests above a rate limit get `429`; wrong credentials always get a generic `401 {"error":"invalid credentials"}`, and duplicate signups a generic `409`.

`POST /api/upload/image` accepts `.png`, `.jpg`, `.jpeg`, `.webp`, rejects files above `MAX_UPLOAD_MB` with `413`, and returns `503` if Pillow is unavailable on the server (never storing an unsanitized file). Otherwise the image is re-encoded with Pillow — EXIF/metadata dropped, downscaled to at most 1600 px wide — written as `<unix-timestamp>_<sanitized-name>` into `static/uploads/`, and returned as a `/static/uploads/<filename>` URL.

## Frontend routes

| Path           | Page                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `/`            | Home (fetches a random catchphrase)                                   |
| `/products`    | Product/service catalog + cart drawer                                 |
| `/product/:id` | Product details (image gallery, sanitized Markdown)                   |
| `/about`       | About                                                                 |
| `/contact`     | Contact form                                                          |
| `/addproduct`  | Legacy quick single-product form (one image URL per line; the API still enforces the admin role) |
| `/login`       | Login (redirects to `/setup` when setup is pending)                   |
| `/signup`      | Sign up                                                               |
| `/setup`       | First-launch wizard (create your admin account)                       |
| `/admin`       | Admin panel (products/services CRUD, multi-image upload)              |
| `/account`     | Profile & password management                                         |
| `/checkout`    | Checkout (PayPal buttons + simulated payment UI for other methods)    |
| `*`            | Built-in 404 page                                                     |

## Features

- **Catalog** — products and services with multi-image galleries, sanitized Markdown descriptions, discounted prices, "limited edition" and "sold out" badges, plus search/filtering in the admin panel.
- **Cart** — client-side cart persisted in `localStorage` (key `cart`); items carry `{id, kind, qty}` where `kind` is `product` or `service`.
- **Auth** — signup/login with email or username, PBKDF2-hashed passwords (8+ chars, server-enforced), signed 7-day bearer tokens, per-IP rate limiting on login/signup/contact. First launch seeds a temporary `admin`/`admin` account that you replace via `/setup`.
- **Admin** — role-based CRUD for products and services with image reordering (move up/down), multi-image upload, and a role check against `/api/auth/me` (the temporary setup admin is redirected to `/setup`).
- **Checkout** — server-side amount calculation (prices are re-read from the database, so the client cannot set them) and PayPal Orders API v2 integration. Dev discount codes `DEV10` (10%), `STUDENT15` (15%), `SAVE5` (€5) are honoured by the server only when `ENABLE_DEV_DISCOUNT_CODES=1`.
- **Contact** — validated, rate-limited form submissions stored in the `contact_messages` table.

## Scripts

Frontend (`front/`): there is no backend build step, and no automated test suite in either half.

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `npm run dev`     | Start the Vite dev server    |
| `npm run build`   | Production build to `dist/`  |
| `npm run preview` | Preview the production build |
| `npm run lint`    | Run ESLint                   |

## Security & known limitations

The repo ships with the following hardening (see also [`SECURITY.md`](SECURITY.md) for the full audit report with before/after tests):

- Role-based admin (`users.role`); the only bootstrap is the temporary setup account, and the legacy username-based promotion runs **once**, when a pre-role database is migrated.
- No credentials, tokens or password hashes in `server.log`; per-IP rate limits on login, signup and contact.
- CORS restricted to the `ALLOWED_ORIGINS` allow-list; `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` on all API responses.
- Server-side validation: password length, email format, and length caps on auth, profile and contact payloads.
- Markdown product/service descriptions are sanitized (`rehype-sanitize`) before rendering.
- Image uploads are refused outright unless Pillow is installed, so files are always re-encoded and metadata-stripped.
- Dev discount codes are off by default (`ENABLE_DEV_DISCOUNT_CODES`).

Known limitations (accepted for a template, revisit before going live):

- **Non-PayPal payment methods** (Stripe, iDEAL, Crypto) are UI placeholders — "Place order" only logs the payload and simulates success. No order is persisted anywhere; the `orders` table is unused.
- **The checkout discount box is client-side.** `Checkout.jsx` applies `DEV10`/`STUDENT15`/`SAVE5` for display regardless of `ENABLE_DEV_DISCOUNT_CODES`, so with the flag off the summary can show a lower total than PayPal actually charges (the server recomputes and ignores the code). Wire the box to the server before using it in production.
- **Auth token is stored client-side** (`localStorage`, key `userToken`); it is neither refreshed nor revocable server-side. An HttpOnly-session design would further reduce XSS impact.
- **Rate limits are in-memory** (per process) — fine for a single dev server; a shared store (e.g. Redis) is needed when scaling.
- The Flask server binds to `127.0.0.1` — expose it behind a reverse proxy with TLS for anything public.
- The API base URL is duplicated as a literal in the frontend pages instead of using `front/src/api/axios.js`, and `ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is a hard-coded constant rather than a setting.
- The "restart" loop around `app.run()` in `server.py` never actually loops (its `finally` block breaks immediately), which Python flags with a `SyntaxWarning`.
