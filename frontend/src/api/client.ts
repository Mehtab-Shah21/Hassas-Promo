import axios from "axios";

const SERVER_URL_KEY = "server_url";
const BUILD_TIME_URL = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Resolves the backend's address at request time, not at module-load time.
 * On an admin-PC install the backend runs locally, so a build-time
 * VITE_API_URL (or the localhost default) is enough. On an employee install
 * (frontend-only, no local backend) there's no way to know the admin PC's
 * LAN address at build time — the user enters it once on first run via
 * ServerConfigGate, and it's persisted here so every request uses it.
 */
export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) || BUILD_TIME_URL || "http://localhost:8000";
}

export function setServerUrl(url: string) {
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ""));
}

export function hasConfiguredServerUrl(): boolean {
  return Boolean(localStorage.getItem(SERVER_URL_KEY) || BUILD_TIME_URL);
}

export function clearServerUrl() {
  localStorage.removeItem(SERVER_URL_KEY);
}

export const apiClient = axios.create();

export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${getServerUrl()}${path}`;
}

apiClient.interceptors.request.use((config) => {
  config.baseURL = getServerUrl();
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Respect an explicit per-request override (e.g. superadmin picking a
  // target company in a form that isn't the currently active business)
  // rather than always clobbering it with the globally active business.
  if (!config.headers["X-Business-Id"]) {
    const businessId = localStorage.getItem("active_business_id");
    if (businessId) {
      config.headers["X-Business-Id"] = businessId;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
