import os
import sqlite3

DATABASE = 'shop.db'


def table_exists(cursor, table_name: str) -> bool:
    """Check if a table exists in the database."""
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a given column exists in a table."""
    # Note: table_name is static in our calls; PRAGMA doesn't support parameters.
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def create_or_update_db_table():
    conn = sqlite3.connect(DATABASE)
    try:
        # Make sure foreign key constraints are enforced
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()

        # ------------------------------
        # TABLES (latest schema)
        # ------------------------------
        # Products
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

        # Product variants
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS product_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                variant_name TEXT NOT NULL,
                attributes_json TEXT NOT NULL,
                price_delta   REAL NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        ''')

        # Product variant images
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS product_variant_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                variant_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                alt_text TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
            )
        ''')

        # Services
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

        # Users
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                phone TEXT,
                address TEXT,
                preferred_payment TEXT
            )
        ''')

        # Orders + order_items
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

        # Product images
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

        # Service images
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

        # Discount codes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS discount_codes (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                code          TEXT NOT NULL UNIQUE,
                kind          TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
                value         REAL NOT NULL CHECK (value >= 0),
                active        INTEGER NOT NULL DEFAULT 1,
                starts_at     TEXT,
                expires_at    TEXT,
                max_uses      INTEGER,
                used_count    INTEGER NOT NULL DEFAULT 0,
                applies_to    TEXT DEFAULT 'all',
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        # ------------------------------
        # BACKFILLS (add missing columns in existing DBs)
        # ------------------------------
        # Products
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

        # Services
        services_backfill = [
            ('services', 'bio', 'TEXT'),
            ('services', 'discount_price', 'REAL'),
            ('services', 'active', 'INTEGER DEFAULT 1'),
        ]
        for table, col, definition in services_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # Users
        users_backfill = [
            ('users', 'preferred_payment', 'TEXT'),
            ('users', 'phone', 'TEXT'),
            ('users', 'address', 'TEXT'),
        ]
        for table, col, definition in users_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # Images / Variants: ensure sort_order exists before we touch it or index it
        images_variants_backfill = [
            # table, column, definition (match your CREATE TABLE definitions)
            ('product_images', 'sort_order', 'INTEGER DEFAULT 0'),
            ('service_images', 'sort_order', 'INTEGER DEFAULT 0'),
            ('product_variants', 'sort_order', 'INTEGER NOT NULL DEFAULT 0'),
            ('product_variant_images', 'sort_order', 'INTEGER NOT NULL DEFAULT 0'),
        ]
        for table, col, definition in images_variants_backfill:
            if table_exists(cursor, table) and not column_exists(cursor, table, col):
                print(f"Adding column {col} to {table}")
                cursor.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')

        # ------------------------------
        # LEGACY MIGRATIONS (after backfills)
        # ------------------------------
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

        # ------------------------------
        # INDEXES (create AFTER columns are ensured)
        # ------------------------------
        # product_variants
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_variants_sort ON product_variants(product_id, sort_order)')

        # product_variant_images
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_variant_images_variant_id ON product_variant_images(variant_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_variant_images_sort ON product_variant_images(variant_id, sort_order)')

        # product_images
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_product_images_sort ON product_images(product_id, sort_order)')

        # service_images
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_service_images_service_id ON service_images(service_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_service_images_sort ON service_images(service_id, sort_order)')

        conn.commit()
    finally:
        conn.close()

if __name__ == '__main__':
    try:
        if not os.path.exists(DATABASE):
            print("No database found → creating a new one...")
        else:
            print("Database found → checking schema and upgrading if needed...")
        create_or_update_db_table()
        print("✔ Done.")
    except sqlite3.Error as e:
        print(f"SQL error: {e}")
        input("Press Enter to exit...")
    except Exception as e:
        print(f"Error: {e}")
        input("Press Enter to exit...")
    finally:
        exit(0)
