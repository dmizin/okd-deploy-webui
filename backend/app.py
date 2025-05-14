import sys
import os
import json
import logging
import subprocess
import jwt
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, make_response, abort

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
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
API_IDENTIFIER = os.getenv("API_IDENTIFIER", "")
AUTH0_NAMESPACE = os.getenv("AUTH0_NAMESPACE", "")
ADMIN_ROLE_NAME = os.getenv("ADMIN_ROLE_NAME", "")

# JWT auth validation
def get_token_auth_header():
    """Get the access token from the header"""
    auth = request.headers.get("Authorization", None)
    if not auth:
        logger.warning("Authorization header is missing")
        return None

    parts = auth.split()
    if parts[0].lower() != "bearer":
        logger.warning("Authorization header must start with Bearer")
        return None
    elif len(parts) == 1:
        logger.warning("Token not found")
        return None
    elif len(parts) > 2:
        logger.warning("Authorization header must be Bearer token")
        return None

    token = parts[1]
    return token

def requires_auth(f):
    """Determines if the access token is valid"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_auth_header()
        if not token:
            logger.warning("No auth token provided")
            return jsonify({"status": "error", "message": "Authentication required"}), 401

        try:
            # This is a lightweight verification that the token is well-formed
            # For production, you should verify the token with Auth0
            jwt_payload = jwt.decode(token, options={"verify_signature": False})
            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return jsonify({"status": "error", "message": "Token is expired"}), 401
        except jwt.InvalidTokenError:
            logger.warning("Invalid token")
            return jsonify({"status": "error", "message": "Invalid token"}), 401

    return decorated

def requires_admin(f):
    """Determines if the user has admin role"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_auth_header()
        if not token:
            logger.warning("No auth token provided")
            return jsonify({"status": "error", "message": "Authentication required"}), 401

        try:
            # This is a lightweight verification that the token contains the admin role
            # For production, you should verify the token with Auth0
            jwt_payload = jwt.decode(token, options={"verify_signature": False})

            # Check if user has admin role in either format
            namespace = AUTH0_NAMESPACE
            namespace_roles = f"{namespace}_roles"

            # Try both formats: plain namespace and namespace_roles
            roles = jwt_payload.get(namespace, []) or jwt_payload.get(namespace_roles, [])
            if not isinstance(roles, list):
                roles = []

            logger.info(f"User roles: {roles}, Admin role: {ADMIN_ROLE_NAME}")
            logger.info(f"Checking for roles in: {namespace} or {namespace_roles}")

            if ADMIN_ROLE_NAME not in roles:
                logger.warning(f"User does not have admin role ({ADMIN_ROLE_NAME})")
                return jsonify({
                    "status": "error",
                    "message": f"Access denied. Admin privileges required ({ADMIN_ROLE_NAME})."
                }), 403

            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return jsonify({"status": "error", "message": "Token is expired"}), 401
        except jwt.InvalidTokenError:
            logger.warning("Invalid token")
            return jsonify({"status": "error", "message": "Invalid token"}), 401
        except Exception as e:
            logger.error(f"Error in admin role check: {str(e)}", exc_info=True)
            return jsonify({"status": "error", "message": f"Authentication error: {str(e)}"}), 500

    return decorated


@app.route("/")
def serve_frontend():
    """ Serve the React frontend. """
    logger.info("Serving frontend index.html")
    return send_from_directory(app.static_folder, "index.html")


# Update to the generate-yaml API endpoint in app.py
@app.route("/generate-yaml", methods=["POST"])
@requires_auth
@requires_admin
def generate_yaml_api():
    """ API to generate YAML from frontend input """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        logger.info(f"Generating YAML for request with namespace '{data.get('namespace')}'")

        # Extract and validate critical fields
        namespace = data.get("namespace")
        if not namespace:
            return jsonify({"status": "error", "message": "Namespace is required"}), 400

        # Log if this is a new namespace creation with requester info
        create_new = data.get("createNewNamespace", False)
        requester = data.get("requesterNickname", "")
        if create_new:
            logger.info(f"Creating new namespace '{namespace}' with requester '{requester}'")
        else:
            logger.info(f"Using existing namespace '{namespace}'")

        yaml_output = generate_yaml(data)
        return jsonify({"status": "success", "yaml": yaml_output})

    except Exception as e:
        logger.error(f"Error generating YAML: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


# Update to the deploy-to-okd API endpoint in app.py
@app.route("/deploy-to-okd", methods=["POST"])
@requires_auth
@requires_admin
def deploy_to_okd():
    """ API to deploy YAML to OpenShift """
    try:
        data = request.get_json()
        logger.info(f"Received OpenShift deployment request for namespace '{data.get('namespace')}'")

        # Log if this is a new namespace creation with requester info
        namespace = data.get("namespace")
        create_new = data.get("createNewNamespace", False)
        requester = data.get("requesterNickname", "")

        if create_new:
            logger.info(f"Creating new namespace '{namespace}' with requester '{requester}'")
        else:
            logger.info(f"Using existing namespace '{namespace}'")

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
@requires_auth
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
@requires_auth
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
@requires_auth
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
@requires_auth
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


@app.route("/api/check-admin", methods=["GET"])
@requires_auth
@requires_admin
def check_admin_access():
    """ API to check if the current user has admin access """
    return jsonify({
        "status": "success",
        "message": "You have admin access",
        "role": ADMIN_ROLE_NAME
    })


@app.route("/api/debug-token", methods=["GET"])
@requires_auth
def debug_token():
    """ Debug endpoint to check JWT token claims """
    token = get_token_auth_header()
    if not token:
        return jsonify({"status": "error", "message": "No token provided"}), 400

    try:
        # Decode the token without verification
        payload = jwt.decode(token, options={"verify_signature": False})

        # Extract roles information for debugging
        namespace = AUTH0_NAMESPACE
        namespace_roles = f"{namespace}_roles"

        roles_plain = payload.get(namespace, [])
        roles_with_suffix = payload.get(namespace_roles, [])

        debug_info = {
            "status": "success",
            "admin_role_name": ADMIN_ROLE_NAME,
            "namespace": namespace,
            "namespace_roles": namespace_roles,
            "roles_plain_namespace": roles_plain,
            "roles_with_suffix": roles_with_suffix,
            "is_admin": ADMIN_ROLE_NAME in (roles_plain or roles_with_suffix),
            "payload": {k: v for k, v in payload.items() if k not in ["aud", "iss"]}  # Filter out some standard claims
        }

        return jsonify(debug_info)
    except Exception as e:
        logger.error(f"Error decoding token: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Token decode error: {str(e)}"}), 500


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
    logger.info(f"Admin role configured as: '{ADMIN_ROLE_NAME}'")

    if not AUTH0_DOMAIN or not API_IDENTIFIER or not AUTH0_NAMESPACE:
        logger.warning("Auth0 configuration missing. Authentication may not work properly.")

    # Try to authenticate at startup
    if authenticate_to_okd():
        logger.info("Successfully authenticated to OpenShift cluster at startup")
    else:
        logger.warning("Failed to authenticate to OpenShift cluster at startup. Will retry when needed.")

    app.run(host="0.0.0.0", port=5000, debug=True)
