import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApiClient } from "./apiClient";
import { useAuth } from "./AuthProvider";

const cpuOptions = ["250m", "500m", "750m", "1"];
const memoryOptions = ["256Mi", "512Mi", "1Gi", "2Gi"];
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

// Use this function to get route domains
const routeDomains = getRouteDomains();

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

  const [namespace, setNamespace] = useState("");
  const [containerImage, setContainerImage] = useState("");
  const [cpuRequest, setCpuRequest] = useState(cpuOptions[0]);
  const [memoryRequest, setMemoryRequest] = useState(memoryOptions[0]);
  const [containerPort, setContainerPort] = useState(80);
  const [exposeRoute, setExposeRoute] = useState(false);
  const [routePort, setRoutePort] = useState(80);
  const [routeHostname, setRouteHostname] = useState("");
  const [routeDomain, setRouteDomain] = useState(routeDomains[0]);
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

    // Initialize first secret and configmap names
    setSecretNames(["app-secret"]);
    setConfigmapNames(["app-config"]);

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
      storageClass: defaultStorageClass
    }]);
  };

  // Function to remove a storage volume
  const removeStorage = (index) => {
    setStorageDetails(storageDetails.filter((_, i) => i !== index));
  };

  const handleStorageChange = (index, field, value) => {
    const updatedStorage = [...storageDetails];
    updatedStorage[index][field] = value;
    setStorageDetails(updatedStorage);
  };

  // State to keep track of available secret names
  const [secretNames, setSecretNames] = useState([]);

  // Function to add a new secret
  const addSecret = () => {
    setSecretsDetails([...secretsDetails, {
      name: secretNames.length > 0 ? secretNames[0] : "",
      key: "",
      value: "",
      mountType: "env"
    }]);
  };

  // Function to add a new secret name
  const addSecretName = () => {
    const newSecretName = `secret-${secretNames.length + 1}`;
    setSecretNames([...secretNames, newSecretName]);

    // Create a new secret entry with this name
    setSecretsDetails([...secretsDetails, {
      name: newSecretName,
      key: "",
      value: "",
      mountType: "env"
    }]);

    return newSecretName;
  };

  // Function to rename a secret
  const renameSecret = (oldName, newName) => {
    if (newName.trim() === "") return;

    // Update the name in the secretNames array
    const updatedNames = secretNames.map(name =>
      name === oldName ? newName : name
    );
    setSecretNames(updatedNames);

    // Update all secret details that use this name
    const updatedSecrets = secretsDetails.map(secret =>
      secret.name === oldName ? { ...secret, name: newName } : secret
    );
    setSecretsDetails(updatedSecrets);
  };

  // Function to remove a secret
  const removeSecret = (index) => {
    setSecretsDetails(secretsDetails.filter((_, i) => i !== index));
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

  // State to keep track of available configmap names
  const [configmapNames, setConfigmapNames] = useState([]);

  // Function to add a new configmap
  const addConfigmap = () => {
    setConfigmapsDetails([...configmapsDetails, {
      name: configmapNames.length > 0 ? configmapNames[0] : "",
      key: "",
      value: "",
      mountType: "env"
    }]);
  };

  // Function to add a new configmap name
  const addConfigmapName = () => {
    const newConfigmapName = `config-${configmapNames.length + 1}`;
    setConfigmapNames([...configmapNames, newConfigmapName]);

    // Create a new configmap entry with this name
    setConfigmapsDetails([...configmapsDetails, {
      name: newConfigmapName,
      key: "",
      value: "",
      mountType: "env"
    }]);

    return newConfigmapName;
  };

  // Function to rename a configmap
  const renameConfigmap = (oldName, newName) => {
    if (newName.trim() === "") return;

    // Update the name in the configmapNames array
    const updatedNames = configmapNames.map(name =>
      name === oldName ? newName : name
    );
    setConfigmapNames(updatedNames);

    // Update all configmap details that use this name
    const updatedConfigmaps = configmapsDetails.map(configmap =>
      configmap.name === oldName ? { ...configmap, name: newName } : configmap
    );
    setConfigmapsDetails(updatedConfigmaps);
  };

  // Function to remove a configmap
  const removeConfigmap = (index) => {
    setConfigmapsDetails(configmapsDetails.filter((_, i) => i !== index));
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
  const handleNamespaceChange = (e) => {
    const value = e.target.value;
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

  const handleSubmit = async (event) => {
    event.preventDefault();
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

      <form onSubmit={handleSubmit}>
        {/* General Info Section */}
        <div className="form-section">
          <h3>Basic Configuration</h3>

          {/* Row 1: Namespace and Container Image */}
          <div className="form-row">
            <div className="form-group">
              <label>Namespace:</label>
              {createNewNamespace ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                    placeholder="Enter new namespace name"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setCreateNewNamespace(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={namespace}
                  onChange={handleNamespaceChange}
                  required
                >
                  <option value="">Select a namespace</option>
                  {namespaces.map((ns) => (
                    <option key={ns.name} value={ns.name}>{ns.name}</option>
                  ))}
                  <option value="create-new">--- Create New Namespace ---</option>
                </select>
              )}
            </div>

            <div className="form-group">
              <label>Container Image:</label>
              <input
                type="text"
                value={containerImage}
                onChange={(e) => setContainerImage(e.target.value)}
                placeholder="e.g., nginx:latest"
                required
              />
            </div>
          </div>

          {/* Row 2: CPU and Memory Requests */}
          <div className="form-row">
            <div className="form-group">
              <label>CPU Request:</label>
              <select value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)}>
                {cpuOptions.map((cpu) => <option key={cpu} value={cpu}>{cpu}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Memory Request:</label>
              <select value={memoryRequest} onChange={(e) => setMemoryRequest(e.target.value)}>
                {memoryOptions.map((mem) => <option key={mem} value={mem}>{mem}</option>)}
              </select>
            </div>
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
                      <label>Volume Name:</label>
                      <input
                        type="text"
                        value={vol.name}
                        onChange={(e) => handleStorageChange(index, "name", e.target.value)}
                        placeholder="Name for the volume"
                      />
                    </div>

                    <div className="form-group">
                      <label>Mount Path:</label>
                      <input
                        type="text"
                        value={vol.mountPath}
                        onChange={(e) => handleStorageChange(index, "mountPath", e.target.value)}
                        placeholder="e.g., /data"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Size (Gi):</label>
                      <input
                        type="number"
                        value={vol.size}
                        onChange={(e) => handleStorageChange(index, "size", e.target.value)}
                        placeholder="e.g., 10"
                      />
                    </div>

                    <div className="form-group">
                      <label>Storage Class:</label>
                      <select
                        value={vol.storageClass}
                        onChange={(e) => handleStorageChange(index, "storageClass", e.target.value)}
                      >
                        {storageClasses.length > 0 ? (
                          storageClasses.map((sc) => (
                            <option key={sc.name} value={sc.name}>
                              {sc.name} {sc.isDefault ? "(Default)" : ""}
                            </option>
                          ))
                        ) : (
                          <option value="">No storage classes available</option>
                        )}
                      </select>
                    </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem' }}>
                          <h4 style={{ margin: '0' }}>ConfigMap:</h4>
                          <input
                            type="text"
                            value={configmapName}
                            onChange={(e) => renameConfigmap(configmapName, e.target.value)}
                            style={{
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              padding: '0.25rem 0.5rem',
                              border: '1px dashed #aaa',
                              borderRadius: '4px',
                              background: 'transparent'
                            }}
                          />
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
                                <div className="form-group">
                                  <label>Key:</label>
                                  <input
                                    type="text"
                                    value={configmap.key}
                                    onChange={(e) => handleConfigmapChange(originalIndex, "key", e.target.value)}
                                    placeholder="ConfigMap key name"
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Value:</label>
                                  <input
                                    type="text"
                                    value={configmap.value}
                                    onChange={(e) => handleConfigmapChange(originalIndex, "value", e.target.value)}
                                    placeholder="ConfigMap value"
                                  />
                                </div>
                              </div>

                              <div className="form-row">
                                <div className="form-group">
                                  <label>Mount Type:</label>
                                  <select
                                    value={configmap.mountType}
                                    onChange={(e) => handleConfigmapChange(originalIndex, "mountType", e.target.value)}
                                  >
                                    <option value="env">Environment Variable</option>
                                    <option value="volume">Volume Mount</option>
                                  </select>
                                </div>

                                {configmap.mountType === "env" && (
                                  <div className="form-group">
                                    <label>Env Variable Name:</label>
                                    <input
                                      type="text"
                                      value={configmap.envName || ""}
                                      onChange={(e) => handleConfigmapChange(originalIndex, "envName", e.target.value)}
                                      placeholder="Leave empty to use key name"
                                    />
                                  </div>
                                )}

                                {configmap.mountType === "volume" && (
                                  <div className="form-group">
                                    <label>Mount Path:</label>
                                    <input
                                      type="text"
                                      value={configmap.mountPath || ""}
                                      onChange={(e) => handleConfigmapChange(originalIndex, "mountPath", e.target.value)}
                                      placeholder="Path to mount the configmap at"
                                    />
                                  </div>
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
                        <label>ConfigMap Name:</label>
                        <select
                          value={configmap.name || ""}
                          onChange={(e) => handleConfigmapChange(originalIndex, "name", e.target.value)}
                          required
                        >
                          <option value="">Select a configmap</option>
                          {configmapNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value="add-new-configmap">+ Add New ConfigMap</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Key:</label>
                        <input
                          type="text"
                          value={configmap.key}
                          onChange={(e) => handleConfigmapChange(originalIndex, "key", e.target.value)}
                          placeholder="ConfigMap key name"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Value:</label>
                        <input
                          type="text"
                          value={configmap.value}
                          onChange={(e) => handleConfigmapChange(originalIndex, "value", e.target.value)}
                          placeholder="ConfigMap value"
                        />
                      </div>

                      <div className="form-group">
                        <label>Mount Type:</label>
                        <select
                          value={configmap.mountType}
                          onChange={(e) => handleConfigmapChange(originalIndex, "mountType", e.target.value)}
                        >
                          <option value="env">Environment Variable</option>
                          <option value="volume">Volume Mount</option>
                        </select>
                      </div>
                    </div>

                    {configmap.mountType === "env" && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Env Variable Name:</label>
                          <input
                            type="text"
                            value={configmap.envName || ""}
                            onChange={(e) => handleConfigmapChange(originalIndex, "envName", e.target.value)}
                            placeholder="Leave empty to use key name"
                          />
                        </div>
                      </div>
                    )}

                    {configmap.mountType === "volume" && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Mount Path:</label>
                          <input
                            type="text"
                            value={configmap.mountPath || ""}
                            onChange={(e) => handleConfigmapChange(originalIndex, "mountPath", e.target.value)}
                            placeholder="Path to mount the configmap at"
                          />
                        </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem' }}>
                          <h4 style={{ margin: '0' }}>Secret:</h4>
                          <input
                            type="text"
                            value={secretName}
                            onChange={(e) => renameSecret(secretName, e.target.value)}
                            style={{
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              padding: '0.25rem 0.5rem',
                              border: '1px dashed #aaa',
                              borderRadius: '4px',
                              background: 'transparent'
                            }}
                          />
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
                                <div className="form-group">
                                  <label>Key:</label>
                                  <input
                                    type="text"
                                    value={secret.key}
                                    onChange={(e) => handleSecretChange(originalIndex, "key", e.target.value)}
                                    placeholder="Secret key name"
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Value:</label>
                                  <input
                                    type="text"
                                    value={secret.value}
                                    onChange={(e) => handleSecretChange(originalIndex, "value", e.target.value)}
                                    placeholder="Secret value"
                                  />
                                </div>
                              </div>

                              <div className="form-row">
                                <div className="form-group">
                                  <label>Mount Type:</label>
                                  <select
                                    value={secret.mountType}
                                    onChange={(e) => handleSecretChange(originalIndex, "mountType", e.target.value)}
                                  >
                                    <option value="env">Environment Variable</option>
                                    <option value="volume">Volume Mount</option>
                                  </select>
                                </div>

                                {secret.mountType === "env" && (
                                  <div className="form-group">
                                    <label>Env Variable Name:</label>
                                    <input
                                      type="text"
                                      value={secret.envName || ""}
                                      onChange={(e) => handleSecretChange(originalIndex, "envName", e.target.value)}
                                      placeholder="Leave empty to use key name"
                                    />
                                  </div>
                                )}

                                {secret.mountType === "volume" && (
                                  <div className="form-group">
                                    <label>Mount Path:</label>
                                    <input
                                      type="text"
                                      value={secret.mountPath || ""}
                                      onChange={(e) => handleSecretChange(originalIndex, "mountPath", e.target.value)}
                                      placeholder="Path to mount the secret at"
                                    />
                                  </div>
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
                        <label>Secret Name:</label>
                        <select
                          value={secret.name || ""}
                          onChange={(e) => handleSecretChange(originalIndex, "name", e.target.value)}
                          required
                        >
                          <option value="">Select a secret</option>
                          {secretNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          <option value="add-new-secret">+ Add New Secret</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Key:</label>
                        <input
                          type="text"
                          value={secret.key}
                          onChange={(e) => handleSecretChange(originalIndex, "key", e.target.value)}
                          placeholder="Secret key name"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Value:</label>
                        <input
                          type="text"
                          value={secret.value}
                          onChange={(e) => handleSecretChange(originalIndex, "value", e.target.value)}
                          placeholder="Secret value"
                        />
                      </div>

                      <div className="form-group">
                        <label>Mount Type:</label>
                        <select
                          value={secret.mountType}
                          onChange={(e) => handleSecretChange(originalIndex, "mountType", e.target.value)}
                        >
                          <option value="env">Environment Variable</option>
                          <option value="volume">Volume Mount</option>
                        </select>
                      </div>
                    </div>

                    {secret.mountType === "env" && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Env Variable Name:</label>
                          <input
                            type="text"
                            value={secret.envName || ""}
                            onChange={(e) => handleSecretChange(originalIndex, "envName", e.target.value)}
                            placeholder="Leave empty to use key name"
                          />
                        </div>
                      </div>
                    )}

                    {secret.mountType === "volume" && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Mount Path:</label>
                          <input
                            type="text"
                            value={secret.mountPath || ""}
                            onChange={(e) => handleSecretChange(originalIndex, "mountPath", e.target.value)}
                            placeholder="Path to mount the secret at"
                          />
                        </div>
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
            <div className="form-group">
              <label>Container Port:</label>
              <input
                type="number"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                required
              />
            </div>

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
              <div className="form-group">
                <label>Route Port:</label>
                <select value={routePort} onChange={(e) => setRoutePort(e.target.value)}>
                  <option value="80">Port 80</option>
                  <option value="443">Port 443 (SSL)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Hostname:</label>
                <input
                  type="text"
                  value={routeHostname}
                  onChange={(e) => setRouteHostname(e.target.value)}
                  placeholder="Enter subdomain"
                />
              </div>

              <div className="form-group">
                <label>Domain:</label>
                <select value={routeDomain} onChange={(e) => setRouteDomain(e.target.value)}>
                  {routeDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                </select>
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
