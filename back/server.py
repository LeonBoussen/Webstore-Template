try:
    import init_db
    import uuid
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
    import sqlite3
    from datetime import datetime
    import colorama
    import random
    import os, hashlib, hmac, base64, json, time, re
    import threading
    from functools import wraps
    from werkzeug.utils import secure_filename
    from dotenv import load_dotenv
    import urllib.request
    import urllib.parse
    import ssl
    try:
        from PIL import Image
        PIL_AVAILABLE = True
    except Exception:
        PIL_AVAILABLE = False
except ImportError as e:
    print(f"Failed to import required module: {e}. Make sure all dependencies are installed.")
    exit(1)

try:
    load_dotenv()
    colorama.init(autoreset=True)
except Exception as e:
    print(f"Failed to load environment or initialize colorama: {e}")
    input("Press Enter to exit...")
    exit(1)

try:
    # Origins allowed to call this API (CORS allow-list). Defaults to the
    # Vite dev-server origins; override with ALLOWED_ORIGINS in back/.env.
    ALLOWED_ORIGINS = [
        o.strip()
        for o in (os.environ.get("ALLOWED_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ]
    app = Flask(__name__, static_folder="static")
    app.config["JSON_SORT_KEYS"] = False
    CORS(app, origins=ALLOWED_ORIGINS)
except Exception as e:
    print(f"Failed to initialize Flask app: {e}")
    input("Press Enter to exit...")
    exit(1)

try:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError(
            "SECRET_KEY is required. Copy back/.env.example to back/.env "
            "and set a long random value."
        )
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
    # Username that is reserved for the shop owner / first admin account.
    ADMIN_USERNAME = (os.environ.get("ADMIN_USERNAME") or "LeonBoussen").strip()
    # Keep the hard-coded dev discount codes working only when explicitly enabled.
    ENABLE_DEV_DISCOUNT_CODES = (os.environ.get("ENABLE_DEV_DISCOUNT_CODES") or "0").strip().lower() in ("1", "true", "yes", "on")
    UPLOAD_DIR = os.path.join(os.getcwd(), "static", "uploads")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB"))
    ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
    ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED = False # if PIL not installed do we allow for file uploads where we couldnt reconstruct the image without EXIF data? (default: no, for privacy reasons & security)
    DATABASE = 'shop.db'
    PBKDF2_ITERATIONS = 200_000  # used by hash_password/verify_password

    # --- PayPal / currency configuration ---
    PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
    PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")
    PAYPAL_ENV = (os.environ.get("PAYPAL_ENV", "sandbox") or "sandbox").lower()  # "sandbox" or "live"
    CURRENCY = os.environ.get("CURRENCY", "EUR")
    _PAYPAL_TOKEN = None
    _PAYPAL_TOKEN_EXP = 0
except ValueError as e:
    print(f"Value Error: {e}")
    input("Press Enter to exit...")
    exit(1)
except Exception as e:
    print(f"Failed to load configuration: {e}")
    input("Press Enter to exit...")
    exit(1)

@app.after_request
def add_security_headers(resp):
    """Minimal hardening headers on every response."""
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp

# ----------------------------
# Log safety + rate limiting
# ----------------------------

# Keys whose values must never reach the log file.
SENSITIVE_KEY_PARTS = ("password", "token", "secret", "authorization", "cookie", "salt", "hash")

def mask_sensitive(obj):
    """Recursively mask credential-like keys before values are logged."""
    if isinstance(obj, dict):
        return {
            k: ("***" if any(p in k.lower() for p in SENSITIVE_KEY_PARTS) else mask_sensitive(v))
            for k, v in obj.items()
        }
    if isinstance(obj, (list, tuple)):
        return [mask_sensitive(v) for v in obj]
    return obj

_rl_lock = threading.Lock()
_rl_hits: dict = {}

def rate_limit(max_requests: int, window_seconds: int):
    """Decorator: allow at most `max_requests` requests per window per client IP."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or "unknown"
            key = f"{ip}:{fn.__name__}"
            now = time.time()
            with _rl_lock:
                hits = [t for t in _rl_hits.get(key, []) if now - t < window_seconds]
                if len(hits) >= max_requests:
                    return jsonify({"error": "Too many requests. Try again later."}), 429
                hits.append(now)
                _rl_hits[key] = hits
                if len(_rl_hits) > 10_000:  # best-effort prune, keep table bounded
                    for k in [k for k, v in _rl_hits.items()
                              if not any(now - t < window_seconds for t in v)]:
                        _rl_hits.pop(k, None)
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def log(message, status="DEFAULT"):
    try:
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status = status.upper()
        status_colors = {
            "INFO": colorama.Fore.CYAN,
            "WARNING": colorama.Fore.YELLOW,
            "ERROR": colorama.Fore.RED,
            "SUCCESS": colorama.Fore.GREEN,
            "DEFAULT": colorama.Fore.WHITE
        }
        color = status_colors.get(status, colorama.Fore.MAGENTA)
        status_label = status if status in status_colors else "NO STATUS"
        log_entry = f"[{current_time} - {status_label}] {message}"
        print(color + log_entry)
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
    except Exception as e:
        error_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fallback_msg = f"[{error_time} - ERROR] Failed to log message: {e}"
        print(colorama.Fore.RED + fallback_msg)
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(fallback_msg + "\n")

print("Log Fucntion OK\nSwitching to LOG mode")

def b64url(data: bytes) -> str:
    log("Encoding data to URL-safe base64", "INFO")
    b = base64.urlsafe_b64encode(data).rstrip(b"=").decode()
    log(f"Encoded data: {b}", "SUCCESS")
    return b

def ub64url(data: str) -> bytes:
    log("Decoding URL-safe base64 data", "INFO")
    padding = "=" * ((4 - len(data) % 4) % 4)
    b = base64.urlsafe_b64decode(data + padding)
    log(f"Decoded bytes length: {len(b)}", "SUCCESS")
    return b

def sign_token(payload: dict, exp_seconds: int = 3600):
    log("Signing token with HMAC-SHA256", "INFO")
    body = payload.copy()
    body["exp"] = int(time.time()) + exp_seconds
    raw = json.dumps(body, separators=(",", ":")).encode()
    sig = hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).digest()
    ret = f"{b64url(raw)}.{b64url(sig)}"
    log(f"Generated token (expires {body['exp']})", "SUCCESS")
    return ret

def verify_token(token: str):
    log("Verifying token", "INFO")
    try:
        raw_b64, sig_b64 = token.split(".")
        raw = ub64url(raw_b64)
        expected = hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, ub64url(sig_b64)):
            return None
        body = json.loads(raw)
        if int(time.time()) > int(body.get("exp", 0)):
            return None
        log(f"Token verified successfully {body}", "SUCCESS")
        return body
    except Exception:
        log("Token verification failed", "ERROR")
        return None

def db():
    return sqlite3.connect(DATABASE)

def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing token"}), 401
        token = auth.split(" ", 1)[1].strip()
        body = verify_token(token)
        if not body or not body.get("user_id"):
            return jsonify({"error": "Invalid token"}), 403
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT role FROM users WHERE id=?", (body["user_id"],))
        row = cur.fetchone()
        conn.close()
        # Admin rights come from the account's role, never from its username.
        if not row or row[0] != "admin":
            return jsonify({"error": "Admin access denied"}), 403
        request.user_id = body["user_id"]
        return fn(*args, **kwargs)
    return wrapper

def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing user token"}), 401
        token = auth.split(" ", 1)[1].strip()
        body = verify_token(token)
        if not body or not body.get("user_id"):
            return jsonify({"error": "Invalid user token"}), 403
        request.user_id = body.get("user_id")
        return fn(*args, **kwargs)
    return wrapper

def row_to_product(r):
    log(f"row_to_product called with row: {r}", "INFO")
    result = {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "limited_edition": r[5], "sold_out": r[6],
        "image_url": r[7] if r[7] else None
    }
    log(f"row_to_product returning: {result}", "SUCCESS")
    return result

def row_to_service(r):
    log(f"row_to_service called with row: {r}", "INFO")
    result = {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "active": r[5],
        "image_url": r[6] if len(r) > 6 else None
    }
    log(f"row_to_service returning: {result}", "SUCCESS")
    return result

def _b64e(b: bytes) -> str:
    log(f"_b64e called with bytes: {b[:20]}... (truncated)", "INFO")
    encoded = base64.b64encode(b).decode('ascii')
    log(f"_b64e returning: {encoded}", "SUCCESS")
    return encoded

def _b64d(s: str) -> bytes:
    log(f"_b64d called with string: {s}", "INFO")
    decoded = base64.b64decode(s.encode('ascii'))
    log(f"_b64d returning bytes of length: {len(decoded)}", "SUCCESS")
    return decoded

def hash_password(password: str) -> tuple[str, str]:
    """
    Returns (hash_b64, salt_b64) using PBKDF2-HMAC-SHA256 with PBKDF2_ITERATIONS.
    """
    log(f"hash_password called", "INFO")
    if not isinstance(password, str):
        log("hash_password: password is not a string", "ERROR")
        raise TypeError("password must be a string")
    salt = os.urandom(16)
    log("hash_password: salt generated", "INFO")
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    log("hash_password: derived key (hash) generated", "INFO")
    hash_b64, salt_b64 = _b64e(dk), _b64e(salt)
    log("hash_password returning (lengths only) hash/salt", "SUCCESS")
    return hash_b64, salt_b64

def verify_password(password: str, stored_hash_b64: str, salt_b64: str) -> bool:
    """
    Verifies password against (stored_hash_b64, salt_b64) using same parameters.
    """
    log(f"verify_password called for password: {'*' * len(password)}", "INFO")
    try:
        salt = _b64d(salt_b64)
        log("verify_password: decoded salt", "INFO")
        dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
        log("verify_password: derived key (hash) generated", "INFO")
        calc = _b64e(dk)
        result = hmac.compare_digest(calc, stored_hash_b64)
        log(f"verify_password: comparison result: {result}", "SUCCESS" if result else "WARNING")
        return result
    except Exception as e:
        log(f"verify_password: exception occurred: {e}", "ERROR")
        return False

def _allowed_file(filename: str) -> bool:
    log(f"_allowed_file called with filename: {filename}", "INFO")
    allowed = "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT
    log(f"_allowed_file returning: {allowed}", "SUCCESS" if allowed else "WARNING")
    return allowed

def save_image_and_get_rel_url(file_storage) -> str:
    log("save_image_and_get_rel_url called", "INFO")
    if not file_storage or not getattr(file_storage, "filename", None):
        log("save_image_and_get_rel_url: No file provided", "ERROR")
        raise ValueError("No file")
    if not _allowed_file(file_storage.filename):
        log(f"save_image_and_get_rel_url: Unsupported file type: {file_storage.filename}", "ERROR")
        raise ValueError("Unsupported file type")

    fname = f"{uuid.uuid4().hex}.webp"
    dest = os.path.join(UPLOAD_DIR, fname)
    log(f"save_image_and_get_rel_url: destination path: {dest}", "INFO")

    if Image is None:
        log("save_image_and_get_rel_url: Pillow not available, saving raw file", "WARNING")
        file_storage.save(dest)
    else:
        log("save_image_and_get_rel_url: Opening image with Pillow", "INFO")
        img = Image.open(file_storage.stream).convert("RGB")
        log(f"save_image_and_get_rel_url: Image opened, size: {img.size}", "INFO")
        img.thumbnail((720, 720))
        log(f"save_image_and_get_rel_url: Image resized to: {img.size}", "INFO")
        img.save(dest, "WEBP", quality=88, method=6)
        log("save_image_and_get_rel_url: Image saved as WEBP", "SUCCESS")

    rel_url = f"/static/uploads/{fname}"
    log(f"save_image_and_get_rel_url returning: {rel_url}", "SUCCESS")
    return rel_url

def get_product_with_images(pid: int):
    log(f"get_product_with_images called with pid: {pid}", "INFO")
    with db() as conn:
        cur = conn.cursor()
        log(f"get_product_with_images: querying product with id={pid}", "INFO")
        p = cur.execute("""
            SELECT id, name, bio, price, discount_price, limited_edition, sold_out
              FROM products
             WHERE id = ?
        """, (pid,)).fetchone()
        if not p:
            log(f"get_product_with_images: product not found for id={pid}", "WARNING")
            return None
        log(f"get_product_with_images: product row: {p}", "INFO")
        imgs = [r[0] for r in cur.execute("""
            SELECT image_path FROM product_images
             WHERE product_id = ?
             ORDER BY sort_order ASC, id ASC
        """, (pid,)).fetchall()]
        log(f"get_product_with_images: images found: {imgs}", "INFO")
        first = imgs[0] if imgs else None
        result = {
            "id": p[0],
            "name": p[1],
            "bio": p[2],
            "price": p[3],
            "discount_price": p[4],
            "limited_edition": p[5],
            "sold_out": p[6],
            "image_url": first,
            "images": imgs,
        }
        log(f"get_product_with_images returning: {result}", "SUCCESS")
        return result

# ----------------------------
# PayPal helpers and endpoints
# ----------------------------

def paypal_api_base() -> str:
    log(f"paypal_api_base called, PAYPAL_ENV={PAYPAL_ENV}", "INFO")
    base = "https://api-m.paypal.com" if PAYPAL_ENV == "live" else "https://api-m.sandbox.paypal.com"
    log(f"paypal_api_base returning: {base}", "INFO")
    return base

def _http_json(method: str, url: str, headers: dict, data_obj=None):
    log(f"_http_json called: method={method}, url={url}, data_obj={mask_sensitive(data_obj)}", "INFO")
    data_bytes = None
    if data_obj is not None:
        data_bytes = json.dumps(data_obj).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
        log("Serialized data_obj to JSON bytes", "INFO")

    req = urllib.request.Request(url=url, data=data_bytes, headers=headers, method=method)
    log(f"Created urllib.request.Request: {req}", "INFO")
    context = ssl.create_default_context()
    log("Created SSL context for request", "INFO")
    try:
        with urllib.request.urlopen(req, context=context, timeout=30) as resp:
            log(f"HTTP request sent, got response: status={resp.status}, reason={getattr(resp, 'reason', None)}", "SUCCESS")
            payload = resp.read()
            log(f"Read response payload: {payload[:200]}... (truncated)", "INFO")
            result = json.loads(payload.decode("utf-8"))
            log(f"Decoded JSON response: {result}", "SUCCESS")
            return result, resp.getcode()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        log(f"HTTPError {e.code} for {url}: {body}", "ERROR")
        try:
            result = json.loads(body)
            log(f"Decoded error JSON: {result}", "ERROR")
            return result, e.code
        except Exception as ex:
            log(f"Failed to decode error body as JSON: {ex}", "ERROR")
            return {"error": body or str(e)}, e.code
    except Exception as e:
        log(f"Request error for {url}: {e}", "ERROR")
        return {"error": str(e)}, 500

def paypal_get_token() -> str:
    global _PAYPAL_TOKEN, _PAYPAL_TOKEN_EXP
    now = int(time.time())
    log(f"paypal_get_token called, now={now}, _PAYPAL_TOKEN_EXP={_PAYPAL_TOKEN_EXP}", "INFO")
    if _PAYPAL_TOKEN and now < (_PAYPAL_TOKEN_EXP - 60):
        log("Returning cached PayPal token", "SUCCESS")
        return _PAYPAL_TOKEN

    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        log("PayPal credentials not configured", "ERROR")
        raise RuntimeError("PayPal credentials not configured")

    auth_str = f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}"
    log("Encoding PayPal client credentials for Basic Auth (values not logged)", "INFO")
    auth = base64.b64encode(auth_str.encode()).decode()
    url = f"{paypal_api_base()}/v1/oauth2/token"
    log(f"PayPal token URL: {url}", "INFO")
    data_bytes = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    log(f"PayPal token request data: {data_bytes}", "INFO")
    headers = {
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    log("PayPal token request headers set (Authorization not logged)", "INFO")
    req = urllib.request.Request(url=url, data=data_bytes, headers=headers, method="POST")
    log(f"Created PayPal token request: {req}", "INFO")
    context = ssl.create_default_context()
    log("Created SSL context for PayPal token request", "INFO")
    try:
        with urllib.request.urlopen(req, context=context, timeout=30) as resp:
            log(f"PayPal token HTTP request sent, got response: status={resp.status}, reason={getattr(resp, 'reason', None)}", "SUCCESS")
            payload = resp.read()
            log(f"Read PayPal token response payload: {payload[:200]}... (truncated)", "INFO")
            payload_json = json.loads(payload.decode("utf-8"))
            log(f"Decoded PayPal token JSON: {payload_json}", "SUCCESS")
            _PAYPAL_TOKEN = payload_json.get("access_token")
            _PAYPAL_TOKEN_EXP = now + int(payload_json.get("expires_in", 300))
            log(f"PayPal access token stored, expires in {payload_json.get('expires_in', 300)}s", "SUCCESS")
            return _PAYPAL_TOKEN
    except Exception as e:
        log(f"Failed to obtain PayPal token: {e}", "ERROR")
        raise

def _get_price_for_item(cur, kind: str, iid: int):
    log(f"_get_price_for_item called with kind={kind}, iid={iid}", "INFO")
    if kind == "product":
        log(f"Fetching product price for id={iid}", "INFO")
        row = cur.execute("SELECT name, price, discount_price FROM products WHERE id=?", (iid,)).fetchone()
    elif kind == "service":
        log(f"Fetching service price for id={iid}", "INFO")
        row = cur.execute("SELECT name, price, discount_price FROM services WHERE id=?", (iid,)).fetchone()
    else:
        log(f"Unknown kind '{kind}' for item id={iid}", "WARNING")
        row = None
    if not row:
        log(f"No row found for kind={kind}, id={iid}", "WARNING")
        return None
    name, price, discount_price = row
    log(f"Fetched row: name={name}, price={price}, discount_price={discount_price}", "INFO")
    unit = discount_price if (discount_price is not None and discount_price < price) else price
    log(f"Unit price determined: {unit}", "INFO")
    return {"name": name, "unit_price": float(unit)}

def _apply_dev_discount(subtotal: float, code: str | None) -> float:
    log(f"_apply_dev_discount called with subtotal={subtotal}, code={code}", "INFO")
    if not code:
        log("No discount code provided", "INFO")
        return 0.0
    # Dev codes are only honored when explicitly enabled via the environment.
    if not ENABLE_DEV_DISCOUNT_CODES:
        log(f"Discount code '{code}' ignored: dev discount codes are disabled (set ENABLE_DEV_DISCOUNT_CODES=1 to enable)", "WARNING")
        return 0.0
    c = code.strip().upper()
    log(f"Normalized discount code: {c}", "INFO")
    if c == "DEV10":
        discount = round(subtotal * 0.10, 2)
        log(f"DEV10 code applied: discount={discount}", "SUCCESS")
        return discount
    if c == "STUDENT15":
        discount = round(subtotal * 0.15, 2)
        log(f"STUDENT15 code applied: discount={discount}", "SUCCESS")
        return discount
    if c == "SAVE5":
        discount = min(5.0, subtotal)
        log(f"SAVE5 code applied: discount={discount}", "SUCCESS")
        return discount
    log(f"Unknown discount code '{c}', no discount applied", "WARNING")
    return 0.0

def compute_amounts(items: list, discount_code: str | None):
    """
    items: [{id, kind, qty}]
    returns dict with subtotal, discount, total (floats)
    """
    log(f"compute_amounts called with items={items}, discount_code={discount_code}", "INFO")
    if not isinstance(items, list) or not items:
        log("Cart is empty or items is not a list", "WARNING")
        return None, "Cart is empty"

    with db() as conn:
        cur = conn.cursor()
        subtotal = 0.0
        for it in items:
            log(f"Processing item: {it}", "INFO")
            try:
                iid = int(it.get("id"))
                kind = (it.get("kind") or "").strip().lower()
                qty = int(it.get("qty") or 1)
                log(f"Parsed item: id={iid}, kind={kind}, qty={qty}", "INFO")
            except Exception as e:
                log(f"Invalid item payload: {it}, error: {e}", "ERROR")
                return None, "Invalid item payload"

            got = _get_price_for_item(cur, kind, iid)
            if not got:
                log(f"Item not found: kind={kind}, id={iid}", "WARNING")
                return None, f"Item not found: {kind} {iid}"
            item_total = got["unit_price"] * max(1, qty)
            log(f"Item unit_price={got['unit_price']}, qty={qty}, item_total={item_total}", "INFO")
            subtotal += item_total

        subtotal = round(subtotal, 2)
        log(f"Subtotal calculated: {subtotal}", "INFO")
        discount = _apply_dev_discount(subtotal, discount_code)
        log(f"Discount calculated: {discount}", "INFO")
        total = max(0.0, round(subtotal - discount, 2))
        log(f"Total calculated: {total}", "INFO")
        return {"subtotal": subtotal, "discount": discount, "total": total}, None

@app.route('/api/paypal/config', methods=['GET'])
def paypal_config():
    log("Received request for PayPal config", "INFO")
    if not PAYPAL_CLIENT_ID:
        log("PayPal client ID not configured", "ERROR")
        return jsonify({"error": "PayPal not configured"}), 500
    config = {
        "client_id": PAYPAL_CLIENT_ID,
        "currency": CURRENCY,
        "env": PAYPAL_ENV
    }
    log(f"Returning PayPal config: {config}", "SUCCESS")
    return jsonify(config)

@app.route('/api/paypal/create-order', methods=['POST'])
def paypal_create_order():
    """
    Expects: { items: [{id, kind, qty}], discount_code: "DEV10"|... }
    Returns: { id: "PAYPAL-ORDER-ID" }
    """
    log("Received request to create PayPal order", "INFO")
    data = request.get_json(force=True, silent=True) or {}
    log(f"Request payload: {data}", "INFO")
    items = data.get("items") or []
    discount_code = data.get("discount_code")
    log(f"Items: {items}, Discount code: {discount_code}", "INFO")

    amounts, err = compute_amounts(items, discount_code)
    log(f"Computed amounts: {amounts}, Error: {err}", "INFO")
    if err:
        log(f"Error in compute_amounts: {err}", "ERROR")
        return jsonify({"error": err}), 400

    total = amounts["total"]
    log(f"Total amount for order: {total}", "INFO")
    if total <= 0:
        log("Total must be greater than 0", "WARNING")
        return jsonify({"error": "Total must be greater than 0"}), 400

    try:
        token = paypal_get_token()
        log("Obtained PayPal token successfully", "SUCCESS")
    except Exception as e:
        log(f"PayPal auth failed: {e}", "ERROR")
        return jsonify({"error": f"PayPal auth failed: {e}"}), 500

    url = f"{paypal_api_base()}/v2/checkout/orders"
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "amount": {
                "currency_code": CURRENCY,
                "value": f"{total:.2f}"
            }
        }]
    }
    log(f"Sending order creation to PayPal: url={url}, payload={payload}", "INFO")
    headers = {"Authorization": f"Bearer {token}"}
    res, code = _http_json("POST", url, headers, data_obj=payload)
    log(f"PayPal response code: {code}, response: {res}", "INFO")
    if code not in (200, 201):
        log(f"Failed to create PayPal order: {res}", "ERROR")
        return jsonify({"error": "Failed to create PayPal order", "details": res}), 500

    order_id = res.get("id")
    log(f"PayPal order created successfully: {order_id}", "SUCCESS")
    return jsonify({"id": order_id, "amounts": amounts})

@app.route('/api/paypal/capture-order', methods=['POST'])
def paypal_capture_order():
    """
    Expects: { order_id: "..." }
    Returns: capture details
    """
    log("Received request to capture PayPal order", "INFO")
    data = request.get_json(force=True, silent=True) or {}
    log(f"Request payload: {data}", "INFO")
    order_id = data.get("order_id") or data.get("orderID")
    log(f"Order ID to capture: {order_id}", "INFO")
    if not order_id:
        log("order_id required for capture", "WARNING")
        return jsonify({"error": "order_id required"}), 400

    try:
        token = paypal_get_token()
        log("Obtained PayPal token successfully for capture", "SUCCESS")
    except Exception as e:
        log(f"PayPal auth failed: {e}", "ERROR")
        return jsonify({"error": f"PayPal auth failed: {e}"}), 500

    url = f"{paypal_api_base()}/v2/checkout/orders/{order_id}/capture"
    log(f"Sending capture request to PayPal: url={url}", "INFO")
    headers = {"Authorization": f"Bearer {token}"}
    res, code = _http_json("POST", url, headers, data_obj={})
    log(f"PayPal capture response code: {code}, response: {res}", "INFO")

    if code not in (200, 201):
        log(f"Failed to capture PayPal order: {res}", "ERROR")
        return jsonify({"error": "Failed to capture PayPal order", "details": res}), 500

    status = res.get("status")
    ok = status in ("COMPLETED", "APPROVED")
    log(f"PayPal order capture status: {status}, ok: {ok}", "SUCCESS" if ok else "WARNING")
    return jsonify({"ok": ok, "status": status, "details": res})

# ----------------------------
# Existing business endpoints
# ----------------------------

@app.route('/api/catchphrase', methods=['GET'])
def catchphrase():
    log("Received request for catchphrase", "INFO")
    list_of_upphrases = [
        "Privacy is a right, not a privilege",
        "Your data, your rules",
        "Control your digital footprint",
        "Anonymity is freedom",
        "Secure your digital life"
    ]
    list_of_downphrases = [
        "Easy and affordable",
        "Secure phones for everyone",
        "Affordable privacy for all",
        "Affordable security, maximum privacy",
        "Cheaper and better than the rest"
    ]
    upph = random.choice(list_of_upphrases)
    downph = random.choice(list_of_downphrases)
    log(f"Generated catchphrase: {upph} | {downph}", "SUCCESS")
    return jsonify({"upphrase": upph, "downphrase": downph})

@app.route('/api/products', methods=['GET'])
def products_get():
    log("Received request for products list", "INFO")
    conn = db()
    cur = conn.cursor()
    log("Executing SQL to fetch products with first image", "INFO")
    # Pull first image via subquery (works with normalized schema)
    cur.execute("""
        SELECT
            p.id, p.name, p.bio, p.price, p.discount_price,
            p.limited_edition, p.sold_out,
            (
                SELECT pi.image_path
                  FROM product_images pi
                 WHERE pi.product_id = p.id
                 ORDER BY pi.sort_order ASC, pi.id ASC
                 LIMIT 1
            ) AS image_url
        FROM products p
    """)
    rows = cur.fetchall()
    log(f"Fetched {len(rows)} products from database", "SUCCESS")
    conn.close()
    log("Closed database connection for products_get", "INFO")
    result = [row_to_product(r) for r in rows]
    log(f"Returning products list: {result}", "SUCCESS")
    return jsonify(result)

# NEW: return a single product with its full images array
@app.route('/api/products/<int:pid>', methods=['GET'])
def products_get_one(pid):
    log(f"Received request for product details: pid={pid}", "INFO")
    p = get_product_with_images(pid)
    if not p:
        log(f"Product not found: pid={pid}", "WARNING")
        return jsonify({"error": "not found"}), 404
    log(f"Returning product details: {p}", "SUCCESS")
    return jsonify(p)

@app.route('/api/services', methods=['GET'])
def services_get():
    log("Received request for services list", "INFO")
    conn = db()
    cur = conn.cursor()
    log("Executing SQL to fetch services with first image", "INFO")
    cur.execute("""
        SELECT
            s.id, s.name, s.bio, s.price, s.discount_price,
            s.active,
            (
                SELECT si.image_path
                  FROM service_images si
                 WHERE si.service_id = s.id
                 ORDER BY si.sort_order ASC, si.id ASC
                 LIMIT 1
            ) AS image_url
        FROM services s
        WHERE s.active=1
    """)
    rows = cur.fetchall()
    log(f"Fetched {len(rows)} services from database", "SUCCESS")
    conn.close()
    log("Closed database connection for services_get", "INFO")
    result = [row_to_service(r) for r in rows]
    log(f"Returning services list: {result}", "SUCCESS")
    return jsonify(result)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_MIN, USERNAME_MAX = 3, 32
PASSWORD_MIN = 8
PASSWORD_MAX = 128
EMAIL_MAX = 254
ADDRESS_MAX = 2000

@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    log("Received signup request", "INFO")
    data = request.get_json(force=True)
    log(f"Signup payload: {mask_sensitive(data)}", "INFO")
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not email or not username or not password:
        return jsonify({"error": "email, username and password are required"}), 400
    if len(password) < PASSWORD_MIN:
        return jsonify({"error": f"Password must be at least {PASSWORD_MIN} characters"}), 400
    if len(password) > PASSWORD_MAX:
        return jsonify({"error": "Password is too long"}), 400
    if len(username) < USERNAME_MIN or len(username) > USERNAME_MAX:
        return jsonify({"error": f"Username must be between {USERNAME_MIN} and {USERNAME_MAX} characters"}), 400
    if not EMAIL_RE.match(email) or len(email) > EMAIL_MAX:
        return jsonify({"error": "A valid email address is required"}), 400

    # Regular signups always create normal users. Admin accounts are created
    # through the first-launch setup flow (temporary 'admin'/'admin' account,
    # then POST /api/auth/setup). While that temporary account exists, its
    # username is protected so a regular signup cannot impersonate it.
    conn = db()
    cur = conn.cursor()
    if cur.execute(
        "SELECT 1 FROM users WHERE is_setup_admin=1 AND username=? COLLATE NOCASE LIMIT 1",
        (username,),
    ).fetchone():
        conn.close()
        log("Blocked signup attempt using the temporary setup admin username", "WARNING")
        return jsonify({"error": "Account could not be created"}), 409

    log("Hashing password for new user", "INFO")
    pwd_hash, salt = hash_password(password)
    role = "user"
    try:
        cur.execute(
            "INSERT INTO users(email, username, password_hash, salt, role) VALUES(?,?,?,?,?)",
            (email, username, pwd_hash, salt, role)
        )
        conn.commit()
        user_id = cur.lastrowid
        log(f"Inserted user with id={user_id} role={role}", "SUCCESS")
    except sqlite3.IntegrityError:
        log("Signup failed: duplicate email", "WARNING")
        # Generic response: do not reveal whether the email already exists.
        return jsonify({"error": "Account could not be created"}), 409
    except Exception as e:
        log(f"Signup failed unexpectedly: {e}", "ERROR")
        return jsonify({"error": "Account could not be created"}), 500
    finally:
        conn.close()

    token = sign_token({"role": role, "user_id": user_id}, exp_seconds=60 * 60 * 24 * 7)
    log(f"Generated signup token for user_id={user_id}", "SUCCESS")
    return jsonify({"token": token, "user_id": user_id, "role": role}), 201

@app.route('/api/auth/login', methods=['POST'])
@rate_limit(10, 900)
def auth_login():
    log("Received login request", "INFO")
    data = request.get_json(force=True)
    log(f"Login payload: {mask_sensitive(data)}", "INFO")
    identifier = (data.get("identifier") or data.get("email") or "").strip()
    password = data.get("password") or ""
    if not identifier or not password:
        return jsonify({"error": "email/username and password required"}), 400
    conn = db()
    cur = conn.cursor()
    # Users may log in with either their email or their username.
    cur.execute(
        "SELECT id, password_hash, salt, role, is_setup_admin FROM users"
        " WHERE lower(email)=lower(?) OR username=? COLLATE NOCASE",
        (identifier, identifier),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        # Do the same expensive derivation as a real check so unknown emails
        # are not distinguishable by response time.
        hash_password(password)
        return jsonify({"error": "invalid credentials"}), 401
    if not verify_password(password, row[1], row[2]):
        return jsonify({"error": "invalid credentials"}), 401
    user_id, role = row[0], row[3]
    setup_pending = bool(row[4])
    log(f"Login successful for user_id={user_id}", "SUCCESS")
    token = sign_token({"role": role, "user_id": user_id}, exp_seconds=60 * 60 * 24 * 7)
    log(f"Generated login token for user_id={user_id}", "SUCCESS")
    return jsonify({"token": token, "user_id": user_id, "role": role, "setup_pending": setup_pending})

@app.route('/api/auth/me', methods=['GET'])
@require_user
def auth_me():
    log(f"Received /api/auth/me request for user_id={request.user_id}", "INFO")
    conn = db()
    cur = conn.cursor()
    log(f"Querying user profile for user_id={request.user_id}", "INFO")
    cur.execute("SELECT id, email, username, role, is_setup_admin FROM users WHERE id=?", (request.user_id,))
    row = cur.fetchone()
    conn.close()
    log("Closed database connection after /api/auth/me", "INFO")
    if not row:
        log(f"User not found for user_id={request.user_id}", "WARNING")
        return jsonify({"error": "not found"}), 404
    log(f"Returning user profile: id={row[0]}, email={row[1]}, username={row[2]}, role={row[3]}", "SUCCESS")
    return jsonify({
        "id": row[0], "email": row[1], "username": row[2],
        "role": row[3], "setup_pending": bool(row[4]),
    })

@app.route('/api/auth/setup-status', methods=['GET'])
def auth_setup_status():
    """Whether the temporary first-launch admin account still exists."""
    conn = db()
    cur = conn.cursor()
    pending = cur.execute("SELECT 1 FROM users WHERE is_setup_admin=1 LIMIT 1").fetchone() is not None
    conn.close()
    return jsonify({"setup_pending": pending})

@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    """
    First-launch admin setup. Only callable with a token of the temporary
    setup admin ('admin'/'admin'). Creates the owner's own admin account and
    deletes the temporary one in the same transaction, so 'admin'/'admin'
    stops working immediately.
    Expects: { email, username, password }
    Returns: { token, user_id, role: 'admin', setup_pending: false }
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "Missing token"}), 401
    token_value = auth.split(" ", 1)[1].strip()
    body = verify_token(token_value)
    if not body or not body.get("user_id"):
        return jsonify({"error": "Invalid token"}), 403

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, role, is_setup_admin FROM users WHERE id=?", (body["user_id"],))
    row = cur.fetchone()
    conn.close()
    if not row or row[1] != "admin" or not row[2]:
        return jsonify({"error": "Setup is not required"}), 403
    setup_admin_id = row[0]

    data = request.get_json(force=True)
    log(f"Admin setup payload: {mask_sensitive(data)}", "INFO")
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not email or not username or not password:
        return jsonify({"error": "email, username and password are required"}), 400
    if len(password) < PASSWORD_MIN:
        return jsonify({"error": f"Password must be at least {PASSWORD_MIN} characters"}), 400
    if len(password) > PASSWORD_MAX:
        return jsonify({"error": "Password is too long"}), 400
    if len(username) < USERNAME_MIN or len(username) > USERNAME_MAX:
        return jsonify({"error": f"Username must be between {USERNAME_MIN} and {USERNAME_MAX} characters"}), 400
    if not EMAIL_RE.match(email) or len(email) > EMAIL_MAX:
        return jsonify({"error": "A valid email address is required"}), 400

    log("Hashing password for the new admin account", "INFO")
    pwd_hash, salt = hash_password(password)

    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users(email, username, password_hash, salt, role, is_setup_admin)"
            " VALUES(?,?,?,?,'admin',0)",
            (email, username, pwd_hash, salt),
        )
        new_id = cur.lastrowid
        # Remove the temporary account: the new one is now the only admin.
        cur.execute("DELETE FROM users WHERE id=? AND is_setup_admin=1", (setup_admin_id,))
        conn.commit()
        log(f"Admin setup complete: created user_id={new_id}, removed temporary admin", "SUCCESS")
    except sqlite3.IntegrityError:
        log("Admin setup failed: email already in use", "WARNING")
        return jsonify({"error": "Email is already in use"}), 409
    except Exception as e:
        log(f"Admin setup failed unexpectedly: {e}", "ERROR")
        return jsonify({"error": "Could not create the admin account, please try again"}), 500
    finally:
        conn.close()

    token_value = sign_token({"role": "admin", "user_id": new_id}, exp_seconds=60 * 60 * 24 * 7)
    return jsonify({"token": token_value, "user_id": new_id, "role": "admin", "setup_pending": False}), 201

@app.route('/api/user/profile', methods=['GET'])
@require_user
def user_profile_get():
    log(f"Received user profile GET for user_id={request.user_id}", "INFO")
    conn = db()
    cur = conn.cursor()
    log(f"Querying user profile fields for user_id={request.user_id}", "INFO")
    cur.execute("SELECT id, email, username, address FROM users WHERE id=?", (request.user_id,))
    row = cur.fetchone()
    conn.close()
    log("Closed database connection after user_profile_get", "INFO")
    if not row:
        log(f"User profile not found for user_id={request.user_id}", "WARNING")
        return jsonify({"error": "not found"}), 404
    log(f"Returning user profile: id={row[0]}, email={row[1]}, username={row[2]}, address={row[3]}", "SUCCESS")
    return jsonify({"id": row[0], "email": row[1], "username": row[2], "address": row[3]})

@app.route('/api/user/profile', methods=['PUT'])
@require_user
def user_profile_put():
    log(f"Received request to update user profile for user_id={request.user_id}", "INFO")
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    address = data.get("address")
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    if email and (not EMAIL_RE.match(email) or len(email) > EMAIL_MAX):
        return jsonify({"error": "A valid email address is required"}), 400
    if address is not None and len(address) > ADDRESS_MAX:
        return jsonify({"error": "Address is too long"}), 400
    if new_password and len(new_password) < PASSWORD_MIN:
        return jsonify({"error": f"New password must be at least {PASSWORD_MIN} characters"}), 400
    if new_password and len(new_password) > PASSWORD_MAX:
        return jsonify({"error": "New password is too long"}), 400

    conn = db()
    cur = conn.cursor()

    # Email/address update
    if email or (address is not None):
        log(f"Attempting to update email/address for user_id={request.user_id}: email={email}, address={address}", "INFO")
        if email:
            cur.execute("SELECT id FROM users WHERE email=? AND id<>?", (email, request.user_id))
            if cur.fetchone():
                log(f"Email '{email}' already in use by another user", "WARNING")
                conn.close()
                return jsonify({"error": "email already in use"}), 409
        sets, vals = [], []
        if email:
            sets.append("email=?"); vals.append(email)
            log(f"Email will be updated to '{email}'", "INFO")
        if address is not None:
            sets.append("address=?"); vals.append(address)
            log(f"Address will be updated to '{address}'", "INFO")
        if sets:
            vals.append(request.user_id)
            cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", vals)
            conn.commit()
            log(f"Updated user_id={request.user_id} fields: {sets}", "SUCCESS")

    # Password change
    if new_password:
        log(f"Password change requested for user_id={request.user_id}", "INFO")
        if not current_password:
            log("Current password not provided for password change", "WARNING")
            conn.close()
            return jsonify({"error": "current_password required"}), 400
        cur.execute("SELECT password_hash, salt FROM users WHERE id=?", (request.user_id,))
        row = cur.fetchone()
        if not row or not verify_password(current_password, row[0], row[1]):
            log("Current password incorrect for password change", "WARNING")
            conn.close()
            return jsonify({"error": "current password incorrect"}), 403
        new_hash, new_salt = hash_password(new_password)
        cur.execute("UPDATE users SET password_hash=?, salt=? WHERE id=?", (new_hash, new_salt, request.user_id))
        conn.commit()
        log(f"Password updated for user_id={request.user_id}", "SUCCESS")

    conn.close()
    log(f"User profile update completed for user_id={request.user_id}", "SUCCESS")
    return jsonify({"ok": True})

@app.route('/api/upload/image', methods=['POST'])
@require_admin
def upload_image():
    log("Received image upload request", "INFO")
    if 'image' not in request.files:
        log("No image file part in request", "WARNING")
        return jsonify({"error": "image file required"}), 400
    f = request.files['image']
    if f.filename == '':
        log("Empty filename in uploaded image", "WARNING")
        return jsonify({"error": "empty filename"}), 400
    name = secure_filename(f.filename)
    ext = os.path.splitext(name)[1].lower()
    log(f"Processing uploaded file: {name} (ext: {ext})", "INFO")
    if ext not in ALLOWED_EXT:
        log(f"Unsupported file type: {ext}", "WARNING")
        return jsonify({"error": "unsupported file type"}), 415
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    log(f"Uploaded file size: {size} bytes", "INFO")
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        log(f"File too large: {size} bytes (limit: {MAX_UPLOAD_MB}MB)", "WARNING")
        return jsonify({"error": f"file too large (>{MAX_UPLOAD_MB}MB)"}), 413

    # Without Pillow we cannot re-encode the file, which means EXIF/GPS data and
    # possible polyglot content would be stored verbatim. Refuse unless the
    # explicit opt-in flag is set.
    if not PIL_AVAILABLE and not ALLOW_UPLOADS_WITHOUT_EXIF_REMOVED:
        log("Upload rejected: Pillow is required to sanitize images", "WARNING")
        return jsonify({"error": "Image processing unavailable on server"}), 503

    ts = int(time.time())
    out_name = f"{ts}_{name}"
    out_path = os.path.join(UPLOAD_DIR, out_name)
    log(f"Saving image to: {out_path}", "INFO")
    try:
        if PIL_AVAILABLE:
            img = Image.open(f.stream)
            log(f"Opened image with Pillow: mode={img.mode}, size={img.size}", "INFO")
            # Normalize mode and drop EXIF by re-saving
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
                log("Converted image mode to RGB", "INFO")
            # Resize down if very large
            max_w = 1600
            if img.width > max_w:
                ratio = max_w / float(img.width)
                new_size = (max_w, int(img.height * ratio))
                img = img.resize(new_size)
                log(f"Resized image to {new_size}", "INFO")
            # Format inferred from extension; EXIF not passed => stripped
            img.save(out_path, optimize=True, quality=85)
            log(f"Image uploaded and processed: {out_name}", "SUCCESS")
        else:
            # Fallback: raw save (metadata may remain)
            f.save(out_path)
            log(f"Image uploaded without processing of metadata, data might persist (Pillow not installed): {out_name}", "WARNING")
    except Exception as e:
        log(f"Upload processing failed: {e}", "ERROR")
        return jsonify({"error": "failed to process image"}), 500

    rel_url = f"/static/uploads/{out_name}"
    log(f"Image successfully saved: {rel_url}", "SUCCESS")
    return jsonify({"image_url": rel_url}), 201

@app.route('/api/products', methods=['POST'])
@require_admin
def products_create():
    log("Received request to create new product", "INFO")
    data = request.get_json(force=True)
    name = data.get('name')
    price = data.get('price')
    bio = data.get('bio')
    discount_price = data.get('discount_price')
    limited = int(bool(data.get('limited_edition', 0)))
    sold_out = int(bool(data.get('sold_out', 0)))
    images = data.get('images') or []
    if not images and data.get('image_url'):
        images = [data['image_url']]

    log(f"Product data: name={name}, price={price}, bio={bio}, discount_price={discount_price}, limited_edition={limited}, sold_out={sold_out}, images={images}", "INFO")

    if not name or price is None:
        log("Missing required fields for product creation", "WARNING")
        return jsonify({"error": "`name` and `price` are required"}), 400

    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")  # enable FK (SQLite quirk)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO products (name, bio, price, discount_price, limited_edition, sold_out)
            VALUES (?,?,?,?,?,?)
        """, (name, bio, price, discount_price, limited, sold_out))
        new_id = cur.lastrowid
        log(f"Inserted new product with id {new_id}", "SUCCESS")

        if images:
            cur.executemany(
                "INSERT INTO product_images (product_id, image_path, alt_text, sort_order) VALUES (?,?,?,?)",
                [(new_id, p, None, i) for i, p in enumerate(images)]
            )
            log(f"Inserted images for product {new_id}: {images}", "SUCCESS")
        else:
            log(f"No images provided for product {new_id}", "INFO")

        conn.commit()
        log(f"Product {new_id} created successfully", "SUCCESS")
        return jsonify({"id": new_id}), 201
    except Exception as e:
        log(f"Error creating product: {e}", "ERROR")
        return jsonify({"error": "failed to create product"}), 500
    finally:
        conn.close()
        log("Database connection closed for product creation", "INFO")

@app.route('/api/products/<int:pid>', methods=['PUT'])
@require_admin
def products_update(pid):
    log(f"Received request to update product {pid}", "INFO")
    data = request.get_json(force=True)
    field_map = {
        "name": "name",
        "bio": "bio",
        "price": "price",
        "discount_price": "discount_price",
        "limited_edition": "limited_edition",
        "sold_out": "sold_out",
    }

    fields, values = [], []
    for key, col in field_map.items():
        if key in data:
            if key in ("limited_edition", "sold_out"):
                fields.append(f"{col}=?")
                values.append(int(bool(data[key])))
                log(f"Field '{col}' set to {int(bool(data[key]))}", "INFO")
            else:
                fields.append(f"{col}=?")
                values.append(data[key])
                log(f"Field '{col}' set to {data[key]}", "INFO")

    replace_images = None
    if "images" in data:
        replace_images = data.get("images") or []
        log(f"Images to replace: {replace_images}", "INFO")
    elif "image_url" in data:
        replace_images = [data["image_url"]] if data["image_url"] else []
        log(f"Image_url to replace: {replace_images}", "INFO")

    if not fields and replace_images is None:
        log(f"No fields or images to update for product {pid}", "WARNING")
        return jsonify({"error": "no fields to update"}), 400

    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()

        if fields:
            values.append(pid)
            cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id=?", values)
            log(f"Updated fields for product {pid}: {fields}", "SUCCESS")

        if replace_images is not None:
            cur.execute("DELETE FROM product_images WHERE product_id=?", (pid,))
            log(f"Deleted old images for product {pid}", "INFO")
            if replace_images:
                cur.executemany(
                    "INSERT INTO product_images (product_id, image_path, alt_text, sort_order) VALUES (?,?,?,?)",
                    [(pid, p, None, i) for i, p in enumerate(replace_images)]
                )
                log(f"Inserted new images for product {pid}: {replace_images}", "SUCCESS")
            else:
                log(f"No new images provided for product {pid}", "INFO")

        conn.commit()
        log(f"Product {pid} updated successfully", "SUCCESS")
        return jsonify({"ok": True})
    except Exception as e:
        log(f"Error updating product {pid}: {e}", "ERROR")
        return jsonify({"error": "failed to update product"}), 500
    finally:
        conn.close()
        log(f"Database connection closed for product update {pid}", "INFO")

@app.route('/api/products/<int:pid>', methods=['DELETE'])
@require_admin
def products_delete(pid):
    log(f"Received request to delete product {pid}", "INFO")
    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        cur.execute("DELETE FROM products WHERE id=?", (pid,))
        conn.commit()
        log(f"Product {pid} deleted successfully", "SUCCESS")
        return jsonify({"ok": True})
    except Exception as e:
        log(f"Error deleting product {pid}: {e}", "ERROR")
        return jsonify({"error": "failed to delete product"}), 500
    finally:
        conn.close()
        log(f"Database connection closed for product delete {pid}", "INFO")

@app.route('/api/services', methods=['POST'])
@require_admin
def services_create():
    log("Received request to create new service", "INFO")
    data = request.get_json(force=True)
    name = data.get('name')
    price = data.get('price')
    bio = data.get('bio')
    discount_price = data.get('discount_price')
    active = int(bool(data.get('active', 1)))

    images = data.get('images') or []
    if not images and data.get('image_url'):
        images = [data['image_url']]

    log(f"Service data: name={name}, price={price}, bio={bio}, discount_price={discount_price}, active={active}, images={images}", "INFO")

    if not name or price is None:
        log("Missing required fields for service creation", "WARNING")
        return jsonify({"error": "`name` and `price` are required"}), 400

    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO services (name, bio, price, discount_price, active)
            VALUES (?,?,?,?,?)
        """, (name, bio, price, discount_price, active))
        new_id = cur.lastrowid
        log(f"Inserted new service with id {new_id}", "SUCCESS")

        if images:
            cur.executemany(
                "INSERT INTO service_images (service_id, image_path, alt_text, sort_order) VALUES (?,?,?,?)",
                [(new_id, p, None, i) for i, p in enumerate(images)]
            )
            log(f"Inserted images for service {new_id}: {images}", "SUCCESS")
        else:
            log(f"No images provided for service {new_id}", "INFO")

        conn.commit()
        log(f"Service {new_id} created successfully", "SUCCESS")
        return jsonify({"id": new_id}), 201
    except Exception as e:
        log(f"Error creating service: {e}", "ERROR")
        return jsonify({"error": "failed to create service"}), 500
    finally:
        conn.close()
        log("Database connection closed for service creation", "INFO")

@app.route('/api/services/<int:sid>', methods=['PUT'])
@require_admin
def services_update(sid):
    log(f"Received request to update service {sid}", "INFO")
    data = request.get_json(force=True)
    field_map = {
        "name": "name",
        "bio": "bio",
        "price": "price",
        "discount_price": "discount_price",
        "active": "active",
    }

    fields, values = [], []
    for key, col in field_map.items():
        if key in data:
            if key == "active":
                fields.append(f"{col}=?")
                values.append(int(bool(data[key])))
            else:
                fields.append(f"{col}=?")
                values.append(data[key])

    replace_images = None
    if "images" in data:
        replace_images = data.get("images") or []
    elif "image_url" in data:
        replace_images = [data["image_url"]] if data["image_url"] else []

    if not fields and replace_images is None:
        log(f"No fields to update for service {sid}", "WARNING")
        return jsonify({"error": "no fields to update"}), 400

    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()

        if fields:
            values.append(sid)
            cur.execute(f"UPDATE services SET {', '.join(fields)} WHERE id=?", values)
            log(f"Updated fields for service {sid}: {fields}", "SUCCESS")

        if replace_images is not None:
            cur.execute("DELETE FROM service_images WHERE service_id=?", (sid,))
            if replace_images:
                cur.executemany(
                    "INSERT INTO service_images (service_id, image_path, alt_text, sort_order) VALUES (?,?,?,?)",
                    [(sid, p, None, i) for i, p in enumerate(replace_images)]
                )
                log(f"Replaced images for service {sid}: {replace_images}", "SUCCESS")
            else:
                log(f"Removed all images for service {sid}", "INFO")

        conn.commit()
        log(f"Service {sid} updated successfully", "SUCCESS")
        return jsonify({"ok": True})
    except Exception as e:
        log(f"Error updating service {sid}: {e}", "ERROR")
        return jsonify({"error": "failed to update service"}), 500
    finally:
        conn.close()

@app.route('/api/services/<int:sid>', methods=['DELETE'])
@require_admin
def services_delete(sid):
    log(f"Received request to delete service {sid}", "INFO")
    conn = db()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        cur = conn.cursor()
        cur.execute("DELETE FROM services WHERE id=?", (sid,))
        conn.commit()
        log(f"Service {sid} deleted successfully", "SUCCESS")
        return jsonify({"ok": True})
    except Exception as e:
        log(f"Error deleting service {sid}: {e}", "ERROR")
        return jsonify({"error": "failed to delete service"}), 500
    finally:
        conn.close()

@app.route('/static/uploads/<path:filename>')
def uploaded_file(filename):
    log(f"Serving uploaded file: {filename}", "INFO")
    return send_from_directory(UPLOAD_DIR, filename)

@app.route('/api/contact', methods=['POST'])
@rate_limit(5, 3600)
def contact_submit():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify({"error": "All fields are required"}), 400
    if len(name) > 100 or len(email) > EMAIL_MAX or len(message) > 5000:
        return jsonify({"error": "One or more fields are too long"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "A valid email address is required"}), 400

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)",
            (name, email, message),
        )
        conn.commit()
        conn.close()
        log(f"Contact message stored from {email}", "SUCCESS")
        return jsonify({"ok": True, "msg": "Message received — we will get back to you soon."}), 201
    except Exception as e:
        log(f"Failed to store contact message: {e}", "ERROR")
        return jsonify({"error": "Failed to save message. Please try again later."}), 500
    

if __name__ == '__main__':
    while True:
        try:
            if not os.path.exists(DATABASE):
                log("No database found → creating a new one with demo catalog...", "INFO")
                init_db.create_or_update_db_table(admin_username=ADMIN_USERNAME, seed_sample_catalog=True)
                log("Database created and initialized.", "SUCCESS")
            else:
                log("Database found → checking schema and upgrading if needed...", "INFO")
                init_db.create_or_update_db_table(admin_username=ADMIN_USERNAME)
                log("Database schema is up to date.", "SUCCESS")
            
            log("server.py has been launched!", "INFO")
            try:
                log("Starting Flask server...", "INFO")
                app.run(host="127.0.0.1", port=5000)
            except KeyboardInterrupt:
                log("Server shutdown initiated by user keyboard interruption", "WARNING")
                exit(0)
            except Exception as e:
                log(f"Error starting server: {e}", "ERROR")
            finally:
                log("Exiting main block and shutting down server", "WARNING")
                exit(0)
        except Exception as e:
            log("An error occurred in the main while loop.", "WARNING")
            log(f"Top level error: {e}", "ERROR")
            time.sleep(5)
        finally:
            log("Restarting main while loop...", "INFO")
            break
