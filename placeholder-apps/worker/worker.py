from flask import Flask, jsonify
import os
import socket
import threading
import time

app = Flask(__name__)

# Simulated task counter
tasks_processed = 0

def background_worker():
    global tasks_processed
    while True:
        time.sleep(5)
        tasks_processed += 1
        print(f"[Worker] Processed task #{tasks_processed}")

@app.route("/")
def home():
    return jsonify({
        "service": "task-processor",
        "status": "running",
        "hostname": socket.gethostname(),
        "tasks_processed": tasks_processed
    })

@app.route("/health")
def health():
    return jsonify({"status": "healthy", "service": "task-processor"})

if __name__ == "__main__":
    worker_thread = threading.Thread(target=background_worker, daemon=True)
    worker_thread.start()
    print("[Worker] Background task processor started")
    app.run(host="0.0.0.0", port=5555)

