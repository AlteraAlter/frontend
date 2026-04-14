let logsRoot = null;
let logsList = null;
let logsToggleBtn = null;
let logsResizeHandle = null;
let manualExpandedHeight = null;
let isDragging = false;
let dragStartY = 0;
let dragStartHeight = 0;
let minHeight = 0;
let maxHeight = 0;
const DEFAULT_EXPANDED_HEIGHT = "14rem";

function getDefaultExpandedHeight() {
    if (!logsRoot) return DEFAULT_EXPANDED_HEIGHT;
    const prevExpanded = logsRoot.getAttribute("data-expanded");
    const prevInline = logsRoot.style.getPropertyValue("--logs-max-height");
    logsRoot.style.removeProperty("--logs-max-height");
    logsRoot.setAttribute("data-expanded", "true");
    const computed = getComputedStyle(logsRoot)
        .getPropertyValue("--logs-max-height")
        .trim();
    if (prevExpanded) {
        logsRoot.setAttribute("data-expanded", prevExpanded);
    } else {
        logsRoot.setAttribute("data-expanded", "false");
    }
    if (prevInline) {
        logsRoot.style.setProperty("--logs-max-height", prevInline);
    }
    return computed || DEFAULT_EXPANDED_HEIGHT;
}

export function initLogsPanel() {
    logsRoot = document.querySelector("#logsPanel");
    logsList = document.querySelector("#logsList");
    logsToggleBtn = document.querySelector("#logsToggleBtn");
    logsResizeHandle = document.querySelector("#logsResizeHandle");
    const clearBtn = document.querySelector("#logsClearBtn");
    if (!logsRoot || !logsList || !logsToggleBtn || !clearBtn) return;

    const header = logsRoot.querySelector(".logs-header");
    minHeight = header?.offsetHeight || 44;
    maxHeight = Math.max(minHeight + 120, Math.floor(window.innerHeight * 0.7));

    logsToggleBtn.addEventListener("click", () => {
        const nextExpanded = logsRoot.getAttribute("data-expanded") !== "true";
        logsRoot.setAttribute("data-expanded", nextExpanded ? "true" : "false");
        if (nextExpanded) {
            if (manualExpandedHeight) {
                logsRoot.style.setProperty("--logs-max-height", `${manualExpandedHeight}px`);
            } else {
                logsRoot.style.setProperty("--logs-max-height", getDefaultExpandedHeight());
            }
        } else {
            logsRoot.style.setProperty("--logs-max-height", `${minHeight}px`);
        }
        logsToggleBtn.textContent = nextExpanded ? "Collapse" : "Expand";
    });

    clearBtn.addEventListener("click", () => {
        logsList.innerHTML = "";
    });

    if (logsResizeHandle) {
        const startDrag = (clientY) => {
            isDragging = true;
            dragStartY = clientY;
            dragStartHeight = logsRoot.getBoundingClientRect().height;
            logsRoot.style.transition = "none";
            document.body.style.userSelect = "none";
        };

        const updateDrag = (clientY) => {
            if (!isDragging) return;
            const delta = dragStartY - clientY;
            let nextHeight = dragStartHeight + delta;
            nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight));
            logsRoot.style.setProperty("--logs-max-height", `${nextHeight}px`);
            manualExpandedHeight = nextHeight > minHeight ? nextHeight : null;
            const isExpanded = nextHeight > minHeight + 4;
            logsRoot.setAttribute("data-expanded", isExpanded ? "true" : "false");
            logsToggleBtn.textContent = isExpanded ? "Collapse" : "Expand";
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            logsRoot.style.transition = "";
            document.body.style.userSelect = "";
        };

        logsResizeHandle.addEventListener("mousedown", (event) => {
            startDrag(event.clientY);
        });

        window.addEventListener("mousemove", (event) => {
            updateDrag(event.clientY);
        });

        window.addEventListener("mouseup", endDrag);

        logsResizeHandle.addEventListener("touchstart", (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            startDrag(touch.clientY);
        }, { passive: true });

        window.addEventListener("touchmove", (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            updateDrag(touch.clientY);
        }, { passive: true });

        window.addEventListener("touchend", endDrag);
    }
}

export function addLog(message, level = "info") {
    if (!message) return;
    if (!logsList) {
        logsList = document.querySelector("#logsList");
    }
    if (!logsList) return;

    const item = document.createElement("li");
    item.className = `logs-item logs-${normalizeLevel(level)}`;
    item.textContent = `[${formatTimestamp(new Date())}] ${message}`;
    logsList.prepend(item);
}

function formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeLevel(level) {
    const normalized = String(level || "").toLowerCase();
    if (normalized === "error" || normalized === "warn" || normalized === "success") {
        return normalized;
    }
    return "info";
}
