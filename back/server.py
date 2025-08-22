import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
from datetime import datetime
import colorama
import random
import os, hashlib, hmac, base64, json, time
from functools import wraps
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()
colorama.init(autoreset=True)

# PIL for EXIF removal & resizing
try:
    from PIL import Image
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

app = Flask(__name__, static_folder="static")
app.config["JSON_SORT_KEYS"] = False

CORS(app)

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "q")
UPLOAD_DIR = os.path.join(os.getcwd(), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "5"))
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}

PBKDF2_ITERATIONS = 200_000  # used by hash_password/verify_password


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
        log_entry = f"[{status_label} - {current_time}] {message}"
        print(color + log_entry)
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
    except Exception as e:
        error_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fallback_msg = f"[ERROR - {error_time}] Failed to log message: {e}"
        print(colorama.Fore.RED + fallback_msg)
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(fallback_msg + "\n")


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def ub64url(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_token(payload: dict, exp_seconds: int = 3600):
    body = payload.copy()
    body["exp"] = int(time.time()) + exp_seconds
    raw = json.dumps(body, separators=(",", ":")).encode()
    sig = hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).digest()
    return f"{b64url(raw)}.{b64url(sig)}"


def verify_token(token: str):
    try:
        raw_b64, sig_b64 = token.split(".")
        raw = ub64url(raw_b64)
        expected = hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, ub64url(sig_b64)):
            return None
        body = json.loads(raw)
        if int(time.time()) > int(body.get("exp", 0)):
            return None
        return body
    except Exception:
        return None


def db():
    return sqlite3.connect('shop.db')


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing token"}), 401
        token = auth.split(" ", 1)[1].strip()
        body = verify_token(token)
        if not body or body.get("role") != "user" or not body.get("user_id"):
            return jsonify({"error": "Invalid token"}), 403
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE id=?", (body["user_id"],))
        row = cur.fetchone()
        conn.close()
        if not row or row[0] != "LeonBoussen":
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
        if not body or body.get("role") != "user":
            return jsonify({"error": "Invalid user token"}), 403
        request.user_id = body.get("user_id")
        return fn(*args, **kwargs)
    return wrapper


def row_to_product(r):
    return {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "image_url": f"{r[5]}" if r[5] else None, 
        "limited_edition": r[6], "sold_out": r[7]
    }


def row_to_service(r):
    return {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "image_url": f"{r[5]}" if r[5] else None,
        "active": r[6]
    }


def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode('ascii')


def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode('ascii'))


def hash_password(password: str) -> tuple[str, str]:
    """
    Returns (hash_b64, salt_b64) using PBKDF2-HMAC-SHA256 with PBKDF2_ITERATIONS.
    """
    if not isinstance(password, str):
        raise TypeError("password must be a string")
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return _b64e(dk), _b64e(salt)


def verify_password(password: str, stored_hash_b64: str, salt_b64: str) -> bool:
    """
    Verifies password against (stored_hash_b64, salt_b64) using same parameters.
    """
    try:
        salt = _b64d(salt_b64)
        dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
        calc = _b64e(dk)
        return hmac.compare_digest(calc, stored_hash_b64)
    except Exception:
        return False

def _normalize_rel(url: str):
    if not url:
        return None
    u = url.strip()
    # absolute http(s) allowed as-is
    if u.startswith("http://") or u.startswith("https://"):
        return u
    # force leading slash
    if not u.startswith("/"):
        u = "/" + u
    # normalize legacy /uploads/* to /static/uploads/*
    if u.startswith("/uploads/"):
        u = "/static" + u
    return u

def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def save_image_and_get_rel_url(file_storage) -> str:
    if not file_storage or not getattr(file_storage, "filename", None):
        raise ValueError("No file")
    if not _allowed_file(file_storage.filename):
        raise ValueError("Unsupported file type")

    # Always save as WEBP to strip EXIF and keep small
    fname = f"{uuid.uuid4().hex}.webp"
    dest = os.path.join(UPLOAD_DIR, fname)

    if Image is None:
        # Fallback: raw save (no EXIF removal/resize). Pillow recommended.
        file_storage.save(dest)
    else:
        img = Image.open(file_storage.stream).convert("RGB")
        img.thumbnail((720, 720))  # Resize to max 720x720
        img.save(dest, "WEBP", quality=88, method=6)

    return f"/static/uploads/products/{fname}"

def get_product_with_images(pid: int):
    with db() as conn:
        cur = conn.cursor()
        p = cur.execute("""
            SELECT id, name, bio, price, discount_price, limited_edition, sold_out, active, image_path
              FROM products
             WHERE id = ?
        """, (pid,)).fetchone()
        if not p:
            return None
        imgs = [r["image_path"] for r in cur.execute("""
            SELECT image_path
              FROM product_images
             WHERE product_id = ?
             ORDER BY sort_order ASC, id ASC
        """, (pid,)).fetchall()]
        first = imgs[0] if imgs else (p["image_path"] or None)
        return {
            "id": p["id"],
            "name": p["name"],
            "bio": p["bio"],
            "price": p["price"],
            "discount_price": p["discount_price"],
            "limited_edition": p["limited_edition"],
            "sold_out": p["sold_out"],
            "active": p["active"],
            "image_url": first,
            "images": imgs,
        }


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
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, bio, price, discount_price, image_path, limited_edition, sold_out FROM products")
    rows = cur.fetchall()
    conn.close()
    return jsonify([row_to_product(r) for r in rows])


@app.route('/api/services', methods=['GET'])
def services_get():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, bio, price, discount_price, image_path, active FROM services WHERE active=1")
    rows = cur.fetchall()
    conn.close()
    return jsonify([row_to_service(r) for r in rows])


@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    data = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not email or not username or not password:
        return jsonify({"error": "email, username, password required"}), 400
    pwd_hash, salt = hash_password(password)
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users(email, username, password_hash, salt) VALUES(?,?,?,?)",
            (email, username, pwd_hash, salt)
        )
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
    except sqlite3.IntegrityError:
        return jsonify({"error": "email already registered"}), 409
    token = sign_token({"role": "user", "user_id": user_id}, exp_seconds=60 * 60 * 24 * 7)
    return jsonify({"token": token, "user_id": user_id}), 201


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash, salt FROM users WHERE email=?", (email,))
    row = cur.fetchone()
    conn.close()
    if not row or not verify_password(password, row[1], row[2]):
        return jsonify({"error": "invalid credentials"}), 401
    user_id = row[0]
    token = sign_token({"role": "user", "user_id": user_id}, exp_seconds=60 * 60 * 24 * 7)
    return jsonify({"token": token, "user_id": user_id})


@app.route('/api/auth/me', methods=['GET'])
@require_user
def auth_me():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, email, username FROM users WHERE id=?", (request.user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify({"id": row[0], "email": row[1], "username": row[2]})


@app.route('/api/user/profile', methods=['GET'])
@require_user
def user_profile_get():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, email, username, address FROM users WHERE id=?", (request.user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify({"id": row[0], "email": row[1], "username": row[2], "address": row[3]})


@app.route('/api/user/profile', methods=['PUT'])
@require_user
def user_profile_put():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    address = data.get("address")
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    conn = db()
    cur = conn.cursor()

    # Email/address update
    if email or (address is not None):
        if email:
            cur.execute("SELECT id FROM users WHERE email=? AND id<>?", (email, request.user_id))
            if cur.fetchone():
                conn.close()
                return jsonify({"error": "email already in use"}), 409
        sets, vals = [], []
        if email:
            sets.append("email=?"); vals.append(email)
        if address is not None:
            sets.append("address=?"); vals.append(address)
        if sets:
            vals.append(request.user_id)
            cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", vals)
            conn.commit()

    # Password change
    if new_password:
        if not current_password:
            conn.close(); return jsonify({"error": "current_password required"}), 400
        cur.execute("SELECT password_hash, salt FROM users WHERE id=?", (request.user_id,))
        row = cur.fetchone()
        if not row or not verify_password(current_password, row[0], row[1]):
            conn.close(); return jsonify({"error": "current password incorrect"}), 403
        new_hash, new_salt = hash_password(new_password)
        cur.execute("UPDATE users SET password_hash=?, salt=? WHERE id=?", (new_hash, new_salt, request.user_id))
        conn.commit()

    conn.close()
    return jsonify({"ok": True})


@app.route('/api/upload/image', methods=['POST'])
@require_admin
def upload_image():
    if 'image' not in request.files:
        return jsonify({"error": "image file required"}), 400
    f = request.files['image']
    if f.filename == '':
        return jsonify({"error": "empty filename"}), 400
    name = secure_filename(f.filename)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": "unsupported file type"}), 415
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error": f"file too large (>{MAX_UPLOAD_MB}MB)"}), 413

    ts = int(time.time())
    out_name = f"{ts}_{name}"
    out_path = os.path.join(UPLOAD_DIR, out_name)
    try:
        if PIL_AVAILABLE:
            img = Image.open(f.stream)
            # Normalize mode and drop EXIF by re-saving
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            # Resize down if very large
            max_w = 1600
            if img.width > max_w:
                ratio = max_w / float(img.width)
                img = img.resize((max_w, int(img.height * ratio)))
            # Format inferred from extension; EXIF not passed => stripped
            img.save(out_path, optimize=True, quality=85)
        else:
            # Fallback: raw save (metadata may remain)
            f.save(out_path)
    except Exception as e:
        log(f"Upload processing failed: {e}", "ERROR")
        return jsonify({"error": "failed to process image"}), 500

    rel_url = f"/static/uploads/{out_name}"
    return jsonify({"image_url": rel_url}), 201


@app.route('/api/products', methods=['POST'])
@require_admin
def products_create():
    data = request.get_json(force=True)
    name = data.get('name')
    price = data.get('price')
    bio = data.get('bio')
    discount_price = data.get('discount_price')
    image_path = data.get('image_url')
    limited = int(bool(data.get('limited_edition', 0)))
    sold_out = int(bool(data.get('sold_out', 0)))
    if not name or price is None:
        return jsonify({"error": "`name` and `price` are required"}), 400
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO products (name, bio, price, discount_price, image_path, limited_edition, sold_out)
        VALUES (?,?,?,?,?,?,?)
    """, (name, bio, price, discount_price, image_path, limited, sold_out))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route('/api/products/<int:pid>', methods=['PUT'])
@require_admin
def products_update(pid):
    data = request.get_json(force=True)
    fields, values = [], []
    for key in ("name", "bio", "price", "discount_price", "image_url", "limited_edition", "sold_out"):
        if key in data:
            col = "image_path" if key == "image_url" else key
            fields.append(f"{col}=?")
            if key in ("limited_edition", "sold_out"):
                values.append(int(bool(data[key])))
            else:
                values.append(data[key])
    if not fields:
        return jsonify({"error": "no fields to update"}), 400
    values.append(pid)
    conn = db()
    cur = conn.cursor()
    cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id=?", values)
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/products/<int:pid>', methods=['DELETE'])
@require_admin
def products_delete(pid):
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/services', methods=['POST'])
@require_admin
def services_create():
    data = request.get_json(force=True)
    name = data.get('name')
    price = data.get('price')
    bio = data.get('bio')
    discount_price = data.get('discount_price')
    image_path = data.get('image_url')
    active = int(bool(data.get('active', 1)))
    if not name or price is None:
        return jsonify({"error": "`name` and `price` are required"}), 400
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO services (name, bio, price, discount_price, image_path, active)
        VALUES (?,?,?,?,?,?)
    """, (name, bio, price, discount_price, image_path, active))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route('/api/services/<int:sid>', methods=['PUT'])
@require_admin
def services_update(sid):
    data = request.get_json(force=True)
    fields, values = [], []
    for key in ("name", "bio", "price", "discount_price", "image_url", "active"):
        if key in data:
            col = "image_path" if key == "image_url" else key
            if key == "active":
                fields.append(f"{col}=?")
                values.append(int(bool(data[key])))
            else:
                fields.append(f"{col}=?")
                values.append(data[key])
    if not fields:
        return jsonify({"error": "no fields to update"}), 400
    values.append(sid)
    conn = db()
    cur = conn.cursor()
    cur.execute(f"UPDATE services SET {', '.join(fields)} WHERE id=?", values)
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/api/services/<int:sid>', methods=['DELETE'])
@require_admin
def services_delete(sid):
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM services WHERE id=?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route('/static/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


if __name__ == '__main__':
    log("server.py has been launched!", "INFO")
    try:
        log("Starting Flask server...", "SUCCESS")
        app.run(host="127.0.0.1", port=5000)
    except KeyboardInterrupt:
        log("Server shutdown initiated by user keyboard interruption", "WARNING")
        exit(0)
    except Exception as e:
        log(f"Error starting server: {e}", "ERROR")
    finally:
        log("Exiting main block and shutting down server", "WARNING")
        exit(0)
