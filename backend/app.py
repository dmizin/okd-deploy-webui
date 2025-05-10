import sys
import os
import json
import logging
import subprocess
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from yaml_generator import generate_yaml
from okd_api import get_namespaces, get_storage_classes, authenticate_to_okd, execute_oc_command, check_auth_status

# Initialize Flask app
app = Flask(__name__, static_folder="frontend/build", static_url_path="/")
CORS(app)

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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

        logger.info(f"Generating YAML for request")

        yaml_output = generate_yaml(data)
        return jsonify({"status": "success", "yaml": yaml_output})

    except Exception as e:
        logger.error(f"Error generating YAML: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/deploy-to-okd", methods=["POST"])
def deploy_to_okd():
    """ API to deploy YAML to OpenShift """
    try:
        data = request.get_json()
        logger.info(f"Received OpenShift deployment request")

        # Generate YAML
        yaml_content = generate_yaml(data)
        yaml_file_path = "/tmp/generated.yaml"

        # Save YAML to a file
        with open(yaml_file_path, "w") as yaml_file:
            yaml_file.write(yaml_content)

        # Authenticate to OpenShift and apply YAML
        if not authenticate_to_okd():
            logger.error("Failed to authenticate to OpenShift")
            return jsonify({"status": "error", "message": "Failed to authenticate to OpenShift cluster"}), 500

        # Apply the YAML
        apply_cmd = f"oc apply -f {yaml_file_path}"
        result = execute_oc_command(apply_cmd)

        if result.get("status") == "error":
            logger.error(f"Deployment error: {result.get('message')}")
            return jsonify({"status": "error", "message": result.get("message")}), 500

        logger.info("Successfully deployed YAML to OpenShift!")
        return jsonify({"status": "success", "message": "Deployment successful!"})

    except Exception as e:
        logger.error(f"Unexpected error during deployment: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500


@app.route("/api/cluster-data", methods=["GET"])
def fetch_cluster_data():
    """ API to fetch both namespaces and storage classes in a single call """
    logger.info("Fetching all cluster data (namespaces and storage classes)")
    try:
        # Process in parallel - authenticate once at the beginning
        authenticate_to_okd()

        # Get both resources (with caching)
        namespaces_result = get_namespaces(use_cache=True)
        storage_classes_result = get_storage_classes(use_cache=True)

        # Combine the results
        result = {
            "status": "success" if namespaces_result.get("status") == "success" and
                                   storage_classes_result.get("status") == "success"
                      else "partial",
            "namespaces": namespaces_result.get("namespaces", []),
            "storageClasses": storage_classes_result.get("storageClasses", [])
        }

        # Add any error messages
        if namespaces_result.get("status") == "error":
            result["namespacesError"] = namespaces_result.get("message")
        if storage_classes_result.get("status") == "error":
            result["storageClassesError"] = storage_classes_result.get("message")

        # Set cache headers
        response = make_response(jsonify(result))
        response.headers['Cache-Control'] = 'max-age=300'  # Cache for 5 minutes
        return response

    except Exception as e:
        logger.error(f"Unexpected error fetching cluster data: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}",
            "namespaces": [],
            "storageClasses": []
        }), 500


@app.route("/api/namespaces", methods=["GET"])
def fetch_namespaces():
    """ API to fetch non-system namespaces from the OpenShift cluster """
    logger.info("Fetching namespaces from OpenShift cluster")
    try:
        result = get_namespaces()
        if "status" in result and result["status"] == "error":
            logger.error(f"Error fetching namespaces: {result.get('message', 'Unknown error')}")
            return jsonify(result), 500

        # Set cache headers
        response = make_response(jsonify(result))
        response.headers['Cache-Control'] = 'max-age=300'  # Cache for 5 minutes
        return response

    except Exception as e:
        logger.error(f"Unexpected error in fetch_namespaces: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500


@app.route("/api/storage-classes", methods=["GET"])
def fetch_storage_classes():
    """ API to fetch available storage classes from the OpenShift cluster """
    logger.info("Fetching storage classes from OpenShift cluster")
    try:
        result = get_storage_classes()
        if "status" in result and result["status"] == "error":
            logger.error(f"Error fetching storage classes: {result.get('message', 'Unknown error')}")
            return jsonify(result), 500

        # Set cache headers
        response = make_response(jsonify(result))
        response.headers['Cache-Control'] = 'max-age=300'  # Cache for 5 minutes
        return response

    except Exception as e:
        logger.error(f"Unexpected error in fetch_storage_classes: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500


@app.route("/api/authenticate", methods=["GET"])
def check_authentication():
    """ API to test authentication to the OpenShift cluster """
    logger.info("Testing authentication to OpenShift cluster")
    try:
        if check_auth_status():
            # Already authenticated
            return jsonify({"status": "success", "message": "Already authenticated to OpenShift cluster"})
        elif authenticate_to_okd():
            return jsonify({"status": "success", "message": "Successfully authenticated to OpenShift cluster"})
        else:
            return jsonify({"status": "error", "message": "Failed to authenticate to OpenShift cluster"}), 401
    except Exception as e:
        logger.error(f"Unexpected error during authentication: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500


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

    # Try to authenticate at startup
    if authenticate_to_okd():
        logger.info("Successfully authenticated to OpenShift cluster at startup")
    else:
        logger.warning("Failed to authenticate to OpenShift cluster at startup. Will retry when needed.")

    app.run(host="0.0.0.0", port=5000, debug=True)
