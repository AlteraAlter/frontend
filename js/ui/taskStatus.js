import { setMetricCardValue, setMetricCardText } from "./cards.js";
import {
    initProgressBarStatus,
    setProgressBarProgress,
    setProgressBarRunning,
    setProgressBarStatus,
} from "./progressBarStatus.js";
import { qs } from "../core/dom.js"
import { addLog } from "./logsPanel.js";

let liveJobRuntime = createEmptyRuntime();

export function showTaskStatus({ hasTask, message } = {}) {
    const noTaskContainer = qs("#no-task-container");
    const statusTaskContainer = qs("#status-taks-container");
    if (!noTaskContainer || !statusTaskContainer) return;
    if (typeof hasTask !== "boolean") return;

    if (hasTask) {
        const wasHidden = statusTaskContainer.style.display === "none" || !statusTaskContainer.style.display;
        statusTaskContainer.style.display = "block";
        noTaskContainer.style.display = "none";
        if (wasHidden) {
            initProgressBarStatus({ success: 0, error: 0, queue: 0 });
        }
    }
    else {
        noTaskContainer.style.display = "block";
        statusTaskContainer.style.display = "none";
    }
}

export function handleBackendStatusMessage(raw) {
    const parsed = parseSocketPayload(raw);
    if (!parsed) return { done: false };

    const { event, payload, info } = normalizeEvent(parsed);
    if (!event || !payload) return { done: false };

    switch (event) {
        case "job_started": {
            const total = toNumber(payload.total);
            resetLiveJobRuntime({ total, processed: 0, success: 0, error: 0 });
            const task = String(payload.task || "").toLowerCase();
            if (task === "delete") liveJobRuntime.mode = "delete";
            else if (task === "checker") liveJobRuntime.mode = "check";
            else if (task === "price_sync") liveJobRuntime.mode = "check";
            else liveJobRuntime.mode = "upload";
            addLog(`🚀 Job started: ${Number.isFinite(total) ? total : 0} items in queue`);
            if (Number.isFinite(total)) {
                setMetricCardValue("totalProducts", total);
                setMetricCardValue("success", 0);
                setMetricCardValue("remaining", total);
                setMetricCardValue("errors", 0);
            }
            setProgressBarStatus({
                success: 0,
                error: 0,
                queue: Number.isFinite(total) ? total : undefined,
            });
            if (Number.isFinite(total)) {
                setProgressBarProgress({ processed: 0, total });
            }
            showTaskStatus({
                hasTask: true
            });
            return { done: false };
        }
        case "item": {
            liveJobRuntime.mode = "check";
            const ean = String(payload.ean || "").trim();
            const items = Array.isArray(payload.items) ? payload.items : [];
            const notFound = items.length === 0 || String(info || "").toLowerCase().includes("not found");
            addLog(`🔎 Check result for EAN ${ean || "-"}`);
            if (ean && !liveJobRuntime.countedEans.has(ean)) {
                liveJobRuntime.countedEans.add(ean);
                // Checker "not found" is a valid outcome, not an error.
                liveJobRuntime.success += 1;
            }
            if (items.length > 0) {
                items.forEach((item) => {
                    liveJobRuntime.checkRows.push({
                        ...item,
                        ean: item?.ean || ean,
                    });
                });
            } else {
                liveJobRuntime.checkRows.push({
                    ean,
                    title: null,
                    price: null,
                    storefront: null,
                    status: "not_found",
                });
            }
            applyRuntimeMetrics();
            return { done: false, previewPayload: [...liveJobRuntime.checkRows] };
        }
        case "storefront_result": {
            liveJobRuntime.mode = "delete";
            const key = `${String(payload.ean || "")}:${String(payload.storefront || "")}`;
            if (key && !liveJobRuntime.countedStorefrontKeys.has(key)) {
                liveJobRuntime.countedStorefrontKeys.add(key);
                const row = {
                    ean: payload.ean || "",
                    title: null,
                    price: null,
                    storefront: payload.storefront || null,
                    status: payload.result || "",
                };
                liveJobRuntime.deleteRows.push(row);
                if (String(row.status || "").toLowerCase() !== "success") {
                    liveJobRuntime.deleteErrorRows.push(row);
                }
            }
            addLog(
                `🗑️ Delete ${normalizeOutcome(payload.result)}: EAN ${payload.ean || "-"} (${(payload.storefront || "-").toUpperCase()})`
            );
            return { done: false };
        }
        case "job_progress": {
            const total = toNumber(payload.total);
            const processed = toNumber(payload.processed);
            const payloadSuccess = toNumber(payload.success);
            const payloadError = toNumber(payload.error);
            const task = String(payload.task || "").toLowerCase();
            const prevProcessed = Number.isFinite(liveJobRuntime.processed) ? liveJobRuntime.processed : 0;
            let previewPayload = null;
            if (task === "delete") liveJobRuntime.mode = "delete";
            if (task === "checker") liveJobRuntime.mode = "check";
            if (task === "price_sync") liveJobRuntime.mode = "check";

            if (Number.isFinite(total)) {
                liveJobRuntime.total = total;
                setMetricCardValue("totalProducts", total);
            }
            if (Number.isFinite(processed)) {
                if (processed < prevProcessed) {
                    addLog(
                        `⚠️ Ignored stale progress event: ${processed}/${Number.isFinite(total) ? total : "?"} (current ${prevProcessed})`,
                        "warn"
                    );
                    return { done: false };
                }
                const status = String(payload.status || "").toLowerCase();
                if (Number.isFinite(payloadSuccess)) {
                    liveJobRuntime.success = payloadSuccess;
                }
                if (Number.isFinite(payloadError)) {
                    liveJobRuntime.error = payloadError;
                }
                if (!Number.isFinite(payloadSuccess) && !Number.isFinite(payloadError)) {
                    if (processed > prevProcessed && (status === "success" || status === "failed")) {
                        if (status === "success") liveJobRuntime.success += 1;
                        if (status === "failed") liveJobRuntime.error += 1;
                    }
                }
                liveJobRuntime.processed = processed;
            } else {
                if (Number.isFinite(payloadSuccess)) {
                    liveJobRuntime.success = payloadSuccess;
                }
                if (Number.isFinite(payloadError)) {
                    liveJobRuntime.error = payloadError;
                }
            }
            applyRuntimeMetrics();

            if (Number.isFinite(total) && Number.isFinite(processed)) {
                setProgressBarProgress({ processed, total });
            }

            setProgressBarStatus({
                success: liveJobRuntime.success,
                error: liveJobRuntime.error,
                queue: getRuntimeRemaining(),
            });

            if (task === "price_sync") {
                const ean = String(payload.ean || "").trim();
                if (ean) {
                    const status = String(payload.status || "").trim().toLowerCase() || "processed";
                    const row = {
                        ean,
                        country: String(payload.storefront || "").trim() || "—",
                        title: "Aftercool sync",
                        price: payload.aftercool_price ?? null,
                        status,
                    };
                    const existingIdx = liveJobRuntime.checkRows.findIndex(
                        (entry) => String(entry?.ean || "").trim() === ean
                    );
                    if (existingIdx >= 0) {
                        liveJobRuntime.checkRows[existingIdx] = row;
                    } else {
                        liveJobRuntime.checkRows.push(row);
                    }
                    previewPayload = [...liveJobRuntime.checkRows];
                }
            }

            showTaskStatus({
                hasTask: true,
            });
            addLog(`⏳ Progress: ${Number.isFinite(processed) ? processed : 0}/${Number.isFinite(total) ? total : 0}`);
            if (previewPayload) {
                return { done: false, previewPayload };
            }
            return { done: false };
        }
        case "job_completed": {
            const total = toNumber(payload.total);
            const processed = toNumber(payload.processed);
            const success = toNumber(payload.success);
            const failed = toNumber(payload.failed);
            const error = toNumber(payload.error);
            const found = toNumber(payload.found);
            const notFound = toNumber(payload.not_found);
            const resultCount = toNumber(payload.result_count);
            const taskName = String(payload.task || "").toLowerCase();
            const isPriceSyncTask = taskName === "price_sync";
            let remaining = null;

            const isCheckerTask =
                !isPriceSyncTask &&
                (liveJobRuntime.mode === "check" ||
                taskName === "checker" ||
                Number.isFinite(found) ||
                Number.isFinite(notFound));

            if (Number.isFinite(total)) liveJobRuntime.total = total;
            if (Number.isFinite(processed)) liveJobRuntime.processed = processed;

            if (isCheckerTask) {
                const foundCount = Number.isFinite(found) ? found : 0;
                const notFoundCount = Number.isFinite(notFound)
                    ? notFound
                    : (Number.isFinite(total) ? Math.max(0, total - foundCount) : 0);
                const checkerTotal = Number.isFinite(total) ? total : foundCount + notFoundCount;
                // Checker outcome: found + not found are both successful checks.
                liveJobRuntime.success = checkerTotal;
                liveJobRuntime.error = 0;
            } else {
                if (Number.isFinite(success)) liveJobRuntime.success = success;
                else if (Number.isFinite(found)) liveJobRuntime.success = found;
                if (Number.isFinite(failed)) liveJobRuntime.error = failed;
                else if (Number.isFinite(error)) liveJobRuntime.error = error;
                else if (Number.isFinite(resultCount) && Number.isFinite(total)) {
                    liveJobRuntime.success = resultCount;
                    liveJobRuntime.error = Math.max(0, total - resultCount);
                }
            }

            if (Number.isFinite(total)) setMetricCardValue("totalProducts", total);
            setMetricCardValue("success", liveJobRuntime.success);
            setMetricCardValue("errors", liveJobRuntime.error);
            if (Number.isFinite(total) && Number.isFinite(processed)) {
                remaining = Math.max(0, total - processed);
                setMetricCardValue("remaining", remaining);
            } else {
                remaining = getRuntimeRemaining();
                setMetricCardValue("remaining", remaining);
            }
            setProgressBarStatus({
                success: liveJobRuntime.success,
                error: liveJobRuntime.error,
                queue: Number.isFinite(remaining) ? remaining : getRuntimeRemaining(),
            });
            if (Number.isFinite(total)) {
                setProgressBarProgress({
                    processed: Number.isFinite(processed) ? processed : total,
                    total,
                });
            }
            setProgressBarRunning(false);
            showTaskStatus({ hasTask: true });
            addLog(
                `${liveJobRuntime.error > 0 ? "✅" : "🎉"} Job completed: ${liveJobRuntime.success} success, ${liveJobRuntime.error} errors`,
                "success"
            );
            const completedResult = Array.isArray(payload.results)
                ? payload.results
                : (Array.isArray(payload.result) ? payload.result : null);
            const completedPreview = normalizeCompletedPreviewRows(completedResult);
            const previewPayload = buildFinalPreviewPayload({ payload, completedPreview });
            const resolvedTotal = Number.isFinite(total) ? total : liveJobRuntime.total;
            const resolvedProcessed = Number.isFinite(processed) ? processed : liveJobRuntime.processed;
            const allItemsProcessed =
                Number.isFinite(resolvedTotal) &&
                Number.isFinite(resolvedProcessed) &&
                resolvedProcessed >= resolvedTotal;
            if (!allItemsProcessed) {
                addLog(
                    `⚠️ Completion event received early: processed ${Number.isFinite(resolvedProcessed) ? resolvedProcessed : "?"} of ${Number.isFinite(resolvedTotal) ? resolvedTotal : "?"}. Keeping socket open.`,
                    "warn"
                );
            }
            return {
                done: allItemsProcessed,
                previewPayload,
            };
        }
        case "job_failed": {
            const total = toNumber(payload.total);
            const processed = toNumber(payload.processed);
            const success = toNumber(payload.success);
            const error = toNumber(payload.error);
            let remaining = null;
            const resolvedTotal = Number.isFinite(total) ? total : liveJobRuntime.total;
            const resolvedSuccess = Number.isFinite(success) ? success : liveJobRuntime.success;
            const resolvedError = Number.isFinite(error) ? error : liveJobRuntime.error;
            if (Number.isFinite(resolvedTotal)) liveJobRuntime.total = resolvedTotal;
            if (Number.isFinite(processed)) liveJobRuntime.processed = processed;
            liveJobRuntime.success = resolvedSuccess;
            liveJobRuntime.error = resolvedError;
            if (Number.isFinite(resolvedTotal)) setMetricCardValue("totalProducts", resolvedTotal);
            setMetricCardValue("success", resolvedSuccess);
            setMetricCardValue("errors", resolvedError);
            if (Number.isFinite(total) && Number.isFinite(processed)) {
                remaining = Math.max(0, total - processed);
                setMetricCardValue("remaining", remaining);
                setProgressBarProgress({ processed, total });
            } else {
                remaining = getRuntimeRemaining();
                setMetricCardValue("remaining", remaining);
            }
            setProgressBarStatus({
                success: resolvedSuccess,
                error: resolvedError,
                queue: Number.isFinite(remaining) ? remaining : 0,
            });
            setProgressBarRunning(false);
            addLog(`❌ Job failed${info ? `: ${humanizeInfo(info)}` : ""}`, "error");
            return { done: false };
        }
        case "ean_started": {
            showTaskStatus({
                hasTask: true,
            });
            return { done: false };
        }
        case "progress": {
            const stage = String(payload.stage || "").trim();
            const ean = String(payload.ean || payload.item?.ean || "").trim();
            const hasEan = Boolean(ean || payload.item?.ean);
            if (isTerminalStatus(payload.status) && !hasEan) {
                addLog(
                    `⚠️ Received terminal progress status without EAN (${String(payload.status || "").trim() || "unknown"}). Ignoring auto-close.`,
                    "warn"
                );
                setProgressBarRunning(false);
                showTaskStatus({
                    hasTask: true,
                });
                return { done: false };
            }
            if (stage) {
                addLog(`⚙️ ${ean ? `EAN ${ean}: ` : ""}${formatStageLabel(stage)}`);
            }
            showTaskStatus({
                hasTask: true,
            });
            return { done: false };
        }
        case "ean_completed": {
            liveJobRuntime.mode = "upload";
            const normalizedStatus = String(payload.status || "").toLowerCase();
            const rawEan = payload.ean ?? payload.item?.ean;
            const ean = String(rawEan || "").trim();
            const countKey = ean || `__missing_ean_${liveJobRuntime.countedUploadEans.size + 1}`;
            const isSuccess =
                normalizedStatus === "success" ||
                normalizedStatus === "done" ||
                normalizedStatus === "completed";
            const isError = normalizedStatus === "error" || normalizedStatus === "failed";

            if (isSuccess || isError) {
                const nextOutcome = isError ? "error" : "success";
                const prevOutcome = liveJobRuntime.uploadOutcomeByEan.get(countKey);
                if (!prevOutcome) {
                    liveJobRuntime.uploadOutcomeByEan.set(countKey, nextOutcome);
                    liveJobRuntime.countedUploadEans.add(countKey);
                    if (nextOutcome === "success") liveJobRuntime.success += 1;
                    if (nextOutcome === "error") liveJobRuntime.error += 1;
                } else if (prevOutcome !== nextOutcome) {
                    liveJobRuntime.uploadOutcomeByEan.set(countKey, nextOutcome);
                    if (prevOutcome === "success") liveJobRuntime.success = Math.max(0, liveJobRuntime.success - 1);
                    if (prevOutcome === "error") liveJobRuntime.error = Math.max(0, liveJobRuntime.error - 1);
                    if (nextOutcome === "success") liveJobRuntime.success += 1;
                    if (nextOutcome === "error") liveJobRuntime.error += 1;
                }
                if (Number.isFinite(liveJobRuntime.total) && liveJobRuntime.total > 0) {
                    const nextProcessed = Math.min(liveJobRuntime.total, liveJobRuntime.uploadOutcomeByEan.size);
                    liveJobRuntime.processed = Math.max(
                        Number.isFinite(liveJobRuntime.processed) ? liveJobRuntime.processed : 0,
                        nextProcessed
                    );
                } else {
                    const nextProcessed = liveJobRuntime.success + liveJobRuntime.error;
                    liveJobRuntime.processed = Math.max(
                        Number.isFinite(liveJobRuntime.processed) ? liveJobRuntime.processed : 0,
                        nextProcessed
                    );
                }
            }

            const item = payload.item && typeof payload.item === "object" ? payload.item : {};
            const stage = String(payload.stage || "final").trim() || "final";
            const rowKey = `${ean || "—"}:${stage}`;
            const row = {
                _key: rowKey,
                ean: item.ean || ean || "—",
                title: item.title || item.article || null,
                article: item.article || null,
                sku: item.sku || null,
                price: item.price ?? null,
                status: isSuccess ? "success" : (isError ? "error" : normalizedStatus || "error"),
                stage: payload.stage || null,
                message: payload.message || null,
                detail: payload.detail || null,
            };
            const existingIdx = liveJobRuntime.uploadRows.findIndex((entry) => entry._key === rowKey);
            if (existingIdx >= 0) {
                liveJobRuntime.uploadRows[existingIdx] = row;
            } else {
                liveJobRuntime.uploadRows.push(row);
            }
            if (isError) {
                upsertUploadErrorRow(stripInternalRowFields(row));
                addLog(`❌ Upload failed for EAN ${row.ean || "-"} at ${formatStageLabel(row.stage || "final")}`, "error");
            } else if (isSuccess) {
                addLog(`✅ Upload completed for EAN ${row.ean || "-"}`, "success");
            }

            applyRuntimeMetrics();
            if (Number.isFinite(liveJobRuntime.total) && liveJobRuntime.total > 0) {
                setProgressBarProgress({
                    processed: liveJobRuntime.processed,
                    total: liveJobRuntime.total,
                });
            }

            showTaskStatus({
                hasTask: true,
            });
            return { done: false };
        }
        default:
            return { done: false };
    }
}

export function mapOperationLabel(operation) {
    switch (operation) {
        case "upload":
            return "Загрузка";
        case "check":
            return "Проверка";
        case "delete":
            return "Удаление";
        case "aftercool_sync":
            return "Синхронизация Aftercool";
        default:
            return "Задача";
    }
}

export function applyTaskSummaryFromResponse({ operation, payload }) {
    const summary = summarizeResponse(operation, payload);
    if (!summary) return;

    const { total, success, error } = summary;
    const remaining = Math.max(0, total - success - error);

    setMetricCardValue("totalProducts", total);
    setMetricCardValue("success", success);
    setMetricCardValue("errors", error);
    setMetricCardValue("remaining", remaining);

    setProgressBarStatus({
        success,
        error,
        queue: remaining,
    });
    setProgressBarProgress({
        processed: total - remaining,
        total,
    });
    setProgressBarRunning(false);
    showTaskStatus({ hasTask: true });
}

export function resetTaskUi({ total = 0, running = true } = {}) {
    const totalValue = Number.isFinite(Number(total)) && Number(total) > 0
        ? Number(total)
        : 0;
    resetLiveJobRuntime({ total: totalValue, processed: 0, success: 0, error: 0 });

    setMetricCardValue("totalProducts", totalValue);
    setMetricCardValue("success", 0);
    setMetricCardValue("errors", 0);
    setMetricCardValue("remaining", totalValue);

    setProgressBarStatus({
        success: 0,
        error: 0,
        queue: totalValue,
    });
    setProgressBarProgress({
        processed: 0,
        total: totalValue,
    });
    setProgressBarRunning(running);
    showTaskStatus({ hasTask: true });
}

export function applyTaskSnapshot({
    total,
    success = 0,
    error = 0,
    remaining,
    running = true,
} = {}) {
    const totalValue = Number(total);
    if (!Number.isFinite(totalValue) || totalValue < 0) return;

    const successValue = Number.isFinite(Number(success)) ? Number(success) : 0;
    const errorValue = Number.isFinite(Number(error)) ? Number(error) : 0;
    const computedRemaining = Number.isFinite(Number(remaining))
        ? Number(remaining)
        : Math.max(0, totalValue - successValue - errorValue);
    const processed = Math.max(0, totalValue - computedRemaining);

    setMetricCardValue("totalProducts", totalValue);
    setMetricCardValue("success", successValue);
    setMetricCardValue("errors", errorValue);
    setMetricCardValue("remaining", computedRemaining);

    setProgressBarStatus({
        success: successValue,
        error: errorValue,
        queue: computedRemaining,
    });
    setProgressBarProgress({
        processed,
        total: totalValue,
    });
    setProgressBarRunning(running);
    showTaskStatus({ hasTask: true });
}

export function parseTaskStatus(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return normalizeTaskStatus(parsed);
        } catch {
            return normalizeTaskStatus(raw);
        }
    }
    return normalizeTaskStatus(raw);
}

function normalizeTaskStatus(payload) {
    if (typeof payload === "string") {
        return { status: payload };
    }

    if (payload && typeof payload === "object") {
        const task = payload.task || payload.job || payload.name;
        const status = payload.status || payload.state || payload.message;
        const done =
            payload.done === true ||
            payload.completed === true ||
            payload.status === "completed" ||
            payload.status === "done" ||
            payload.status === "success" ||
            payload.status === "failed" ||
            payload.status === "error";
        return { task, status, done, message: payload.message };
    }

    return null;
}

function renderNoTasks(container, state) {
    container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package w-12 h-12 mx-auto mb-4 opacity-50">
                                <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z">
                                </path>
                                <path d="M12 22V12"></path>
                                <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"></path>
                                <path d="m7.5 4.27 9 5.15"></path>
                            </svg>
                            <h3 class="text-h3 text-foreground mb-2">Нет активной задачи</h3>
                            <p class="text-body">Загрузите файл или проверьте товары, чтобы начать обработку</p>
                            `;
}

function parseSocketPayload(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
    return raw;
}

function normalizeEvent(data) {
    if (!data || typeof data !== "object") return { event: null, payload: null, info: null };
    if (typeof data.event === "string") {
        return {
            event: data.event,
            payload: data.payload ?? data,
            info: data.info ?? null,
        };
    }
    return { event: inferEvent(data), payload: data, info: null };
}

function inferEvent(data) {
    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
    if (has("total") && !has("processed")) return "job_started";
    if (has("processed") && has("success") && has("error") && has("status")) return "job_completed";
    if (has("processed") && has("success") && has("error") && has("ean")) return "job_progress";
    if (has("status") && has("ean") && has("item") && !has("stage")) return "ean_started";
    if (has("stage") && (data.status === "success" || data.status === "error")) return "ean_completed";
    if (isTerminalStatus(data.status)) return "job_failed";
    if (has("stage")) return "progress";
    return null;
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function formatStageLabel(stage) {
    const value = String(stage || "").trim().replace(/[_-]+/g, " ");
    if (!value) return "processing";
    const known = {
        validation: "validation",
        generate_description_and_pics: "description + image preparation",
        adapt_html_description: "HTML description adaptation",
        category_selector: "category selection",
        create_product_body: "product payload creation",
        fetch_unit_id: "unit lookup",
        update_price: "price update",
        add_unit: "offer creation",
        final: "finalization",
    };
    return known[String(stage || "").trim()] || value;
}

function normalizeOutcome(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "status unknown";
    if (normalized === "success") return "success";
    if (normalized === "not found") return "not found";
    if (normalized === "failed") return "failed";
    return normalized;
}

function humanizeInfo(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.toLowerCase() === "stopped") return "stopped by user";
    return text;
}

function isTerminalStatus(status) {
    const normalized = String(status || "").toLowerCase();
    return normalized === "error" || normalized === "failed" || normalized === "cancelled" || normalized === "canceled" || normalized === "stopped";
}

function summarizeResponse(operation, payload) {
    if (operation === "check") {
        return summarizeCheckResponse(payload);
    }

    if (Array.isArray(payload)) {
        const total = payload.length;
        const error = payload.filter((item) => isErrorItem(operation, item)).length;
        return { total, error, success: Math.max(0, total - error) };
    }

    if (payload && typeof payload === "object") {
        const total = Number.isFinite(Number(payload.total)) ? Number(payload.total) : 1;
        const success = Number.isFinite(Number(payload.success))
            ? Number(payload.success)
            : isErrorItem(operation, payload)
                ? 0
                : total;
        const error = Number.isFinite(Number(payload.error))
            ? Number(payload.error)
            : Math.max(0, total - success);
        return { total, success, error };
    }

    if (payload == null) return null;
    return { total: 1, success: 1, error: 0 };
}

function summarizeCheckResponse(payload) {
    if (Array.isArray(payload)) {
        const groups = groupByEan(payload);
        if (groups.size > 0) {
            const total = groups.size;
            let error = 0;
            groups.forEach((items) => {
                const hasSuccess = items.some((item) => !isErrorItem("check", item));
                if (!hasSuccess) error += 1;
            });
            return {
                total,
                error,
                success: Math.max(0, total - error),
            };
        }

        const total = payload.length;
        const error = payload.filter((item) => isErrorItem("check", item)).length;
        return { total, error, success: Math.max(0, total - error) };
    }

    if (payload && typeof payload === "object") {
        const error = isErrorItem("check", payload) ? 1 : 0;
        return { total: 1, success: error ? 0 : 1, error };
    }

    if (payload == null) return null;
    return { total: 1, success: 1, error: 0 };
}

function groupByEan(items) {
    const groups = new Map();
    items.forEach((item) => {
        const raw = item && typeof item === "object" ? item.ean : null;
        const ean = raw == null ? "" : String(raw).trim();
        if (!ean) return;
        if (!groups.has(ean)) groups.set(ean, []);
        groups.get(ean).push(item);
    });
    return groups;
}

function isErrorItem(operation, item) {
    if (!item || typeof item !== "object") return false;
    const status = String(item.status || "").toLowerCase();
    if (status === "error" || status === "failed") return true;
    if (operation !== "check" && status === "not_found") return true;
    if (item.error) return true;

    if (operation === "check") {
        return false;
    }
    return false;
}

function createEmptyRuntime() {
    return {
        mode: null,
        total: 0,
        processed: 0,
        success: 0,
        error: 0,
        countedEans: new Set(),
        countedStorefrontKeys: new Set(),
        countedUploadEans: new Set(),
        uploadOutcomeByEan: new Map(),
        checkRows: [],
        deleteRows: [],
        deleteErrorRows: [],
        uploadRows: [],
        uploadErrorRows: [],
    };
}

function resetLiveJobRuntime({ total, processed, success, error } = {}) {
    liveJobRuntime = createEmptyRuntime();
    if (Number.isFinite(Number(total))) liveJobRuntime.total = Number(total);
    if (Number.isFinite(Number(processed))) liveJobRuntime.processed = Number(processed);
    if (Number.isFinite(Number(success))) liveJobRuntime.success = Number(success);
    if (Number.isFinite(Number(error))) liveJobRuntime.error = Number(error);
}

function getRuntimeRemaining() {
    if (!Number.isFinite(liveJobRuntime.total)) return 0;
    if (Number.isFinite(liveJobRuntime.processed) && liveJobRuntime.processed >= 0) {
        return Math.max(0, liveJobRuntime.total - liveJobRuntime.processed);
    }
    return Math.max(0, liveJobRuntime.total - liveJobRuntime.success - liveJobRuntime.error);
}

function applyRuntimeMetrics() {
    setMetricCardValue("totalProducts", liveJobRuntime.total);
    setMetricCardValue("success", liveJobRuntime.success);
    setMetricCardValue("errors", liveJobRuntime.error);
    setMetricCardValue("remaining", getRuntimeRemaining());
    setProgressBarStatus({
        success: liveJobRuntime.success,
        error: liveJobRuntime.error,
        queue: getRuntimeRemaining(),
    });
}

function stripInternalRowFields(row) {
    if (!row || typeof row !== "object") return row;
    const { _key, ...publicRow } = row;
    return publicRow;
}

function upsertUploadErrorRow(row) {
    if (!row || typeof row !== "object") return;
    const key = `${String(row.ean || "").trim()}:${String(row.stage || "final").trim()}`;
    const idx = liveJobRuntime.uploadErrorRows.findIndex((entry) =>
        `${String(entry.ean || "").trim()}:${String(entry.stage || "final").trim()}` === key
    );
    if (idx >= 0) {
        liveJobRuntime.uploadErrorRows[idx] = row;
        return;
    }
    liveJobRuntime.uploadErrorRows.push(row);
}

function buildFinalPreviewPayload({ payload, completedPreview }) {
    if (liveJobRuntime.mode === "upload") {
        const finalRows = [...liveJobRuntime.uploadErrorRows];
        const failedEans = Array.isArray(payload?.failed_eans) ? payload.failed_eans : [];
        failedEans.forEach((eanRaw) => {
            const ean = String(eanRaw || "").trim();
            if (!ean) return;
            const exists = finalRows.some((row) => String(row?.ean || "").trim() === ean);
            if (exists) return;
            finalRows.push({
                ean,
                title: null,
                price: null,
                status: "error",
                stage: "final",
                message: "Failed during upload",
            });
        });
        return finalRows;
    }

    if (liveJobRuntime.mode === "delete") {
        const finalRows = [...liveJobRuntime.deleteErrorRows];
        const failedEans = Array.isArray(payload?.failed_eans) ? payload.failed_eans : [];
        failedEans.forEach((eanRaw) => {
            const ean = String(eanRaw || "").trim();
            if (!ean) return;
            const exists = finalRows.some((row) => String(row?.ean || "").trim() === ean);
            if (exists) return;
            finalRows.push({
                ean,
                title: null,
                price: null,
                storefront: null,
                status: "failed",
            });
        });
        return finalRows;
    }

    if (completedPreview) return completedPreview;
    return [...liveJobRuntime.checkRows];
}

function normalizeCompletedPreviewRows(results) {
    if (!Array.isArray(results)) return null;
    if (results.length === 0) return [];

    const hasCheckerShape = results.some((row) =>
        row && typeof row === "object" &&
        (Object.prototype.hasOwnProperty.call(row, "found") ||
            Array.isArray(row.items) ||
            Array.isArray(row.storefronts))
    );
    if (!hasCheckerShape) return results;

    const rows = [];
    results.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const ean = String(entry.ean || "").trim() || "—";
        const found = entry.found === true;
        const notFound = entry.found === false || String(entry.message || "").toLowerCase().includes("not found");
        const items = Array.isArray(entry.items) ? entry.items : [];
        const storefronts = Array.isArray(entry.storefronts) ? entry.storefronts : [];

        if (found) {
            const itemStorefronts = new Set();
            items.forEach((item) => {
                const storefront = String(item?.storefront || "").trim() || "—";
                itemStorefronts.add(storefront);
                rows.push({
                    ...item,
                    ean: String(item?.ean || ean),
                    storefront,
                    status: "exists",
                });
            });
            storefronts.forEach((storefrontRaw) => {
                const storefront = String(storefrontRaw || "").trim();
                if (!storefront || itemStorefronts.has(storefront)) return;
                rows.push({
                    ean,
                    title: null,
                    price: null,
                    storefront,
                    status: "exists",
                });
            });
            if (items.length === 0 && storefronts.length === 0) {
                rows.push({
                    ean,
                    title: null,
                    price: null,
                    storefront: null,
                    status: "exists",
                });
            }
            return;
        }

        if (notFound) {
            rows.push({
                ean,
                title: null,
                price: null,
                storefront: null,
                status: "doesnt_exist",
            });
            return;
        }

        rows.push({
            ean,
            title: null,
            price: null,
            storefront: null,
            status: "error",
        });
    });

    return rows;
}
