import { ENDPOINTS } from "../core/config.js";

// Central mapping for each bulk operation to backend endpoint + payload builder.
const OPERATION_CONFIG = {
    upload: {
        endpoint: ENDPOINTS.upload,
        requiresFile: true,
        buildFormData: (formData, file, controllers) => {
            formData.append("file", file);
            formData.append("mode", "upload_collection");
            appendController(formData, controllers);
        },
    },
    check: {
        endpoint: ENDPOINTS.check,
        requiresFile: true,
        buildFormData: (formData, file, controllers) => {
            formData.append("file", file);
            formData.append("mode", "checker");
            appendController(formData, controllers);
        },
    },
    delete: {
        endpoint: ENDPOINTS.delete,
        requiresFile: true,
        buildFormData: (formData, file, controllers) => {
            formData.append("file", file);
            formData.append("mode", "delete");
            appendController(formData, controllers);
        },
    },
    aftercool_sync: {
        endpoint: ENDPOINTS.aftercoolSync,
        requiresFile: false,
        method: "GET",
    },
};

export function getOperationConfig(operation) {
    return OPERATION_CONFIG[operation] || null;
}

export async function sendFileRequest({ operation, file, token, controllers = [] }) {
    const config = getOperationConfig(operation);
    if (!config || config.disabled) return null;

    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const method = String(config.method || "POST").toUpperCase();
    const requestInit = {
        method,
        headers,
    };

    if (method !== "GET") {
        const formData = new FormData();
        config.buildFormData(formData, file, controllers);
        requestInit.body = formData;
    }

    const response = await fetch(config.endpoint, requestInit);
    return response;
}

export async function sendEanRequest({ ean, token, controllers = [] }) {
    if (!ean) return null;
    const selected = Array.isArray(controllers) ? controllers.find(Boolean) : null;
    const payload = {
        controller: selected || "jv",
        mode: "checker",
        ean: String(ean),
    };

    const response = await fetch(ENDPOINTS.check, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    return response;
}

// Backend accepts one controller value; UI keeps it as an array for shared modal logic.
function appendController(formData, controllers) {
    const selected = Array.isArray(controllers) ? controllers.find(Boolean) : null;
    formData.append("controller", selected || "jv");
}
