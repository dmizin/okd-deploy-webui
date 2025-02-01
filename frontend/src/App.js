import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import DeploymentForm from './DeploymentForm';

const App = () => {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } = useAuth0();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {!isAuthenticated ? (
        <button onClick={() => loginWithRedirect()}>Log in</button>
      ) : (
        <div>
          <h2>Welcome, {user.name}</h2>
          <button onClick={() => logout({ returnTo: window.location.origin })}>
            Log out
          </button>
          {/* Redirect to Deployment Form after login */}
          <DeploymentForm />
        </div>
      )}
    </div>
  );
};

export default App;
