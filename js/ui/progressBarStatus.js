import { qs } from "../core/dom.js";

let statusNodes = null;
let progressNodes = null;

export function initProgressBarStatus({ success = 0, error = 0, queue = 0 } = {}) {
    const container = qs("#progressBarContainer");
    if (!container) {
        return;
    }
    if (statusNodes && progressNodes) {
        setProgressBarStatus({ success, error, queue });
        setProgressBarProgress({ processed: 0, total: 0 });
        setProgressBarRunning(true);
        return;
    }

    statusNodes = getStatusNodes(container);
    progressNodes = getProgressNodes(container);
    if (!statusNodes) {
        container.insertAdjacentHTML(
            "beforeend",
            buildStatusMarkup({ success, error, queue })
        );
        statusNodes = getStatusNodes(container);
    }
    if (!progressNodes) {
        progressNodes = getProgressNodes(container);
    }

    setProgressBarStatus({ success, error, queue });
    setProgressBarProgress({ processed: 0, total: 0 });
    setProgressBarRunning(true);
}

export function setProgressBarStatus({ success, error, queue } = {}) {
    if (!statusNodes) {
        const container = qs("#progressBarContainer");
        statusNodes = container ? getStatusNodes(container) : null;
    }
    if (!statusNodes) return;

    if (Number.isFinite(Number(success))) {
        statusNodes.success.textContent = success;
    }
    if (Number.isFinite(Number(error))) {
        statusNodes.error.textContent = error;
    }
    if (Number.isFinite(Number(queue))) {
        statusNodes.queue.textContent = queue;
    }
}

export function setProgressBarProgress({ processed, total } = {}) {
    if (!progressNodes) {
        const container = qs("#progressBarContainer");
        progressNodes = container ? getProgressNodes(container) : null;
    }
    if (!progressNodes) return;

    const totalValue = Number(total);
    const processedValue = Number(processed);
    if (!Number.isFinite(totalValue) || totalValue <= 0) {
        progressNodes.text.textContent = "0 / 0 обработано";
        progressNodes.bar.setAttribute("aria-valuenow", "0");
        progressNodes.bar.setAttribute("data-state", "determinate");
        progressNodes.fill.setAttribute("data-state", "determinate");
        progressNodes.fill.style.transform = "translateX(-100%)";
        setProgressBarRunning(false);
        return;
    }

    const safeProcessed = Number.isFinite(processedValue)
        ? Math.min(Math.max(0, processedValue), totalValue)
        : 0;
    const percent = Math.min(100, Math.max(0, (safeProcessed / totalValue) * 100));
    const translate = percent - 100;

    progressNodes.text.textContent = `${safeProcessed} / ${totalValue} обработано`;
    progressNodes.bar.setAttribute("aria-valuenow", String(Math.round(percent)));
    progressNodes.bar.setAttribute("data-state", "determinate");
    progressNodes.fill.setAttribute("data-state", "determinate");
    progressNodes.fill.style.transform = `translateX(${translate}%)`;
    setProgressBarRunning(percent < 100);
}

export function setProgressBarRunning(isRunning) {
    if (!progressNodes) {
        const container = qs("#progressBarContainer");
        progressNodes = container ? getProgressNodes(container) : null;
    }
    if (!progressNodes || !progressNodes.spinner) return;
    progressNodes.spinner.classList.toggle("is-paused", !isRunning);
    progressNodes.spinner.classList.toggle("is-hidden", !isRunning);
    progressNodes.spinner.setAttribute("aria-hidden", isRunning ? "false" : "true");
}

function getStatusNodes(container) {
    const success = container.querySelector('[data-progress-counter="success"]');
    const error = container.querySelector('[data-progress-counter="error"]');
    const queue = container.querySelector('[data-progress-counter="queue"]');
    if (!success || !error || !queue) return null;
    return { success, error, queue };
}

function getProgressNodes(container) {
    const text = container.querySelector("[data-progress-text]");
    const bar = container.querySelector("[data-progress-bar]");
    const fill = container.querySelector("[data-progress-fill]");
    const spinner = container.querySelector("[data-progress-spinner]");
    if (!text || !bar || !fill || !spinner) return null;
    return { text, bar, fill, spinner };
}

function buildStatusMarkup({ success, error, queue }) {
    return `<div class="flex gap-6 text-sm">
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24"
                height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                class="lucide lucide-circle-check w-4 h-4 text-success">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m9 12 2 2 4-4"></path>
            </svg>
            <span class="text-muted-foreground">Успешно:</span>
            <span class="font-mono-data font-medium" data-progress-counter="success">${success}</span>
        </div>
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24"
                height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                class="lucide lucide-triangle-alert w-4 h-4 text-destructive">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>
                <path d="M12 9v4"></path>
                <path d="M12 17h.01"></path>
            </svg>
            <span class="text-muted-foreground">Ошибки:</span>
            <span class="font-mono-data font-medium" data-progress-counter="error">${error}</span>
        </div>
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24"
                height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                class="lucide lucide-loader-circle w-4 h-4 text-warning">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span class="text-muted-foreground">В очереди:</span>
            <span class="font-mono-data font-medium" data-progress-counter="queue">${queue}</span>
        </div>
    </div>`;
}
