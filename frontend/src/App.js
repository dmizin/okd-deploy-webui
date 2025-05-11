import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import DeploymentForm from './DeploymentForm';
import { AuthProvider, useAuth } from './AuthProvider';
import './styles.css'; // Import our new stylesheet

// Main application component
const AppContent = () => {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } = useAuth();

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
            <DeploymentForm />
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
