#!/bin/sh

echo "Generating runtime environment variables..."

# Create the env-config.js file dynamically at runtime
cat <<EOF > /app/frontend/build/env-config.js
window._env_ = {
  REACT_APP_AUTH0_DOMAIN: "${AUTH0_DOMAIN}",
  REACT_APP_CLIENT_ID: "${REACT_APP_CLIENT_ID}",
  REACT_APP_API_IDENTIFIER: "${API_IDENTIFIER}",
  REACT_APP_AUTH0_NAMESPACE: "${AUTH0_NAMESPACE}",
  REACT_APP_ADMIN_ROLE_NAME: "${ADMIN_ROLE_NAME}"
  REACT_APP_ROUTE_DOMAINS: "${ROUTE_DOMAINS}"
};
EOF

echo "Generated /app/frontend/build/env-config.js with Auth0 configuration:"
echo "  Domain: ${AUTH0_DOMAIN}"
echo "  Client ID: ${REACT_APP_CLIENT_ID}"
echo "  API Identifier: ${API_IDENTIFIER}"
echo "  Namespace: ${AUTH0_NAMESPACE}"
echo "  Admin Role: ${ADMIN_ROLE_NAME}"
echo "  Route Domains: ${ROUTE_DOMAINS}"

# Start the application
exec "$@"
