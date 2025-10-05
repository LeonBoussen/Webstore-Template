import sqlite3
import argparse
import sys

def print_results(cursor):
    """
    Fetches all rows from the last executed SELECT query and prints them as a table.
    """
    rows = cursor.fetchall()
    if not rows:
        print("(No results)")
        return
    columns = [description[0] for description in cursor.description]
    widths = [len(col) for col in columns]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))
    header = ' | '.join(col.ljust(widths[i]) for i, col in enumerate(columns))
    separator = '-+-'.join('-' * widths[i] for i in range(len(widths)))
    print(header)
    print(separator)
    for row in rows:
        print(' | '.join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)))

def list_tables(cursor):
    """List all table names in the database."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    rows = cursor.fetchall()
    if not rows:
        print("(No tables found)")
    else:
        print("Tables:")
        for r in rows:
            print(f"  {r[0]}")


def show_schema(cursor, table):
    """Display the CREATE schema for the specified table."""
    cursor.execute(f"PRAGMA table_info({table});")
    rows = cursor.fetchall()
    if not rows:
        print(f"(No such table: {table})")
    else:
        print("cid | name | type | notnull | dflt_value | pk")
        for r in rows:
            print(" | ".join(str(x) for x in r))


def main():
    parser = argparse.ArgumentParser(description="SQLite SQL execution console")
    parser.add_argument('--db', default='shop.db', help='Path to SQLite database file')
    args = parser.parse_args()

    try:
        conn = sqlite3.connect(args.db)
    except sqlite3.Error as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

    cursor = conn.cursor()
    print(f"Connected to {args.db}.")
    print("Enter SQL statements, .tables, .schema TABLE, or 'exit' to quit.")

    try:
        while True:
            query = input('sql> ').strip()
            if not query:
                continue
            low = query.lower()
            if low in ('exit', 'quit'):
                print('Exiting.')
                break
            if query.startswith('.'):
                if low == '.tables':
                    list_tables(cursor)
                elif low.startswith('.schema'):
                    parts = query.split()
                    if len(parts) >= 2:
                        show_schema(cursor, parts[1])
                    else:
                        print("Usage: .schema TABLE")
                else:
                    print(f"Unknown meta-command: {query}")
                continue
            try:
                cursor.execute(query)
                if low.startswith('select'):
                    print_results(cursor)
                else:
                    conn.commit()
                    print('Query executed successfully.')
            except sqlite3.Error as e:
                print(f"SQL error: {e}")
    except (KeyboardInterrupt, EOFError):
        print('\nExiting.')
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
