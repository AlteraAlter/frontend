let logsRoot = null;
let logsList = null;
let logsToggleBtn = null;

export function initLogsPanel() {
    logsRoot = document.querySelector("#logsPanel");
    logsList = document.querySelector("#logsList");
    logsToggleBtn = document.querySelector("#logsToggleBtn");
    const clearBtn = document.querySelector("#logsClearBtn");
    if (!logsRoot || !logsList || !logsToggleBtn || !clearBtn) return;

    logsToggleBtn.addEventListener("click", () => {
        const nextExpanded = logsRoot.getAttribute("data-expanded") !== "true";
        logsRoot.setAttribute("data-expanded", nextExpanded ? "true" : "false");
        logsToggleBtn.textContent = nextExpanded ? "Collapse" : "Expand";
    });

    clearBtn.addEventListener("click", () => {
        logsList.innerHTML = "";
    });
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
