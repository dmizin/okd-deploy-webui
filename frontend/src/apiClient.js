import axios from "axios";
import { useAuth } from "./AuthProvider";

export const useApiClient = () => {
    const { accessToken } = useAuth();
    const apiClient = axios.create({ baseURL: "http://localhost:5000" });
    
    apiClient.interceptors.request.use(config => {
        if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
        return config;
    }, error => Promise.reject(error));

    return apiClient;
};