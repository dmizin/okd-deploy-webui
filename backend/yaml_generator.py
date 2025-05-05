import yaml
import logging

logger = logging.getLogger(__name__)

def generate_yaml(data):
    """Generate YAML manifests for OpenShift deployment."""
    namespace = data["namespace"]
    container_image = data["containerImage"]
    cpu_request = data["cpuRequest"]
    memory_request = data["memoryRequest"]
    container_port = int(data["containerPort"])  # Ensure int format
    expose_route = data["exposeRoute"]

    route_port = int(data["routePort"]) if expose_route else None
    route_hostname = data["routeHostname"] if expose_route else None  # Full hostname

    storage_required = data["storageRequired"]
    storage_details = data["storageDetails"]

    # Namespace YAML
    namespace_yaml = {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {"name": namespace}
    }

    # Deployment YAML
    deployment_yaml = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": f"{namespace}-deployment", "namespace": namespace},
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
                            "volumeMounts": []
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

    # Service YAML
    service_yaml = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": f"{namespace}-service", "namespace": namespace},
        "spec": {
            "selector": {"app": namespace},
            "ports": [{"protocol": "TCP", "port": container_port, "targetPort": container_port}]
        }
    }

    # Route YAML (if requested)
    route_yaml = None
    if expose_route and route_hostname:
        route_yaml = {
            "apiVersion": "route.openshift.io/v1",
            "kind": "Route",
            "metadata": {"name": f"{namespace}-route", "namespace": namespace},
            "spec": {
                "to": {"kind": "Service", "name": f"{namespace}-service"},
                "port": {"targetPort": container_port},  # Uses the correct service port
                "host": route_hostname,  # Use full hostname from frontend
                "tls": {"termination": "edge"} if route_port == 443 else None
            }
        }

    # Compile YAML Output
    yaml_documents = [yaml.dump(namespace_yaml), yaml.dump(deployment_yaml), yaml.dump(service_yaml)]
    if persistent_volumes_yaml:
        yaml_documents.extend([yaml.dump(pvc) for pvc in persistent_volumes_yaml])
    if route_yaml:
        yaml_documents.append(yaml.dump(route_yaml))

    return "\n---\n".join(yaml_documents)
