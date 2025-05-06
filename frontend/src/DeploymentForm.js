import React, { useState } from "react";

const cpuOptions = ["250m", "500m", "750m", "1"];
const memoryOptions = ["256Mi", "512Mi", "1Gi", "2Gi"];
const storageClasses = ["csi-rbd-fast-sc", "csi-rbd-fast-sc-retain", "csi-rbd-sc", "csi-rbd-sc-retain"];
const routeDomains = ["apps.okd.science.internal", "science.xyz"];

const DeploymentForm = () => {
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

  // Function to add a new storage volume
  const addStorage = () => {
    setStorageDetails([...storageDetails, { name: "", mountPath: "", size: "", storageClass: storageClasses[0] }]);
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

  // Function to copy YAML to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedYaml).then(() => {
      alert("YAML copied to clipboard!");
    }).catch(err => console.error("Failed to copy YAML:", err));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const deploymentData = {
      namespace,
      containerImage,
      cpuRequest,
      memoryRequest,
      containerPort: Number(containerPort), // Ensure int32 format
      exposeRoute,
      routePort: Number(routePort), // Ensure int32 format
      routeHostname: `${routeHostname}.${routeDomain}`,
      storageRequired,
      storageDetails,
      secretsRequired,
      secretsDetails,
    };

    fetch("/generate-yaml", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deploymentData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setGeneratedYaml(data.yaml);
      })
      .catch((error) => {
        console.error("Error generating YAML:", error);
        alert(`Failed to generate YAML: ${error.message}`);
      });
  };


  const deployToOKD = () => {
    const deploymentData = {
      namespace,
      containerImage,
      cpuRequest,
      memoryRequest,
      containerPort: Number(containerPort), // Ensure int32 format
      exposeRoute,
      routePort: Number(routePort), // Ensure int32 format
      routeHostname: `${routeHostname}.${routeDomain}`,
      storageRequired,
      storageDetails,
      secretsRequired,
      secretsDetails,
    };

    fetch("/deploy-to-okd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deploymentData),
    })
      .then((response) => response.json())
      .then((data) => alert(data.message))
      .catch((error) => console.error("Deployment error:", error));
  };


  return (
    <div>
      <h2>Deploy a New Application</h2>
      <form onSubmit={handleSubmit}>

        {/* Row 1: Namespace and Container Image */}
        <div>
          <label>Namespace: </label>
          <input type="text" value={namespace} onChange={(e) => setNamespace(e.target.value)} required />

          <label> Container Image: </label>
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
                {storageClasses.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
              </select>

              <button type="button" onClick={() => removeStorage(index)} style={{ marginLeft: "10px", color: "red" }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addStorage}>Add Volume</button>
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

        <button type="submit">Generate YAML</button>
      </form>

      {/* Display YAML Output */}
      {generatedYaml && (
      <div>
        <h3>Generated YAML</h3>
        <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px", overflowX: "auto" }}>
          {generatedYaml}
        </pre>
        <button onClick={copyToClipboard} style={{ marginTop: "5px", padding: "5px 10px", cursor: "pointer", background: "#007BFF", color: "#fff", border: "none", borderRadius: "5px" }}>
          Copy YAML
        </button>

        {/* Deploy to OKD button */}
        <button onClick={deployToOKD} style={{ marginLeft: "10px", padding: "5px 10px", cursor: "pointer", background: "#28a745", color: "#fff", border: "none", borderRadius: "5px" }}>
          Deploy to OKD
        </button>
      </div>
    )}
  </div>
);
};

export default DeploymentForm;
