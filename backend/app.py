import sys
import os
import json
import logging
import subprocess
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from yaml_generator import generate_yaml

# Initialize Flask app
app = Flask(__name__, static_folder="frontend/build", static_url_path="/")
CORS(app)

# Logging Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load OpenShift Cluster details from environment variables (from docker-compose)
OKD_CLUSTER_API = os.getenv("OKD_CLUSTER_API", "https://missing-cluster-api.com")
OKD_SERVICE_ACCOUNT_TOKEN = os.getenv("OKD_SERVICE_ACCOUNT_TOKEN", "missing-cluster-sa-token")


@app.route("/")
def serve_frontend():
    """ Serve the React frontend. """
    logger.info("Serving frontend index.html")
    return send_from_directory(app.static_folder, "index.html")


@app.route("/generate-yaml", methods=["POST"])
def generate_yaml_api():
    """ API to generate YAML from frontend input """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        logger.info(f"Generating YAML for request: {data}")

        yaml_output = generate_yaml(data)
        return jsonify({"status": "success", "yaml": yaml_output})

    except Exception as e:
        logger.error(f"Error generating YAML: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/deploy-to-okd", methods=["POST"])
def deploy_to_okd():
    """ API to deploy YAML to OpenShift """
    try:
        data = request.get_json()
        logger.info(f"Received OpenShift deployment request: {json.dumps(data, indent=2)}")

        # Generate YAML
        yaml_content = generate_yaml(data)
        yaml_file_path = "/tmp/generated.yaml"

        # Save YAML to a file
        with open(yaml_file_path, "w") as yaml_file:
            yaml_file.write(yaml_content)

        # Authenticate to OpenShift
        login_cmd = f"oc login --server={OKD_CLUSTER_API} --token={OKD_SERVICE_ACCOUNT_TOKEN} --insecure-skip-tls-verify"
        apply_cmd = f"oc apply -f {yaml_file_path}"

        # Execute OpenShift commands
        subprocess.run(login_cmd, shell=True, check=True)
        subprocess.run(apply_cmd, shell=True, check=True)

        logger.info("Successfully deployed YAML to OpenShift!")
        return jsonify({"status": "success", "message": "Deployment successful!"})

    except subprocess.CalledProcessError as e:
        logger.error(f"Deployment error: {str(e)}")
        return jsonify({"status": "error", "message": f"Deployment failed: {e}"}), 500


# Catch-all route to serve React frontend
@app.route("/<path:path>")
def static_proxy(path):
    """ Serve static assets and fallback to index.html for SPA """
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    logger.info("Starting OKD Deployment App...")
    app.run(host="0.0.0.0", port=5000)
