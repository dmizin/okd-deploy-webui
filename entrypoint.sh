#!/bin/sh

echo "Generating runtime environment variables..."

# Create the env-config.js file dynamically at runtime
cat <<EOF > /app/frontend/env-config.js
window._env_ = {
  REACT_APP_AUTH0_DOMAIN: "$AUTH0_DOMAIN",
  REACT_APP_API_IDENTIFIER: "$API_IDENTIFIER",
  REACT_APP_AUTH0_NAMESPACE: "$AUTH0_NAMESPACE"
};
EOF

echo "Generated /app/frontend/env-config.js with:"
cat /app/frontend/env-config.js

# Start the application
exec "$@"
