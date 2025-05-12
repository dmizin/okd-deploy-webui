import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import DeploymentForm from './DeploymentForm';
import { AuthProvider, useAuth, RequireAdmin } from './AuthProvider';
import { useApiClient } from './apiClient';
import './styles.css'; // Import our new stylesheet

// Debug Panel for troubleshooting auth issues
const DebugPanel = () => {
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const apiClient = useApiClient();

  const debugAuth = async () => {
    setLoading(true);
    try {
      const response = await apiClient.debugToken();
      setTokenInfo(response.data);
    } catch (error) {
      console.error("Debug error:", error);
      setTokenInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="debug-panel">
      <h3>Auth Troubleshooting</h3>
      <button onClick={debugAuth} className="btn btn-secondary" disabled={loading}>
        {loading ? "Loading..." : "Debug Auth Token"}
      </button>

      {tokenInfo && (
        <div className="debug-results">
          <h4>Token Debug Info:</h4>
          <pre>{JSON.stringify(tokenInfo, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

// Access Denied component
const AccessDenied = () => {
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="access-denied-container">
      <h2>Access Denied</h2>
      <p>
        You do not have the required permissions to access this application.
        Please contact your administrator if you believe this is an error.
      </p>
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="btn btn-outline"
      >
        {showDebug ? "Hide Troubleshooting" : "Show Troubleshooting"}
      </button>

      {showDebug && <DebugPanel />}
    </div>
  );
};

// Main application component
const AppContent = () => {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="loader-container">
        <div className="loader"></div>
        <p>Loading application...</p>
      </div>
    );
  }

  return (
    <div className="app-container fade-in">
      {!isAuthenticated ? (
        <div className="login-container">
          <h1>OKD Deployment App</h1>
          <p>
            A simple application that helps you deploy containerized applications to OpenShift/OKD clusters
            without needing to manually create deployment files.
          </p>
          <button
            onClick={() => loginWithRedirect()}
            className="btn btn-primary btn-lg"
          >
            Log in to continue
          </button>
        </div>
      ) : (
        <>
          <header className="header">
            <div className="header-content">
              <h1 className="app-title">OKD WebUI</h1>
              <div className="user-section">
                <span>Welcome, {user?.name || 'User'}</span>
                {isAdmin && <span className="admin-badge">Admin</span>}
                <button
                  onClick={() => logout({ returnTo: window.location.origin })}
                  className="btn btn-outline btn-sm"
                >
                  Log out
                </button>
              </div>
            </div>
          </header>
          <main className="app-container">
            <RequireAdmin fallback={<AccessDenied />}>
              <DeploymentForm />
            </RequireAdmin>
          </main>
        </>
      )}
    </div>
  );
};

// Wrapper component that provides the AuthProvider
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
