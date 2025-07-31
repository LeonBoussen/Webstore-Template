from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import sqlite3
import os

#initialize Flask app and CORS
app = Flask(__name__)
CORS(app)

# get all products from the database
def get_all_products():
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price FROM products")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "price": r[2]} for r in rows]

# api call route for function get_all_products
@app.route('/api/products', methods=['GET'])
def products():
    return jsonify(get_all_products())

if __name__ == '__main__':
    app.run(port=5000)
