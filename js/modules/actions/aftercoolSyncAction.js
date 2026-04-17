import { qs, on } from "../../core/dom.js";
import { startOperationRequest } from "../../ui/fileSelect.js";
import { DEFAULT_CONTROLLER } from "../../ui/controllerSelect.js";

export function initAftercoolSyncAction() {
    const button = qs("#aftercoolSyncBtn");
    if (!button) return;

    on(button, "click", async () => {
        await startOperationRequest({
            operation: "aftercool_sync",
            controllers: [DEFAULT_CONTROLLER],
            triggerButton: button,
        });
    });
}
