import { ENDPOINTS } from "../core/config.js";

// Central mapping for each bulk operation to backend endpoint + payload builder.
const OPERATION_CONFIG = {
    upload: {
        endpoint: ENDPOINTS.upload,
        buildFormData: (formData, file, jobId, controllers) => {
            formData.append("file", file);
            appendJobId(formData, jobId);
            formData.append("mode", "upload_collection");
            appendController(formData, controllers);
        },
    },
    check: {
        endpoint: ENDPOINTS.check,
        buildFormData: (formData, file, jobId, controllers) => {
            formData.append("file", file);
            appendJobId(formData, jobId);
            formData.append("mode", "checker");
            appendController(formData, controllers);
        },
    },
    delete: {
        endpoint: ENDPOINTS.delete,
        buildFormData: (formData, file, jobId, controllers) => {
            formData.append("file", file);
            formData.append("mode", "delete");
            appendController(formData, controllers);
        },
    },
};

export function getOperationConfig(operation) {
    return OPERATION_CONFIG[operation] || null;
}

export async function sendFileRequest({ operation, file, token, jobId, controllers = [] }) {
    const config = getOperationConfig(operation);
    if (!config || config.disabled) return null;

    const formData = new FormData();
    config.buildFormData(formData, file, jobId, controllers);

    const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });
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

export async function stopJobRequest({ jobId, token }) {
    if (!jobId) return null;
    const response = await fetch(ENDPOINTS.stopJob, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: String(jobId) }),
    });
    return response;
}

// Upload/check flows may include client-side job_id so websocket updates can be attached immediately.
function appendJobId(formData, jobId) {
    if (!jobId) return;
    formData.append("job_id", jobId);
}

// Backend accepts one controller value; UI keeps it as an array for shared modal logic.
function appendController(formData, controllers) {
    const selected = Array.isArray(controllers) ? controllers.find(Boolean) : null;
    formData.append("controller", selected || "jv");
}
