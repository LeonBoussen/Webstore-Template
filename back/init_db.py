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
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def create_or_update_db_table():
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

        # Users: fairly standard auth + some profile data
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
        users_backfill = [
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
