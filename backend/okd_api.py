import json
import logging
import subprocess
import os
import time
import threading
from flask import jsonify

logger = logging.getLogger(__name__)

# Load OpenShift Cluster details from environment variables
OKD_CLUSTER_API = os.getenv("OKD_CLUSTER_API", "https://missing-cluster-api.com")
OKD_SERVICE_ACCOUNT_TOKEN = os.getenv("OKD_SERVICE_ACCOUNT_TOKEN", "missing-cluster-sa-token")

# Global authentication state with thread safety
class OKDSession:
    def __init__(self):
        self.authenticated = False
        self.last_auth_time = 0
        self.auth_lock = threading.Lock()
        self.auth_token_expiry = 3600  # Token valid for 1 hour (in seconds)
        # Cache for API responses to reduce redundant calls
        self.cache = {
            "namespaces": {"data": None, "timestamp": 0, "ttl": 300},  # 5 minutes TTL
            "storage_classes": {"data": None, "timestamp": 0, "ttl": 300}  # 5 minutes TTL
        }

    def get_cached(self, key):
        """Get a cached response if it's valid, otherwise None"""
        cache_entry = self.cache.get(key)
        if not cache_entry:
            return None

        if cache_entry["data"] and (time.time() - cache_entry["timestamp"] < cache_entry["ttl"]):
            logger.debug(f"Using cached data for {key}")
            return cache_entry["data"]

        return None

    def set_cache(self, key, data):
        """Set data in the cache with current timestamp"""
        if key in self.cache:
            self.cache[key]["data"] = data
            self.cache[key]["timestamp"] = time.time()

# Create a global session object
okd_session = OKDSession()

def authenticate_to_okd():
    """
    Authenticate to OpenShift using the service account token.
    Uses a lock to prevent concurrent authentication attempts.
    """
    global okd_session

    # Check if already authenticated and token is still valid
    current_time = time.time()
    if okd_session.authenticated and (current_time - okd_session.last_auth_time < okd_session.auth_token_expiry):
        logger.debug("Using existing OKD authentication")
        return True

    # Use lock to prevent concurrent authentication
    with okd_session.auth_lock:
        # Double-check if another thread already authenticated while waiting for lock
        if okd_session.authenticated and (current_time - okd_session.last_auth_time < okd_session.auth_token_expiry):
            logger.debug("Using existing OKD authentication (after lock)")
            return True

        try:
            # Ensure .kube directory exists
            kube_dir = os.path.expanduser("~/.kube")
            os.makedirs(kube_dir, exist_ok=True)

            # Login with token
            login_cmd = f"oc login --server={OKD_CLUSTER_API} --token={OKD_SERVICE_ACCOUNT_TOKEN} --insecure-skip-tls-verify"
            result = subprocess.run(login_cmd, shell=True, check=True, capture_output=True, text=True)

            # Verify successful login
            if "Logged into" in result.stdout:
                okd_session.authenticated = True
                okd_session.last_auth_time = time.time()
                logger.info(f"Authentication successful: {result.stdout.strip()}")
                return True
            else:
                logger.error(f"Authentication failed: {result.stdout}")
                return False

        except subprocess.CalledProcessError as e:
            logger.error(f"Authentication error: {e.stderr}")
            okd_session.authenticated = False
            return False
        except Exception as e:
            logger.error(f"Unexpected authentication error: {str(e)}", exc_info=True)
            okd_session.authenticated = False
            return False

def check_auth_status():
    """
    Check if currently authenticated to OpenShift.
    Does not attempt to authenticate if not.
    """
    global okd_session
    current_time = time.time()
    return okd_session.authenticated and (current_time - okd_session.last_auth_time < okd_session.auth_token_expiry)

def get_namespaces(use_cache=True):
    """
    Query the OpenShift cluster for all namespaces and filter out system namespaces
    (those starting with 'openshift-' or 'kube-').
    """
    global okd_session

    # Check cache first if enabled
    if use_cache:
        cached_data = okd_session.get_cached("namespaces")
        if cached_data:
            logger.debug("Returning cached namespaces data")
            return cached_data

    try:
        # Authenticate to OpenShift
        if not authenticate_to_okd():
            logger.error("Failed to authenticate to OpenShift cluster")
            return {"status": "error", "message": "Failed to authenticate to OpenShift"}

        # Get all namespaces
        cmd = "oc get namespaces -o json"
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)

        # Parse the JSON output
        namespaces_data = json.loads(result.stdout)

        # Filter out system namespaces
        user_namespaces = []
        for namespace in namespaces_data.get("items", []):
            name = namespace["metadata"]["name"]
            if not (name.startswith("openshift-") or name.startswith("kube-")):
                user_namespaces.append({
                    "name": name,
                    "status": namespace["status"]["phase"],
                    "created": namespace["metadata"]["creationTimestamp"]
                })

        logger.info(f"Successfully fetched {len(user_namespaces)} user namespaces")

        # Cache the result
        response_data = {"status": "success", "namespaces": user_namespaces}
        okd_session.set_cache("namespaces", response_data)

        return response_data

    except subprocess.CalledProcessError as e:
        logger.error(f"Error fetching namespaces: {e.stderr}")
        return {"status": "error", "message": f"Failed to fetch namespaces: {e.stderr}"}
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON from oc command: {e}")
        return {"status": "error", "message": f"Failed to parse namespace data: {e}"}
    except Exception as e:
        logger.error(f"Unexpected error fetching namespaces: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"Unexpected error: {str(e)}"}

def get_storage_classes(use_cache=True):
    """
    Query the OpenShift cluster for all available storage classes.
    """
    global okd_session

    # Check cache first if enabled
    if use_cache:
        cached_data = okd_session.get_cached("storage_classes")
        if cached_data:
            logger.debug("Returning cached storage classes data")
            return cached_data

    try:
        # Authenticate to OpenShift
        if not authenticate_to_okd():
            logger.error("Failed to authenticate to OpenShift cluster")
            return {"status": "error", "message": "Failed to authenticate to OpenShift"}

        # Get all storage classes
        cmd = "oc get storageclass -o json"
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)

        # Parse the JSON output
        storage_classes_data = json.loads(result.stdout)

        # Extract storage class names and details
        storage_classes = []
        for sc in storage_classes_data.get("items", []):
            storage_classes.append({
                "name": sc["metadata"]["name"],
                "provisioner": sc["provisioner"],
                "isDefault": "annotations" in sc["metadata"] and
                              "storageclass.kubernetes.io/is-default-class" in sc["metadata"]["annotations"]
            })

        logger.info(f"Successfully fetched {len(storage_classes)} storage classes")

        # Cache the result
        response_data = {"status": "success", "storageClasses": storage_classes}
        okd_session.set_cache("storage_classes", response_data)

        return response_data

    except subprocess.CalledProcessError as e:
        logger.error(f"Error fetching storage classes: {e.stderr}")
        return {"status": "error", "message": f"Failed to fetch storage classes: {e.stderr}"}
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON from oc command: {e}")
        return {"status": "error", "message": f"Failed to parse storage class data: {e}"}
    except Exception as e:
        logger.error(f"Unexpected error fetching storage classes: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"Unexpected error: {str(e)}"}

def execute_oc_command(command):
    """
    Execute an OpenShift CLI command and return the results.
    Ensures authentication before running the command.
    """
    try:
        # Authenticate to OpenShift
        if not authenticate_to_okd():
            logger.error("Failed to authenticate to OpenShift cluster")
            return {"status": "error", "message": "Failed to authenticate to OpenShift"}

        # Execute the command
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return {"status": "success", "output": result.stdout}

    except subprocess.CalledProcessError as e:
        logger.error(f"Error executing command '{command}': {e.stderr}")
        return {"status": "error", "message": f"Command failed: {e.stderr}"}
    except Exception as e:
        logger.error(f"Unexpected error executing command '{command}': {str(e)}", exc_info=True)
        return {"status": "error", "message": f"Unexpected error: {str(e)}"}
