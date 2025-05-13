import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";

// Create the auth context
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const {
    isAuthenticated,
    loginWithRedirect,
    logout,
    getIdTokenClaims,
    user,
    isLoading,
  } = useAuth0();

  const [accessToken, setAccessToken] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const getToken = async () => {
      if (isAuthenticated) {
        try {
          const claims = await getIdTokenClaims();
          if (claims) {
            setAccessToken(claims.__raw);

            // Extract roles from JWT claims using environment variable for namespace
            const namespace = window._env_?.REACT_APP_AUTH0_NAMESPACE || '';

            // Try both formats: "namespace" and "namespace_roles"
            const namespaceRoles = `${namespace}_roles`;
            let roles = claims[namespace] || claims[namespaceRoles] || [];
            const rolesArray = Array.isArray(roles) ? roles : [];
            setUserRoles(rolesArray);

            // Check if user has admin role
            const adminRoleName = window._env_?.REACT_APP_ADMIN_ROLE_NAME;
            setIsAdmin(rolesArray.includes(adminRoleName));

            console.log('User claims:', claims);
            console.log('Looking for roles in namespace:', namespace, 'or', namespaceRoles);
            console.log('User roles found:', rolesArray);
            console.log('Admin role name:', adminRoleName);
            console.log('Is admin:', rolesArray.includes(adminRoleName));
          }
        } catch (error) {
          console.error("Error getting token claims:", error);
        }
      } else {
        setAccessToken(null);
        setUserRoles([]);
        setIsAdmin(false);
      }
    };

    if (!isLoading) {
      getToken();
    }
  }, [isAuthenticated, getIdTokenClaims, isLoading]);

const getRedirectUrl = () => {
  // Use API URL for redirection if available
  if (window._env_?.REACT_APP_API_URL) {
    const apiUrl = window._env_.REACT_APP_API_URL;

    // If API URL is a relative path ("/"), we need to combine it with origin
    if (apiUrl.startsWith("/")) {
      return `${window.location.origin}${apiUrl === "/" ? "" : apiUrl}`;
    }

    return apiUrl;
  }

  // Otherwise fallback to current origin
  return window.location.origin;
};

// Create a wrapper for the logout function
const logoutWithRedirect = () => {
  const redirectUrl = getRedirectUrl();
  console.log('Logout redirecting to:', redirectUrl);
  logout({
    logoutParams: {
      returnTo: redirectUrl
    }
  });
};

const contextValue = {
  isAuthenticated,
  loginWithRedirect,
  logout: logoutWithRedirect,
  user,
  accessToken,
  userRoles,
  isAdmin,
  isLoading
};

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Optional component for protecting admin routes
export const RequireAdmin = ({ children, fallback }) => {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loader-container">
      <div className="loader"></div>
      <p>Checking permissions...</p>
    </div>;
  }

  return isAdmin ? children : (fallback ||
    <div className="access-denied">
      <h2>Access Denied</h2>
      <p>You do not have the required admin privileges to access this resource.</p>
    </div>
  );
};
