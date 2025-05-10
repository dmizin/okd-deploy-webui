import React from 'react';
import ReactDOM from 'react-dom';
import { Auth0Provider } from '@auth0/auth0-react';
import App from './App';

// Get Auth0 configuration from environment variables
const getAuth0Config = () => {
  if (!window._env_) {
    console.error('Environment variables not available. Make sure env-config.js is loaded.');
    return {
      domain: '',
      clientId: '',
      audience: ''
    };
  }

  return {
    domain: window._env_.REACT_APP_AUTH0_DOMAIN,
    clientId: window._env_.REACT_APP_CLIENT_ID, // This should match the env var name in docker-compose
    audience: window._env_.REACT_APP_API_IDENTIFIER
  };
};

const auth0Config = getAuth0Config();

// Log configuration for debugging (remove in production)
console.log('Auth0 Config:', {
  domain: auth0Config.domain,
  clientId: auth0Config.clientId,
  audience: auth0Config.audience
});

// Function to handle redirect callback after authentication
const onRedirectCallback = (appState) => {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

ReactDOM.render(
  <Auth0Provider
    domain={auth0Config.domain}
    clientId={auth0Config.clientId}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: auth0Config.audience,
    }}
    onRedirectCallback={onRedirectCallback}
  >
    <App />
  </Auth0Provider>,
  document.getElementById('root')
);
