import React, { useState } from 'react';

const DeploymentForm = () => {
  const [namespace, setNamespace] = useState('');
  const [containerImage, setContainerImage] = useState('');
  const [cpuRequest, setCpuRequest] = useState('');
  const [memoryRequest, setMemoryRequest] = useState('');
  const [storageRequired, setStorageRequired] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    const deploymentData = {
      namespace,
      containerImage,
      cpuRequest,
      memoryRequest,
      storageRequired
    };

    console.log("Deploying:", deploymentData);

    // Call backend API (to be implemented)
    fetch('/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentData),
    })
    .then(response => response.json())
    .then(data => {
      alert(`Deployment Response: ${JSON.stringify(data)}`);
    })
    .catch(error => console.error('Error:', error));
  };

  return (
    <div>
      <h2>Deploy a New Application</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Namespace:</label>
          <input type="text" value={namespace} onChange={(e) => setNamespace(e.target.value)} required />
        </div>
        <div>
          <label>Container Image:</label>
          <input type="text" value={containerImage} onChange={(e) => setContainerImage(e.target.value)} required />
        </div>
        <div>
          <label>CPU Request:</label>
          <input type="text" value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)} />
        </div>
        <div>
          <label>Memory Request:</label>
          <input type="text" value={memoryRequest} onChange={(e) => setMemoryRequest(e.target.value)} />
        </div>
        <div>
          <label>Requires Persistent Storage?</label>
          <input type="checkbox" checked={storageRequired} onChange={(e) => setStorageRequired(e.target.checked)} />
        </div>
        <button type="submit">Deploy</button>
      </form>
    </div>
  );
};

export default DeploymentForm;
