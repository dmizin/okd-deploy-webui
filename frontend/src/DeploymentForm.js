import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApiClient } from "./apiClient";
import { useAuth } from "./AuthProvider";

const cpuOptions = ["250m", "500m", "750m", "1"];
const memoryOptions = ["256Mi", "512Mi", "1Gi", "2Gi"];
const routeDomains = ["apps.okd.science.internal", "science.xyz"];

// Default fallback storage classes in case the API fails
const fallbackStorageClasses = [
  { name: "csi-rbd-fast-sc", isDefault: true },
  { name: "csi-rbd-fast-sc-retain", isDefault: false },
  { name: "csi-rbd-sc", isDefault: false },
  { name: "csi-rbd-sc-retain", isDefault: false }
];

const DeploymentForm = () => {
  const apiClient = useApiClient();
  const { isAuthenticated } = useAuth();

  // Use a ref to track initialization state to prevent double fetching
  const initialized = useRef(false);

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
      fetchClusterData();
    }
  }, [isAuthenticated, fetchClusterData]);

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

  // Function to add a new secret
  const addSecret = () => {
    setSecretsDetails([...secretsDetails, { name: "", key: "", value: "", mountType: "env" }]);
  };

  // Function to remove a secret
  const removeSecret = (index) => {
    setSecretsDetails(secretsDetails.filter((_, i) => i !== index));
  };

  const handleSecretChange = (index, field, value) => {
    const updatedSecrets = [...secretsDetails];
    updatedSecrets[index][field] = value;
    setSecretsDetails(updatedSecrets);
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
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <h3>Loading cluster data...</h3>
        <p>Connecting to OpenShift cluster...</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Deploy a New Application</h2>

      {/* Status bar with connection info and refresh button */}
      <div style={{
        backgroundColor: clusterConnected ? '#d4edda' : '#f8d7da',
        color: clusterConnected ? '#155724' : '#721c24',
        padding: '10px',
        borderRadius: '5px',
        marginBottom: '15px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          {clusterConnected ?
            `Connected to OpenShift cluster (${namespaces.length} namespaces, ${storageClasses.length} storage classes available)` :
            `Error connecting to cluster: ${error || "Unknown error"}`
          }
        </span>
        <button
          onClick={handleRefresh}
          style={{
            padding: '5px 10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Refresh Cluster Data
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Row 1: Namespace and Container Image */}
        <div>
          <label>Namespace: </label>
          {createNewNamespace ? (
            <input
              type="text"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="Enter new namespace name"
              required
            />
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

          {createNewNamespace && (
            <button
              type="button"
              onClick={() => setCreateNewNamespace(false)}
              style={{ marginLeft: "10px" }}
            >
              Cancel
            </button>
          )}

          <label style={{ marginLeft: "20px" }}> Container Image: </label>
          <input type="text" value={containerImage} onChange={(e) => setContainerImage(e.target.value)} required />
        </div>

        {/* Row 2: CPU and Memory Requests */}
        <div>
          <label>CPU Request: </label>
          <select value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)}>
            {cpuOptions.map((cpu) => <option key={cpu} value={cpu}>{cpu}</option>)}
          </select>

          <label> Memory Request: </label>
          <select value={memoryRequest} onChange={(e) => setMemoryRequest(e.target.value)}>
            {memoryOptions.map((mem) => <option key={mem} value={mem}>{mem}</option>)}
          </select>
        </div>

        {/* Row 3: Storage Configuration */}
        <div>
          <label>
            <input type="checkbox" checked={storageRequired} onChange={() => setStorageRequired(!storageRequired)} /> Requires Storage
          </label>

          {storageRequired && storageDetails.map((vol, index) => (
            <div key={index} style={{ marginBottom: "10px", border: "1px solid #ccc", padding: "10px", borderRadius: "5px" }}>
              <label>Name: </label>
              <input type="text" value={vol.name} onChange={(e) => handleStorageChange(index, "name", e.target.value)} />

              <label> Mount Path: </label>
              <input type="text" value={vol.mountPath} onChange={(e) => handleStorageChange(index, "mountPath", e.target.value)} />

              <label> Size (Gi): </label>
              <input type="number" value={vol.size} onChange={(e) => handleStorageChange(index, "size", e.target.value)} />

              <label> Storage Class: </label>
              <select value={vol.storageClass} onChange={(e) => handleStorageChange(index, "storageClass", e.target.value)}>
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

              <button type="button" onClick={() => removeStorage(index)} style={{ marginLeft: "10px", color: "red" }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addStorage} disabled={!storageClasses.length}>Add Volume</button>
        </div>

        {/* Row 4: Secrets Configuration */}
        <div>
          <label>
            <input type="checkbox" checked={secretsRequired} onChange={() => setSecretsRequired(!secretsRequired)} /> Requires Secrets
          </label>

          {secretsRequired && secretsDetails.map((secret, index) => (
            <div key={index} style={{ marginBottom: "10px", border: "1px solid #ccc", padding: "10px", borderRadius: "5px" }}>
              <label>Secret Name: </label>
              <input type="text" value={secret.name} onChange={(e) => handleSecretChange(index, "name", e.target.value)} />

              <label> Key: </label>
              <input type="text" value={secret.key} onChange={(e) => handleSecretChange(index, "key", e.target.value)} />

              <label> Value: </label>
              <input type="text" value={secret.value} onChange={(e) => handleSecretChange(index, "value", e.target.value)} />

              <label> Mount Type: </label>
              <select value={secret.mountType} onChange={(e) => handleSecretChange(index, "mountType", e.target.value)}>
                <option value="env">Environment Variable</option>
                <option value="volume">Volume Mount</option>
              </select>

              {secret.mountType === "env" && (
                <>
                  <label> Env Variable Name: </label>
                  <input
                    type="text"
                    value={secret.envName || ""}
                    onChange={(e) => handleSecretChange(index, "envName", e.target.value)}
                    placeholder="Leave empty to use key name"
                  />
                </>
              )}

              {secret.mountType === "volume" && (
                <>
                  <label> Mount Path: </label>
                  <input
                    type="text"
                    value={secret.mountPath || ""}
                    onChange={(e) => handleSecretChange(index, "mountPath", e.target.value)}
                  />
                </>
              )}

              <button type="button" onClick={() => removeSecret(index)} style={{ marginLeft: "10px", color: "red" }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addSecret}>Add Secret</button>
        </div>

        {/* Row 5: Network Configuration */}
        <div>
          <label>Container Port: </label>
          <input type="number" value={containerPort} onChange={(e) => setContainerPort(e.target.value)} required />

          <label>
            <input type="checkbox" checked={exposeRoute} onChange={() => setExposeRoute(!exposeRoute)} /> Expose Route
          </label>

          {exposeRoute && (
            <>
              <label> Route Port: </label>
              <select value={routePort} onChange={(e) => setRoutePort(e.target.value)}>
                <option value="80">Port 80</option>
                <option value="443">Port 443 (SSL)</option>
              </select>

              <label> Hostname: </label>
              <input type="text" value={routeHostname} onChange={(e) => setRouteHostname(e.target.value)} placeholder="Enter subdomain" />

              <label> Domain: </label>
              <select value={routeDomain} onChange={(e) => setRouteDomain(e.target.value)}>
                {routeDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
              </select>
            </>
          )}
        </div>

        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            margin: '20px 0',
            cursor: 'pointer'
          }}
        >
          Generate YAML
        </button>
      </form>

      {/* Display YAML Output */}
      {generatedYaml && (
      <div>
        <h3>Generated YAML</h3>
        <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px", overflowX: "auto" }}>
          {generatedYaml}
        </pre>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button
            onClick={copyToClipboard}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007BFF',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Copy YAML
          </button>

          <button
            onClick={deployToOKD}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
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
