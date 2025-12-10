from flask import Flask, jsonify
import os
import socket

app = Flask(__name__)

@app.route("/")
def home():
    return jsonify({
        "service": "api-server",
        "status": "running",
        "hostname": socket.gethostname(),
        "message": "E-Commerce API is operational!"
    })

@app.route("/health")
def health():
    return jsonify({"status": "healthy", "service": "api-server"})

@app.route("/api/products")
def products():
    return jsonify([
        {"id": 1, "name": "Widget", "price": 29.99},
        {"id": 2, "name": "Gadget", "price": 49.99},
        {"id": 3, "name": "Gizmo", "price": 19.99}
    ])

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)

