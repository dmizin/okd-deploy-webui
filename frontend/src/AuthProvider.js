import React, { createContext, useContext, useState, useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const {
    isAuthenticated,
    loginWithRedirect,
    logout,
    getIdTokenClaims,
    user,
  } = useAuth0();
  const [accessToken, setAccessToken] = useState(null);
  const [userRoles, setUserRoles] = useState([]);

  useEffect(() => {
    const getToken = async () => {
      if (isAuthenticated) {
        const claims = await getIdTokenClaims();
        setAccessToken(claims.__raw);

        // Extract roles from JWT claims using environment variable for namespace
        const roles = claims[process.env.AUTH0_NAMESPACE] || [];
        setUserRoles(roles);
      } else {
        loginWithRedirect();
      }
    };
    getToken();
  }, [isAuthenticated, getIdTokenClaims, loginWithRedirect]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        loginWithRedirect,
        logout,
        user,
        accessToken,
        userRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
