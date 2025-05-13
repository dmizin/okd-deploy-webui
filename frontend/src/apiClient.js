import axios from "axios";
import { useAuth } from "./AuthProvider";

export const useApiClient = () => {
    // Get authentication data from context
    const auth = useAuth();
    const { accessToken } = auth || {};

    // Create API client with base URL
    const baseURL = window._env_?.REACT_APP_API_URL || process.env.REACT_APP_API_URL || "http://localhost:5000";
    const apiClient = axios.create({
        baseURL,
        timeout: 15000, // 15 second timeout - OKD commands might take time
        headers: {
            'Content-Type': 'application/json'
        }
    });

    // Add auth token to requests if available
    apiClient.interceptors.request.use(config => {
        // Only add the token if it exists
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    }, error => {
        console.error("Request error in interceptor:", error);
        return Promise.reject(error);
    });

    // Add response interceptor for common error handling
    apiClient.interceptors.response.use(
        response => response,
        error => {
            // Log the error for debugging
            console.error("API Response Error:", error);

            // Handle specific error cases
            if (error.code === 'ERR_NETWORK') {
                console.error("Network Error: Unable to connect to the backend server.");
            } else if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error(`Server Error ${error.response.status}:`, error.response.data);
            } else if (error.request) {
                // The request was made but no response was received
                console.error("No response received:", error.request);
            }

            return Promise.reject(error);
        }
    );

    // In-memory cache
    const cache = {
        clusterData: null,
        clusterDataTimestamp: 0,
        ttl: 5 * 60 * 1000 // 5 minutes
    };

    // API methods
    const methods = {
        // Check if the user has admin role
        checkAdminAccess: () => {
            console.log("Checking admin access");
            return apiClient.get("/api/check-admin")
                .then(response => response)
                .catch(error => {
                    console.error("Admin access check error:", error);
                    return {
                        data: {
                            status: "error",
                            message: error.response?.data?.message || error.message || "Access denied"
                        }
                    };
                });
        },

        // Debug token claims
        debugToken: () => {
            console.log("Debugging token claims");
            return apiClient.get("/api/debug-token")
                .then(response => response)
                .catch(error => {
                    console.error("Token debug error:", error);
                    return {
                        data: {
                            status: "error",
                            message: error.response?.data?.message || error.message || "Debug failed"
                        }
                    };
                });
        },

        // Check authentication with OpenShift
        authenticate: () => {
            console.log("Checking authentication status");
            return apiClient.get("/api/authenticate")
                .catch(error => {
                    console.error("Authentication error:", error);
                    return {
                        data: {
                            status: "error",
                            message: error.message || "Authentication failed"
                        }
                    };
                });
        },

        // Generate YAML from form data
        generateYaml: (data) => apiClient.post("/generate-yaml", data),

        // Deploy application to OKD
        deployToOKD: (data) => apiClient.post("/deploy-to-okd", data),

        // Fetch all cluster data in a single call (namespaces and storage classes)
        getClusterData: () => {
            // Check cache first
            const now = Date.now();
            if (cache.clusterData && (now - cache.clusterDataTimestamp < cache.ttl)) {
                console.log("Using cached cluster data");
                return Promise.resolve(cache.clusterData);
            }

            console.log("Fetching fresh cluster data");
            return apiClient.get("/api/cluster-data")
                .then(response => {
                    // Cache the response
                    cache.clusterData = response;
                    cache.clusterDataTimestamp = now;
                    return response;
                })
                .catch(error => {
                    console.error("Error fetching cluster data:", error);
                    return {
                        data: {
                            status: "error",
                            message: error.message || "Failed to fetch cluster data",
                            namespaces: [],
                            storageClasses: []
                        }
                    };
                });
        },

        // These individual methods are kept for backward compatibility
        // but they'll use the combined endpoint and cache when possible
        getNamespaces: () => {
            // Try to use cached cluster data first
            const now = Date.now();
            if (cache.clusterData && (now - cache.clusterDataTimestamp < cache.ttl)) {
                console.log("Using cached namespaces from cluster data");
                return Promise.resolve({
                    data: {
                        status: "success",
                        namespaces: cache.clusterData.data.namespaces
                    }
                });
            }

            // Otherwise use getClusterData to refresh everything
            return methods.getClusterData().then(response => {
                return {
                    data: {
                        status: response.data.status === "error" ? "error" : "success",
                        message: response.data.namespacesError,
                        namespaces: response.data.namespaces || []
                    }
                };
            });
        },

        getStorageClasses: () => {
            // Try to use cached cluster data first
            const now = Date.now();
            if (cache.clusterData && (now - cache.clusterDataTimestamp < cache.ttl)) {
                console.log("Using cached storage classes from cluster data");
                return Promise.resolve({
                    data: {
                        status: "success",
                        storageClasses: cache.clusterData.data.storageClasses
                    }
                });
            }

            // Otherwise use getClusterData to refresh everything
            return methods.getClusterData().then(response => {
                return {
                    data: {
                        status: response.data.status === "error" ? "error" : "success",
                        message: response.data.storageClassesError,
                        storageClasses: response.data.storageClasses || []
                    }
                };
            });
        },

        // Method to clear the cache
        clearCache: () => {
            cache.clusterData = null;
            cache.clusterDataTimestamp = 0;
        }
    };

    return {
        ...apiClient,
        ...methods,
        isAuthenticated: !!accessToken
    };
};
