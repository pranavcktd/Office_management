import axios from "axios";

export const TOKEN_STORAGE_KEY = "office_mgmt_token";
export const USER_STORAGE_KEY = "office_mgmt_user";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data?.details?.fieldErrors) {
      const first = Object.values(data.details.fieldErrors).flat()[0];
      if (typeof first === "string") return first;
    }
    if (typeof data?.error === "string") return data.error;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
