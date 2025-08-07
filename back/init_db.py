import os
import sqlite3

# Database name as constant to ensure consistency
DATABASE = 'shop.db'

# Function to check if a column exists in a table
def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns

# Function to create or update the database tables
def create_or_update_db_table():
    # make connection with database
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            bio TEXT,
            price REAL NOT NULL,
            discount_price REAL,
            image_path TEXT,
            limited_edition INTEGER DEFAULT 0,
            sold_out INTEGER DEFAULT 0
        )
    ''')

    # users table
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

    # order table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            status TEXT CHECK(status IN ('ordered', 'confirmed', 'shipped', 'delivered')) NOT NULL DEFAULT 'ordered',
            shipping_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # order_items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')

    # Check and add new columns if they do not exist
    add_columns = [
        # (table, column, definition)
        ('products', 'limited_edition', 'INTEGER DEFAULT 0'),
        ('products', 'sold_out', 'INTEGER DEFAULT 0'),
        ('products', 'discount_price', 'REAL'),
        ('products', 'bio', 'TEXT'),
        ('products', 'image_path', 'TEXT'),
        ('users', 'preferred_payment', 'TEXT')
    ]
    for table, column, definition in add_columns:
        if not column_exists(cursor, table, column):
            print(f"Adding column {column} to table {table}")
            cursor.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')

    conn.commit()
    conn.close()

if __name__ == '__main__':
    try:
        create_or_update_db_table()
        input("Database initialized successfully.\nPress Enter to exit...")
    except sqlite3.Error as e:
        print(f"An sql error!: {e}")
        input("Press Enter to exit...")
    except Exception as e:
        print(f"An error occurred: {e}")
        input("Press Enter to exit...")
    finally:
        exit(0)