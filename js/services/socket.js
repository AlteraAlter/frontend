import { WS_BASE_URL } from "../core/config.js";

export function createWebSocket(path, handlers = {}, options = {}) {
    const { onOpen, onMessage, onClose, onError } = handlers;
    const { params, suffix } = options;
    const socket = new WebSocket(buildWsUrl(path, suffix));

    socket.onopen = (event) => {
        if (typeof onOpen === "function") onOpen(event, socket);
    };

    socket.onmessage = (event) => {
        if (typeof onMessage === "function") onMessage(event, socket);
    };

    socket.onerror = (event) => {
        if (typeof onError === "function") onError(event, socket);
    };

    socket.onclose = (event) => {
        if (typeof onClose === "function") onClose(event, socket);
    };

    return socket;
}

function buildWsUrl(path, suffix) {
    const isFullUrl = /^wss?:\/\//i.test(path);
    const base = WS_BASE_URL.endsWith("/") ? WS_BASE_URL.slice(0, -1) : WS_BASE_URL;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    let url = isFullUrl ? path : `${base}${normalizedPath}`;

    if (suffix) {
        // Current backend contract expects job_id in query string for upload progress channel.
        const cleanSuffix = String(suffix).replace(/^\/+|\/+$/g, "");
        url = `${url.replace(/\/+$/g, "")}/?job_id=${cleanSuffix}`;
    } else {
        url = `${url.replace(/\/+$/g, "")}/`;
    }
    return url;
}
