import yaml
import base64
import logging
import re

logger = logging.getLogger(__name__)

# RFC 1123 subdomain regex pattern for validation
RFC1123_PATTERN = r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$'

def validate_resource_name(name):
    """Validate if a resource name conforms to RFC 1123 subdomain pattern."""
    if not name:
        return False

    return bool(re.match(RFC1123_PATTERN, name))

# Custom YAML representer to use the pipe character for multiline strings
def represent_multiline_str(dumper, data):
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)

# Register our custom representer
yaml.add_representer(str, represent_multiline_str)

def generate_yaml(data):
    """Generate YAML manifests for OpenShift deployment."""
    namespace = data["namespace"]

    # Validate namespace name
    if not validate_resource_name(namespace):
        raise ValueError(f"Invalid namespace name '{namespace}'. Must match RFC 1123 pattern: lowercase alphanumeric characters, '-' or '.', must start and end with alphanumeric.")

    container_image = data["containerImage"]
    cpu_request = data["cpuRequest"]
    memory_request = data["memoryRequest"]
    container_port = int(data["containerPort"])  # Ensure int format
    expose_route = data["exposeRoute"]

    route_port = int(data["routePort"]) if expose_route else None
    route_hostname = data["routeHostname"] if expose_route else None  # Full hostname

    # Validate route hostname if provided
    if route_hostname and not validate_resource_name(route_hostname):
        raise ValueError(f"Invalid route hostname '{route_hostname}'. Must match RFC 1123 pattern.")

    storage_required = data["storageRequired"]
    storage_details = data["storageDetails"] if storage_required else []

    secrets_required = data.get("secretsRequired", False)
    secrets_details = data.get("secretsDetails", []) if secrets_required else []

    configmaps_required = data.get("configmapsRequired", False)
    configmaps_details = data.get("configmapsDetails", []) if configmaps_required else []

    # Check if it's a new namespace
    create_namespace = data.get("createNewNamespace", False)
    requester_nickname = data.get("requesterNickname", "")

    # Namespace YAML (only if creating a new namespace)
    namespace_yaml = None
    if create_namespace:
        namespace_yaml = {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": namespace,
                "annotations": {
                    "openshift.io/requester": requester_nickname
                }
            }
        }

    # Deployment YAML
    deployment_name = f"{namespace}-deployment"
    # Validate deployment name
    if not validate_resource_name(deployment_name):
        raise ValueError(f"Invalid deployment name '{deployment_name}'. Must match RFC 1123 pattern.")

    deployment_yaml = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": deployment_name, "namespace": namespace},
        "spec": {
            "replicas": 1,
            "selector": {"matchLabels": {"app": namespace}},
            "template": {
                "metadata": {"labels": {"app": namespace}},
                "spec": {
                    "containers": [
                        {
                            "name": namespace,
                            "image": container_image,
                            "resources": {
                                "requests": {"cpu": cpu_request, "memory": memory_request}
                            },
                            "ports": [{"containerPort": container_port}],  # Ensure integer
                            "volumeMounts": [],
                            "env": []
                        }
                    ],
                    "volumes": []
                }
            }
        }
    }

    # Storage Configuration (if enabled)
    persistent_volumes_yaml = []
    if storage_required:
        for storage in storage_details:
            volume_name = storage["name"]

            # Validate volume name
            if not validate_resource_name(volume_name):
                raise ValueError(f"Invalid volume name '{volume_name}'. Must match RFC 1123 pattern.")

            mount_path = storage["mountPath"]
            volume_size = f"{storage['size']}Gi"
            storage_class = storage["storageClass"]

            # PVC YAML
            pvc_yaml = {
                "apiVersion": "v1",
                "kind": "PersistentVolumeClaim",
                "metadata": {"name": volume_name, "namespace": namespace},
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {"requests": {"storage": volume_size}},
                    "storageClassName": storage_class
                }
            }
            persistent_volumes_yaml.append(pvc_yaml)

            # Add volume mount in Deployment
            deployment_yaml["spec"]["template"]["spec"]["containers"][0]["volumeMounts"].append({
                "name": volume_name,
                "mountPath": mount_path
            })
            deployment_yaml["spec"]["template"]["spec"]["volumes"].append({
                "name": volume_name,
                "persistentVolumeClaim": {"claimName": volume_name}
            })

    # ConfigMaps Configuration (if enabled)
    configmaps_yaml = []
    if configmaps_required:
        # Group configmap items by their name to create proper configmap objects
        configmap_groups = {}
        for configmap_detail in configmaps_details:
            configmap_name = configmap_detail["name"]

            # Validate configmap name
            if not validate_resource_name(configmap_name):
                raise ValueError(f"Invalid configmap name '{configmap_name}'. Must match RFC 1123 pattern.")

            if configmap_name not in configmap_groups:
                configmap_groups[configmap_name] = []
            configmap_groups[configmap_name].append(configmap_detail)

        # Create configmap objects for each group
        for configmap_name, configmap_items in configmap_groups.items():
            # Create the configmap data
            configmap_data = {}
            for item in configmap_items:
                key = item["key"]
                value = item["value"]

                # The registered custom representer will handle multiline strings properly
                configmap_data[key] = value

            # Create the configmap YAML
            configmap_yaml = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": configmap_name, "namespace": namespace},
                "data": configmap_data
            }
            configmaps_yaml.append(configmap_yaml)

            # Add references to deployment
            for item in configmap_items:
                if item["mountType"] == "env":
                    # Environment variable mount
                    env_name = item.get("envName", item["key"])  # Use key name if envName not provided
                    deployment_yaml["spec"]["template"]["spec"]["containers"][0]["env"].append({
                        "name": env_name,
                        "valueFrom": {
                            "configMapKeyRef": {
                                "name": configmap_name,
                                "key": item["key"]
                            }
                        }
                    })
                else:  # Volume mount
                    # Check if volume already exists
                    volume_exists = False
                    for volume in deployment_yaml["spec"]["template"]["spec"]["volumes"]:
                        if volume.get("name") == configmap_name:
                            volume_exists = True
                            break

                    # Add volume if it doesn't exist
                    if not volume_exists:
                        deployment_yaml["spec"]["template"]["spec"]["volumes"].append({
                            "name": configmap_name,
                            "configMap": {
                                "name": configmap_name
                            }
                        })

                    # Add volume mount
                    deployment_yaml["spec"]["template"]["spec"]["containers"][0]["volumeMounts"].append({
                        "name": configmap_name,
                        "mountPath": item["mountPath"],
                        "subPath": item["key"]
                    })

    # Secrets Configuration (if enabled)
    secrets_yaml = []
    if secrets_required:
        # Group secrets by their name to create proper secret objects
        secret_groups = {}
        for secret_detail in secrets_details:
            secret_name = secret_detail["name"]

            # Validate secret name
            if not validate_resource_name(secret_name):
                raise ValueError(f"Invalid secret name '{secret_name}'. Must match RFC 1123 pattern.")

            if secret_name not in secret_groups:
                secret_groups[secret_name] = []
            secret_groups[secret_name].append(secret_detail)

        # Create secret objects for each group
        for secret_name, secret_items in secret_groups.items():
            # Create the secret data
            secret_data = {}
            for item in secret_items:
                # Base64 encode the value
                secret_data[item["key"]] = base64.b64encode(item["value"].encode()).decode()

            # Create the secret YAML
            secret_yaml = {
                "apiVersion": "v1",
                "kind": "Secret",
                "metadata": {"name": secret_name, "namespace": namespace},
                "type": "Opaque",
                "data": secret_data
            }
            secrets_yaml.append(secret_yaml)

            # Add references to deployment
            for item in secret_items:
                if item["mountType"] == "env":
                    # Environment variable mount
                    env_name = item.get("envName", item["key"])  # Use key name if envName not provided
                    deployment_yaml["spec"]["template"]["spec"]["containers"][0]["env"].append({
                        "name": env_name,
                        "valueFrom": {
                            "secretKeyRef": {
                                "name": secret_name,
                                "key": item["key"]
                            }
                        }
                    })
                else:  # Volume mount
                    # Check if volume already exists
                    volume_exists = False
                    for volume in deployment_yaml["spec"]["template"]["spec"]["volumes"]:
                        if volume.get("name") == secret_name:
                            volume_exists = True
                            break

                    # Add volume if it doesn't exist
                    if not volume_exists:
                        deployment_yaml["spec"]["template"]["spec"]["volumes"].append({
                            "name": secret_name,
                            "secret": {
                                "secretName": secret_name
                            }
                        })

                    # Add volume mount
                    deployment_yaml["spec"]["template"]["spec"]["containers"][0]["volumeMounts"].append({
                        "name": secret_name,
                        "mountPath": item["mountPath"],
                        "subPath": item["key"]
                    })

    # Service YAML
    service_name = f"{namespace}-service"

    # Validate service name
    if not validate_resource_name(service_name):
        raise ValueError(f"Invalid service name '{service_name}'. Must match RFC 1123 pattern.")

    service_yaml = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": service_name, "namespace": namespace},
        "spec": {
            "selector": {"app": namespace},
            "ports": [{"protocol": "TCP", "port": container_port, "targetPort": container_port}]
        }
    }

    # Route YAML (if requested)
    route_yaml = None
    if expose_route and route_hostname:
        route_name = f"{namespace}-route"

        # Validate route name
        if not validate_resource_name(route_name):
            raise ValueError(f"Invalid route name '{route_name}'. Must match RFC 1123 pattern.")

        route_yaml = {
            "apiVersion": "route.openshift.io/v1",
            "kind": "Route",
            "metadata": {"name": route_name, "namespace": namespace},
            "spec": {
                "to": {"kind": "Service", "name": service_name},
                "port": {"targetPort": container_port},  # Uses the correct service port
                "host": route_hostname,  # Use full hostname from frontend
                "tls": {"termination": "edge"} if route_port == 443 else None
            }
        }

    # Compile YAML Output
    yaml_documents = []

    # Only add namespace YAML if creating a new namespace
    if namespace_yaml:
        yaml_documents.append(yaml.dump(namespace_yaml))

    yaml_documents.extend([
        yaml.dump(deployment_yaml),
        yaml.dump(service_yaml)
    ])

    if persistent_volumes_yaml:
        yaml_documents.extend([yaml.dump(pvc) for pvc in persistent_volumes_yaml])
    if configmaps_yaml:
        yaml_documents.extend([yaml.dump(configmap) for configmap in configmaps_yaml])
    if secrets_yaml:
        yaml_documents.extend([yaml.dump(secret) for secret in secrets_yaml])
    if route_yaml:
        yaml_documents.append(yaml.dump(route_yaml))

    return "\n---\n".join(yaml_documents)
