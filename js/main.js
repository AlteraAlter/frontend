import { initAuthModal } from "./modules/modals/authModal.js";
import { initUploadModal } from "./modules/modals/uploadModal.js";
import { initCheckModal } from "./modules/modals/checkModal.js";
import { initDeleteModal } from "./modules/modals/deleteModal.js";
import { renderMetricCards } from "./ui/cards.js";
import { initLogsPanel } from "./ui/logsPanel.js";

// Bootstraps all UI modules once the static page is ready.
document.addEventListener("DOMContentLoaded", () => {
    initAuthModal();
    initUploadModal();
    initCheckModal();
    initDeleteModal();
    renderMetricCards();
    initLogsPanel();
});
