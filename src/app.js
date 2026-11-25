// Wiring de la aplicación: conecta el cliente HTTP, la capa de UI y el DOM.
// No contiene lógica de red ni de render; solo orquesta (SRP + DIP).

import {
  clearFilePreview,
  describeUploadError,
  openDocumentDialog,
  renderDocuments,
  setFilePreview,
  showToast,
  updateHealthBadge,
} from "./ui.js";

export const MAX_BYTES = 15 * 1024 * 1024;
const HEALTH_INTERVAL_MS = 30000;

const ELEMENT_IDS = {
  uploadForm: "upload-form",
  fileInput: "file-input",
  dropZone: "drop-zone",
  filePreview: "file-preview",
  uploadButton: "upload-button",
  result: "result",
  resultText: "result-text",
  resultChecksum: "result-checksum",
  copyButton: "copy-button",
  documents: "documents",
  refreshButton: "refresh-button",
  healthBadge: "health-badge",
  toast: "toast",
  dialog: "doc-dialog",
  dialogTitle: "dialog-title",
  dialogChecksum: "dialog-checksum",
  dialogText: "dialog-text",
  dialogSave: "dialog-save",
};

export function readElements(root) {
  return Object.fromEntries(
    Object.entries(ELEMENT_IDS).map(([key, id]) => [key, root.getElementById(id)])
  );
}

function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function createApp({
  api,
  els,
  confirmImpl = (message) => window.confirm(message),
  clipboard = navigator.clipboard,
  win = window,
}) {
  let selectedFile = null;
  let editingId = null;

  async function checkHealth() {
    updateHealthBadge(els.healthBadge, await api.health());
  }

  function setFile(file) {
    if (!file) return;
    if (!isPdf(file)) {
      showToast(els.toast, "El archivo debe ser un PDF.", { isError: true });
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast(els.toast, "El PDF supera el límite de 15 MB.", { isError: true });
      return;
    }
    selectedFile = file;
    setFilePreview(els, file);
    els.result.hidden = true;
  }

  function clearFile() {
    selectedFile = null;
    clearFilePreview(els);
  }

  async function uploadPdf(event) {
    event.preventDefault();
    if (!selectedFile) return;

    const file = selectedFile;
    els.uploadButton.disabled = true;
    els.uploadButton.textContent = "Extrayendo…";

    try {
      const data = await api.extractPdf(file);
      els.result.hidden = false;
      els.resultText.textContent = data.text;
      els.resultChecksum.textContent = data.checksum;
      showToast(els.toast, "Texto extraído y guardado.");
      clearFile();
      await loadDocuments();
    } catch (error) {
      showToast(els.toast, describeUploadError(error), { isError: true });
      selectedFile = file;
      els.uploadButton.disabled = false;
    } finally {
      els.uploadButton.textContent = "Extraer texto";
    }
  }

  async function loadDocuments() {
    try {
      renderDocuments(els.documents, await api.listDocuments());
    } catch {
      els.documents.innerHTML = '<p class="empty">No se pudieron cargar los documentos.</p>';
    }
  }

  async function openDocument(id, mode) {
    try {
      const doc = await api.getDocument(id);
      editingId = mode === "edit" ? doc.id : null;
      openDocumentDialog(els, doc, mode);
    } catch (error) {
      showToast(els.toast, error.message, { isError: true });
    }
  }

  async function deleteDocument(id) {
    if (!confirmImpl("¿Borrar este documento? Esta acción no se puede deshacer.")) return;
    try {
      await api.deleteDocument(id);
      showToast(els.toast, "Documento borrado.");
      await loadDocuments();
    } catch (error) {
      showToast(els.toast, error.message, { isError: true });
    }
  }

  async function saveDialog() {
    if (!editingId) return;
    const text = els.dialogText.value;
    if (!text.trim()) {
      showToast(els.toast, "El texto no puede estar vacío.", { isError: true });
      return;
    }
    try {
      await api.updateDocument(editingId, { text });
      showToast(els.toast, "Documento actualizado.");
      await loadDocuments();
    } catch (error) {
      showToast(els.toast, error.message, { isError: true });
    }
  }

  async function copyResult() {
    try {
      await clipboard.writeText(els.resultText.textContent);
      showToast(els.toast, "Texto copiado al portapapeles.");
    } catch {
      showToast(els.toast, "No se pudo copiar el texto.", { isError: true });
    }
  }

  function handleDocumentClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest(".doc");
    if (!card) return;
    const action = button.dataset.action;
    if (action === "delete") {
      deleteDocument(card.dataset.id);
    } else {
      openDocument(card.dataset.id, action);
    }
  }

  function wireEvents() {
    els.fileInput.addEventListener("change", (event) => setFile(event.target.files[0]));
    els.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        els.fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((type) =>
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragover");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragover");
      })
    );
    els.dropZone.addEventListener("drop", (event) => setFile(event.dataTransfer.files[0]));

    els.uploadForm.addEventListener("submit", uploadPdf);
    els.refreshButton.addEventListener("click", loadDocuments);
    els.copyButton.addEventListener("click", copyResult);
    els.documents.addEventListener("click", handleDocumentClick);
    els.dialogSave.addEventListener("click", saveDialog);
  }

  let healthTimer = null;

  function start() {
    wireEvents();
    checkHealth();
    healthTimer = win.setInterval(checkHealth, HEALTH_INTERVAL_MS);
    loadDocuments();
  }

  function stop() {
    if (healthTimer !== null) win.clearInterval(healthTimer);
    healthTimer = null;
  }

  return {
    start,
    stop,
    setFile,
    uploadPdf,
    loadDocuments,
    openDocument,
    deleteDocument,
    saveDialog,
  };
}
