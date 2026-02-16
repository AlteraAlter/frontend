import { sendFileRequest, getOperationConfig } from "../services/api.js";
import { initUploadProgressSocket } from "../modules/ws/uploadProgressSocket.js";
import { initCheckProgressSocket } from "../modules/ws/checkProgressSocket.js";
import { initDeleteProgressSocket } from "../modules/ws/deleteProgressSocket.js";
import {
    applyTaskSummaryFromResponse,
    mapOperationLabel,
    resetTaskUi,
    showTaskStatus,
    handleBackendStatusMessage,
} from "./taskStatus.js";
import { setMetricCardValue } from "./cards.js";
import { setProgressBarRunning } from "./progressBarStatus.js";
import {
    clearBackendResponsePreview,
    renderBackendResponsePreview,
} from "./backendResponsePreview.js";

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
    let selectedControllers = ["jv"];

    const renderConfirm = (fileName) => {
        const showControllerSelect =
            enableControllerSelect &&
            (fileSelectionContainer.getAttribute("modal-type") === "upload" ||
                fileSelectionContainer.getAttribute("modal-type") === "delete" ||
                fileSelectionContainer.getAttribute("modal-type") === "check");

        if (showControllerSelect && selectedControllers.length > 1) {
            selectedControllers = [selectedControllers[0]];
        }

        const controllerMarkup = showControllerSelect
            ? `<div class="flex items-center gap-6">
                    <label class="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="controller-jv" value="jv" ${selectedControllers.includes("jv") ? "checked" : ""}>
                        <span class="font-medium">JV</span>
                    </label>
                    <label class="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="controller-xl" value="xl" ${selectedControllers.includes("xl") ? "checked" : ""}>
                        <span class="font-medium">XL</span>
                    </label>
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
            const syncControllers = (changed) => {
                if (changed === "jv" && jvInput?.checked && xlInput) {
                    xlInput.checked = false;
                }
                if (changed === "xl" && xlInput?.checked && jvInput) {
                    jvInput.checked = false;
                }
                const next = [];
                if (jvInput?.checked) next.push("jv");
                if (xlInput?.checked) next.push("xl");
                selectedControllers = next;
                confirmButton.disabled = selectedControllers.length === 0;
            };
            jvInput?.addEventListener("change", () => syncControllers("jv"));
            xlInput?.addEventListener("change", () => syncControllers("xl"));
            syncControllers();
        }

        confirmButton.addEventListener("click", () =>
            sendRequest({
                operation: fileSelectionContainer.getAttribute("modal-type"),
                file: selectedFile,
                statusNode,
                confirmButton,
                backButton,
                onSuccess,
                controllers: selectedControllers,
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
    resetTaskUi({ total: 0, running: true });

    showTaskStatus({
        hasTask: true,
    });

    if (typeof onSuccess === "function") {
        onSuccess({ operation });
    }

    const initProgressSocket = getProgressSocketInitializer(operation);
    const usePostJobIdFlow = operation === "delete";
    const requestJobId = usePostJobIdFlow ? null : crypto.randomUUID();
    let progressSocket = null;
    if (!usePostJobIdFlow) {
        progressSocket = initProgressSocket(
            createProgressSocketHandlers({ operation, jobId: requestJobId })
        );
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

        if (!response?.ok) {
            const code = response ? response.status : "unknown";
            throw new Error(`Request failed with status ${code}`);
        }

        if (!usePostJobIdFlow && operation !== "check") {
            renderBackendResponsePreview({
                operation,
                payload: resolvePreviewPayload(responseBody),
            });
        }

        if (usePostJobIdFlow) {
            const wsJobId = extractWsJobId(responseBody);
            if (wsJobId) {
                clearBackendResponsePreview();
                progressSocket = initProgressSocket(
                    createProgressSocketHandlers({ operation, jobId: wsJobId })
                );
                if (statusNode) statusNode.textContent = "Задача запущена";
                return;
            }
            applyTaskSummaryFromResponse({
                operation,
                payload: responseBody,
            });
            setProgressBarRunning(false);
        }

        if (statusNode) statusNode.textContent = "Файл отправлен";
    } catch (error) {
        console.error(error);
        if (statusNode) statusNode.textContent = "Ошибка отправки файла";
        setProgressBarRunning(false);
        showTaskStatus({
            hasTask: true,
            message: "Ошибка отправки файла",
        });
        if (progressSocket && progressSocket.readyState === WebSocket.OPEN) {
            progressSocket.close();
        }
    } finally {
        if (confirmButton) confirmButton.disabled = false;
        if (backButton) backButton.disabled = false;
    }
}

async function normalizeWsData(data) {
    console.log(data);
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
        onMessage: async (event) => {
            const data = await normalizeWsData(event.data);
            const result = handleBackendStatusMessage(data);
            if (Object.prototype.hasOwnProperty.call(result || {}, "previewPayload")) {
                renderBackendResponsePreview({
                    operation,
                    payload: result.previewPayload,
                });
            }
            if (result?.done && event?.target) {
                event.target.close();
            }
        },
        onError: () => {
            setProgressBarRunning(false);
            showTaskStatus({
                hasTask: true,
                message: "Ошибка соединения",
            });
        },
    };
}

function extractWsJobId(responseBody) {
    if (!responseBody || typeof responseBody !== "object") return null;
    const candidate = responseBody.job_id || responseBody.jobId || null;
    const value = String(candidate || "").trim();
    return value || null;
}

function resolvePreviewPayload(responseBody) {
    if (!responseBody || typeof responseBody !== "object") return responseBody;
    if (Array.isArray(responseBody.result)) return responseBody.result;
    return responseBody;
}
