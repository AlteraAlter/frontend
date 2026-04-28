import { sendFileRequest, getOperationConfig } from "../services/api.js";
import {
    applyTaskSummaryFromResponse,
    resetTaskUi,
    showTaskStatus,
} from "./taskStatus.js";
import { setMetricCardValue } from "./cards.js";
import { setProgressBarRunning } from "./progressBarStatus.js";
import {
    clearBackendResponsePreview,
    renderBackendResponsePreview,
} from "./backendResponsePreview.js";
import {
    bindControllerSelector,
    DEFAULT_CONTROLLER,
    renderControllerSelectorMarkup,
} from "./controllerSelect.js";

// Shared uploader/checker/deleter file flow used by all action modals.
export function initFileSelect({
    fileSelectionContainer,
    fileInputSelector = "#file-upload",
    fileStatusSelector = "#uploadFileStatus",
    readyText = "Ready to upload",
    backText = "Back",
    confirmText = "Confirm",
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
    let selectedController = DEFAULT_CONTROLLER;

    const renderConfirm = (fileName) => {
        const showControllerSelect =
            enableControllerSelect &&
            (fileSelectionContainer.getAttribute("modal-type") === "upload" ||
                fileSelectionContainer.getAttribute("modal-type") === "delete" ||
                fileSelectionContainer.getAttribute("modal-type") === "check");
        const controllerGroupName = "task-controller";

        const controllerMarkup = showControllerSelect
            ? renderControllerSelectorMarkup({
                title: "Controller",
                groupName: controllerGroupName,
                idPrefix: "controller",
                selected: selectedController,
            })
            : "";

        // Replaces dropzone with an explicit confirmation step before network requests.
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
            bindControllerSelector(fileSelectionContainer, {
                groupName: controllerGroupName,
                onChange: (controller) => {
                    selectedController = controller || DEFAULT_CONTROLLER;
                    confirmButton.disabled = !selectedController;
                },
            });
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
        fileStatus.textContent = "No file selected";

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0] || null;
            const fileName = file?.name;
            if (!fileName || !file) {
                fileStatus.textContent = "No file selected";
                selectedFile = null;
                if (jsonCountCardKey) setMetricCardValue(jsonCountCardKey, 0);
                return;
            }

            if (jsonOnly) {
                const lowerName = fileName.toLowerCase();
                const isJson = file.type === "application/json" || lowerName.endsWith(".json");
                if (!isJson) {
                    fileStatus.textContent = "Only JSON files are allowed";
                    fileInput.value = "";
                    selectedFile = null;
                    if (jsonCountCardKey) setMetricCardValue(jsonCountCardKey, 0);
                    return;
                }
            }

            fileStatus.textContent = `Selected file: ${fileName}`;
            selectedFile = file;

            if (jsonOnly && jsonCountCardKey) {
                setMetricCardValue(jsonCountCardKey, 0);
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

export async function startOperationRequest({
    operation,
    controllers = [],
    triggerButton = null,
} = {}) {
    await sendRequest({
        operation,
        file: null,
        statusNode: null,
        confirmButton: triggerButton,
        backButton: null,
        onSuccess: null,
        controllers,
    });
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
    if (!operationConfig || operationConfig.disabled) {
        if (statusNode) statusNode.textContent = "Unknown operation";
        return;
    }

    const requiresFile = operationConfig.requiresFile !== false;
    if (requiresFile && !file) {
        if (statusNode) statusNode.textContent = "No file selected";
        return;
    }

    if (statusNode) statusNode.textContent = "Sending request...";
    if (confirmButton) confirmButton.disabled = true;
    if (backButton) backButton.disabled = true;
    clearBackendResponsePreview();

    showTaskStatus({ hasTask: true });
    resetTaskUi({ total: 0, running: true });

    if (typeof onSuccess === "function") {
        onSuccess({ operation });
    }

    try {
        const response = await sendFileRequest({
            operation,
            file,
            token: localStorage.getItem("jwt_access"),
            controllers,
        });
        const responseBody = await parseResponseBody(response);

        if (!response?.ok) {
            const code = response ? response.status : "unknown";
            const backendError = extractBackendError(responseBody);
            throw new Error(backendError || `Request failed with status ${code}`);
        }

        const previewPayload = normalizePreviewPayload(responseBody);
        if (previewPayload) {
            renderBackendResponsePreview({
                operation,
                payload: previewPayload,
            });
        }

        applyTaskSummaryFromResponse({
            operation,
            payload: previewPayload || responseBody,
        });

        const responseMessage =
            responseBody && typeof responseBody === "object"
                ? String(responseBody.message || "").trim()
                : "";
        if (statusNode) {
            statusNode.textContent = responseMessage || "Request accepted";
        }
    } catch (error) {
        console.error(error);
        if (statusNode) statusNode.textContent = "Request failed";
        showTaskStatus({ hasTask: true, message: "Request failed" });
    } finally {
        setProgressBarRunning(false);
        if (confirmButton) confirmButton.disabled = false;
        if (backButton) backButton.disabled = false;
    }
}

function extractBackendError(payload) {
    if (!payload) return null;
    if (typeof payload === "string") return payload;
    if (typeof payload !== "object") return null;

    const direct = payload.error || payload.detail || payload.message;
    if (typeof direct === "string" && direct.trim()) return direct.trim();

    if (Array.isArray(payload.file) && payload.file.length) {
        return String(payload.file[0]);
    }

    if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length) {
        return String(payload.non_field_errors[0]);
    }

    return null;
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

function normalizePreviewPayload(responseBody) {
    if (Array.isArray(responseBody)) return responseBody;
    if (!responseBody || typeof responseBody !== "object") return null;

    if (Array.isArray(responseBody.results)) return responseBody.results;
    if (Array.isArray(responseBody.result)) return responseBody.result;

    // Preserve current preview behavior for single-result shaped responses.
    if (
        responseBody.ean ||
        responseBody.title ||
        responseBody.price != null ||
        responseBody.storefront ||
        responseBody.status
    ) {
        return [responseBody];
    }

    return null;
}
