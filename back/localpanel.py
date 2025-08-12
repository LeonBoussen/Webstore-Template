# =========================
# == LOCAL PANEL (ADDON) ==
# =========================
from flask import session, redirect, Response, Flask, request, jsonify, send_from_directory
import re
import hmac
from dotenv import load_dotenv
import os
from functools import wraps
import sqlite3
from werkzeug.utils import secure_filename
import hashlib
import binascii
import time


def db():
    return sqlite3.connect(DB_PATH)

# Standalone app (works even if not embedded)
app = Flask(__name__)

# Load .env so LOCALPANEL_PASSWORD / SECRET_KEY / UPLOAD_DIR are available
try:
    load_dotenv()
except Exception:
    pass

# --- Try to re-use server.py's DB + uploads config to stay 100% compatible ---
SERVER_IMPORT_OK = False
try:
    import server as _srv  # same process, same cwd
    SERVER_IMPORT_OK = True
except Exception:
    SERVER_IMPORT_OK = False

# --- Config (match server.py, with safe fallbacks) ---
if SERVER_IMPORT_OK:
    # Reuse server's config and DB helper
    db = _srv.db                      # same 'shop.db' connection function
    UPLOAD_DIR = _srv.UPLOAD_DIR      # same absolute uploads folder
    MAX_UPLOAD_MB = _srv.MAX_UPLOAD_MB
else:
    # Fallbacks that mirror server.py defaults
    def db():
        import sqlite3, os
        return sqlite3.connect('shop.db')  # same filename as server.py
    UPLOAD_DIR = os.path.join(os.getcwd(), "static", "uploads")
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "5"))

ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "gif"}
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Use existing SECRET_KEY from env for Flask sessions (safe if already set)
if not getattr(app, "secret_key", None):
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# Dedicated password for the Local Panel (separate from any SPA admin)
LOCALPANEL_PASSWORD = os.environ.get("LOCALPANEL_PASSWORD", "change-this-strong-local-only-password")


# Use existing SECRET_KEY from env for Flask sessions (safe if already set)
if not getattr(app, "secret_key", None):
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# Dedicated password for the Local Panel (separate from any SPA admin)
LOCALPANEL_PASSWORD = os.environ.get("LOCALPANEL_PASSWORD", "change-this-strong-local-only-password")

def _is_valid_identifier(name: str) -> bool:
    return bool(re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', name))

def require_localpanel(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("localpanel_auth"):
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper

def list_tables(conn):
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    return [r[0] for r in cur.fetchall()]

def table_columns(conn, table):
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    cols = []
    for cid, name, ctype, nn, dflt, pk in cur.fetchall():
        cols.append({
            "name": name,
            "type": ctype or "",
            "notnull": bool(nn),
            "default": dflt,
            "pk": bool(pk),
        })
    return cols

def table_single_int_pk(columns):
    pk_cols = [c for c in columns if c["pk"]]
    if len(pk_cols) != 1:
        return None
    if "INT" not in (pk_cols[0]["type"] or "").upper():
        return None
    return pk_cols[0]["name"]

# ---------- Auth pages ----------
@app.route("/localpanel", methods=["GET"])
def localpanel_root():
    if not session.get("localpanel_auth"):
        # Login page - styled similarly to your Signup card
        return Response("""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Local Panel – Login</title>
</head>
<body class="min-h-screen bg-neutral-950 text-white">
  <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]"></div>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="w-full max-w-md">
      <div class="text-center mb-6">
        <h1 class="text-3xl font-semibold bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
          Local Panel
        </h1>
        <p class="mt-1 text-sm text-neutral-400">Enter the local password to continue.</p>
      </div>
      <form method="POST" action="/localpanel/login"
            class="rounded-2xl bg-neutral-900/60 border border-white/10 p-6 shadow-xl backdrop-blur">
        <label class="block text-sm mb-2">Password</label>
        <input type="password" name="password" required
               class="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
               placeholder="••••••••" />
        <button class="w-full rounded-xl px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition shadow-lg">
          Enter
        </button>
      </form>
    </div>
  </div>
</body>
</html>
        """, mimetype="text/html")

    # Authenticated panel UI
    return Response("""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Local Panel</title>
</head>
<body class="min-h-screen bg-neutral-950 text-white">
  <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]"></div>
  <header class="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur border-b border-white/10">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <h1 class="text-lg font-semibold bg-gradient-to-br from-cyan-300 to-blue-500 bg-clip-text text-transparent">Local Panel</h1>
      <form method="POST" action="/localpanel/logout">
        <button class="rounded-xl px-3 py-2 bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700">Logout</button>
      </form>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-6">
    <aside class="col-span-12 lg:col-span-3 space-y-6">
      <div class="rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 p-4">
        <h2 class="text-sm uppercase tracking-wider text-neutral-400 mb-3">Quick Actions</h2>
        <ul class="space-y-2 text-sm">
          <li><button onclick="showCard('productsCard')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-800">Products — Quick Add</button></li>
          <li><button onclick="showCard('usersCard')" class="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-800">Users — Quick Add</button></li>
          <li><button onclick="showExplorer()" class="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-800">Open Explorer</button></li>
        </ul>
      </div>

      <div class="rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 p-4">
        <h2 class="text-sm uppercase tracking-wider text-neutral-400 mb-3">Tables</h2>
        <ul id="tables" class="space-y-1 text-sm"></ul>
      </div>
    </aside>

    <section class="col-span-12 lg:col-span-9 space-y-6">
      <!-- Products Quick Add -->
      <div id="productsCard" class="rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 p-4 hidden">
        <h2 class="text-base font-medium text-neutral-200 mb-3">Add Product</h2>
        <form id="productForm" class="grid md:grid-cols-2 gap-3" enctype="multipart/form-data">
          <div><label class="block text-xs text-neutral-400 mb-1">Name *</label><input name="name" required class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Price *</label><input name="price" type="number" step="0.01" required class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Discount price</label><input name="discount_price" type="number" step="0.01" class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div class="md:col-span-2"><label class="block text-xs text-neutral-400 mb-1">Bio</label><input name="bio" class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Image</label><input name="image" type="file" accept="image/*" class="w-full text-sm"></div>
          <div class="flex items-center gap-6 md:col-span-2">
            <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="limited_edition" class="accent-cyan-500"> Limited</label>
            <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="almost_sold_out" class="accent-cyan-500"> Almost sold out</label>
            <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="sold_out" class="accent-cyan-500"> Sold out</label>
          </div>
          <div><button id="createProductBtn" type="button" class="rounded-lg px-4 py-2 bg-emerald-600 hover:bg-emerald-500">Create product</button></div>
          <div class="text-xs text-neutral-400">Uploads go to <code>{UPLOAD_DIR}</code> (max {int(MAX_UPLOAD_MB)}MB).</div>
        </form>
        <div id="productMsg" class="mt-2 text-xs text-neutral-400"></div>
        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm text-neutral-300">Products table</h3>
            <button class="rounded-lg px-3 py-1 bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" onclick="showTable('products')">Refresh</button>
          </div>
          <div class="overflow-auto"><table class="min-w-full text-sm" id="productsTable"></table></div>
        </div>
      </div>

      <!-- Users Quick Add -->
      <div id="usersCard" class="rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 p-4 hidden">
        <h2 class="text-base font-medium text-neutral-200 mb-3">Add User</h2>
        <form id="userForm" class="grid md:grid-cols-2 gap-3">
          <div><label class="block text-xs text-neutral-400 mb-1">Email *</label><input name="email" type="email" required class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Username *</label><input name="username" required class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Password *</label><input name="password" type="password" required class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Phone</label><input name="phone" class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Address</label><input name="address" class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><label class="block text-xs text-neutral-400 mb-1">Preferred payment</label><input name="preferred_payment" class="w-full bg-neutral-800 rounded-lg px-3 py-2 ring-1 ring-white/10"></div>
          <div><button id="createUserBtn" type="button" class="rounded-lg px-4 py-2 bg-emerald-600 hover:bg-emerald-500">Create user</button></div>
        </form>
        <div id="userMsg" class="mt-2 text-xs text-neutral-400"></div>

        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm text-neutral-300">Users table</h3>
            <button class="rounded-lg px-3 py-1 bg-neutral-800 ring-1 ring-white/10 hover:bg-neutral-700" onclick="showTable('users')">Refresh</button>
          </div>
          <div class="overflow-auto"><table class="min-w-full text-sm" id="usersTable"></table></div>
        </div>
      </div>

      <!-- Explorer -->
      <div id="explorerCard" class="rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 id="activeTableTitle" class="text-base font-medium text-neutral-200">Select a table</h2>
          <div class="text-xs text-neutral-400" id="pkHint"></div>
        </div>
        <div id="insertForm" class="mb-4 hidden"></div>
        <div class="overflow-auto">
          <table class="min-w-full text-sm" id="dataTable"></table>
        </div>
        <div id="msg" class="mt-3 text-xs text-neutral-400"></div>
      </div>
    </section>
  </main>

<script>
const el = (sel) => document.querySelector(sel);
const api = async (path, opts={}) => {
  const r = await fetch(path, Object.assign({headers: {'Content-Type':'application/json'}}, opts));
  if (!r.ok) throw new Error((await r.json()).error || ('HTTP '+r.status));
  return r.json();
};

let schema = null;
let activeTable = null;
let pkName = null;

function showCard(id) {
  ['productsCard','usersCard','explorerCard'].forEach(x => {
    const n = el('#'+x);
    if (!n) return;
    if (x === id) n.classList.remove('hidden'); else n.classList.add('hidden');
  });
  if (id === 'productsCard') { showTable('products'); }
  if (id === 'usersCard') { showTable('users'); }
}
function showExplorer(){ showCard('explorerCard'); }

async function loadSchema() {
  schema = await api('/localpanel/api/schema');
  const ul = el('#tables');
  ul.innerHTML = '';
  schema.tables.forEach(t => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-800';
    btn.textContent = t;
    btn.onclick = () => { showExplorer(); showTable(t); };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function showTable(table) {
  activeTable = table;
  el('#activeTableTitle').textContent = table;
  const meta = schema.columns[table];
  pkName = meta.find(c => c.pk)?.name || null;
  el('#pkHint').textContent = pkName ? ('PK: '+pkName) : 'No single PK detected';

  const rows = await api(`/localpanel/api/table/${encodeURIComponent(table)}?limit=200`);
  renderTable(meta, rows);
  renderInsert(meta);

  // Mirror into products/users subtables if present
  if (table === 'products' && el('#productsTable')) {
    renderNamedTable('#productsTable', meta, rows);
  }
  if (table === 'users' && el('#usersTable')) {
    renderNamedTable('#usersTable', meta, rows);
  }
}

function renderNamedTable(selector, meta, rows) {
  const tbl = el(selector);
  const cols = meta.map(c => c.name);
  tbl.innerHTML = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  cols.concat(['_actions']).forEach(h => {
    const th = document.createElement('th');
    th.className = 'px-3 py-2 text-left text-neutral-400 font-normal';
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-white/5';
    cols.forEach(cn => {
      const td = document.createElement('td');
      td.className = 'px-3 py-2 align-top';
      if (cn === 'image_path' && row[cn]) {
        const img = document.createElement('img');
        img.src = row[cn];
        img.alt = 'img';
        img.style.maxWidth = '64px';
        img.style.maxHeight = '64px';
        td.appendChild(img);
      } else {
        const inp = document.createElement('input');
        inp.className = 'w-full bg-neutral-800 rounded-lg px-2 py-1 text-sm ring-1 ring-white/10';
        inp.value = row[cn] ?? '';
        inp.dataset.col = cn;
        inp.dataset.pkval = pkName ? row[pkName] : '';
        td.appendChild(inp);
      }
      tr.appendChild(td);
    });
    const act = document.createElement('td');
    act.className = 'px-3 py-2 align-top space-x-2';
    const save = document.createElement('button');
    save.className = 'rounded-lg px-3 py-1 bg-cyan-600 hover:bg-cyan-500';
    save.textContent = 'Save';
    save.onclick = () => updateRow(tr, cols);
    const del = document.createElement('button');
    del.className = 'rounded-lg px-3 py-1 bg-red-600 hover:bg-red-500';
    del.textContent = 'Delete';
    del.onclick = () => deleteRow(tr);
    act.appendChild(save); act.appendChild(del);
    tr.appendChild(act);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

function renderTable(meta, rows) {
  renderNamedTable('#dataTable', meta, rows);
}

function renderInsert(meta) {
  const holder = el('#insertForm');
  holder.innerHTML = '';
  const cols = meta.filter(c => !c.pk); // ignore PK on insert
  if (!cols.length) { holder.classList.add('hidden'); return; }
  holder.classList.remove('hidden');

  const f = document.createElement('form');
  f.className = 'grid md:grid-cols-2 gap-3';
  cols.forEach(c => {
    const wrap = document.createElement('div');
    const lab = document.createElement('label');
    lab.className = 'block text-xs text-neutral-400 mb-1';
    lab.textContent = c.name + (c.notnull ? ' *' : '');
    const inp = document.createElement('input');
    inp.className = 'w-full bg-neutral-800 rounded-lg px-3 py-2 text-sm ring-1 ring-white/10';
    inp.name = c.name;
    wrap.appendChild(lab); wrap.appendChild(inp);
    f.appendChild(wrap);
  });
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'justify-self-start rounded-lg px-4 py-2 bg-emerald-600 hover:bg-emerald-500';
  submit.textContent = 'Insert row';
  submit.onclick = async () => {
    const data = {};
    f.querySelectorAll('input').forEach(i => data[i.name] = i.value);
    try {
      await fetch(`/localpanel/api/table/${encodeURIComponent(activeTable)}`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      el('#msg').textContent = 'Inserted ✔';
      showTable(activeTable);
    } catch (e) {
      el('#msg').textContent = 'Insert failed: '+e.message;
    }
  };
  f.appendChild(submit);
  holder.appendChild(f);
}

// Update & Delete (generic)
async function updateRow(tr, cols) {
  if (!pkName) { el('#msg').textContent = 'No PK; cannot update.'; return; }
  const data = {};
  let pkval = null;
  tr.querySelectorAll('input').forEach(inp => {
    const c = inp.dataset.col;
    if (c === pkName) pkval = inp.value;
    else data[c] = inp.value;
  });
  try {
    await fetch(`/localpanel/api/table/${encodeURIComponent(activeTable)}/${encodeURIComponent(pkval)}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    el('#msg').textContent = 'Saved ✔';
  } catch (e) {
    el('#msg').textContent = 'Save failed: '+e.message;
  }
}
async function deleteRow(tr) {
  if (!pkName) { el('#msg').textContent = 'No PK; cannot delete.'; return; }
  const pkval = tr.querySelector(`input[data-col="${pkName}"]`).value;
  try {
    await fetch(`/localpanel/api/table/${encodeURIComponent(activeTable)}/${encodeURIComponent(pkval)}`, {
      method: 'DELETE'
    });
    el('#msg').textContent = 'Deleted ✔';
    tr.remove();
  } catch (e) {
    el('#msg').textContent = 'Delete failed: '+e.message;
  }
}

// Quick Add handlers
el('#createProductBtn')?.addEventListener('click', async () => {
  const f = el('#productForm');
  const fd = new FormData(f);
  // Convert checkboxes
  ['limited_edition','almost_sold_out','sold_out'].forEach(k=>{
    fd.set(k, f.querySelector(`[name="${k}"]`).checked ? '1' : '0');
  });
  try {
    const r = await fetch('/localpanel/api/products/create', { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json()).error || ('HTTP '+r.status));
    el('#productMsg').textContent = 'Product created ✔';
    showTable('products');
    f.reset();
  } catch(e) {
    el('#productMsg').textContent = 'Create failed: '+e.message;
  }
});

el('#createUserBtn')?.addEventListener('click', async () => {
  const f = el('#userForm');
  const data = {};
  f.querySelectorAll('input').forEach(i => data[i.name] = i.value);
  try {
    await fetch('/localpanel/api/users/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    el('#userMsg').textContent = 'User created ✔';
    showTable('users');
    f.reset();
  } catch(e) {
    el('#userMsg').textContent = 'Create failed: '+e.message;
  }
});

loadSchema();
showExplorer();
</script>
</body>
</html>
    """, mimetype="text/html")

@app.route("/localpanel/login", methods=["POST"])
def localpanel_login():
    pw = request.form.get("password", "")
    ok = (LOCALPANEL_PASSWORD and hmac.compare_digest(str(pw), str(LOCALPANEL_PASSWORD)))
    if not ok:
        return redirect("/localpanel", code=302)
    session["localpanel_auth"] = True
    return redirect("/localpanel", code=302)

@app.route("/localpanel/logout", methods=["POST"])
def localpanel_logout():
    session.pop("localpanel_auth", None)
    return redirect("/localpanel", code=302)

# ---------- Generic Explorer APIs ----------
@app.route("/localpanel/api/schema", methods=["GET"])
@require_localpanel
def lp_schema():
    conn = db()
    try:
        tables = list_tables(conn)
        columns = {t: table_columns(conn, t) for t in tables}
        return jsonify({"tables": tables, "columns": columns})
    finally:
        conn.close()

@app.route("/localpanel/api/table/<table>", methods=["GET"])
@require_localpanel
def lp_table_rows(table):
    if not _is_valid_identifier(table):
        return jsonify({"error":"invalid table"}), 400
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))
    conn = db()
    try:
        if table not in list_tables(conn):
            return jsonify({"error":"unknown table"}), 404
        cols = [c["name"] for c in table_columns(conn, table)]
        if not cols:
            return jsonify([])
        cur = conn.cursor()
        cur.execute(f"SELECT {', '.join(cols)} FROM {table} LIMIT ? OFFSET ?", (limit, offset))
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return jsonify(rows)
    finally:
        conn.close()

@app.route("/localpanel/api/table/<table>", methods=["POST"])
@require_localpanel
def lp_table_insert(table):
    if not _is_valid_identifier(table):
        return jsonify({"error":"invalid table"}), 400
    data = request.get_json(force=True, silent=True) or {}
    conn = db()
    try:
        if table not in list_tables(conn):
            return jsonify({"error":"unknown table"}), 404
        cols_meta = table_columns(conn, table)
        valid_cols = [c["name"] for c in cols_meta if not c["pk"]]
        keys = [k for k in data.keys() if k in valid_cols]
        if not keys:
            return jsonify({"error":"no valid columns in body"}), 400
        placeholders = ",".join(["?"]*len(keys))
        sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({placeholders})"
        cur = conn.cursor()
        cur.execute(sql, tuple(data[k] for k in keys))
        conn.commit()
        return jsonify({"id": cur.lastrowid}), 201
    finally:
        conn.close()

@app.route("/localpanel/api/table/<table>/<int:pk>", methods=["PUT"])
@require_localpanel
def lp_table_update(table, pk):
    if not _is_valid_identifier(table):
        return jsonify({"error":"invalid table"}), 400
    data = request.get_json(force=True, silent=True) or {}
    conn = db()
    try:
        if table not in list_tables(conn):
            return jsonify({"error":"unknown table"}), 404
        cols_meta = table_columns(conn, table)
        pkcol = table_single_int_pk(cols_meta)
        if not pkcol:
            return jsonify({"error":"no single integer PK on this table"}), 400
        valid_cols = [c["name"] for c in cols_meta if c["name"] != pkcol]
        sets = [f"{k}=?" for k in data.keys() if k in valid_cols]
        if not sets:
            return jsonify({"error":"no updatable columns provided"}), 400
        sql = f"UPDATE {table} SET {', '.join(sets)} WHERE {pkcol}=?"
        cur = conn.cursor()
        cur.execute(sql, tuple(data[k] for k in data.keys() if k in valid_cols) + (pk,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

@app.route("/localpanel/api/table/<table>/<int:pk>", methods=["DELETE"])
@require_localpanel
def lp_table_delete(table, pk):
    if not _is_valid_identifier(table):
        return jsonify({"error":"invalid table"}), 400
    conn = db()
    try:
        if table not in list_tables(conn):
            return jsonify({"error":"unknown table"}), 404
        cols_meta = table_columns(conn, table)
        pkcol = table_single_int_pk(cols_meta)
        if not pkcol:
            return jsonify({"error":"no single integer PK on this table"}), 400
        sql = f"DELETE FROM {table} WHERE {pkcol}=?"
        cur = conn.cursor()
        cur.execute(sql, (pk,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

# ---------- Product endpoints (image upload + fields) ----------
def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTS

def _save_image(file_storage):
    if not file_storage or file_storage.filename == "":
        return None
    if not _allowed_file(file_storage.filename):
        raise ValueError("Unsupported file type")
    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError("File too large")
    ts = int(time.time()*1000)
    fn = secure_filename(file_storage.filename)
    name, ext = os.path.splitext(fn)
    final = f"{name}_{ts}{ext}"
    dest = os.path.join(UPLOAD_DIR, final)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    file_storage.save(dest)
    # Return path usable by the browser
    web_path = "/" + dest.replace("\\", "/")
    return web_path

@app.route("/localpanel/api/products/create", methods=["POST"])
@require_localpanel
def products_create():
    form = request.form
    name = form.get("name", "").strip()
    price = form.get("price", "").strip()
    discount_price = form.get("discount_price", "").strip() or None
    bio = form.get("bio", "").strip() or None
    limited = 1 if form.get("limited_edition") == "1" else 0
    almost = 1 if form.get("almost_sold_out") == "1" else 0
    soldout = 1 if form.get("sold_out") == "1" else 0

    if not name or not price:
        return jsonify({"error": "name and price are required"}), 400

    image_path = None
    try:
        image_path = _save_image(request.files.get("image"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    conn = db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO products (name, bio, price, discount_price, image_path, limited_edition, almost_sold_out, sold_out)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, bio, float(price), float(discount_price) if discount_price else None, image_path, limited, almost, soldout))
        conn.commit()
        return jsonify({"id": cur.lastrowid, "image_path": image_path}), 201
    finally:
        conn.close()

@app.route("/localpanel/api/products/<int:pid>/update", methods=["POST"])
@require_localpanel
def products_update(pid):
    # Accept multipart for optional image, otherwise fields from form
    form = request.form if request.form else request.get_json(force=True, silent=True) or {}
    fields = {}
    for k in ["name","bio","price","discount_price","limited_edition","almost_sold_out","sold_out"]:
        if k in form:
            v = form.get(k)
            if k in ("limited_edition","almost_sold_out","sold_out"):
                fields[k] = 1 if str(v) in ("1", "true", "True", "on") else 0
            elif k in ("price","discount_price") and v not in (None,""):
                fields[k] = float(v)
            else:
                fields[k] = v
    # Optional new image
    if request.files.get("image"):
        try:
            imgp = _save_image(request.files.get("image"))
            fields["image_path"] = imgp
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    if not fields:
        return jsonify({"error":"no fields to update"}), 400

    conn = db()
    try:
        cols = ", ".join([f"{k}=?" for k in fields.keys()])
        vals = list(fields.values()) + [pid]
        cur = conn.cursor()
        cur.execute(f"UPDATE products SET {cols} WHERE id=?", vals)
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

# ---------- User endpoints (create + password reset) ----------
def _hash_password(password: str, salt_hex: str = None):
    if not salt_hex:
        salt_hex = binascii.hexlify(os.urandom(16)).decode()
    h = hashlib.sha256(binascii.unhexlify(salt_hex) + password.encode()).hexdigest()
    return h, salt_hex

@app.route("/localpanel/api/users/create", methods=["POST"])
@require_localpanel
def users_create():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = data.get("password")
    phone = (data.get("phone") or "").strip() or None
    address = (data.get("address") or "").strip() or None
    preferred_payment = (data.get("preferred_payment") or "").strip() or None

    if not email or not username or not password:
        return jsonify({"error":"email, username, password required"}), 400

    pwd_hash, salt = _hash_password(password)

    conn = db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (email, username, password_hash, salt, phone, address, preferred_payment)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (email, username, pwd_hash, salt, phone, address, preferred_payment))
        conn.commit()
        return jsonify({"id": cur.lastrowid}), 201
    except sqlite3.IntegrityError as e:
        return jsonify({"error": "email already exists"}), 400
    finally:
        conn.close()

@app.route("/localpanel/api/users/<int:uid>/password", methods=["POST"])
@require_localpanel
def users_password(uid):
    data = request.get_json(force=True, silent=True) or {}
    new_password = data.get("password")
    if not new_password:
        return jsonify({"error":"password required"}), 400
    pwd_hash, salt = _hash_password(new_password)
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE users SET password_hash=?, salt=? WHERE id=?", (pwd_hash, salt, uid))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()

# ====== END LOCAL PANEL (ADDON) ======
if __name__ == '__main__':
    try:
        app.run(port=5000)
    except KeyboardInterrupt:
        exit(0)
    except Exception as e:
        print(f"Error starting Local Panel: {e}")
        exit(1)
