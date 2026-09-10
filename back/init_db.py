import os
import sqlite3
import hashlib
import base64

DATABASE = 'shop.db'

# Must match PBKDF2_ITERATIONS in server.py (used for the seeded temporary admin).
PBKDF2_ITERATIONS = 200_000

# ---------------------------------------------------------------------------
# Demo catalog (seeded once, on a brand-new database). Delete or edit the
# entries from the admin panel to start with your own products and services.
# Images point at picsum.photos placeholders — replace them with your own.
# ---------------------------------------------------------------------------

SAMPLE_PRODUCTS = [
    {
        "name": "DeGoogled Pixel 8 — Privacy Edition",
        "price": 449.0, "discount_price": 399.0, "limited_edition": 1, "sold_out": 0,
        "bio": (
            "A refurbished Google Pixel 8 with stock Android replaced by a hardened, "
            "de-Googled operating system.\n\n"
            "**What you get**\n\n"
            "- Clean OS build without Google services\n"
            "- 7 years of security updates\n"
            "- Factory-sealed packaging, 12-month warranty\n"
            "- Free privacy setup session (30 min, online)\n\n"
            "> Limited stock — every device is wiped, relocked and tested by hand."
        ),
        "images": [
            "https://picsum.photos/seed/degpixel8a/1200/900",
            "https://picsum.photos/seed/degpixel8b/1200/900",
            "https://picsum.photos/seed/degpixel8c/1200/900",
        ],
    },
    {
        "name": "Faraday Pouch — Signal Blocking Case",
        "price": 24.95, "discount_price": None, "limited_edition": 0, "sold_out": 0,
        "bio": (
            "Block all wireless signals with this padded Faraday pouch.\n\n"
            "- Blocks Wi-Fi, Bluetooth, GPS and cellular\n"
            "- Fits phones up to 6.8\"\n"
            "- Keyring loop, RFID-safe inner pocket\n"
            "- Tested with a live network scanner before shipping"
        ),
        "images": [
            "https://picsum.photos/seed/faraday1/1200/900",
            "https://picsum.photos/seed/faraday2/1200/900",
        ],
    },
    {
        "name": "YubiKey 5 NFC Security Key",
        "price": 55.0, "discount_price": None, "limited_edition": 0, "sold_out": 1,
        "bio": (
            "The gold standard for phishing-resistant two-factor authentication.\n\n"
            "- FIDO2 / WebAuthn, U2F, OTP, PIV\n"
            "- USB-A with NFC tap support\n"
            "- Works with Google, GitHub, Microsoft and 800+ services"
        ),
        "images": [
            "https://picsum.photos/seed/yubikey1/1200/900",
            "https://picsum.photos/seed/yubikey2/1200/900",
        ],
    },
    {
        "name": "Privacy VPN — 1 Year License",
        "price": 59.99, "discount_price": 39.99, "limited_edition": 0, "sold_out": 0,
        "bio": (
            "One year of a no-logs VPN service on up to five devices.\n\n"
            "- WireGuard & OpenVPN protocols\n"
            "- Servers in 40+ countries\n"
            "- Kill switch and split tunnelling\n\n"
            "Delivered by email within 10 minutes of purchase."
        ),
        "images": [
            "https://picsum.photos/seed/vpnkey1/1200/900",
            "https://picsum.photos/seed/vpnkey2/1200/900",
        ],
    },
    {
        "name": "Encrypted USB Drive — 64 GB",
        "price": 39.0, "discount_price": None, "limited_edition": 0, "sold_out": 0,
        "bio": (
            "Hardware-encrypted USB 3.2 stick with a built-in PIN pad.\n\n"
            "- AES-256 XTS hardware encryption\n"
            "- Tamper-proof: 10 wrong PINs = secure wipe\n"
            "- USB-C and USB-A compatible\n\n"
            "**Includes** a backup guide and a spare recovery key card."
        ),
        "images": [
            "https://picsum.photos/seed/usbdrive1/1200/900",
            "https://picsum.photos/seed/usbdrive2/1200/900",
        ],
    },
    {
        "name": "Pi-hole Network Ad-Blocker Kit",
        "price": 129.0, "discount_price": None, "limited_edition": 0, "sold_out": 0,
        "bio": (
            "A plug-and-play Raspberry Pi kit that blocks ads and trackers for "
            "your **whole home network**.\n\n"
            "- Pre-flashed Pi-hole image with 500k-blocklist\n"
            "- Case, power supply and 32 GB SD card included\n"
            "- 30-minute guided setup video\n\n"
            "_Raspberry Pi 5 2 GB included._"
        ),
        "images": [
            "https://picsum.photos/seed/pihole1/1200/900",
            "https://picsum.photos/seed/pihole2/1200/900",
        ],
    },
    {
        "name": "Webcam Cover Pack — 3 Pack",
        "price": 9.99, "discount_price": None, "limited_edition": 0, "sold_out": 0,
        "bio": "Ultra-thin sliding webcam covers.\n\n- Fits laptops, tablets and monitors\n- No tools, no residue\n- 0.6 mm profile",
        "images": ["https://picsum.photos/seed/webcampack/1200/900"],
    },
    {
        "name": "Password Manager Family — 1 Year",
        "price": 49.99, "discount_price": 29.99, "limited_edition": 0, "sold_out": 0,
        "bio": (
            "One year of a family password manager (6 accounts) with secure "
            "sharing and emergency access.\n\n"
            "- Unlimited passwords and devices\n"
            "- Encrypted file attachments\n"
            "- 1 GB encrypted storage per account"
        ),
        "images": ["https://picsum.photos/seed/pwmgr1/1200/900"],
    },
]

SAMPLE_SERVICES = [
    {
        "name": "Custom Website Development",
        "price": 899.0, "discount_price": None, "active": 1,
        "bio": (
            "A fast, mobile-first website built to your spec.\n\n"
            "**What is included**\n\n"
            "- Design in your brand style\n"
            "- Up to 5 pages or sections\n"
            "- Contact form & analytics consent\n"
            "- Basic SEO setup\n\n"
            "Delivery in 2–4 weeks, including two revision rounds."
        ),
        "images": ["https://picsum.photos/seed/website1/1200/900", "https://picsum.photos/seed/website2/1200/900"],
    },
    {
        "name": "Secure Server Hosting — 1 Year",
        "price": 120.0, "discount_price": 96.0, "active": 1,
        "bio": (
            "Managed hosting on a hardened Linux server.\n\n"
            "- Automatic updates & daily backups\n"
            "- Firewall + fail2ban configured\n"
            "- Let's Encrypt TLS certificates\n"
            "- 99.9% uptime target, monitoring included"
        ),
        "images": ["https://picsum.photos/seed/hosting1/1200/900"],
    },
    {
        "name": "Privacy & Security Audit",
        "price": 349.0, "discount_price": None, "active": 1,
        "bio": (
            "A full review of your digital footprint and setup.\n\n"
            "- Devices, accounts and passwords reviewed\n"
            "- Social-media privacy check\n"
            "- Clear action list, sorted by risk\n\n"
            "You receive a written report plus a 45-minute walkthrough call."
        ),
        "images": ["https://picsum.photos/seed/audit1/1200/900"],
    },
    {
        "name": "Maintenance & Support Plan (Monthly)",
        "price": 49.0, "discount_price": None, "active": 1,
        "bio": (
            "Ongoing care for your website or server.\n\n"
            "- Updates, backups and uptime monitoring\n"
            "- Small content changes included\n"
            "- 24h response time on business days\n"
            "- Cancel anytime"
        ),
        "images": ["https://picsum.photos/seed/maint1/1200/900"],
    },
    {
        "name": "Private Programming Lessons",
        "price": 30.0, "discount_price": None, "active": 1,
        "bio": (
            "One-on-one lessons with a working developer.\n\n"
            "- Python, JavaScript, or web fundamentals\n"
            "- 1-hour sessions, online or in person\n"
            "- Homework review between sessions\n\n"
            "Buy a single lesson, or contact us for a 10-lesson bundle."
        ),
        "images": ["https://picsum.photos/seed/lessons1/1200/900"],
    },
]


def table_exists(cursor, table_name: str) -> bool:
    """Check if a table exists in the database."""
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a given column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def create_or_update_db_table(admin_username: str | None = None, seed_sample_catalog: bool = False):
    """
    Create/upgrade the schema.

    If `admin_username` is given (the value of the ADMIN_USERNAME setting),
    the oldest account with that username is granted the 'admin' role. This is
    a one-time migration for databases created before roles existed, when
    admin rights were (unsafely) derived from the username alone; it is skipped
    on databases that already have the `role` column.

    If `seed_sample_catalog` is True (only meant for brand-new databases),
    a demo catalog of products and services is inserted so the shop is not
    empty on first launch. Real data is never overwritten.
    """
    conn = sqlite3.connect(DATABASE)
    try:
        # Make sure foreign key constraints are enforced
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()

        # MAIN TABLES (latest schema)
        # Products: image_path is gone, images live in product_images
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                bio TEXT,
                price REAL NOT NULL,
                discount_price REAL,
                limited_edition INTEGER DEFAULT 0,
                sold_out INTEGER DEFAULT 0,
                almost_sold_out INTEGER DEFAULT 0
            )
        ''')

        # Services: same deal, image_path removed
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                bio TEXT,
                price REAL NOT NULL,
                discount_price REAL,
                active INTEGER DEFAULT 1
            )
        ''')

        # Contact form submissions
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        ''')

        # Users: fairly standard auth + some profile data.
        # `role` is 'user' or 'admin'; admin rights are granted via a role,
        # NOT by choosing a specific username. `is_setup_admin` flags the
        # temporary 'admin'/'admin' account seeded on first launch; it is
        # removed once the owner creates their own admin account.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                is_setup_admin INTEGER NOT NULL DEFAULT 0,
                phone TEXT,
                address TEXT,
                preferred_payment TEXT
            )
        ''')

        # Orders + order_items: classic one-to-many
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                status TEXT CHECK(status IN ('ordered', 'confirmed', 'shipped', 'delivered')) NOT NULL DEFAULT 'ordered',
                shipping_date TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        ''')

        # Product images (new normalized table)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS product_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                alt_text TEXT,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_images_sort ON product_images(product_id, sort_order)')

        # Service images (same idea as products)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS service_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                alt_text TEXT,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
            )
        ''')

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS discount_codes (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                code          TEXT NOT NULL UNIQUE,
                kind          TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
                value         REAL NOT NULL CHECK (value >= 0),
                active        INTEGER NOT NULL DEFAULT 1,               -- 1=true, 0=false
                starts_at     TEXT,                                     -- ISO8601 or NULL
                expires_at    TEXT,                                     -- ISO8601 or NULL
                max_uses      INTEGER,                                  -- NULL = unlimited
                used_count    INTEGER NOT NULL DEFAULT 0,
                applies_to    TEXT DEFAULT 'all',                       -- 'all' | 'product' | 'service' (extend as needed)
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """)

        cursor.execute('CREATE INDEX IF NOT EXISTS idx_service_images_service_id ON service_images(service_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_service_images_sort ON service_images(service_id, sort_order)')

        # Add missing columns to products if the DB was created earlier
        products_backfill = [
            ('products', 'bio', 'TEXT'),
            ('products', 'price', 'REAL NOT NULL DEFAULT 0'),
            ('products', 'discount_price', 'REAL'),
            ('products', 'limited_edition', 'INTEGER DEFAULT 0'),
            ('products', 'sold_out', 'INTEGER DEFAULT 0'),
            ('products', 'almost_sold_out', 'INTEGER DEFAULT 0'),
        ]
        for table, col, definition in products_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # Add missing columns to services
        services_backfill = [
            ('services', 'bio', 'TEXT'),
            ('services', 'discount_price', 'REAL'),
            ('services', 'active', 'INTEGER DEFAULT 1'),
        ]
        for table, col, definition in services_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # Add missing columns to users
        # NOTE: read this *before* the backfill adds `role`. A database that
        # still lacks the column predates roles, which is the only case where
        # the legacy username-based promotion below may run.
        users_predate_roles = table_exists(cursor, 'users') and not column_exists(cursor, 'users', 'role')
        users_backfill = [
            ('users', 'role', "TEXT NOT NULL DEFAULT 'user'"),
            ('users', 'is_setup_admin', "INTEGER NOT NULL DEFAULT 0"),
            ('users', 'preferred_payment', 'TEXT'),
            ('users', 'phone', 'TEXT'),
            ('users', 'address', 'TEXT'),
        ]
        for table, col, definition in users_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # Move legacy product.image_path into product_images
        if column_exists(cursor, 'products', 'image_path'):
            print("Migrating products.image_path to product_images...")
            cursor.execute('''
                INSERT INTO product_images (product_id, image_path, alt_text, sort_order)
                SELECT p.id, p.image_path, NULL, 0
                FROM products p
                WHERE p.image_path IS NOT NULL AND TRIM(p.image_path) <> ''
                  AND NOT EXISTS (
                      SELECT 1 FROM product_images pi
                      WHERE pi.product_id = p.id AND pi.sort_order = 0
                  )
            ''')

        # Move legacy service.image_path into service_images
        if column_exists(cursor, 'services', 'image_path'):
            print("Migrating services.image_path to service_images...")
            cursor.execute('''
                INSERT INTO service_images (service_id, image_path, alt_text, sort_order)
                SELECT s.id, s.image_path, NULL, 0
                FROM services s
                WHERE s.image_path IS NOT NULL AND TRIM(s.image_path) <> ''
                  AND NOT EXISTS (
                      SELECT 1 FROM service_images si
                      WHERE si.service_id = s.id AND si.sort_order = 0
                  )
            ''')

        # Legacy migration: grant 'admin' to the oldest account that uses the
        # configured admin username. This runs EXACTLY ONCE, when the `role`
        # column is first added to a pre-role database.
        #
        # It must never run on a current-schema database: every startup used to
        # re-run it, so anyone who signed up with the configured username (the
        # default is ADMIN_USERNAME=LeonBoussen) was silently promoted to admin
        # on the next restart. On a current-schema database the only bootstrap
        # is the temporary 'admin'/'admin' account + /api/auth/setup flow.
        if admin_username and users_predate_roles:
            cursor.execute(
                """
                UPDATE users SET role = 'admin'
                 WHERE id = (SELECT MIN(id) FROM users
                              WHERE username = ? COLLATE NOCASE)
                """,
                (admin_username,),
            )
            if cursor.rowcount:
                print(f"Promoted '{admin_username}' to admin role (pre-role database migration).")

        # --- Temporary default-admin seeding (first launch) -----------------
        # A brand-new database has no admin at all: seed the well-known
        # temporary account 'admin' / 'admin'. The first person who logs in
        # with it is forced (POST /api/auth/setup) to create their own admin
        # account, and this temporary account is deleted in that same step.
        admin_count = cursor.execute(
            "SELECT COUNT(*) FROM users WHERE role='admin'"
        ).fetchone()[0]
        real_admin_count = cursor.execute(
            "SELECT COUNT(*) FROM users WHERE role='admin' AND is_setup_admin=0"
        ).fetchone()[0]

        if real_admin_count > 0:
            # A real admin exists: never keep a temporary setup account around.
            cursor.execute("DELETE FROM users WHERE is_setup_admin=1")
        elif admin_count == 0:
            salt = os.urandom(16)
            password = 'admin'
            dk = hashlib.pbkdf2_hmac(
                'sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS
            )
            cursor.execute(
                """
                INSERT INTO users(email, username, password_hash, salt, role, is_setup_admin)
                VALUES(?,?,?,?,'admin',1)
                """,
                (
                    'setup-admin@local.invalid',
                    'admin',
                    base64.b64encode(dk).decode('ascii'),
                    base64.b64encode(salt).decode('ascii'),
                ),
            )
            print("\n==========================================================")
            print(" TEMPORARY ADMIN ACCOUNT CREATED (first launch)")
            print("   username: admin")
            print("   password: admin")
            print(" Log in once — you will be asked to create your own admin")
            print(" account, and this temporary account is removed.")
            print("==========================================================\n")

        # --- Demo catalog (brand-new database only) -------------------------
        # Keeps the first run from looking empty. Never runs on an existing
        # database, so real products/services are never touched.
        if seed_sample_catalog:
            product_count = cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            if product_count == 0:
                for p in SAMPLE_PRODUCTS:
                    cursor.execute(
                        """
                        INSERT INTO products(name, bio, price, discount_price, limited_edition, sold_out)
                        VALUES(?,?,?,?,?,?)
                        """,
                        (p["name"], p["bio"], p["price"], p["discount_price"],
                         int(bool(p["limited_edition"])), int(bool(p["sold_out"]))),
                    )
                    pid = cursor.lastrowid
                    for i, url in enumerate(p["images"]):
                        cursor.execute(
                            "INSERT INTO product_images(product_id, image_path, alt_text, sort_order) VALUES(?,?,?,?)",
                            (pid, url, p["name"], i),
                        )
                print(f"Seeded {len(SAMPLE_PRODUCTS)} demo products.")
            service_count = cursor.execute("SELECT COUNT(*) FROM services").fetchone()[0]
            if service_count == 0:
                for s in SAMPLE_SERVICES:
                    cursor.execute(
                        """
                        INSERT INTO services(name, bio, price, discount_price, active)
                        VALUES(?,?,?,?,?)
                        """,
                        (s["name"], s["bio"], s["price"], s["discount_price"], int(bool(s["active"]))),
                    )
                    sid = cursor.lastrowid
                    for i, url in enumerate(s["images"]):
                        cursor.execute(
                            "INSERT INTO service_images(service_id, image_path, alt_text, sort_order) VALUES(?,?,?,?)",
                            (sid, url, s["name"], i),
                        )
                print(f"Seeded {len(SAMPLE_SERVICES)} demo services.")

        conn.commit()

    finally:
        conn.close()

if __name__ == '__main__':
    try:
        fresh = not os.path.exists(DATABASE)
        if fresh:
            print("No database found → creating a new one...")
        else:
            print("Database found → checking schema and upgrading if needed...")
        create_or_update_db_table(seed_sample_catalog=fresh)
        print("✔ Done.")
    except sqlite3.Error as e:
        print(f"SQL error: {e}")
        input("Press Enter to exit...")
    except Exception as e:
        print(f"Error: {e}")
        input("Press Enter to exit...")
    finally:
        exit(0)
