import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder="frontend/build", static_url_path="")
CORS(app)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Starting Flask Application...")

@app.route("/")
def serve_frontend():
    logger.info("Serving index.html")
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def serve_static_files(path):
    logger.info(f"Serving static file: {path}")
    return send_from_directory(app.static_folder, path)

@app.route("/deploy", methods=["POST"])
def deploy():
    data = request.json
    logger.info(f"Received deployment request: {data}")

    response = {
        "status": "success",
        "message": f"Deployment triggered for {data['containerImage']} in namespace {data['namespace']}"
    }
    return jsonify(response), 200

if __name__ == "__main__":
    logger.info("Running on 0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000)
