export function clearBackendResponsePreview() {
    const container = getPreviewContainer(false);
    if (!container) return;
    container.remove();
}

export function renderBackendResponsePreview({ operation, payload }) {
    const container = getPreviewContainer(true);
    if (!container) return;

    container.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "text-h3 text-foreground mb-2";
    title.textContent = "Ответ сервера";
    container.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "text-caption text-muted-foreground mb-4";
    meta.textContent = `Операция: ${operationLabel(operation)}`;
    container.appendChild(meta);

    if (Array.isArray(payload)) {
        renderArrayPayload(container, operation, payload);
        return;
    }

    const pre = document.createElement("pre");
    pre.className = "text-caption";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.textContent =
        typeof payload === "string" ? payload : JSON.stringify(payload || {}, null, 2);
    container.appendChild(pre);
}

function renderArrayPayload(container, operation, items) {
    let normalizedRows = items
        .filter((item) => item && typeof item === "object")
        .map((item) => normalizeRow(operation, item));

    if (operation === "check") {
        normalizedRows = aggregateCheckRowsByEan(normalizedRows);
    }

    if (operation === "check" && normalizedRows.length === 0) {
        normalizedRows = [{
            ean: "—",
            country: "—",
            title: "—",
            sku: "—",
            price: "—",
            stock: "—",
            status: "error",
        }];
    }

    if (normalizedRows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "text-caption text-muted-foreground";
        empty.textContent = "Нет данных для отображения";
        container.appendChild(empty);
        return;
    }

    const statusGroups = groupByStatus(normalizedRows);
    const totalRows = normalizedRows.length;
    const totalEans = new Set(normalizedRows.map((row) => row.ean)).size;

    const count = document.createElement("p");
    count.className = "text-caption text-muted-foreground mb-4";
    count.textContent = `Товаров (EAN): ${totalEans}, записей: ${totalRows}`;
    container.appendChild(count);

    if (operation === "check" && totalEans > 1) {
        appendCheckExportAction(container, normalizedRows);
    }

    if (operation === "check") {
        container.appendChild(buildCheckSimpleList(normalizedRows));
        return;
    }

    const list = document.createElement("div");
    list.className = "space-y-3 backend-response-list";

    statusGroups.forEach(({ statusKey, rows }, index) => {
        const panel = document.createElement("details");
        panel.className = "rounded-lg border bg-card backend-response-group";
        panel.style.borderColor = "hsl(var(--border))";
        if (index === 0) panel.open = true;

        const summary = document.createElement("summary");
        summary.className = "flex items-center gap-3 backend-response-summary";

        const statusLabel = document.createElement("span");
        statusLabel.className = `backend-response-status-title ${statusToneClass(statusKey)}`;
        statusLabel.textContent = formatStatusLabel(statusKey).toUpperCase();
        summary.appendChild(statusLabel);

        const badge = document.createElement("span");
        badge.className = "text-caption text-muted-foreground backend-response-count";
        badge.textContent = String(rows.length);
        summary.appendChild(badge);

        panel.appendChild(summary);

        const body = document.createElement("div");
        body.className = "backend-response-body";
        body.appendChild(buildStatusTable(operation, rows));

        panel.appendChild(body);
        list.appendChild(panel);
    });

    container.appendChild(list);
}

function buildCheckSimpleList(rows) {
    const list = document.createElement("div");
    list.className = "backend-check-simple-list";

    rows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "backend-check-simple-item";

        const ean = document.createElement("span");
        ean.className = "backend-check-simple-ean";
        ean.textContent = String(row?.ean || "—");

        const status = document.createElement("span");
        status.className = `backend-response-status-badge ${statusToneClass(row?.status)}`;
        status.textContent = formatStatusLabel(row?.status);

        item.appendChild(ean);
        item.appendChild(status);
        list.appendChild(item);
    });

    return list;
}

function getPreviewContainer(createIfMissing) {
    const statusContainer = document.querySelector("#status-taks-container");
    if (!statusContainer) return null;

    let container = statusContainer.querySelector('[data-backend-response-preview="true"]');
    if (!container && createIfMissing) {
        container = document.createElement("div");
        container.className = "bg-card rounded-lg border p-6";
        container.setAttribute("data-backend-response-preview", "true");
        statusContainer.appendChild(container);
    }
    return container;
}

function operationLabel(operation) {
    switch (operation) {
        case "upload":
            return "Загрузка";
        case "check":
            return "Проверка";
        case "delete":
            return "Удаление";
        default:
            return "Операция";
    }
}

function normalizeRow(operation, item) {
    const status = normalizeStatus(operation, item);
    return {
        ean: getStringValue(item, ["ean", "EAN"], "—"),
        country: getStringValue(item, ["country", "storefront", "locale", "lang", "language"], "—"),
        title: getStringValue(item, ["title", "article", "name", "product_name"], "—"),
        sku: getStringValue(item, ["sku", "product_id"], "—"),
        price: getPriceValue(item),
        stock: getStringValue(item, ["stock", "amount", "quantity", "qty"], "—"),
        status,
    };
}

function normalizeStatus(operation, item) {
    const raw = getStringValue(item, ["status", "result", "state"], "").toLowerCase();

    if (operation === "delete") {
        if (raw.includes("deleted") || raw.includes("success")) return "deleted";
        if (raw.includes("exist")) return "exist";
        if (raw.includes("error") || raw.includes("fail") || raw.includes("not_found")) return "error";
        return raw || "exist";
    }

    if (operation === "check") {
        const ean = getStringValue(item, ["ean", "EAN"], "");
        const hasPositiveSignals =
            item?.found === true ||
            item?.exists === true ||
            item?.title != null ||
            item?.price != null ||
            getStringValue(item, ["storefront", "country", "locale", "lang", "language"], "") !== "";
        if (!raw) {
            if (!ean) return "exists";
            return hasPositiveSignals ? "exists" : "error";
        }
        if (raw.includes("error") || raw.includes("fail")) return "error";
        if (
            raw.includes("not_found") ||
            raw.includes("doesnt_exist") ||
            raw.includes("not exist") ||
            raw.includes("missing")
        ) {
            return "doesnt_exist";
        }
        if (raw.includes("exist") || raw.includes("found") || raw.includes("success")) return "exists";
        return "error";
    }

    if (raw.includes("error") || raw.includes("fail") || raw.includes("not_found")) return "error";
    if (raw.includes("success") || raw.includes("done") || raw.includes("completed")) return "success";
    if (raw.includes("deleted")) return "deleted";
    if (raw.includes("exist") || raw.includes("found")) return "exist";
    return raw || "success";
}

function buildStatusTable(operation, rows) {
    const wrapper = document.createElement("div");
    wrapper.className = "backend-response-table-wrap";

    const table = document.createElement("table");
    table.className = "backend-response-table";
    table.style.minWidth = operation === "upload" || operation === "check" ? "760px" : "420px";

    const columns = getColumnsForOperation(operation);
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    columns.forEach((column) => {
        const th = document.createElement("th");
        th.className = "text-caption text-muted-foreground backend-response-th";
        th.textContent = column.label;
        headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
        const tr = document.createElement("tr");
        columns.forEach((column) => {
            const td = document.createElement("td");
            td.className = "backend-response-td";
            const value = column.value(row);
            if (column.key === "status") {
                td.appendChild(buildStatusBadge(value));
            } else {
                td.className = `backend-response-td ${column.tone || "text-body text-foreground"}`;
                td.textContent = value;
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
}

function getColumnsForOperation(operation) {
    if (operation === "check") {
        return [
            {
                key: "ean",
                label: "EAN",
                value: (row) => row.ean,
                tone: "font-mono-data text-body text-foreground",
            },
            {
                key: "country",
                label: "Страна",
                value: (row) => row.country,
                tone: "text-caption text-muted-foreground",
            },
            {
                key: "title",
                label: "Название",
                value: (row) => row.title,
                tone: "text-body text-foreground",
            },
            {
                key: "price",
                label: "Цена",
                value: (row) => row.price,
                tone: "font-mono-data text-body text-foreground",
            },
            {
                key: "status",
                label: "Статус",
                value: (row) => row.status,
            },
        ];
    }

    if (operation === "delete") {
        return [
            {
                key: "ean",
                label: "EAN",
                value: (row) => row.ean,
                tone: "font-mono-data text-body text-foreground",
            },
            {
                key: "status",
                label: "Статус",
                value: (row) => row.status,
            },
        ];
    }

    return [
        {
            key: "ean",
            label: "EAN",
            value: (row) => row.ean,
            tone: "font-mono-data text-body text-foreground",
        },
        {
            key: "title",
            label: "Название",
            value: (row) => row.title,
            tone: "text-body text-foreground",
        },
        {
            key: "sku",
            label: "SKU",
            value: (row) => row.sku,
            tone: "font-mono-data text-caption text-muted-foreground",
        },
        {
            key: "price",
            label: "Цена",
            value: (row) => row.price,
            tone: "font-mono-data text-body text-foreground",
        },
        {
            key: "stock",
            label: "Остаток",
            value: (row) => row.stock,
            tone: "font-mono-data text-body text-foreground",
        },
        {
            key: "status",
            label: "Статус",
            value: (row) => row.status,
        },
    ];
}

function groupByStatus(rows) {
    const order = ["success", "deleted", "exists", "doesnt_exist", "exist", "error"];
    const groups = new Map();

    rows.forEach((row) => {
        const key = row.status || "other";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    return sortedKeys.map((statusKey) => ({
        statusKey,
        rows: groups.get(statusKey),
    }));
}

function buildStatusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `backend-response-status-badge ${statusToneClass(status)}`;
    badge.textContent = formatStatusLabel(status);
    return badge;
}

function statusToneClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "success" || normalized === "deleted" || normalized === "done" || normalized === "exists") {
        return "backend-response-status-ok";
    }
    if (normalized === "error" || normalized === "failed") {
        return "backend-response-status-error";
    }
    if (normalized === "exist" || normalized === "doesnt_exist") {
        return "backend-response-status-warn";
    }
    return "backend-response-status-neutral";
}

function getStringValue(item, keys, fallback = "") {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(item || {}, key)) {
            const value = item[key];
            if (value == null) continue;
            const normalized = String(value).trim();
            if (normalized) return normalized;
        }
    }
    return fallback;
}

function formatStatusLabel(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "doesnt_exist") return "doesnt exist";
    return normalized || "—";
}

function getPriceValue(item) {
    const raw = item?.price;
    if (raw == null || raw === "") return "—";
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        return `€${numeric.toFixed(2)}`;
    }
    return String(raw);
}

function aggregateCheckRowsByEan(rows) {
    const groups = new Map();

    rows.forEach((row) => {
        const ean = String(row?.ean || "").trim() || "—";
        if (!groups.has(ean)) {
            groups.set(ean, []);
        }
        groups.get(ean).push(row);
    });

    return Array.from(groups.entries()).map(([ean, eanRows]) => {
        const countries = dedupeValues(eanRows.map((row) => row.country));
        const titles = dedupeValues(eanRows.map((row) => row.title));
        const prices = dedupeValues(eanRows.map((row) => row.price));

        return {
            ean,
            country: countries.length > 0 ? countries.join(", ") : "—",
            title: titles.length === 1 ? titles[0] : (titles[0] || "—"),
            price: prices.length === 1 ? prices[0] : "—",
            status: pickAggregatedCheckStatus(eanRows),
        };
    });
}

function pickAggregatedCheckStatus(rows) {
    const statuses = new Set(rows.map((row) => String(row?.status || "").toLowerCase()));
    if (statuses.has("exists")) return "exists";
    if (statuses.has("doesnt_exist")) return "doesnt_exist";
    if (statuses.has("error")) return "error";
    return rows[0]?.status || "error";
}

function dedupeValues(values) {
    const unique = [];
    const seen = new Set();

    values.forEach((value) => {
        const normalized = String(value == null ? "" : value).trim();
        if (!normalized || normalized === "—") return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        unique.push(normalized);
    });

    return unique;
}

function appendCheckExportAction(container, rows) {
    const successEans = extractSuccessfulCheckEans(rows);

    const actions = document.createElement("div");
    actions.className = "mb-4 flex items-center gap-2 flex-wrap";

    const csvButton = document.createElement("button");
    csvButton.type = "button";
    csvButton.className = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2";
    csvButton.textContent = `CSV (${successEans.length})`;
    csvButton.disabled = successEans.length === 0;
    csvButton.addEventListener("click", () => {
        downloadSuccessfulCheckEansCsv(successEans);
    });

    const xlsxButton = document.createElement("button");
    xlsxButton.type = "button";
    xlsxButton.className = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2";
    xlsxButton.textContent = `XLSX (${successEans.length})`;
    xlsxButton.disabled = successEans.length === 0;
    xlsxButton.addEventListener("click", () => {
        downloadSuccessfulCheckEansXlsx(successEans);
    });

    actions.appendChild(csvButton);
    actions.appendChild(xlsxButton);
    container.appendChild(actions);
}

function extractSuccessfulCheckEans(rows) {
    const result = [];
    const seen = new Set();

    rows.forEach((row) => {
        const status = String(row?.status || "").toLowerCase();
        const isSuccess = status === "exists" || status === "exist" || status === "success";
        if (!isSuccess) return;

        const ean = String(row?.ean || "").trim();
        if (!ean || ean === "—" || seen.has(ean)) return;
        seen.add(ean);
        result.push(ean);
    });

    return result;
}

function downloadSuccessfulCheckEansCsv(eans) {
    const content = ["ean", ...eans].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `successful_eans_${buildTimestamp()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function downloadSuccessfulCheckEansXlsx(eans) {
    const xlsx = window?.XLSX;
    if (!xlsx) {
        downloadSuccessfulCheckEansCsv(eans);
        return;
    }

    const rows = eans.map((ean) => ({ ean }));
    const sheet = xlsx.utils.json_to_sheet(rows, { header: ["ean"] });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "successful_eans");
    xlsx.writeFile(workbook, `successful_eans_${buildTimestamp()}.xlsx`);
}

function buildTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
