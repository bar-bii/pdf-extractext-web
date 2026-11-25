import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearFilePreview,
  describeUploadError,
  formatFileSize,
  openDocumentDialog,
  renderDocuments,
  setFilePreview,
  shortenChecksum,
  showToast,
  updateHealthBadge,
} from "../src/ui.js";

function makeDialogElements() {
  return {
    dialogTitle: document.createElement("h2"),
    dialogChecksum: document.createElement("code"),
    dialogText: document.createElement("textarea"),
    dialogSave: document.createElement("button"),
    dialog: { showModal: vi.fn() },
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("formatFileSize", () => {
  it("muestra el tamaño en KB redondeado", () => {
    expect(formatFileSize(1536)).toBe("2 KB");
  });
});

describe("shortenChecksum", () => {
  it("recorta checksums largos", () => {
    expect(shortenChecksum("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef…");
  });

  it("deja intactos los cortos", () => {
    expect(shortenChecksum("abc")).toBe("abc");
  });
});

describe("describeUploadError", () => {
  it("explica el duplicado (409)", () => {
    expect(describeUploadError({ status: 409 })).toContain("duplicado");
  });

  it("incluye el detalle del extractor (400)", () => {
    expect(describeUploadError({ status: 400, detail: "no es pdf" })).toContain("no es pdf");
  });

  it("explica archivo demasiado grande (413)", () => {
    expect(describeUploadError({ status: 413 })).toContain("demasiado grande");
  });

  it("explica formato inválido (415)", () => {
    expect(describeUploadError({ status: 415 })).toContain("PDF válido");
  });

  it("usa Retry-After cuando el extractor está saturado (503)", () => {
    expect(describeUploadError({ status: 503, retryAfter: "12" })).toContain("12 s");
  });

  it("explica el timeout (504)", () => {
    expect(describeUploadError({ status: 504 })).toContain("timeout");
  });

  it("tiene un mensaje genérico para el resto", () => {
    expect(describeUploadError({ status: 500, detail: "boom" })).toContain("boom");
  });
});

describe("updateHealthBadge", () => {
  it("marca la API como operativa", () => {
    const badge = document.createElement("span");
    updateHealthBadge(badge, true);

    expect(badge.textContent).toBe("API operativa");
    expect(badge.className).toBe("badge badge--ok");
  });

  it("marca la API sin conexión", () => {
    const badge = document.createElement("span");
    updateHealthBadge(badge, false);

    expect(badge.textContent).toBe("API sin conexión");
    expect(badge.className).toBe("badge badge--down");
  });
});

describe("showToast", () => {
  it("muestra el mensaje y lo oculta al pasar el tiempo", () => {
    vi.useFakeTimers();
    const toast = document.createElement("div");
    toast.hidden = true;

    showToast(toast, "guardado");

    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe("guardado");
    expect(toast.classList.contains("toast--error")).toBe(false);

    vi.advanceTimersByTime(4500);
    expect(toast.hidden).toBe(true);
  });

  it("aplica el estilo de error", () => {
    const toast = document.createElement("div");
    showToast(toast, "falló", { isError: true });

    expect(toast.classList.contains("toast--error")).toBe(true);
  });
});

describe("setFilePreview / clearFilePreview", () => {
  it("muestra nombre y tamaño y habilita el botón", () => {
    const filePreview = document.createElement("div");
    const uploadButton = document.createElement("button");
    uploadButton.disabled = true;

    setFilePreview(
      { filePreview, uploadButton },
      new File(["x"], "test.pdf", { type: "application/pdf" })
    );

    expect(filePreview.hidden).toBe(false);
    expect(filePreview.textContent).toContain("test.pdf");
    expect(uploadButton.disabled).toBe(false);
  });

  it("limpia la selección y deshabilita el botón", () => {
    const filePreview = document.createElement("div");
    const fileInput = document.createElement("input");
    const uploadButton = document.createElement("button");

    clearFilePreview({ filePreview, fileInput, uploadButton });

    expect(filePreview.hidden).toBe(true);
    expect(fileInput.value).toBe("");
    expect(uploadButton.disabled).toBe(true);
  });
});

describe("renderDocuments", () => {
  it("muestra un estado vacío", () => {
    const container = document.createElement("div");

    renderDocuments(container, []);

    expect(container.querySelector(".empty").textContent).toContain("Todavía no hay");
  });

  it("renderiza tarjetas con acciones y datos", () => {
    const container = document.createElement("div");

    renderDocuments(container, [
      { id: "abc", text: "contenido", checksum: "0123456789abcdef0123456789abcdef" },
    ]);

    const card = container.querySelector(".doc");
    expect(card.dataset.id).toBe("abc");
    expect(card.querySelector(".doc-preview").textContent).toBe("contenido");
    expect(card.querySelector(".doc-code").textContent).toBe("0123456789abcdef…");
    expect([...card.querySelectorAll("button")].map((b) => b.dataset.action)).toEqual([
      "view",
      "edit",
      "delete",
    ]);
  });

  it("no interpreta el texto del documento como HTML", () => {
    const container = document.createElement("div");

    renderDocuments(container, [
      { id: "1", text: "<img src=x onerror=alert(1)>", checksum: "abc" },
    ]);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".doc-preview").textContent).toContain("<img");
  });
});

describe("openDocumentDialog", () => {
  it("abre en modo lectura", () => {
    const els = makeDialogElements();

    openDocumentDialog(els, { id: "1", text: "hola", checksum: "abc" }, "view");

    expect(els.dialogTitle.textContent).toBe("Texto del documento");
    expect(els.dialogText.readOnly).toBe(true);
    expect(els.dialogSave.hidden).toBe(true);
    expect(els.dialogChecksum.textContent).toBe("abc");
    expect(els.dialog.showModal).toHaveBeenCalledOnce();
  });

  it("abre en modo edición", () => {
    const els = makeDialogElements();

    openDocumentDialog(els, { id: "1", text: "hola", checksum: "abc" }, "edit");

    expect(els.dialogText.readOnly).toBe(false);
    expect(els.dialogSave.hidden).toBe(false);
  });
});
