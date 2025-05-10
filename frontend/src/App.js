import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import DeploymentForm from './DeploymentForm';
import { AuthProvider, useAuth } from './AuthProvider';

// Main application component
const AppContent = () => {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {!isAuthenticated ? (
        <div>
          <h1>OKD Deployment App</h1>
          <p>Please log in to access the deployment tool</p>
          <button
            onClick={() => loginWithRedirect()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Log in
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            borderBottom: '1px solid #eee'
          }}>
            <h2>Welcome, {user?.name || 'User'}</h2>
            <button
              onClick={() => logout({ returnTo: window.location.origin })}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Log out
            </button>
          </div>
          <DeploymentForm />
        </div>
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
