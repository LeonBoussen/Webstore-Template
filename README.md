# Webstore Template

A full-stack e-commerce webstore template built with a **Flask** (Python) backend and a **React + Vite** frontend. It ships with product/service browsing, a localStorage cart, authentication, an admin panel, a contact form, and PayPal checkout — all wired together out of the box.

> ⚠️ **Template status.** This is a working starting point, not a production-hardened shop. See [Security & known limitations](#security--known-limitations) before deploying.

## Table of contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [One-command start](#one-command-start)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Frontend routes](#frontend-routes)
- [Features](#features)
- [Scripts](#scripts)
- [Security & known limitations](#security--known-limitations)

## Tech stack

| Layer    | Technology                                                        |
| -------- | ----------------------------------------------------------------- |
| Backend  | Python 3, Flask, Flask-Cors, SQLite, python-dotenv, Pillow        |
| Frontend | React 19, Vite 7, Tailwind CSS 4, React Router 7, Axios           |
| Auth     | HMAC-SHA256 signed tokens (PBKDF2 password hashing)               |
| Payments | PayPal Orders API v2 (sandbox-ready)                              |

## Repository layout

```
Webstore-Template/
├── back/                     # Flask backend
│   ├── server.py             # App entry point + all API routes
│   ├── init_db.py            # SQLite schema creation / migration
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Template for required environment variables
│   └── static/uploads/       # Uploaded images (gitignored, created at runtime)
├── front/                    # React (Vite) frontend
│   ├── src/
│   │   ├── components/       # Navbar, shared UI
│   │   ├── pages/            # One component per route (Home, Products, …)
│   │   ├── lib/              # Shared helpers (e.g. Markdown sanitizer)
│   │   └── api/axios.js      # Shared Axios instance
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── start.cmd                 # Windows helper: starts backend + frontend
└── .gitignore
```

## Prerequisites

- **Node.js** 18+ (developed against Node 24) and npm
- **Python** 3.10+ (developed against Python 3.14)
- Optional: a [PayPal developer](https://developer.paypal.com/) account for checkout

## Backend setup

From the repository root (commands shown for Windows PowerShell; on macOS/Linux activate the venv with `source .venv/bin/activate`):

```powershell
# 1. Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r back/requirements.txt

# 3. Configure the environment
Copy-Item back\.env.example back\.env
# Generate a SECRET_KEY and paste it into back\.env (SECRET_KEY=...):
python -c "import secrets; print(secrets.token_hex(32))"

# 4. Start the API server (creates shop.db on first start)
python back/server.py
```

The backend listens on **http://127.0.0.1:5000** and creates `shop.db` in the `back/` directory on first launch. Logs are written to `server.log`.

> 💡 **First launch:** the first run
> - seeds a **temporary admin account** (`admin` / `admin`) — log in once with
>   it and you are redirected to `/setup`, where you create your own admin
>   account (the temporary one is deleted in that step), and
> - seeds a **demo catalog** (8 products + 5 services with placeholder images)
>   so the shop never looks empty. Delete or edit these in the Admin panel to
>   start with your own content — real data is never overwritten.

## Frontend setup

From the repository root:

```powershell
cd front
npm install
npm run dev
```

The Vite dev server runs on **http://localhost:5173** and reads API data from `http://127.0.0.1:5000/api`.

## One-command start

On Windows you can start both servers at once:

```powershell
.\start.cmd
```

This launches the backend (`py server.py`), the frontend (`npm run dev`), and opens the site in your default browser.

## Environment variables

All backend configuration lives in `back/.env` (see `back/.env.example`).

| Variable               | Required | Default                                      | Description                                             |
| ---------------------- | -------- | -------------------------------------------- | ------------------------------------------------------- |
| `SECRET_KEY`           | ✅       | –                                            | Secret used to sign auth tokens (use a long random value) |
| `MAX_UPLOAD_MB`        | ✅       | –                                            | Max image upload size in megabytes                      |
| `ALLOWED_ORIGINS`      | ❌       | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allow-list for the API             |
| `ADMIN_USERNAME`       | ❌       | `LeonBoussen`                                | Legacy: username auto-promoted to admin when migrating old databases |
| `ENABLE_DEV_DISCOUNT_CODES` | ❌  | `0`                                          | Set `1` to enable the DEV10/STUDENT15/SAVE5 dev codes   |
| `PAYPAL_CLIENT_ID`     | ❌       | (empty)                                      | PayPal client ID; empty disables PayPal                 |
| `PAYPAL_CLIENT_SECRET` | ❌       | (empty)                                      | PayPal client secret                                    |
| `PAYPAL_ENV`           | ❌       | `sandbox`                                    | `sandbox` or `live`                                     |
| `CURRENCY`             | ❌       | `EUR`                                        | Three-letter ISO currency code                          |
| `ADMIN_PASSWORD`       | ❌       | (empty)                                      | Legacy variable, not used by auth checks                |

**Auth model:** passwords are PBKDF2-hashed and must be at least 8 characters (enforced server-side). Users log in with their email **or** username. Admin rights come from the account's `role` column — never from its username.

**First launch:** a fresh database is seeded with a temporary admin account (`admin` / `admin`). The first login with it is redirected to `/setup`, where you create your own admin account. That step deletes the temporary account, so `admin`/`admin` immediately stops working and your new account is the only admin. `ADMIN_USERNAME` is only used to auto-promote the owner when migrating databases created before roles existed.

## API reference

All endpoints are prefixed with `/api`. Admin routes require a bearer token whose account has the `admin` role; user routes require any valid token.

| Method | Endpoint                     | Auth  | Description                        |
| ------ | ---------------------------- | ----- | ---------------------------------- |
| GET    | `/api/catchphrase`           | –     | Random marketing tagline           |
| GET    | `/api/products`              | –     | List products                      |
| GET    | `/api/products/<id>`         | –     | Single product + image gallery     |
| POST   | `/api/products`              | admin | Create product                     |
| PUT    | `/api/products/<id>`         | admin | Update product                     |
| DELETE | `/api/products/<id>`         | admin | Delete product                     |
| GET    | `/api/services`              | –     | List active services               |
| POST   | `/api/services`              | admin | Create service                     |
| PUT    | `/api/services/<id>`         | admin | Update service                     |
| DELETE | `/api/services/<id>`         | admin | Delete service                     |
| POST   | `/api/auth/signup`           | –     | Register (returns token + role; rate-limited) |
| POST   | `/api/auth/login`            | –     | Log in with email or username (returns token + role; rate-limited) |
| GET    | `/api/auth/me`               | user  | Current user (incl. role)          |
| GET    | `/api/auth/setup-status`     | –     | Whether the first-launch setup is pending      |
| POST   | `/api/auth/setup`            | setup admin | Create the owner's admin account & delete the temporary one |
| GET    | `/api/user/profile`          | user  | Get profile                        |
| PUT    | `/api/user/profile`          | user  | Update profile / change password   |
| POST   | `/api/upload/image`          | admin | Upload a product/service image     |
| POST   | `/api/contact`               | –     | Submit a contact-form message (rate-limited) |
| GET    | `/api/paypal/config`         | –     | PayPal client config for the SDK   |
| POST   | `/api/paypal/create-order`   | –     | Create a PayPal order              |
| POST   | `/api/paypal/capture-order`  | –     | Capture an approved PayPal order   |
| GET    | `/static/uploads/<filename>` | –     | Serve uploaded images              |

Authentication tokens are returned as `{ token, user_id, role }` and must be sent as `Authorization: Bearer <token>`.

## Frontend routes

| Path           | Page                                  |
| -------------- | ------------------------------------- |
| `/`            | Home                                  |
| `/products`    | Product/service catalog + cart drawer |
| `/product/:id` | Product details (image gallery)       |
| `/about`       | About                                 |
| `/contact`     | Contact form                          |
| `/addproduct`  | Legacy add-product form               |
| `/login`       | Login                                 |
| `/signup`      | Sign up                               |
| `/setup`       | First-launch wizard (create your admin account) |
| `/admin`       | Admin panel (products/services)       |
| `/account`     | Profile & password management         |
| `/checkout`    | Checkout (PayPal + dev payment UI)    |

## Features

- **Catalog** — products and services with multi-image galleries, sanitized Markdown descriptions, discounts, "limited edition" and "sold out" badges.
- **Cart** — client-side cart persisted in `localStorage` (key `cart`).
- **Auth** — signup/login (email or username) with PBKDF2-hashed passwords (min. 8 chars, server-enforced), signed bearer tokens, per-IP rate limiting. First launch seeds a temporary `admin`/`admin` account that is replaced by your own account via `/setup`.
- **Admin** — role-based CRUD for products and services, including multi-image upload (re-encoded & EXIF-stripped by Pillow; uploads are refused without it).
- **Checkout** — server-side amount calculation and PayPal Orders API v2 integration. Dev discount codes `DEV10` (10%), `STUDENT15` (15%), `SAVE5` (€5) exist only when `ENABLE_DEV_DISCOUNT_CODES=1`.
- **Contact** — validated, rate-limited form submissions stored in SQLite.

## Scripts

Frontend (`front/`):

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `npm run dev`     | Start the Vite dev server    |
| `npm run build`   | Production build to `dist/`  |
| `npm run preview` | Preview the production build |
| `npm run lint`    | Run ESLint                   |

## Security & known limitations

The repo ships with the following hardening (see also `SECURITY.md` for the full audit report with before/after tests):

- Role-based admin (`users.role`), reserved admin username, and automatic migration of pre-role databases.
- No credentials/tokens/password hashes in `server.log`; per-IP rate limits on login, signup and contact.
- CORS restricted to the `ALLOWED_ORIGINS` allow-list; hardening headers on all API responses.
- Server-side validation: password min. 8 chars, email format, length caps (auth, profile, contact).
- Markdown product/service descriptions are sanitized (`rehype-sanitize`) before rendering.
- Image uploads require Pillow so files are re-encoded and metadata-stripped.
- Dev discount codes are off by default (`ENABLE_DEV_DISCOUNT_CODES`).

Known limitations (accepted for a template, revisit before going live):

- **Non-PayPal payment methods** (Stripe, iDEAL, Crypto) are UI placeholders — the "Place order" button simulates success.
- **Auth token is stored client-side** (`localStorage`); it is not refreshed or revocable server-side. An HttpOnly-session design would further reduce XSS impact.
- **Rate limits are in-memory** (per process) — fine for a single dev server; a shared store (e.g. Redis) is needed when scaling.
- The Flask server binds to `127.0.0.1` — expose it behind a reverse proxy with TLS for anything public.
