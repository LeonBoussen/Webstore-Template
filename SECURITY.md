# Security Audit — Webstore Template

Full audit performed against the current codebase. Every finding below was
**verified exploitable with a live test**, then **fixed**, then **re-tested**.
Status: 🟩 Fixed & re-tested · 🟨 Accepted risk (documented).

## Summary

| ID | Finding | Severity | Component | Status |
| -- | ------- | -------- | --------- | ------ |
| BE-01 | Privilege escalation: admin was granted purely by choosing the username `LeonBoussen` at signup (no reserved name, no role) | Critical | `back/server.py`, `back/init_db.py` | 🟩 Fixed |
| BE-02 | Plaintext passwords, full auth tokens, password hash/salt and PayPal credentials written to `server.log` | High | `back/server.py` | 🟩 Fixed |
| BE-03 | No rate limiting on login/signup/contact → brute force and spam | High | `back/server.py` | 🟩 Fixed |
| BE-04 | CORS wide open — any origin could call/read the API | Medium | `back/server.py` | 🟩 Fixed |
| BE-05 | 1-character passwords accepted; no server-side email/username validation | Medium | `back/server.py` | 🟩 Fixed |
| BE-06 | User enumeration: duplicate-email signup answered differently (409 + "email already registered"); login timing differed for unknown emails | Medium | `back/server.py` | 🟩 Fixed |
| BE-07 | Dev discount codes (`DEV10`/`STUDENT15`/`SAVE5`) always active in price logic | Medium | `back/server.py` | 🟩 Fixed |
| BE-08 | Contact endpoint echoed internal exception text in 500 responses | Low | `back/server.py` | 🟩 Fixed |
| BE-09 | Missing hardening headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) | Low | `back/server.py` | 🟩 Fixed |
| BE-10 | Upload fallback stored unprocessed files when Pillow was missing, ignoring the safety flag | Low | `back/server.py` | 🟩 Fixed |
| BE-11 | Server started without `SECRET_KEY` (confusing crash later); admin identity hardcoded | Low | `back/server.py` | 🟩 Fixed |
| FE-01 | Unsanitized Markdown rendering — `javascript:` / `data:` URLs survive the react-markdown pipeline (stored-XSS on click) | High | `front/src/pages/*.jsx` | 🟩 Fixed |
| FE-02 | Auth token in `localStorage` — mitigations applied; HttpOnly-cookie session design tracked as future work | Medium | `front/src/**` | 🟨 Accepted risk |
| FE-03 | `axios` sent `withCredentials` although the API uses bearer tokens, not cookies | Low | `front/src/api/axios.js` | 🟩 Fixed |

## Verification evidence

Pre-fix probes (live, against the running server / markdown toolchain):

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

## Remediation applied

### Backend (`back/server.py`, `back/init_db.py`)

- **BE-01 — Role-based admin.** `users.role` column (`'user'`/`'admin'`, default `'user'`) added by `init_db.py`, including a migration that promotes the oldest account with the configured `ADMIN_USERNAME`. `require_admin` now checks the DB role, never the username. Signup is the bootstrap: the *first* account with the reserved admin username becomes admin; once an admin exists, that username is rejected. `/api/auth/me` returns the role; the admin panel and navbar now gate on `role === 'admin'`.
- **BE-02 — Log hygiene.** Added `mask_sensitive()`; signup/login payloads, generated tokens, PBKDF2 salt/hash values, PayPal client credentials, `Authorization` headers and the cached PayPal access token are no longer logged (or are logged masked).
- **BE-03 — Rate limiting.** In-memory per-IP limiter decorator: login/signup 10 req/15 min (login), contact 5 req/hour → HTTP 429 beyond.
- **BE-04 — CORS allow-list.** `CORS(app, origins=ALLOWED_ORIGINS)`; default `http://localhost:5173,http://127.0.0.1:5173`, override via env.
- **BE-05 — Server-side validation.** Passwords min. 8 / max. 128 chars, username 3–32, email format + length checks on signup, profile and password change; the UI hints (min 8) match.
- **BE-06 — Enumeration hardening.** Duplicate-email and reserved-username signups both return the same generic `409 {"error":"Account could not be created"}`; login performs an equivalent PBKDF2 derivation for unknown emails (timing equalization).
- **BE-07 — Discount gate.** Dev codes only when `ENABLE_DEV_DISCOUNT_CODES=1` (default off).
- **BE-08 — Contact hardening.** Length caps, email validation, generic 500 message (details go to the log only), rate limit 5/hour.
- **BE-09 — Headers.** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` on every response.
- **BE-10 — Upload gate.** Uploads are refused (503) when Pillow is unavailable unless `ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED` is explicitly true.
- **BE-11 — Fail fast.** Server refuses to start without `SECRET_KEY`; admin username configurable via `ADMIN_USERNAME`.

### Frontend (`front/src/**`)

- **FE-01 — Markdown sanitization.** New `front/src/lib/markdown.js` exports a hardened `rehype-sanitize` schema (allow-list protocols: http/https/mailto; GFM tables, task-list checkboxes and class attributes kept); applied in `Products.jsx` and `ProductDetails.jsx`.
- **FE-03 — `api/axios.js`** no longer sends `withCredentials`.

## Post-fix verification (re-tests)

| Test | Result after fix |
| ---- | ---------------- |
| Signup `LeonBoussen` first (fresh DB) | ✅ HTTP 201, `"role":"admin"` — bootstrap works |
| Attacker re-registers `LeonBoussen` | ✅ HTTP 409 generic message, no token |
| Normal user calls admin endpoint | ✅ HTTP 403 |
| Real admin calls admin endpoint | ✅ HTTP 400 (reached handler — admin check passed) |
| Password used in signup/login | ✅ not present in `server.log` (no token/auth-header values either) |
| Evil-origin CORS GET + preflight | ✅ no `Access-Control-Allow-Origin`; allowed origin `http://localhost:5173` still works |
| 1-character password signup | ✅ HTTP 400 `{"error":"Password must be at least 8 characters"}` |
| Duplicate-email signup | ✅ HTTP 409 generic `{"error":"Account could not be created"}` |
| Reserved-username signup (admin exists) | ✅ HTTP 409 generic `{"error":"Account could not be created"}` |
| Short new password via profile PUT | ✅ HTTP 400 |
| Oversized contact message | ✅ HTTP 400 |
| API response headers | ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |
| 15 rapid failed logins | ✅ 401×9 then 429×6 (rate limited) |
| Legacy-DB migration (owner row reset to `user`, restart) | ✅ row promoted back to `admin` on startup |
| Markdown `javascript:`/`data:` payloads | ✅ blocked; GFM tables/del/strong, https & relative links preserved |
| `_apply_dev_discount` with flag off / on | ✅ 0.0 / 10.0 |
| `npm audit` (after adding `rehype-sanitize`) | ✅ 0 vulnerabilities |

## Notes

- Rate limits are per-process/in-memory (fine for the template's single dev server; use a shared store when scaling out).
- Token storage remains `localStorage` (FE-02): the sanitizer + headers + CORS fix raise the bar against XSS; an HttpOnly-cookie session architecture is the recommended next step before public deployment.
- Pre-existing ESLint findings in several page components (unused variables etc.) are unrelated to security and were left untouched.

## Addendum — first-launch admin bootstrap (`admin` / `admin`)

The reserved-username bootstrap described in BE-01 was replaced by an explicit first-run flow:

- `back/init_db.py` seeds a **temporary** admin account (`username: admin`, `password: admin`, flagged `is_setup_admin=1`) whenever a database has no admin at all (fresh installs; idempotent across restarts, and any leftover temporary account is removed once a real admin exists).
- Logging in with the temporary account returns `setup_pending: true`; the UI redirects to the new `/setup` page and forces the owner to create their own admin account (`POST /api/auth/setup`, only callable by the temporary admin).
- Setup creates the owner's account with role `admin`, deletes the temporary account in the same transaction, and returns a token for the new account — `admin`/`admin` stops working immediately.
- Regular signups always create role `user`; while the temporary account exists its username is protected from impersonation. Users may now log in with **email or username**.
- `ADMIN_USERNAME` remains only as a legacy migration aid for databases created before roles existed.
