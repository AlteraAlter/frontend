const RUNTIME_CONFIG = window.__APP_CONFIG__ || {};
const STORAGE_API_KEY = "api_base_url";

function getBaseUrl() {
    if (RUNTIME_CONFIG.baseUrl) return normalizeBaseUrl(RUNTIME_CONFIG.baseUrl);

    const saved = localStorage.getItem(STORAGE_API_KEY);
    if (saved) return normalizeBaseUrl(saved);

    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        return stripTrailingSlash(window.location.origin);
    }

    return "http://127.0.0.1:8050";
}

function normalizeBaseUrl(value) {
    const trimmed = stripTrailingSlash(value);
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/")) {
        return stripTrailingSlash(`${window.location.origin}${trimmed}`);
    }
    return stripTrailingSlash(`http://${trimmed}`);
}

function stripTrailingSlash(value) {
    return String(value || "").replace(/\/+$/g, "");
}

export const BASE_URL = getBaseUrl();

export const ENDPOINTS = {
    upload: `${BASE_URL}/api/kaufland_main/upload_json/`,
    check: `${BASE_URL}/api/kaufland_main/`,
    delete: `${BASE_URL}/api/kaufland_main/`,
    aftercoolSync: `${BASE_URL}/api/aftercool_login/`,
};
