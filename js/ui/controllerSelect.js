export const DEFAULT_CONTROLLER = "jv";

const CONTROLLERS = [
    { value: "jv", label: "JV" },
    { value: "xl", label: "XL" },
];

export function normalizeController(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return CONTROLLERS.some((item) => item.value === normalized)
        ? normalized
        : DEFAULT_CONTROLLER;
}

export function renderControllerSelectorMarkup({
    title = "Controller",
    groupName = "task-controller",
    idPrefix = "task-controller",
    selected = DEFAULT_CONTROLLER,
} = {}) {
    const normalizedSelected = normalizeController(selected);
    const options = CONTROLLERS.map((item) => {
        const checked = item.value === normalizedSelected ? "checked" : "";
        const optionId = `${idPrefix}-${item.value}`;
        return `<label class="inline-flex items-center gap-2 cursor-pointer controller-radio-option">
                    <input type="radio" name="${groupName}" id="${optionId}" value="${item.value}" ${checked}>
                    <span class="font-medium">${item.label}</span>
                </label>`;
    }).join("");

    return `<div class="space-y-2">
                <p class="text-sm font-medium leading-none">${title}</p>
                <div class="flex items-center gap-6 controller-radio-group">
                    ${options}
                </div>
            </div>`;
}

export function getSelectedController(container, groupName) {
    if (!container) return DEFAULT_CONTROLLER;
    const selected = container.querySelector(`input[name="${groupName}"]:checked`);
    return normalizeController(selected?.value);
}

export function bindControllerSelector(container, { groupName, onChange } = {}) {
    if (!container || !groupName) return () => {};
    const radioNodes = container.querySelectorAll(`input[name="${groupName}"]`);
    if (!radioNodes.length) return () => {};

    const emit = () => {
        const selected = getSelectedController(container, groupName);
        if (typeof onChange === "function") onChange(selected);
    };

    radioNodes.forEach((input) => input.addEventListener("change", emit));
    emit();
    return emit;
}
