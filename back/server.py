from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime
import colorama; colorama.init()
import random


#initialize Flask app, CORS and colorama
app = Flask(__name__) # Flask app instance
CORS(app) # Enable CORS for all routes to allow cross-origin requests
colorama.init(autoreset=True) # make sure that the console colors reset after each print

# log everything with a timestamp in server.log
def log(message, status="DEFAULT"):
    try:
        # 1. Get current day and time
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 2. Status colors and format
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

        # 3. Print to terminal
        print(color + log_entry)

        # 4. Append to server.log
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")

    except Exception as e:
        # Fallback logging
        error_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fallback_msg = f"[ERROR - {error_time}] Failed to log message: {e}"
        print(colorama.Fore.RED + fallback_msg)
        with open("server.log", "a", encoding="utf-8") as f:
            f.write(fallback_msg + "\n")
        

# get all products from the database
def get_all_products():
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price FROM products")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "price": r[2]} for r in rows]

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

# api call route for function get_all_products
@app.route('/api/products', methods=['GET'])
def products():
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price, image_path FROM products")
    rows = cursor.fetchall()
    conn.close()
    return jsonify([
        {"id":r[0], "name":r[1], "price":r[2], "image_url":r[3]}
        for r in rows
    ])

# 
@app.route('/api/products', methods=['POST'])
def add_product():
    # 1. Parse JSON body
    data = request.get_json()
    name           = data.get('name')
    price          = data.get('price')
    image_path     = data.get('image')           # name matches your frontend
    # (you can extend to bio, discount_price, etc. later)

    # 2. Validate required fields
    if not name or not price:
        return jsonify({"error":"`name` and `price` are required"}), 400

    # 3. Insert into SQLite
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO products (name, price, image_path)
        VALUES (?, ?, ?)
    """, (name, price, image_path))
    conn.commit()

    new_id = cursor.lastrowid
    conn.close()

    # 4. Return the new product’s ID
    return jsonify({"id": new_id}), 201


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