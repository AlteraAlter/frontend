import { sendFileRequest, getOperationConfig, stopJobRequest } from "../services/api.js";
import { initUploadProgressSocket } from "../modules/ws/uploadProgressSocket.js";
import { initCheckProgressSocket } from "../modules/ws/checkProgressSocket.js";
import { initDeleteProgressSocket } from "../modules/ws/deleteProgressSocket.js";
import {
    applyTaskSummaryFromResponse,
    mapOperationLabel,
    showTaskStatus,
    handleBackendStatusMessage,
} from "./taskStatus.js";
import { setMetricCardValue } from "./cards.js";
import { setProgressBarRunning } from "./progressBarStatus.js";
import {
    clearBackendResponsePreview,
    renderBackendResponsePreview,
} from "./backendResponsePreview.js";
import { addLog } from "./logsPanel.js";

let activeTask = null;
let stopButtonBound = false;

export function initFileSelect({
    fileSelectionContainer,
    fileInputSelector = "#file-upload",
    fileStatusSelector = "#uploadFileStatus",
    readyText = "Готов к загрузке",
    backText = "Отмена",
    confirmText = "Подтвердить",
    jsonOnly = false,
    jsonCountCardKey = null,
    onSuccess,
    enableControllerSelect = false,
    floatingCloseButtonId = null,
}) {
    if (!fileSelectionContainer) return;

    const originalHTML = fileSelectionContainer.innerHTML;
    const cancelButton = document.getElementById("multiBackBtn");
    const floatingCloseButtonHTML = floatingCloseButtonId
        ? fileSelectionContainer.querySelector(`#${floatingCloseButtonId}`)?.outerHTML || ""
        : "";
    let selectedFile = null;
    let selectedController = "jv";

    const renderConfirm = (fileName) => {
        const showControllerSelect =
            enableControllerSelect &&
            (fileSelectionContainer.getAttribute("modal-type") === "upload" ||
                fileSelectionContainer.getAttribute("modal-type") === "delete" ||
                fileSelectionContainer.getAttribute("modal-type") === "check");

        const controllerMarkup = showControllerSelect
            ? `<div class="space-y-2">
                    <p class="text-sm font-medium leading-none">Контроллер</p>
                    <div class="flex items-center gap-6 controller-radio-group">
                        <label class="inline-flex items-center gap-2 cursor-pointer controller-radio-option">
                            <input type="radio" name="bulk-controller" id="controller-jv" value="jv" ${selectedController === "jv" ? "checked" : ""}>
                            <span class="font-medium">JV</span>
                        </label>
                        <label class="inline-flex items-center gap-2 cursor-pointer controller-radio-option">
                            <input type="radio" name="bulk-controller" id="controller-xl" value="xl" ${selectedController === "xl" ? "checked" : ""}>
                            <span class="font-medium">XL</span>
                        </label>
                    </div>
                </div>`
            : "";

        fileSelectionContainer.innerHTML = `
            <div class="space-y-4" id="confirm-action-container">
                <div class="p-4 bg-secondary border rounded-lg" id="confirmContainer">
                    <p class="text-body text-foreground font-medium" id="confirm-file-name"></p>
                    <p class="text-caption text-muted-foreground mt-1" id="confirm-file-status">${readyText}</p>
                </div>
                ${controllerMarkup}
                <div class="flex gap-2 space-y-4">
                    <button id="back-button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 flex-1">
                        ${backText}
                    </button>
                    <button id="confirm-button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 flex-1">
                        ${confirmText}
                    </button>
                </div>
            </div>`;
        if (floatingCloseButtonHTML) {
            fileSelectionContainer.insertAdjacentHTML("beforeend", floatingCloseButtonHTML);
        }

        const fileNameNode = fileSelectionContainer.querySelector("#confirm-file-name");
        if (fileNameNode) {
            fileNameNode.textContent = fileName;
        }

        const backButton = fileSelectionContainer.querySelector("#back-button");
        if (backButton) {
            backButton.addEventListener("click", () => {
                restoreInitial();
            });
        }

        const confirmButton = fileSelectionContainer.querySelector("#confirm-button");
        const statusNode = fileSelectionContainer.querySelector("#confirm-file-status");

        if (showControllerSelect && confirmButton) {
            const jvInput = fileSelectionContainer.querySelector("#controller-jv");
            const xlInput = fileSelectionContainer.querySelector("#controller-xl");
            const syncController = () => {
                if (xlInput?.checked) selectedController = "xl";
                else selectedController = "jv";
                confirmButton.disabled = !selectedController;
            };
            jvInput?.addEventListener("change", syncController);
            xlInput?.addEventListener("change", syncController);
            syncController();
        }

        confirmButton.addEventListener("click", () =>
            sendRequest({
                operation: fileSelectionContainer.getAttribute("modal-type"),
                file: selectedFile,
                statusNode,
                confirmButton,
                backButton,
                onSuccess,
                controllers: [selectedController],
            })
        );

        if (cancelButton) {
            cancelButton.style.display = "none";
        }

        if (fileSelectionContainer.getAttribute("modal-type") === "delete") {
            const confirmContainer = fileSelectionContainer.querySelector("#confirmContainer");
            if (confirmContainer) {
                confirmContainer.classList.replace("bg-secondary", "bg-destructive/10");
                confirmContainer.classList.add("border", "border-destructive/20");
            }
        }
    };

    const bindFileInput = () => {
        const fileInput = fileSelectionContainer.querySelector(fileInputSelector);
        const fileStatus = fileSelectionContainer.querySelector(fileStatusSelector);

        if (!fileInput || !fileStatus) return;

        fileInput.value = "";
        selectedFile = null;
        fileStatus.textContent = "Файл не выбран";

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0] || null;
            const fileName = file?.name;
            if (!fileName || !file) {
                fileStatus.textContent = "Файл не выбран";
                selectedFile = null;
                if (jsonCountCardKey) setMetricCardValue(jsonCountCardKey, 0);
                return;
            }

            if (jsonOnly) {
                const lowerName = fileName.toLowerCase();
                const isJson = file.type === "application/json" || lowerName.endsWith(".json");
                if (!isJson) {
                    fileStatus.textContent = "Допускаются только JSON файлы";
                    fileInput.value = "";
                    selectedFile = null;
                    if (jsonCountCardKey) setMetricCardValue(jsonCountCardKey, 0);
                    return;
                }
            }

            fileStatus.textContent = `Выбран файл: ${fileName}`;
            selectedFile = file;

            if (jsonOnly && jsonCountCardKey) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (!Array.isArray(data)) {
                        fileStatus.textContent = "Неверный формат JSON: ожидается массив";
                        selectedFile = null;
                        fileInput.value = "";
                        setMetricCardValue(jsonCountCardKey, 0);
                        return;
                    }
                    setMetricCardValue(jsonCountCardKey, data.length);
                } catch (error) {
                    console.error(error);
                    fileStatus.textContent = "Ошибка чтения JSON файла";
                    selectedFile = null;
                    fileInput.value = "";
                    setMetricCardValue(jsonCountCardKey, 0);
                    return;
                }
            }
            renderConfirm(fileName);
        });
    };

    const restoreInitial = () => {
        fileSelectionContainer.innerHTML = originalHTML;
        if (cancelButton) cancelButton.style.display = "block";
        if (jsonCountCardKey) setMetricCardValue(jsonCountCardKey, 0);
        bindFileInput();
    };

    bindFileInput();
}

async function sendRequest({
    operation,
    file,
    statusNode,
    confirmButton,
    backButton,
    onSuccess,
    controllers = [],
}) {
    ensureStopButtonBinding();

    const operationConfig = operation ? getOperationConfig(operation) : null;
    if (!operationConfig) {
        if (statusNode) statusNode.textContent = "Неизвестная операция";
        return;
    }
    if (operationConfig.disabled) {
        return;
    }

    if (!file) {
        if (statusNode) statusNode.textContent = "Файл не выбран";
        return;
    }

    if (statusNode) statusNode.textContent = "Отправка файла...";
    if (confirmButton) confirmButton.disabled = true;
    if (backButton) backButton.disabled = true;
    clearBackendResponsePreview();

    showTaskStatus({
        hasTask: true,
    });
    setProgressBarRunning(true);
    addLog(`${mapOperationLabel(operation)} started`);

    if (typeof onSuccess === "function") {
        onSuccess({ operation });
    }

    const initProgressSocket = getProgressSocketInitializer(operation);
    const usePostJobIdFlow = operation === "delete";
    const requestJobId = usePostJobIdFlow ? null : crypto.randomUUID();
    let progressSocket = null;
    const selectedController = Array.isArray(controllers) ? (controllers.find(Boolean) || "jv") : "jv";

    if (!usePostJobIdFlow) {
        progressSocket = initProgressSocket(
            createProgressSocketHandlers({ operation, jobId: requestJobId })
        );
        setActiveTask({
            operation,
            jobId: requestJobId,
            controller: selectedController,
            socket: progressSocket,
        });
    }

    try {
        const response = await sendFileRequest({
            operation,
            file,
            token: localStorage.getItem("jwt_access"),
            jobId: requestJobId,
            controllers,
        });
        const responseBody = await parseResponseBody(response);

        if (!response?.ok && operation !== "upload") {
            const code = response ? response.status : "unknown";
            throw new Error(`Request failed with status ${code}`);
        }

        if (usePostJobIdFlow) {
            const wsJobId = extractWsJobId(responseBody);
            if (wsJobId) {
                clearBackendResponsePreview();
                progressSocket = initProgressSocket(
                    createProgressSocketHandlers({ operation, jobId: wsJobId })
                );
                setActiveTask({
                    operation,
                    jobId: wsJobId,
                    controller: selectedController,
                    socket: progressSocket,
                });
                if (statusNode) statusNode.textContent = "Задача запущена";
                addLog(`${mapOperationLabel(operation)} task accepted (job_id: ${wsJobId})`);
                return;
            }
            applyTaskSummaryFromResponse({
                operation,
                payload: responseBody,
            });
            setProgressBarRunning(false);
            clearActiveTask();
        }

        if (statusNode) statusNode.textContent = "Файл отправлен";
        if (operation === "upload" && !response?.ok) {
            addLog("Upload finished with non-2xx HTTP response, waiting websocket final state", "warn");
        }
    } catch (error) {
        console.error(error);
        if (statusNode) statusNode.textContent = "Ошибка отправки файла";
        setProgressBarRunning(false);
        showTaskStatus({
            hasTask: true,
            message: "Ошибка отправки файла",
        });
        addLog(`${mapOperationLabel(operation)} request failed: ${error?.message || "unknown error"}`, "error");
        if (progressSocket && progressSocket.readyState === WebSocket.OPEN) {
            progressSocket.close();
        }
        clearActiveTask();
    } finally {
        if (confirmButton) confirmButton.disabled = false;
        if (backButton) backButton.disabled = false;
    }
}

async function normalizeWsData(data) {
    if (data instanceof Blob) {
        return await data.text();
    }
    if (data instanceof ArrayBuffer) {
        return new TextDecoder().decode(data);
    }
    return data;
}

async function parseResponseBody(response) {
    if (!response) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function getProgressSocketInitializer(operation) {
    switch (operation) {
        case "upload":
            return initUploadProgressSocket;
        case "check":
            return initCheckProgressSocket;
        case "delete":
            return initDeleteProgressSocket;
        default:
            return initUploadProgressSocket;
    }
}

function createProgressSocketHandlers({ operation, jobId }) {
    return {
        jobId,
        onOpen: () => {
            addLog(`${mapOperationLabel(operation)} websocket connected`);
        },
        onMessage: async (event) => {
            const data = await normalizeWsData(event.data);
            const result = handleBackendStatusMessage(data);
            if (Object.prototype.hasOwnProperty.call(result || {}, "previewPayload")) {
                if (
                    (operation === "upload" || operation === "delete") &&
                    Array.isArray(result.previewPayload) &&
                    result.previewPayload.length === 0
                ) {
                    clearBackendResponsePreview();
                } else {
                    renderBackendResponsePreview({
                        operation,
                        payload: result.previewPayload,
                    });
                }
            }
            if (result?.done && event?.target) {
                event.target.close();
                clearActiveTask();
            }
        },
        onError: () => {
            setProgressBarRunning(false);
            showTaskStatus({
                hasTask: true,
                message: "Ошибка соединения",
            });
            addLog(`${mapOperationLabel(operation)} websocket error`, "error");
        },
        onClose: () => {
            addLog(`${mapOperationLabel(operation)} websocket closed`);
        },
    };
}

function extractWsJobId(responseBody) {
    if (!responseBody || typeof responseBody !== "object") return null;
    const candidate = responseBody.job_id || responseBody.jobId || null;
    const value = String(candidate || "").trim();
    return value || null;
}

function ensureStopButtonBinding() {
    if (stopButtonBound) return;
    const button = document.getElementById("stopTaskBtn");
    if (!button) return;
    button.addEventListener("click", () => {
        requestStopActiveTask();
    });
    stopButtonBound = true;
}

function setActiveTask(task) {
    activeTask = {
        operation: task.operation,
        jobId: task.jobId,
        controller: task.controller,
        socket: task.socket || null,
        stopRequested: false,
    };
    setStopButtonEnabled(true);
}

function clearActiveTask() {
    activeTask = null;
    setStopButtonEnabled(false);
}

function setStopButtonEnabled(enabled) {
    const button = document.getElementById("stopTaskBtn");
    if (!button) return;
    button.disabled = !enabled;
}

async function requestStopActiveTask() {
    if (!activeTask || !activeTask.jobId) return;
    if (activeTask.stopRequested) return;

    activeTask.stopRequested = true;
    setStopButtonEnabled(false);
    addLog(`Stop requested for job ${activeTask.jobId}`, "warn");

    try {
        await stopJobRequest({
            jobId: activeTask.jobId,
            token: localStorage.getItem("jwt_access"),
        });
        addLog(`Stop sent for job ${activeTask.jobId}`, "warn");
    } catch (error) {
        addLog(`Failed to stop job ${activeTask.jobId}: ${error?.message || "unknown error"}`, "error");
        activeTask.stopRequested = false;
        setStopButtonEnabled(true);
    }
}
