import { WS_ENDPOINTS } from "../../core/config.js";
import { createWebSocket } from "../../services/socket.js";

export function initUploadProgressSocket({
    jobId,
    onOpen,
    onMessage,
    onClose,
    onError,
} = {}) {
    const token = localStorage.getItem("jwt_access");
    const socket = createWebSocket(
        WS_ENDPOINTS.uploadProgress,
        {
            onOpen: (event, ws) => {
                if (typeof onOpen === "function") onOpen(event, ws);
            },
            onMessage: (event, ws) => {
                if (typeof onMessage === "function") onMessage(event, ws);
            },
            onError: (event, ws) => {
                if (typeof onError === "function") onError(event, ws);
            },
            onClose: (event, ws) => {
                if (typeof onClose === "function") onClose(event, ws);
            },
        },
        {
            params: token ? { token } : undefined,
            suffix: jobId,
        }
    );
    return socket;
}
