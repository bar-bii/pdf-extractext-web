// Capa de presentación: solo transforma datos en DOM. No conoce fetch ni el backend.

const TOAST_DURATION_MS = 4500;
const toastTimers = new WeakMap();

export function formatFileSize(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

export function shortenChecksum(checksum) {
  return checksum.length > 16 ? `${checksum.slice(0, 16)}…` : checksum;
}

export function describeUploadError(error) {
  switch (error?.status) {
    case 409:
      return "Ese PDF ya fue procesado antes (checksum duplicado).";
    case 400:
      return `El extractor rechazó el archivo: ${error.detail}`;
    case 413:
      return "El PDF es demasiado grande para el extractor.";
    case 415:
      return "El archivo enviado no es un PDF válido.";
    case 503:
      return error.retryAfter
        ? `Extractor saturado o caído. Reintenta en ${error.retryAfter} s.`
        : "Extractor no disponible. Intenta de nuevo más tarde.";
    case 504:
      return "El extractor tardó demasiado (timeout). Prueba con un PDF más liviano.";
    default:
      return `No se pudo extraer el texto: ${error?.detail ?? "error desconocido"}`;
  }
}

export function updateHealthBadge(badge, online) {
  badge.textContent = online ? "API operativa" : "API sin conexión";
  badge.className = online ? "badge badge--ok" : "badge badge--down";
}

export function showToast(toast, message, { isError = false } = {}) {
  toast.textContent = message;
  toast.classList.toggle("toast--error", isError);
  toast.hidden = false;

  clearTimeout(toastTimers.get(toast));
  const timer = setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION_MS);
  toastTimers.set(toast, timer);
}

export function setFilePreview({ filePreview, uploadButton }, file) {
  filePreview.hidden = false;
  filePreview.textContent = `${file.name} · ${formatFileSize(file.size)}`;
  uploadButton.disabled = false;
}

export function clearFilePreview({ filePreview, fileInput, uploadButton }) {
  fileInput.value = "";
  filePreview.hidden = true;
  uploadButton.disabled = true;
}

function actionButton(action, label, variant) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn--small ${variant}`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

export function renderDocuments(container, docs) {
  if (!docs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Todavía no hay documentos guardados.";
    container.replaceChildren(empty);
    return;
  }

  const cards = docs.map((doc) => {
    const article = document.createElement("article");
    article.className = "doc";
    article.dataset.id = doc.id;

    const preview = document.createElement("p");
    preview.className = "doc-preview";
    preview.textContent = doc.text || "(sin texto)";

    const code = document.createElement("span");
    code.className = "doc-code";
    code.textContent = shortenChecksum(doc.checksum || "");

    const actions = document.createElement("div");
    actions.className = "doc-actions";
    actions.append(
      actionButton("view", "Ver", "btn--ghost"),
      actionButton("edit", "Editar", "btn--ghost"),
      actionButton("delete", "Borrar", "btn--danger")
    );

    article.append(preview, code, actions);
    return article;
  });

  container.replaceChildren(...cards);
}

export function openDocumentDialog(els, doc, mode) {
  els.dialogTitle.textContent = mode === "edit" ? "Editar texto" : "Texto del documento";
  els.dialogChecksum.textContent = doc.checksum;
  els.dialogText.value = doc.text;
  els.dialogText.readOnly = mode !== "edit";
  els.dialogSave.hidden = mode !== "edit";
  els.dialog.showModal();
}
