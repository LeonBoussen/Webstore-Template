from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for, Response
from flask_cors import CORS
import sqlite3
from datetime import datetime
import colorama; colorama.init()
import random
import os, hashlib, hmac, base64, json, time
from functools import wraps
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

# Optional Pillow for EXIF strip/resize
try:
    from PIL import Image
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

# initialize Flask app, CORS and colorama
app = Flask(__name__)
CORS(app)  # allow cross-origin; frontend uses header-based tokens
colorama.init(autoreset=True)

# --- CONFIG ---
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change-this-admin-password")
UPLOAD_DIR = os.path.join(os.getcwd(), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "5"))
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}

# --- LOGGING ---
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

# --- SIMPLE TOKEN SIGN/VERIFY (HMAC) ---
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

# --- ADMIN CHECK (username-based) ---
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

        # Look up the username for this user_id and allow only LeonBoussen
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE id=?", (body["user_id"],))
        row = cur.fetchone()
        conn.close()

        if not row or row[0] != "LeonBoussen":
            return jsonify({"error": "Admin access denied"}), 403
        # Attach user_id for downstream handlers if needed
        request.user_id = body["user_id"]
        return fn(*args, **kwargs)
    return wrapper

def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error":"Missing user token"}), 401
        token = auth.split(" ", 1)[1].strip()
        body = verify_token(token)
        if not body or body.get("role") != "user":
            return jsonify({"error":"Invalid user token"}), 403
        request.user_id = body.get("user_id")
        return fn(*args, **kwargs)
    return wrapper

# --- WHO AM I (current user info) ---
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

# --- PASSWORD HASHING ---
def hash_password(password: str):
    salt = os.urandom(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return b64url(pwd_hash), b64url(salt)

def verify_password(password: str, stored_hash_b64: str, salt_b64: str):
    salt = ub64url(salt_b64)
    new_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(new_hash, ub64url(stored_hash_b64))

# --- DB HELPERS ---
def db():
    return sqlite3.connect('shop.db')

def row_to_product(r):
    return {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "image_url": r[5], "limited_edition": r[6], "sold_out": r[7]
    }

def row_to_service(r):
    return {
        "id": r[0], "name": r[1], "bio": r[2],
        "price": r[3], "discount_price": r[4],
        "image_url": r[5], "active": r[6]
    }

# --- PUBLIC ROUTES ---
@app.route('/api/catchphrase', methods=['GET'])
def catchphrase():
    log("Received request for catchphrase", "INFO")
    list_of_upphrases = [
        "Privacy is a right, not a privilege.",
        "Your data, your rules.",
        "Control your digital footprint.",
        "Anonymity is freedom.",
        "Secure your digital life."
    ]
    list_of_downphrases = [
        "Easy and affordable",
        "Secure phones for everyone.",
        "Affordable privacy for all.",
        "Affordable security, maximum privacy.",
        "Cheaper and better than the rest."
    ]
    upph = random.choice(list_of_upphrases)
    downph = random.choice(list_of_downphrases)
    log(f"Generated catchphrase: {upph} | {downph}", "SUCCESS")
    return jsonify({"upphrase": upph, "downphrase": downph})

# EXTENDED: GET products includes more fields than before
@app.route('/api/products', methods=['GET'])
def products_get():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, bio, price, discount_price, image_path, limited_edition, sold_out FROM products")
    rows = cur.fetchall()
    conn.close()
    return jsonify([row_to_product(r) for r in rows])

# SERVICES: public list
@app.route('/api/services', methods=['GET'])
def services_get():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, bio, price, discount_price, image_path, active FROM services WHERE active=1")
    rows = cur.fetchall()
    conn.close()
    return jsonify([row_to_service(r) for r in rows])

# --- AUTH ---
@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    data = request.get_json(force=True)
    email = data.get("email","").strip().lower()
    username = data.get("username","").strip()
    password = data.get("password","")
    if not email or not username or not password:
        return jsonify({"error":"email, username, password required"}), 400
    pwd_hash, salt = hash_password(password)
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users(email, username, password_hash, salt)
            VALUES(?,?,?,?)
        """, (email, username, pwd_hash, salt))
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
    except sqlite3.IntegrityError:
        return jsonify({"error":"email already registered"}), 409
    token = sign_token({"role":"user","user_id":user_id}, exp_seconds=60*60*24*7)
    return jsonify({"token": token, "user_id": user_id}), 201

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json(force=True)
    email = data.get("email","").strip().lower()
    password = data.get("password","")
    if not email or not password:
        return jsonify({"error":"email and password required"}), 400
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash, salt FROM users WHERE email=?", (email,))
    row = cur.fetchone()
    conn.close()
    if not row or not verify_password(password, row[1], row[2]):
        return jsonify({"error":"invalid credentials"}), 401
    user_id = row[0]
    token = sign_token({"role":"user","user_id":user_id}, exp_seconds=60*60*24*7)
    return jsonify({"token": token, "user_id": user_id})

# --- IMAGE UPLOAD (ADMIN) ---
@app.route('/api/upload/image', methods=['POST'])
@require_admin
def upload_image():
    if 'image' not in request.files:
        return jsonify({"error":"image file required"}), 400
    f = request.files['image']
    if f.filename == '':
        return jsonify({"error":"empty filename"}), 400
    name = secure_filename(f.filename)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error":"unsupported file type"}), 415
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error":f"file too large (>{MAX_UPLOAD_MB}MB)"}), 413

    ts = int(time.time())
    out_name = f"{ts}_{name}"
    out_path = os.path.join(UPLOAD_DIR, out_name)

    # Try to strip EXIF/resize (optional)
    try:
        if PIL_AVAILABLE:
            img = Image.open(f.stream)
            img = img.convert("RGB")
            # Resize if very large (keep ~max 1600px wide)
            max_w = 1600
            if img.width > max_w:
                ratio = max_w / float(img.width)
                img = img.resize((max_w, int(img.height * ratio)))
            img.save(out_path, optimize=True, quality=85)
        else:
            f.save(out_path)
    except Exception as e:
        log(f"Upload processing failed: {e}", "ERROR")
        return jsonify({"error":"failed to process image"}), 500

    rel_url = f"/static/uploads/{out_name}"
    return jsonify({"image_url": rel_url}), 201

# --- PRODUCTS CRUD (ADMIN) ---
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
        return jsonify({"error":"`name` and `price` are required"}), 400

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
    fields = []
    values = []
    for key in ("name","bio","price","discount_price","image_url","limited_edition","sold_out"):
        if key in data:
            col = "image_path" if key == "image_url" else key
            fields.append(f"{col}=?")
            if key in ("limited_edition","sold_out"):
                values.append(int(bool(data[key])))
            else:
                values.append(data[key])
    if not fields:
        return jsonify({"error":"no fields to update"}), 400
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

# --- SERVICES CRUD (ADMIN) ---
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
        return jsonify({"error":"`name` and `price` are required"}), 400
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
    fields = []
    values = []
    for key in ("name","bio","price","discount_price","image_url","active"):
        if key in data:
            col = "image_path" if key == "image_url" else key
            if key == "active":
                fields.append(f"{col}=?")
                values.append(int(bool(data[key])))
            else:
                fields.append(f"{col}=?")
                values.append(data[key])
    if not fields:
        return jsonify({"error":"no fields to update"}), 400
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

# --- LEGACY ENDPOINT KEPT (for compatibility) ---
# Note: you previously had a POST /api/products that only accepted name/price/image (JSON) and returned id. We replaced it above with the admin version.
# The GET /api/products is preserved but returns more fields now.

# --- STATIC FILES (if you want to serve uploads directly) ---
@app.route('/static/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)

if __name__ == '__main__':
    log("server.py has been launched!", "INFO")
    try:
        log("Starting Flask server...", "SUCCESS")
        app.run(port=5000)
    except KeyboardInterrupt:
        log("Server shutdown initiated by user keyboard interruption", "WARNING")
        exit(0)
    except Exception as e:
        log(f"Error starting server: {e}", "ERROR")
    finally:
        log("Exiting main block and shutting down server", "WARNING")
        exit(0)
