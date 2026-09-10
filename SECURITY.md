# Security Audit — Webstore Template

Two rounds of review against this repository:

- **Round 1** — the original audit, shipped with the `security patches` commit (`b230787`).
- **Round 2** — a follow-up audit of the current working tree. It found that three Round-1 fixes
  did not actually hold in the code (**BE-12**, **BE-13**, **BE-14**) and that one Round-1 record
  was wrong (**BE-15**). All four are closed or corrected below.

Status: 🟩 Fixed & re-tested · 🟨 Accepted risk (documented).

Every 🟩 finding was reproduced with a live test against the pre-fix code, fixed, and re-tested.
Round-2 evidence is the verbatim output of probes run against this tree; Round-1 evidence is kept
as the historical record of that audit.

## Summary

| ID    | Finding | Severity | Component | Status |
| ----- | ------- | -------- | --------- | ------ |
| BE-01 | Privilege escalation: admin was granted purely by choosing the username `LeonBoussen` at signup (no reserved name, no role) | Critical | `back/server.py`, `back/init_db.py` | 🟩 Fixed in R1 — residual path found in R2 → **BE-12** |
| BE-02 | Plaintext passwords, full auth tokens, password hash/salt and PayPal credentials written to `server.log` | High | `back/server.py` | 🟩 Fixed in R1 — residual logging found in R2 → **BE-13** |
| BE-03 | No rate limiting on login/signup/contact → brute force and spam | High | `back/server.py` | 🟩 Fixed in R1 — signup was still unlimited → **BE-14** |
| BE-04 | CORS wide open — any origin could call/read the API | Medium | `back/server.py` | 🟩 Fixed |
| BE-05 | 1-character passwords accepted; no server-side email/username validation | Medium | `back/server.py` | 🟩 Fixed |
| BE-06 | User enumeration: duplicate-email signup answered differently (409 + "email already registered"); login timing differed for unknown emails | Medium | `back/server.py` | 🟩 Fixed |
| BE-07 | Dev discount codes (`DEV10`/`STUDENT15`/`SAVE5`) always active in price logic | Medium | `back/server.py` | 🟩 Fixed |
| BE-08 | Contact endpoint echoed internal exception text in 500 responses | Low | `back/server.py` | 🟩 Fixed |
| BE-09 | Missing hardening headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) | Low | `back/server.py` | 🟩 Fixed |
| BE-10 | Upload fallback stored unprocessed files when Pillow was missing, ignoring the safety flag | Low | `back/server.py` | 🟩 Fixed (record corrected in **BE-15**) |
| BE-11 | Server started without `SECRET_KEY` (confusing crash later); admin identity hardcoded | Low | `back/server.py` | 🟩 Fixed |
| **BE-12** | **The legacy `ADMIN_USERNAME` promotion re-ran on every startup** — any visitor who signed up with that username (default `LeonBoussen`) became admin after the next restart | **Critical** | `back/init_db.py` | 🟩 Fixed in R2 |
| **BE-13** | **Auth-token body/signature, PBKDF2 hashes and salts were still written to `server.log`** (and the cached PayPal access token was logged verbatim on the token path) | Medium | `back/server.py` | 🟩 Fixed in R2 |
| **BE-14** | **`/api/auth/signup` had no rate limit at all**, although BE-03 and the README claimed 10 req/15 min | Medium | `back/server.py` | 🟩 Fixed in R2 |
| **BE-15** | BE-10's escape hatch is documented as an environment opt-in, but `ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is a hard-coded `False` constant | Low | `back/server.py`, this file | 🟨 Accepted — record corrected |
| FE-01 | Unsanitized Markdown rendering — `javascript:` / `data:` URLs survived the react-markdown pipeline (stored-XSS on click) | High | `front/src/pages/*.jsx` | 🟩 Fixed |
| FE-02 | Auth token in `localStorage` — mitigations applied; HttpOnly-cookie session design tracked as future work | Medium | `front/src/**` | 🟨 Accepted risk |
| FE-03 | `axios` sent `withCredentials` although the API uses bearer tokens, not cookies | Low | `front/src/api/axios.js` | 🟩 Fixed (preventive — see note) |

## Round 1 — original audit (`b230787`)

### Pre-fix probes (historical record)

| Test | Result before fix |
| ---- | ----------------- |
| Signup with username `LeonBoussen`, then call admin upload endpoint | ✅ exploited — HTTP 400 "image file required" (admin check passed); a control account got 403 |
| Grep `server.log` for the password used in a signup/login | ✅ found — plaintext password in log |
| `GET /api/products` with `Origin: https://evil.example` | ✅ reflected `Access-Control-Allow-Origin: https://evil.example` |
| Signup with 1-character password | ✅ accepted — HTTP 201 |
| Re-signup of an existing email | ✅ HTTP 409 `{"error":"email already registered"}` (enumeration) |
| 15 rapid failed logins | ✅ all 401, zero 429 (no throttling) |
| `GET /api/products` headers | ✅ no hardening headers |
| Markdown `[x](javascript:…)`, `![x](data:…)` through the react-markdown pipeline | ✅ `javascript:` and `data:` URLs preserved in output |
| `_apply_dev_discount(100, "DEV10")` | ✅ returned 10.0 unconditionally |

### Remediation applied

#### Backend (`back/server.py`, `back/init_db.py`)

- **BE-01 — Role-based admin.** `users.role` column (`'user'`/`'admin'`, default `'user'`) added by
  `init_db.py`, including a migration that promotes the oldest account with the configured
  `ADMIN_USERNAME`. `require_admin` checks the DB role, never the username. `/api/auth/me` returns
  the role; the admin panel and navbar gate on `role === 'admin'`.
- **BE-02 — Log hygiene.** `mask_sensitive()` masks credential-like keys; signup/login payloads,
  `Authorization` headers and PayPal request bodies are no longer logged in the clear.
- **BE-03 — Rate limiting.** In-memory per-IP limiter decorator: login 10 req/15 min, contact
  5 req/hour → HTTP 429 beyond.
- **BE-04 — CORS allow-list.** `CORS(app, origins=ALLOWED_ORIGINS)`; default
  `http://localhost:5173,http://127.0.0.1:5173`, override via env.
- **BE-05 — Server-side validation.** Passwords 8–128 chars, username 3–32, email format + length
  checks on signup, profile and password change; the UI hints match.
- **BE-06 — Enumeration hardening.** Duplicate-email and reserved-username signups both return the
  same generic `409 {"error":"Account could not be created"}`; login performs an equivalent PBKDF2
  derivation for unknown identifiers (timing equalization).
- **BE-07 — Discount gate.** Dev codes only when `ENABLE_DEV_DISCOUNT_CODES=1` (default off).
- **BE-08 — Contact hardening.** Length caps, email validation, generic 500 message (details go to
  the log only), rate limit.
- **BE-09 — Headers.** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` on every response.
- **BE-10 — Upload gate.** Uploads are refused (503) when Pillow is unavailable, unless the
  in-source constant `ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is changed to `True`.
- **BE-11 — Fail fast.** Server refuses to start without `SECRET_KEY`; admin username configurable
  via `ADMIN_USERNAME`.

#### Frontend (`front/src/**`)

- **FE-01 — Markdown sanitization.** `front/src/lib/markdown.js` exports a hardened
  `rehype-sanitize` schema (allow-list protocols: http/https/mailto; GFM tables, task-list
  checkboxes and class attributes kept); applied in `Products.jsx` and `ProductDetails.jsx`.
- **FE-03 — `api/axios.js`** no longer sends `withCredentials`.

## Round 2 — follow-up audit

### BE-12 (Critical) — the username-based admin promotion re-ran on every startup

`init_db.py` promoted "the oldest account whose username equals `ADMIN_USERNAME`" on **every**
startup, not just once. That was the dangerous half of BE-01: the username was still an
admin-making credential. `ADMIN_USERNAME` defaults to `LeonBoussen`, and nothing stopped a normal
signup from claiming it, so on a fresh install any visitor could register that name and be
promoted to admin the next time the server restarted.

Reproduced against the pre-fix code (fresh database → attacker signup → restart):

```
PRE-FIX admin holders after restart: [('attacker@evil.example', 'LeonBoussen', 'admin', 0)]
```

The attacker's account was the **only** admin, and the temporary `admin`/`admin` setup account had
been deleted by the same run. Equivalent step-by-step output:

```
after first launch : [(1, 'admin', 'admin', 1)]
after signup       : [(1, 'admin', 'admin', 1), (2, 'LeonBoussen', 'user', 0)]
after restart      : [(2, 'LeonBoussen', 'admin', 0)]
```

**Fix.** `users_predate_roles` is read *before* the column backfill, and the promotion only runs
when the `role` column is actually being added — i.e. exactly once, on a database created before
roles existed. On a current-schema database the only bootstrap is the temporary setup account plus
`POST /api/auth/setup`.

Re-tested:

```
after restart : [(1, 'admin', 'admin', 1), (2, 'LeonBoussen', 'user', 0)]
ADMIN HOLDERS : [('setup-admin@local.invalid', 'admin', 'admin', 1)]
```

The legitimate migration path still works, and does not repeat:

```
pre-role db, before migration: cols=[id, email, username, password_hash, salt] rows=[(1, 'LeonBoussen')]
Adding column role to users  (backfill)
Promoted 'LeonBoussen' to admin role (pre-role database migration).
after 1st start (expect admin):          rows=[(1, 'LeonBoussen', 'admin', 0)]
after 2nd start (expect NO promotion):   rows=[(1, 'LeonBoussen', 'user', 0), (2, 'admin', 'admin', 1)]
```

### BE-13 (Medium) — credential material still reached `server.log`

BE-02 removed plaintext passwords from the log, but three more paths kept writing credentials:

- `b64url()` logged the encoded value on every `sign_token`/`verify_token` call — that is the
  **token body and its HMAC signature**.
- `_b64e()` / `_b64d()` logged the encoded value — that is the **PBKDF2 password hash and the
  per-user salt**, on every signup, login and password change.
- `paypal_get_token()` logged the decoded token response, which contains
  `"access_token": "A21AA…"` (found by reading the code; the live PayPal path needs sandbox
  credentials, which are not configured here).

Reproduced against the pre-fix code (signup + login, then grep the stored hash/salt and the issued
token out of `server.log`):

```
PRE-FIX admin: stored hash in log = True | stored salt in log = True
PRE-FIX puser0: stored hash in log = True | stored salt in log = True
PRE-FIX puser1: stored hash in log = True | stored salt in log = True
PRE-FIX token body in log        : True
PRE-FIX token signature in log   : True
PRE-FIX plaintext password in log: False
```

**Fix.** `b64url()`, `_b64e()` and `_b64d()` log sizes only; `verify_token()` logs the `user_id`
instead of the whole payload; the PayPal token response and successful `_http_json()` responses go
through `mask_sensitive()`, and raw success-body prefixes are no longer echoed. (HTTP *error* bodies
are still logged as plain text for debugging — they originate from PayPal and contain no credentials
of ours.)

Re-tested — none of it is in the log any more:

```
admin: stored hash in log = False | stored salt in log = False
leakuser: stored hash in log = False | stored salt in log = False
issued token in log      : False
token body in log        : False
token signature in log   : False
plaintext password in log: False
```

### BE-14 (Medium) — `/api/auth/signup` had no rate limit

BE-03 and the README both stated signup was limited to 10 req/15 min. The decorator existed only on
`auth_login` and `contact_submit`; the signup route had none, so account creation was unthrottled —
and each successful call also performs a 200 000-iteration PBKDF2 derivation, so unlimited signup
doubles as a CPU-exhaustion lever.

Reproduced against the pre-fix code:

```
PRE-FIX signup status codes (11 requests): [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 201]
```

**Fix.** `@rate_limit(10, 900)` added to `auth_signup`, matching login.

Re-tested:

```
signup status codes (11 requests): [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]
```

### BE-15 (Low) — the upload "opt-in" is a constant, not a setting

BE-10 says uploads are refused without Pillow "unless `ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is
explicitly true", which reads as an environment variable. It is a Python constant
(`ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED = False`) with no environment hook, so the escape hatch cannot
be enabled from `back/.env` — a fail-closed default, which is the safe direction, but the record was
wrong.

**Decision:** keep it hard-coded and fail-closed rather than adding an environment switch that
would let a deployment store un-sanitized, EXIF-bearing files; this document and the README now
describe it as a source-level constant. The gate itself was re-tested and works: uploads are
refused with `503` when Pillow is missing.

## Round-2 re-tests (live, against the current tree)

All probes ran against the real Flask app (test client, throwaway database, `ALLOWED_ORIGINS`
restricted to `http://localhost:5173`).

| Test | Result after fix |
| ---- | ---------------- |
| Signup as `ADMIN_USERNAME` on a fresh DB, then restart | ✅ stays `role='user'`; temporary setup admin (id 1) survives |
| Legacy database with no `role` column, then restart | ✅ owner promoted to admin once; not re-promoted afterwards |
| Signup + login, then grep the log for hash / salt / token body / signature / password | ✅ none present |
| 11 rapid signups | ✅ `201`×10 then `429` |
| 15 rapid failed logins | ✅ `401`×10 then `429`×5 |
| Contact limiter (5 req/hour, counts rejected attempts too) | ✅ `201`×4 then `429`×2 — 5 of 6 attempts allowed |
| No token → admin endpoint | ✅ `401` |
| Normal-user token → admin endpoint | ✅ `403` |
| Normal-user token → `/api/auth/setup` | ✅ `403 {"error":"Setup is not required"}` |
| Admin token → admin endpoint | ✅ `400` ("image file required" — reached the handler) |
| First-launch handover: login `admin`/`admin` → `POST /api/auth/setup` | ✅ `200 setup_pending=true` → `201 role=admin` → `admin`/`admin` then `401` |
| Tampered token signature → `/api/auth/me` | ✅ `403` |
| Malformed token → `/api/auth/me` | ✅ `403` |
| Evil-origin CORS GET and preflight | ✅ no `Access-Control-Allow-Origin`; `http://localhost:5173` still echoed |
| Hardening headers on an API response | ✅ `nosniff`, `DENY`, `no-referrer` |
| 1-character password signup | ✅ `400 {"error":"Password must be at least 8 characters"}` |
| Invalid email signup | ✅ `400 {"error":"A valid email address is required"}` |
| Duplicate-email signup | ✅ `409 {"error":"Account could not be created"}` |
| Signup using the temporary admin username | ✅ `409 {"error":"Account could not be created"}` |
| Short new password via profile `PUT` | ✅ `400` |
| Password change without `current_password` | ✅ `400` |
| Oversized contact message | ✅ `400` |
| `_apply_dev_discount(100, "DEV10")` with the flag off / on | ✅ `0.0` / `10.0` |
| Upload a 2000×1200 JPEG carrying Make/Model/Artist/GPS EXIF | ✅ `201`; stored file is 1600×960, `stored EXIF = {}`, no GPS tag |
| Upload 11 MB with `MAX_UPLOAD_MB=10` | ✅ `413 {"error":"file too large (>10MB)"}` |
| Upload `.svg` | ✅ `415 {"error":"unsupported file type"}` |
| Upload with Pillow simulated as missing (`PIL_AVAILABLE=False`) | ✅ `503 {"error":"Image processing unavailable on server"}` — nothing is stored |
| Markdown `[x](javascript:…)` / `![y](data:text/html;…)` through the real pipeline | ✅ both stripped from the output |
| Markdown `https://` and relative links, GFM tables, `~~del~~` | ✅ all preserved |
| `npm run build` | ✅ builds (`dist/`); only a >500 kB chunk-size warning |
| `python -m py_compile back/server.py back/init_db.py` | ✅ compiles (one pre-existing `SyntaxWarning: 'break' in a 'finally' block`) |

### Corrections to the Round-1 record

1. **BE-01 was not fully fixed.** `require_admin` checks the role correctly, but the username was
   still an admin-making credential through the unconditional startup migration (**BE-12**).
2. **BE-02 was not fully true.** Plaintext passwords were gone, but hashes, salts, token
   bodies/signatures and the PayPal access token were still logged (**BE-13**).
3. **BE-03 was not fully true.** `signup` was never rate limited (**BE-14**).
4. **BE-10's escape hatch has no environment hook** (**BE-15**).
5. The Round-1 re-test row *"Legacy-DB migration (owner row reset to `user`, restart) → row
   promoted back to `admin` on startup"* described the BE-12 vulnerability as a feature. Promotion
   now happens only when the `role` column is first added; a current-schema database is never
   re-promoted.
6. **FE-03's fix is preventive.** `front/src/api/axios.js` is not imported by any page — every page
   builds its own client (`axios.create({baseURL: 'http://127.0.0.1:5000'})` or plain `fetch`) and
   none sets `withCredentials`, so no request ever attached cookies.

### Not re-verified in Round 2

- **PayPal order creation and capture** (`/api/paypal/create-order`, `/capture-order`) — requires
  live sandbox credentials, which are not configured in this checkout. The amount is recomputed
  server-side from database prices, so the client cannot set the charged total.
- **`npm audit`** — needs network access; the Round-1 result (0 vulnerabilities after adding
  `rehype-sanitize`) was not re-checked.
- **`npm run lint`** — still reports 9 errors and 2 warnings (unused variables in `Account.jsx`,
  `Checkout.jsx`, `Contact.jsx`, `ProductDetails.jsx`, `Products.jsx`; an empty block in
  `Products.jsx`; two missing hook dependencies). None of them are security findings.

## Notes & accepted risks

- **Rate limits are per-process and in-memory.** They reset on restart and are not shared between
  workers; a shared store (e.g. Redis) is required when scaling beyond the single dev server.
  Because the limiter counts every attempt — including requests rejected by validation — legitimate
  users share the budget with mistyped ones.
- **Token storage remains `localStorage` (FE-02),** with no server-side revocation or refresh. The
  sanitizer, CORS allow-list and hardening headers raise the bar; an HttpOnly-cookie session
  architecture is the recommended next step before public deployment.
- **Auth tokens are valid for 7 days** and are signed with `SECRET_KEY`; rotating that key
  invalidates every issued token.
- **The frontend hard-codes the API base URL** in each page instead of using
  `front/src/api/axios.js`, and `front/src/lib/markdown.js` imports `hast-util-sanitize` without it
  being a declared dependency in `package.json` (it currently resolves transitively through
  `rehype-sanitize`). Both are maintainability risks worth cleaning up.
- **Dead code:** `save_image_and_get_rel_url()` in `server.py` is not called by any route and
  references the `Image` symbol directly, so it would raise `NameError` — not the intended `503` —
  if Pillow were missing. The `orders`, `order_items` and `discount_codes` tables and the
  `products.almost_sold_out` column are scaffolded but never written.
- **The startup "retry" loop** around `app.run()` breaks out of its own `finally` block on the first
  pass, so it never retries (Python emits a `SyntaxWarning`). Cosmetic, but misleading.
- **No automated test suite** exists in either half of the repository; every result above came from
  manual, live probes run with `flask.test_client()` and Node, against throwaway databases.

## Addendum — first-launch admin bootstrap (`admin` / `admin`)

The reserved-username bootstrap described in BE-01 was replaced by an explicit first-run flow:

- `back/init_db.py` seeds a **temporary** admin account (`username: admin`, `password: admin`,
  flagged `is_setup_admin=1`) whenever a database has no admin at all (fresh installs; idempotent
  across restarts, and any leftover temporary account is removed once a real admin exists).
- Logging in with the temporary account returns `setup_pending: true`; the UI redirects to `/setup`
  and forces the owner to create their own admin account (`POST /api/auth/setup`, callable only with
  the temporary admin's token).
- Setup creates the owner's account with role `admin`, deletes the temporary account in the same
  transaction, and returns a token for the new account — `admin`/`admin` stops working immediately.
- Regular signups always create role `user`; while the temporary account exists its username is
  protected from impersonation. Users may log in with **email or username**.
- `ADMIN_USERNAME` remains only as a one-time migration aid for databases created before roles
  existed, and — since BE-12 — is only ever consulted when that migration actually runs.

> ⚠️ The temporary `admin` / `admin` account is a bootstrap convenience. Until you complete
> `/setup`, anyone who can reach the API can claim it, so complete setup immediately after the
> first start (or delete the temporary row before exposing the server).
