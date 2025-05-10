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

  useEffect(() => {
    const getToken = async () => {
      if (isAuthenticated) {
        try {
          const claims = await getIdTokenClaims();
          if (claims) {
            setAccessToken(claims.__raw);

            // Extract roles from JWT claims using environment variable for namespace
            const namespace = window._env_?.REACT_APP_AUTH0_NAMESPACE || [];
            const roles = claims[namespace] || [];
            setUserRoles(Array.isArray(roles) ? roles : []);
          }
        } catch (error) {
          console.error("Error getting token claims:", error);
        }
      } else {
        setAccessToken(null);
        setUserRoles([]);
      }
    };

    if (!isLoading) {
      getToken();
    }
  }, [isAuthenticated, getIdTokenClaims, isLoading]);

  // Value to be provided by the context
  const contextValue = {
    isAuthenticated,
    loginWithRedirect,
    logout,
    user,
    accessToken,
    userRoles,
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
