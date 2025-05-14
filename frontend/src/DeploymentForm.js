import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApiClient } from "./apiClient";
import { useAuth } from "./AuthProvider";
import {
  FormField,
  TextareaField,
  SelectField,
  ValidationSummary,
  ResourceNameTip,
  ValidatedNameInput
} from "./FormComponents";

// RFC 1123 subdomain validation pattern
const RFC1123_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

// Function to validate resource names according to RFC 1123
const validateResourceName = (name) => {
  if (!name) return false;
  return RFC1123_PATTERN.test(name);
};

const cpuOptions = [
  { value: "250m", label: "250m" },
  { value: "500m", label: "500m" },
  { value: "750m", label: "750m" },
  { value: "1", label: "1" }
];

const memoryOptions = [
  { value: "256Mi", label: "256Mi" },
  { value: "512Mi", label: "512Mi" },
  { value: "1Gi", label: "1Gi" },
  { value: "2Gi", label: "2Gi" }
];

// Get route domains from environment variables
const getRouteDomains = () => {
  const defaultDomains = ["route_domains_not_found_in_env_var"];
  if (!window._env_ || !window._env_.REACT_APP_ROUTE_DOMAINS) {
    console.warn("Route domains not found in environment variables. Using defaults.");
    return defaultDomains;
  }

  // Split the comma-separated string into an array
  return window._env_.REACT_APP_ROUTE_DOMAINS.split(',').map(domain => domain.trim());
};

// Create domain options array for select
const getDomainOptions = () => {
  return getRouteDomains().map(domain => ({
    value: domain,
    label: domain
  }));
};

// Default fallback storage classes in case the API fails
const fallbackStorageClasses = [
  { name: "cs_not_pulled_from_cluster_refresh", isDefault: true }
];

const DeploymentForm = () => {
  const apiClient = useApiClient();
  const { isAuthenticated, user } = useAuth();

  // Use a ref to track initialization state to prevent double fetching
  const initialized = useRef(false);
  const [adminAccessChecked, setAdminAccessChecked] = useState(false);

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Form field states
  const [namespace, setNamespace] = useState("");
  const [namespaceError, setNamespaceError] = useState("");
  const [containerImage, setContainerImage] = useState("");
  const [cpuRequest, setCpuRequest] = useState(cpuOptions[0].value);
  const [memoryRequest, setMemoryRequest] = useState(memoryOptions[0].value);
  const [containerPort, setContainerPort] = useState(80);
  const [exposeRoute, setExposeRoute] = useState(false);
  const [routePort, setRoutePort] = useState(80);
  const [routeHostname, setRouteHostname] = useState("");
  const [routeHostnameError, setRouteHostnameError] = useState("");
  const [routeDomain, setRouteDomain] = useState(getRouteDomains()[0]);

  // Resource configuration states
  const [storageRequired, setStorageRequired] = useState(false);
  const [storageDetails, setStorageDetails] = useState([]);
  const [secretsRequired, setSecretsRequired] = useState(false);
  const [secretsDetails, setSecretsDetails] = useState([]);
  const [configmapsRequired, setConfigmapsRequired] = useState(false);
  const [configmapsDetails, setConfigmapsDetails] = useState([]);
  const [generatedYaml, setGeneratedYaml] = useState(""); // Store YAML response

  // State for cluster data
  const [namespaces, setNamespaces] = useState([]);
  const [storageClasses, setStorageClasses] = useState([]);
  const [createNewNamespace, setCreateNewNamespace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clusterConnected, setClusterConnected] = useState(false);

  // State to keep track of available secret and configmap names
  const [secretNames, setSecretNames] = useState([]);
  const [configmapNames, setConfigmapNames] = useState([]);

  // Create namespace options for select
  const namespaceOptions = namespaces.map(ns => ({
    value: ns.name,
    label: ns.name
  }));

  // Create storage class options for select
  const storageClassOptions = storageClasses.map(sc => ({
    value: sc.name,
    label: `${sc.name} ${sc.isDefault ? "(Default)" : ""}`
  }));

  // Validate namespace name only when field loses focus or form is submitted
  const validateNamespace = (isValid, name) => {
    if (!isValid) {
      setNamespaceError("Invalid namespace name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.");
      setValidationErrors(prev => ({
        ...prev,
        namespace: "Invalid namespace name"
      }));
    } else {
      setNamespaceError("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.namespace;
        return newErrors;
      });
    }
  };

  // Validate hostname only when field loses focus or form is submitted
  const validateRouteHostname = (isValid, hostname) => {
    if (!isValid) {
      setRouteHostnameError("Invalid hostname. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.");
      setValidationErrors(prev => ({
        ...prev,
        routeHostname: "Invalid hostname"
      }));
    } else {
      setRouteHostnameError("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.routeHostname;
        return newErrors;
      });
    }
  };

  // Memoize the fetch function to avoid recreation on each render
  const fetchClusterData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    console.log("Fetching cluster data...");
    setLoading(true);
    setError(null);

    try {
      // Get all cluster data in a single call
      const response = await apiClient.getClusterData();

      if (response.data) {
        // Update namespace data
        if (response.data.namespaces && Array.isArray(response.data.namespaces)) {
          setNamespaces(response.data.namespaces);
        }

        // Update storage classes
        if (response.data.storageClasses && Array.isArray(response.data.storageClasses)) {
          setStorageClasses(response.data.storageClasses);
        } else if (!storageClasses.length) {
          // Use fallback if no storage classes returned
          setStorageClasses(fallbackStorageClasses);
        }

        // Set connection status
        setClusterConnected(response.data.status !== "error");

        // Set error message if any
        if (response.data.status === "error" || response.data.status === "partial") {
          const errorMessages = [];
          if (response.data.namespacesError) errorMessages.push(`Namespaces: ${response.data.namespacesError}`);
          if (response.data.storageClassesError) errorMessages.push(`Storage Classes: ${response.data.storageClassesError}`);
          if (response.data.message) errorMessages.push(response.data.message);

          if (errorMessages.length > 0) {
            setError(errorMessages.join(', '));
          }
        }
      }
    } catch (err) {
      console.error("Error fetching cluster data:", err);
      setError(`Failed to connect to the cluster: ${err.message}`);

      // Use fallback storage classes if needed
      if (!storageClasses.length) {
        setStorageClasses(fallbackStorageClasses);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, apiClient, storageClasses.length]);

  // Initial authentication and data fetch
  useEffect(() => {
    if (isAuthenticated && !initialized.current) {
      initialized.current = true;
      console.log("Initial cluster data fetch");

      // Initialize with valid names that don't contain dashes to avoid validation issues
      setSecretNames(["appsecret"]);
      setConfigmapNames(["appconfig"]);

      // Check admin access first
      apiClient.checkAdminAccess()
        .then(response => {
          setAdminAccessChecked(true);
          if (response.data?.status === "success") {
            console.log("Admin access verified");
            fetchClusterData();
          } else {
            console.error("Admin access denied:", response.data?.message);
            setError("Admin access denied: " + (response.data?.message || "Insufficient permissions"));
            setLoading(false);
          }
        })
        .catch(err => {
          console.error("Error checking admin access:", err);
          setAdminAccessChecked(true);
          setError("Error checking admin permissions: " + err.message);
          setLoading(false);
        });
    }
  }, [isAuthenticated, fetchClusterData, apiClient]);

  // Function to validate a storage volume name
  const validateStorageName = (isValid, name, index) => {
    const updatedStorage = [...storageDetails];

    if (!isValid) {
      updatedStorage[index].nameError = "Invalid volume name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.";
      setValidationErrors(prev => ({
        ...prev,
        [`storage-${index}`]: `Volume: Invalid name format`
      }));
    } else {
      updatedStorage[index].nameError = "";
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`storage-${index}`];
        return newErrors;
      });
    }

    setStorageDetails(updatedStorage);
  };

  // Function to add a new storage volume
  const addStorage = () => {
    // Use the first storage class from the cluster if available
    const defaultStorageClass = storageClasses.length > 0 ?
      storageClasses.find(sc => sc.isDefault)?.name || storageClasses[0].name :
      "";

    setStorageDetails([...storageDetails, {
      name: "",
      mountPath: "",
      size: "",
      storageClass: defaultStorageClass,
      nameError: ""
    }]);
  };

  // Function to remove a storage volume
  const removeStorage = (index) => {
    const updatedStorage = [...storageDetails];
    const removed = updatedStorage.splice(index, 1)[0];

    // Remove from validation errors if present
    if (removed.nameError) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`storage-${index}`];
        return newErrors;
      });
    }

    setStorageDetails(updatedStorage);
  };

  const handleStorageChange = (index, field, value) => {
    const updatedStorage = [...storageDetails];
    updatedStorage[index][field] = value;
    setStorageDetails(updatedStorage);
  };

  // Function to validate a secret name
  const validateSecretName = (isValid, name, secretIndex) => {
    const updatedSecrets = [...secretsDetails];

    if (!isValid) {
      updatedSecrets[secretIndex].nameError = "Invalid secret name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.";
      setValidationErrors(prev => ({
        ...prev,
        [`secret-${secretIndex}`]: `Secret: Invalid name format`
      }));
    } else {
      updatedSecrets[secretIndex].nameError = "";
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`secret-${secretIndex}`];
        return newErrors;
      });
    }

    setSecretsDetails(updatedSecrets);
  };

  // Function to add a new secret
  const addSecret = () => {
    setSecretsDetails([...secretsDetails, {
      name: secretNames.length > 0 ? secretNames[0] : "",
      key: "",
      value: "",
      mountType: "env",
      nameError: ""
    }]);
  };

  // Function to add a new secret name
  const addSecretName = () => {
    const newSecretName = `secret${secretNames.length + 1}`; // No dash
    setSecretNames([...secretNames, newSecretName]);

    // Create a new secret entry with this name
    setSecretsDetails([...secretsDetails, {
      name: newSecretName,
      key: "",
      value: "",
      mountType: "env",
      nameError: ""
    }]);

    return newSecretName;
  };

  // Function to rename a secret
  const renameSecret = (oldName, newName) => {
    if (newName.trim() === "") return;

    // Update without validating - will validate on blur instead
    // Update the name in the secretNames array
    const updatedNames = secretNames.map(name =>
      name === oldName ? newName : name
    );
    setSecretNames(updatedNames);

    // Update all secret details that use this name
    const updatedSecrets = secretsDetails.map(secret => {
      if (secret.name === oldName) {
        return { ...secret, name: newName };
      }
      return secret;
    });

    setSecretsDetails(updatedSecrets);
  };

  // Function to validate secret name on blur
  const validateSecretRename = (oldName, newName) => {
    if (!validateResourceName(newName)) {
      // Find and update all secrets with this name to show the error
      const updatedSecrets = secretsDetails.map(secret => {
        if (secret.name === oldName) {
          return {
            ...secret,
            nameError: "Invalid secret name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character."
          };
        }
        return secret;
      });

      // Update validation errors
      setValidationErrors(prev => ({
        ...prev,
        [`secret-${oldName}`]: `Secret '${oldName}': Invalid name format`
      }));

      setSecretsDetails(updatedSecrets);
      return false;
    }

    return true;
  };

  // Function to remove a secret
  const removeSecret = (index) => {
    const updatedSecrets = [...secretsDetails];
    const removed = updatedSecrets.splice(index, 1)[0];

    // Remove from validation errors if present
    if (removed.nameError) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`secret-${index}`];
        return newErrors;
      });
    }

    setSecretsDetails(updatedSecrets);
  };

  const handleSecretChange = (index, field, value) => {
    const updatedSecrets = [...secretsDetails];

    // If the field is "name" and the value is "add-new-secret", create a new secret name
    if (field === "name" && value === "add-new-secret") {
      value = addSecretName();
    }

    updatedSecrets[index][field] = value;
    setSecretsDetails(updatedSecrets);
  };

  // Function to validate a configmap name
  const validateConfigmapName = (isValid, name, configmapIndex) => {
    const updatedConfigmaps = [...configmapsDetails];

    if (!isValid) {
      updatedConfigmaps[configmapIndex].nameError = "Invalid ConfigMap name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character.";
      setValidationErrors(prev => ({
        ...prev,
        [`configmap-${configmapIndex}`]: `ConfigMap: Invalid name format`
      }));
    } else {
      updatedConfigmaps[configmapIndex].nameError = "";
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`configmap-${configmapIndex}`];
        return newErrors;
      });
    }

    setConfigmapsDetails(updatedConfigmaps);
  };

  // Function to add a new configmap
  const addConfigmap = () => {
    setConfigmapsDetails([...configmapsDetails, {
      name: configmapNames.length > 0 ? configmapNames[0] : "",
      key: "",
      value: "",
      mountType: "env",
      nameError: ""
    }]);
  };

  // Function to add a new configmap name
  const addConfigmapName = () => {
    const newConfigmapName = `config${configmapNames.length + 1}`; // No dash
    setConfigmapNames([...configmapNames, newConfigmapName]);

    // Create a new configmap entry with this name
    setConfigmapsDetails([...configmapsDetails, {
      name: newConfigmapName,
      key: "",
      value: "",
      mountType: "env",
      nameError: ""
    }]);

    return newConfigmapName;
  };

  // Function to rename a configmap
  const renameConfigmap = (oldName, newName) => {
    if (newName.trim() === "") return;

    // Update without validating - will validate on blur instead
    // Update the name in the configmapNames array
    const updatedNames = configmapNames.map(name =>
      name === oldName ? newName : name
    );
    setConfigmapNames(updatedNames);

    // Update all configmap details that use this name
    const updatedConfigmaps = configmapsDetails.map(configmap => {
      if (configmap.name === oldName) {
        return { ...configmap, name: newName };
      }
      return configmap;
    });

    setConfigmapsDetails(updatedConfigmaps);
  };

  // Function to validate configmap name on blur
  const validateConfigmapRename = (oldName, newName) => {
    if (!validateResourceName(newName)) {
      // Find and update all configmaps with this name to show the error
      const updatedConfigmaps = configmapsDetails.map(configmap => {
        if (configmap.name === oldName) {
          return {
            ...configmap,
            nameError: "Invalid ConfigMap name. Must be lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character."
          };
        }
        return configmap;
      });

      // Update validation errors
      setValidationErrors(prev => ({
        ...prev,
        [`configmap-${oldName}`]: `ConfigMap '${oldName}': Invalid name format`
      }));

      setConfigmapsDetails(updatedConfigmaps);
      return false;
    }

    return true;
  };

  // Function to remove a configmap
  const removeConfigmap = (index) => {
    const updatedConfigmaps = [...configmapsDetails];
    const removed = updatedConfigmaps.splice(index, 1)[0];

    // Remove from validation errors if present
    if (removed.nameError) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`configmap-${index}`];
        return newErrors;
      });
    }

    setConfigmapsDetails(updatedConfigmaps);
  };

  const handleConfigmapChange = (index, field, value) => {
    const updatedConfigmaps = [...configmapsDetails];

    // If the field is "name" and the value is "add-new-configmap", create a new configmap name
    if (field === "name" && value === "add-new-configmap") {
      value = addConfigmapName();
    }

    updatedConfigmaps[index][field] = value;
    setConfigmapsDetails(updatedConfigmaps);
  };

  // Function to handle namespace selection or creation
  const handleNamespaceChange = (value) => {
    if (value === "create-new") {
      setCreateNewNamespace(true);
      setNamespace("");
    } else {
      setCreateNewNamespace(false);
      setNamespace(value);
    }
  };

  // Function to copy YAML to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedYaml).then(() => {
      alert("YAML copied to clipboard!");
    }).catch(err => console.error("Failed to copy YAML:", err));
  };

  // Perform form validation
  const validateForm = () => {
    let formErrors = {};

    // Validate namespace
    if (createNewNamespace && namespace) {
      if (!validateResourceName(namespace)) {
        formErrors.namespace = "Invalid namespace name";
      }
    }

    // Validate route hostname if route is exposed
    if (exposeRoute && routeHostname) {
      if (!validateResourceName(routeHostname)) {
        formErrors.routeHostname = "Invalid route hostname";
      }
    }

    // Validate storage names
    if (storageRequired) {
      storageDetails.forEach((volume, index) => {
        if (volume.name && !validateResourceName(volume.name)) {
          formErrors[`storage-${index}`] = `Volume '${volume.name}': Invalid name format`;
        }
      });
    }

    // Validate secret names
    if (secretsRequired) {
      secretsDetails.forEach((secret, index) => {
        if (secret.name && !validateResourceName(secret.name)) {
          formErrors[`secret-${index}`] = `Secret '${secret.name}': Invalid name format`;
        }
      });
    }

    // Validate configmap names
    if (configmapsRequired) {
      configmapsDetails.forEach((configmap, index) => {
        if (configmap.name && !validateResourceName(configmap.name)) {
          formErrors[`configmap-${index}`] = `ConfigMap '${configmap.name}': Invalid name format`;
        }
      });
    }

    setValidationErrors(formErrors);
    return Object.keys(formErrors).length === 0;
  };

  // Check if form has validation errors
  const hasValidationErrors = () => {
    return Object.keys(validationErrors).length > 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setShowValidationErrors(true);

    // Validate the form
    const isValid = validateForm();

    // Don't submit if there are validation errors
    if (!isValid) {
      alert("Please fix the validation errors before generating YAML.");
      return;
    }

    const deploymentData = {
      namespace,
      containerImage,
      cpuRequest,
      memoryRequest,
      containerPort: Number(containerPort),
      exposeRoute,
      routePort: Number(routePort),
      routeHostname: exposeRoute ? `${routeHostname}.${routeDomain}` : "",
      storageRequired,
      storageDetails,
      secretsRequired,
      secretsDetails,
      configmapsRequired,
      configmapsDetails,
      createNewNamespace,
      requesterNickname: user?.nickname || user?.name || ""
    };

    try {
      setLoading(true);
      const response = await apiClient.generateYaml(deploymentData);
      setLoading(false);

      if (response.data && response.data.status === "success") {
        setGeneratedYaml(response.data.yaml);
      } else {
        alert(`Error: ${response.data.message || "Failed to generate YAML"}`);
      }
    } catch (error) {
      setLoading(false);
      console.error("Error generating YAML:", error);
      alert(`Failed to generate YAML: ${error.message}`);
    }
  };

  const deployToOKD = async () => {
    setShowValidationErrors(true);

    // Validate the form
    const isValid = validateForm();

    // Don't submit if there are validation errors
    if (!isValid) {
      alert("Please fix the validation errors before deploying.");
      return;
    }

    const deploymentData = {
      namespace,
      containerImage,
      cpuRequest,
      memoryRequest,
      containerPort: Number(containerPort),
      exposeRoute,
      routePort: Number(routePort),
      routeHostname: exposeRoute ? `${routeHostname}.${routeDomain}` : "",
      storageRequired,
      storageDetails,
      secretsRequired,
      secretsDetails,
      configmapsRequired,
      configmapsDetails,
      createNewNamespace,
      requesterNickname: user?.nickname || user?.name || ""
    };

    try {
      setLoading(true);
      const response = await apiClient.deployToOKD(deploymentData);
      setLoading(false);
      alert(response.data.message);
    } catch (error) {
      setLoading(false);
      console.error("Deployment error:", error);
      alert(`Deployment failed: ${error.response?.data?.message || error.message}`);
    }
  };

  // Manual refresh button handler
  const handleRefresh = () => {
    setError(null);
    apiClient.clearCache(); // Clear client-side cache
    fetchClusterData();
  };

  if (loading) {
    return (
      <div className="loader-container fade-in">
        <div className="loader"></div>
        <h3>Loading cluster data...</h3>
        <p>Connecting to OpenShift cluster...</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h2>Deploy a New Application</h2>

      {/* Status bar with connection info and refresh button */}
      <div className={`status-bar ${clusterConnected ? 'status-success' : 'status-error'}`}>
        <span>
          {clusterConnected ?
            `Connected to OpenShift cluster (${namespaces.length} namespaces, ${storageClasses.length} storage classes available)` :
            `Error connecting to cluster: ${error || "Unknown error"}`
          }
        </span>
        <button
          onClick={handleRefresh}
          className="btn btn-primary btn-sm"
        >
          Refresh Cluster Data
        </button>
      </div>

      {/* Display validation errors at the top if any */}
      {showValidationErrors && hasValidationErrors() && <ValidationSummary errors={validationErrors} />}

      <form onSubmit={handleSubmit}>
        {/* General Info Section */}
        <div className="form-section">
          <h3>Basic Configuration</h3>

          {/* Row 1: Namespace and Container Image */}
          <div className="form-row">
            <div className="form-group">
              <label>Namespace:</label>
              {createNewNamespace ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
                    <ValidatedNameInput
                      value={namespace}
                      onChange={setNamespace}
                      onValidate={validateNamespace}
                      placeholder="Enter new namespace name"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setCreateNewNamespace(false)}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <select
                    value={namespace}
                    onChange={(e) => handleNamespaceChange(e.target.value)}
                    required
                  >
                    <option value="">Select a namespace</option>
                    {namespaces.map((ns) => (
                      <option key={ns.name} value={ns.name}>{ns.name}</option>
                    ))}
                    <option value="create-new">--- Create New Namespace ---</option>
                  </select>
                </div>
              )}
            </div>

            <FormField
              label="Container Image"
              value={containerImage}
              onChange={setContainerImage}
              placeholder="e.g., nginx:latest"
              required
            />
          </div>

          {/* Row 2: CPU and Memory Requests */}
          <div className="form-row">
            <SelectField
              label="CPU Request"
              value={cpuRequest}
              onChange={setCpuRequest}
              options={cpuOptions}
            />

            <SelectField
              label="Memory Request"
              value={memoryRequest}
              onChange={setMemoryRequest}
              options={memoryOptions}
            />
          </div>
        </div>

        {/* Storage Configuration */}
        <div className="form-section">
          <h3>Storage Configuration</h3>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="storageRequired"
              checked={storageRequired}
              onChange={() => setStorageRequired(!storageRequired)}
            />
            <label htmlFor="storageRequired">Requires Storage</label>
          </div>

          {storageRequired && (
            <div>
              {storageDetails.map((vol, index) => (
                <div key={index} className="nested-form-item">
                  <div className="form-row">
                    <div className="form-group">
                      <ValidatedNameInput
                        label="Volume Name"
                        value={vol.name}
                        onChange={(value) => handleStorageChange(index, "name", value)}
                        onValidate={(isValid, name) => validateStorageName(isValid, name, index)}
                        placeholder="Name for the volume"
                      />
                    </div>

                    <FormField
                      label="Mount Path"
                      value={vol.mountPath}
                      onChange={(value) => handleStorageChange(index, "mountPath", value)}
                      placeholder="e.g., /data"
                    />
                  </div>

                  <div className="form-row">
                    <FormField
                      label="Size (Gi)"
                      type="number"
                      value={vol.size}
                      onChange={(value) => handleStorageChange(index, "size", value)}
                      placeholder="e.g., 10"
                    />

                    <SelectField
                      label="Storage Class"
                      value={vol.storageClass}
                      onChange={(value) => handleStorageChange(index, "storageClass", value)}
                      options={storageClassOptions}
                    />
                  </div>

                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeStorage(index)}
                  >
                    &times;
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addStorage}
                disabled={!storageClasses.length}
                className="add-btn"
              >
                + Add Volume
              </button>
            </div>
          )}
        </div>

        {/* ConfigMaps Configuration */}
        <div className="form-section">
          <h3>ConfigMaps Configuration</h3>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="configmapsRequired"
              checked={configmapsRequired}
              onChange={() => setConfigmapsRequired(!configmapsRequired)}
            />
            <label htmlFor="configmapsRequired">Requires ConfigMaps</label>
          </div>

          {configmapsRequired && (
            <div>
              {/* Group the configmaps by name for better visualization */}
              {configmapNames.length > 0 && (
                <div>
                  {configmapNames.map((configmapName, nameIndex) => {
                    // Filter configmaps with this name
                    const configmapsWithName = configmapsDetails.filter(c => c.name === configmapName);

                    return configmapsWithName.length > 0 ? (
                      <div key={nameIndex} className="nested-form-item" style={{ background: '#f5fff0', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem' }}>
                            <h4 style={{ margin: '0' }}>ConfigMap:</h4>
                            <div style={{ position: 'relative', flex: '1' }}>
                              <input
                                type="text"
                                value={configmapName}
                                onChange={(e) => renameConfigmap(configmapName, e.target.value)}
                                onBlur={(e) => validateConfigmapRename(configmapName, e.target.value)}
                                style={{
                                  fontWeight: 'bold',
                                  fontSize: '1rem',
                                  padding: '0.25rem 0.5rem',
                                  border: '1px dashed #aaa',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  width: '100%'
                                }}
                                className={configmapsWithName[0]?.nameError ? "input-error" : ""}
                              />
                              <ResourceNameTip />
                            </div>
                          </div>
                          {configmapsWithName[0]?.nameError &&
                            <div className="error-message">{configmapsWithName[0].nameError}</div>}
                        </div>

                        {configmapsWithName.map((configmap, detailIndex) => {
                          // Find the original index in the full configmapsDetails array
                          const originalIndex = configmapsDetails.findIndex(
                            c => c === configmap
                          );

                          return (
                            <div key={`${nameIndex}-${detailIndex}`}
                                 className="nested-form-item"
                                 style={{ marginBottom: '0.75rem' }}>
                              <div className="form-row">
                                <FormField
                                  label="Key"
                                  value={configmap.key}
                                  onChange={(value) => handleConfigmapChange(originalIndex, "key", value)}
                                  placeholder="ConfigMap key name"
                                />

                                <TextareaField
                                  label="Value"
                                  value={configmap.value}
                                  onChange={(value) => handleConfigmapChange(originalIndex, "value", value)}
                                  placeholder="ConfigMap value (use multiple lines for multi-line content)"
                                  rows={4}
                                  style={{ fontFamily: 'monospace' }}
                                />
                              </div>

                              <div className="form-row">
                                <SelectField
                                  label="Mount Type"
                                  value={configmap.mountType}
                                  onChange={(value) => handleConfigmapChange(originalIndex, "mountType", value)}
                                  options={[
                                    { value: "env", label: "Environment Variable" },
                                    { value: "volume", label: "Volume Mount" }
                                  ]}
                                />

                                {configmap.mountType === "env" && (
                                  <FormField
                                    label="Env Variable Name"
                                    value={configmap.envName || ""}
                                    onChange={(value) => handleConfigmapChange(originalIndex, "envName", value)}
                                    placeholder="Leave empty to use key name"
                                  />
                                )}

                                {configmap.mountType === "volume" && (
                                  <FormField
                                    label="Mount Path"
                                    value={configmap.mountPath || ""}
                                    onChange={(value) => handleConfigmapChange(originalIndex, "mountPath", value)}
                                    placeholder="Path to mount the configmap at"
                                  />
                                )}
                              </div>

                              <button
                                type="button"
                                className="remove-btn"
                                onClick={() => removeConfigmap(originalIndex)}
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })}

                        {/* Add key-value pair to this configmap */}
                        <button
                          type="button"
                          className="add-btn"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => {
                            setConfigmapsDetails([...configmapsDetails, {
                              name: configmapName,
                              key: "",
                              value: "",
                              mountType: "env"
                            }]);
                          }}
                        >
                          + Add Key-Value Pair to {configmapName}
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {/* ConfigMaps with no assigned name yet, if any */}
              {configmapsDetails.filter(c => !c.name || !configmapNames.includes(c.name)).map((configmap, index) => {
                const originalIndex = configmapsDetails.findIndex(c => c === configmap);

                return (
                  <div key={`unnamed-${index}`} className="nested-form-item">
                    <div className="form-row">
                      <div className="form-group">
                        <label>ConfigMap Name: <ResourceNameTip /></label>
                        <select
                          value={configmap.name || ""}
                          onChange={(e) => handleConfigmapChange(originalIndex, "name", e.target.value)}
                          required
                          className={configmap.nameError ? "input-error" : ""}
                        >
                          <option value="">Select a configmap</option>
                          {configmapNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value="add-new-configmap">+ Add New ConfigMap</option>
                        </select>
                        {configmap.nameError && <div className="error-message">{configmap.nameError}</div>}
                      </div>

                      <FormField
                        label="Key"
                        value={configmap.key}
                        onChange={(value) => handleConfigmapChange(originalIndex, "key", value)}
                        placeholder="ConfigMap key name"
                      />
                    </div>

                    <div className="form-row">
                      <TextareaField
                        label="Value"
                        value={configmap.value}
                        onChange={(value) => handleConfigmapChange(originalIndex, "value", value)}
                        placeholder="ConfigMap value (use multiple lines for multi-line content)"
                        rows={4}
                        style={{ fontFamily: 'monospace' }}
                      />

                      <SelectField
                        label="Mount Type"
                        value={configmap.mountType}
                        onChange={(value) => handleConfigmapChange(originalIndex, "mountType", value)}
                        options={[
                          { value: "env", label: "Environment Variable" },
                          { value: "volume", label: "Volume Mount" }
                        ]}
                      />
                    </div>

                    {configmap.mountType === "env" && (
                      <div className="form-row">
                        <FormField
                          label="Env Variable Name"
                          value={configmap.envName || ""}
                          onChange={(value) => handleConfigmapChange(originalIndex, "envName", value)}
                          placeholder="Leave empty to use key name"
                        />
                      </div>
                    )}

                    {configmap.mountType === "volume" && (
                      <div className="form-row">
                        <FormField
                          label="Mount Path"
                          value={configmap.mountPath || ""}
                          onChange={(value) => handleConfigmapChange(originalIndex, "mountPath", value)}
                          placeholder="Path to mount the configmap at"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeConfigmap(originalIndex)}
                    >
                      &times;
                    </button>
                  </div>
                );
              })}

              {/* Add new configmap or add to existing configmap buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    // Add a new entry to the first configmap if available, otherwise create a new configmap first
                    if (configmapNames.length === 0) {
                      addConfigmapName();
                    } else {
                      setConfigmapsDetails([...configmapsDetails, {
                        name: configmapNames[0],
                        key: "",
                        value: "",
                        mountType: "env"
                      }]);
                    }
                  }}
                  className="add-btn"
                  style={{ flex: 1 }}
                >
                  + Add ConfigMap Entry
                </button>

                <button
                  type="button"
                  onClick={addConfigmapName}
                  className="add-btn"
                  style={{ flex: 1 }}
                >
                  + Create New ConfigMap
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Secrets Configuration */}
        <div className="form-section">
          <h3>Secrets Configuration</h3>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="secretsRequired"
              checked={secretsRequired}
              onChange={() => setSecretsRequired(!secretsRequired)}
            />
            <label htmlFor="secretsRequired">Requires Secrets</label>
          </div>

          {secretsRequired && (
            <div>
              {/* Group the secrets by name for better visualization */}
              {secretNames.length > 0 && (
                <div>
                  {secretNames.map((secretName, nameIndex) => {
                    // Filter secrets with this name
                    const secretsWithName = secretsDetails.filter(s => s.name === secretName);

                    return secretsWithName.length > 0 ? (
                      <div key={nameIndex} className="nested-form-item" style={{ background: '#f0f5ff', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem' }}>
                            <h4 style={{ margin: '0' }}>Secret:</h4>
                            <div style={{ position: 'relative', flex: '1' }}>
                              <input
                                type="text"
                                value={secretName}
                                onChange={(e) => renameSecret(secretName, e.target.value)}
                                onBlur={(e) => validateSecretRename(secretName, e.target.value)}
                                style={{
                                  fontWeight: 'bold',
                                  fontSize: '1rem',
                                  padding: '0.25rem 0.5rem',
                                  border: '1px dashed #aaa',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  width: '100%'
                                }}
                                className={secretsWithName[0]?.nameError ? "input-error" : ""}
                              />
                              <ResourceNameTip />
                            </div>
                          </div>
                          {secretsWithName[0]?.nameError &&
                            <div className="error-message">{secretsWithName[0].nameError}</div>}
                        </div>

                        {secretsWithName.map((secret, detailIndex) => {
                          // Find the original index in the full secretsDetails array
                          const originalIndex = secretsDetails.findIndex(
                            s => s === secret
                          );

                          return (
                            <div key={`${nameIndex}-${detailIndex}`}
                                 className="nested-form-item"
                                 style={{ marginBottom: '0.75rem' }}>
                              <div className="form-row">
                                <FormField
                                  label="Key"
                                  value={secret.key}
                                  onChange={(value) => handleSecretChange(originalIndex, "key", value)}
                                  placeholder="Secret key name"
                                />

                                <FormField
                                  label="Value"
                                  value={secret.value}
                                  onChange={(value) => handleSecretChange(originalIndex, "value", value)}
                                  placeholder="Secret value"
                                />
                              </div>

                              <div className="form-row">
                                <SelectField
                                  label="Mount Type"
                                  value={secret.mountType}
                                  onChange={(value) => handleSecretChange(originalIndex, "mountType", value)}
                                  options={[
                                    { value: "env", label: "Environment Variable" },
                                    { value: "volume", label: "Volume Mount" }
                                  ]}
                                />

                                {secret.mountType === "env" && (
                                  <FormField
                                    label="Env Variable Name"
                                    value={secret.envName || ""}
                                    onChange={(value) => handleSecretChange(originalIndex, "envName", value)}
                                    placeholder="Leave empty to use key name"
                                  />
                                )}

                                {secret.mountType === "volume" && (
                                  <FormField
                                    label="Mount Path"
                                    value={secret.mountPath || ""}
                                    onChange={(value) => handleSecretChange(originalIndex, "mountPath", value)}
                                    placeholder="Path to mount the secret at"
                                  />
                                )}
                              </div>

                              <button
                                type="button"
                                className="remove-btn"
                                onClick={() => removeSecret(originalIndex)}
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })}

                        {/* Add key-value pair to this secret */}
                        <button
                          type="button"
                          className="add-btn"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => {
                            setSecretsDetails([...secretsDetails, {
                              name: secretName,
                              key: "",
                              value: "",
                              mountType: "env"
                            }]);
                          }}
                        >
                          + Add Key-Value Pair to {secretName}
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {/* Secrets with no assigned name yet, if any */}
              {secretsDetails.filter(s => !s.name || !secretNames.includes(s.name)).map((secret, index) => {
                const originalIndex = secretsDetails.findIndex(s => s === secret);

                return (
                  <div key={`unnamed-${index}`} className="nested-form-item">
                    <div className="form-row">
                      <div className="form-group">
                        <label>Secret Name: <ResourceNameTip /></label>
                        <select
                          value={secret.name || ""}
                          onChange={(e) => handleSecretChange(originalIndex, "name", e.target.value)}
                          required
                          className={secret.nameError ? "input-error" : ""}
                        >
                          <option value="">Select a secret</option>
                          {secretNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value="add-new-secret">+ Add New Secret</option>
                        </select>
                        {secret.nameError && <div className="error-message">{secret.nameError}</div>}
                      </div>

                      <FormField
                        label="Key"
                        value={secret.key}
                        onChange={(value) => handleSecretChange(originalIndex, "key", value)}
                        placeholder="Secret key name"
                      />
                    </div>

                    <div className="form-row">
                      <FormField
                        label="Value"
                        value={secret.value}
                        onChange={(value) => handleSecretChange(originalIndex, "value", value)}
                        placeholder="Secret value"
                      />

                      <SelectField
                        label="Mount Type"
                        value={secret.mountType}
                        onChange={(value) => handleSecretChange(originalIndex, "mountType", value)}
                        options={[
                          { value: "env", label: "Environment Variable" },
                          { value: "volume", label: "Volume Mount" }
                        ]}
                      />
                    </div>

                    {secret.mountType === "env" && (
                      <div className="form-row">
                        <FormField
                          label="Env Variable Name"
                          value={secret.envName || ""}
                          onChange={(value) => handleSecretChange(originalIndex, "envName", value)}
                          placeholder="Leave empty to use key name"
                        />
                      </div>
                    )}

                    {secret.mountType === "volume" && (
                      <div className="form-row">
                        <FormField
                          label="Mount Path"
                          value={secret.mountPath || ""}
                          onChange={(value) => handleSecretChange(originalIndex, "mountPath", value)}
                          placeholder="Path to mount the secret at"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeSecret(originalIndex)}
                    >
                      &times;
                    </button>
                  </div>
                );
              })}

              {/* Add new secret or add to existing secret buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    // Add a new entry to the first secret if available, otherwise create a new secret first
                    if (secretNames.length === 0) {
                      addSecretName();
                    } else {
                      setSecretsDetails([...secretsDetails, {
                        name: secretNames[0],
                        key: "",
                        value: "",
                        mountType: "env"
                      }]);
                    }
                  }}
                  className="add-btn"
                  style={{ flex: 1 }}
                >
                  + Add Secret Entry
                </button>

                <button
                  type="button"
                  onClick={addSecretName}
                  className="add-btn"
                  style={{ flex: 1 }}
                >
                  + Create New Secret
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Network Configuration Section */}
        <div className="form-section">
          <h3>Network Configuration</h3>

          <div className="form-row">
            <FormField
              label="Container Port"
              type="number"
              value={containerPort}
              onChange={setContainerPort}
              required
            />

            <div className="form-group">
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="exposeRoute"
                  checked={exposeRoute}
                  onChange={() => setExposeRoute(!exposeRoute)}
                />
                <label htmlFor="exposeRoute">Expose Route</label>
              </div>
            </div>
          </div>

          {exposeRoute && (
            <div className="form-row">
              <SelectField
                label="Route Port"
                value={routePort}
                onChange={setRoutePort}
                options={[
                  { value: "80", label: "Port 80" },
                  { value: "443", label: "Port 443 (SSL)" }
                ]}
              />

              <div className="form-group">
                <label>Hostname:</label>
                <div style={{ display: 'flex', gap: '5px', position: 'relative' }}>
                  <ValidatedNameInput
                    value={routeHostname}
                    onChange={setRouteHostname}
                    onValidate={validateRouteHostname}
                    placeholder="Enter subdomain"
                    required
                  />
                  <span style={{ alignSelf: 'center' }}>.</span>
                  <select
                    value={routeDomain}
                    onChange={(e) => setRouteDomain(e.target.value)}
                    style={{ flex: '1' }}
                  >
                    {getDomainOptions().map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          style={{ marginBottom: '2rem' }}
        >
          Generate YAML
        </button>
      </form>

      {/* Display YAML Output */}
      {generatedYaml && (
        <div className="yaml-output fade-in">
          <h3>Generated YAML</h3>
          <pre>
            {generatedYaml}
          </pre>
          <div className="copy-deploy-buttons">
            <button
              onClick={copyToClipboard}
              className="btn btn-primary"
            >
              Copy YAML
            </button>

            <button
              onClick={deployToOKD}
              className="btn btn-success"
            >
              Deploy to OKD
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeploymentForm;
