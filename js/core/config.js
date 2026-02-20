export const BASE_URL = "http://192.168.0.129:8050";
export const WS_BASE_URL = "ws://192.168.0.129:8050";

export const ENDPOINTS = {
    upload: `${BASE_URL}/api/kaufland_main/upload_json/`,
    check: `${BASE_URL}/api/kaufland_main/`,
    delete: `${BASE_URL}/api/kaufland_main/`,
    stopJob: `${BASE_URL}/api/kaufland_main/stop_job/`,
};

export const WS_ENDPOINTS = {
    uploadProgress: "/ws/upload-progress/",
    checkerProgress: "/ws/checker-progress",
    deleteProgress: "/ws/delete-progress",
};
