# openshift_api.py
import subprocess
from flask import jsonify

def apply_yaml(yaml_content):
    """
    Returns the generated YAML content as a JSON response for display on the web page.
    """
    response = {"status": "success", "yaml": yaml_content}
    return jsonify(response)
