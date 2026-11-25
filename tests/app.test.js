import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp, readElements } from "../src/app.js";

const MARKUP = `
  <span id="health-badge"></span>
  <form id="upload-form">
    <input id="file-input" type="file" />
    <label id="drop-zone"></label>
    <div id="file-preview" hidden></div>
    <button id="upload-button" disabled></button>
  </form>
  <div id="result" hidden>
    <pre id="result-text"></pre>
    <code id="result-checksum"></code>
    <button id="copy-button"></button>
  </div>
  <div id="documents"></div>
  <button id="refresh-button"></button>
  <dialog id="doc-dialog">
    <h2 id="dialog-title"></h2>
    <code id="dialog-checksum"></code>
    <textarea id="dialog-text"></textarea>
    <button id="dialog-save"></button>
  </dialog>
  <div id="toast" hidden></div>
`;

function setup(apiOverrides = {}, { confirm = true } = {}) {
  document.body.innerHTML = MARKUP;
  const els = readElements(document);
  els.dialog.showModal = vi.fn();
  const api = {
    health: vi.fn().mockResolvedValue(true),
    extractPdf: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    ...apiOverrides,
  };
  const confirmImpl = vi.fn().mockReturnValue(confirm);
  const app = createApp({ api, els, confirmImpl });
  return { api, els, app, confirmImpl };
}

function pdfFile(name = "doc.pdf", size = 1024) {
  const file = new File(["x"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("arranque", () => {
  it("consulta la salud y carga los documentos", async () => {
    const { api, els, app } = setup();

    app.start();
    await flush();

    expect(api.health).toHaveBeenCalledOnce();
    expect(els.healthBadge.textContent).toBe("API operativa");
    expect(api.listDocuments).toHaveBeenCalledOnce();
  });

  it("muestra error cuando la API está caída", async () => {
    const { els, app } = setup({ health: vi.fn().mockResolvedValue(false) });

    app.start();
    await flush();

    expect(els.healthBadge.textContent).toBe("API sin conexión");
  });
});

describe("selección de archivo", () => {
  it("rechaza archivos que no son PDF", () => {
    const { els, app } = setup();

    app.setFile(new File(["x"], "foto.png", { type: "image/png" }));

    expect(els.toast.hidden).toBe(false);
    expect(els.toast.textContent).toContain("debe ser un PDF");
  });

  it("rechaza PDFs mayores a 15 MB", () => {
    const { els, app } = setup();

    app.setFile(pdfFile("grande.pdf", 16 * 1024 * 1024));

    expect(els.toast.textContent).toContain("15 MB");
  });

  it("acepta un PDF válido y habilita la subida", () => {
    const { els, app } = setup();

    app.setFile(pdfFile());

    expect(els.filePreview.hidden).toBe(false);
    expect(els.uploadButton.disabled).toBe(false);
  });
});

describe("subida", () => {
  it("extrae, muestra el resultado y recarga la lista", async () => {
    const { api, els, app } = setup({
      extractPdf: vi.fn().mockResolvedValue({ text: "hola", checksum: "abc" }),
    });
    app.setFile(pdfFile());

    await app.uploadPdf({ preventDefault: vi.fn() });

    expect(api.extractPdf).toHaveBeenCalledOnce();
    expect(els.result.hidden).toBe(false);
    expect(els.resultText.textContent).toBe("hola");
    expect(els.resultChecksum.textContent).toBe("abc");
    expect(api.listDocuments).toHaveBeenCalled();
    expect(els.toast.textContent).toContain("guardado");
  });

  it("traduce el error 409 a un mensaje claro", async () => {
    const error = Object.assign(new Error("dup"), { status: 409, detail: "dup" });
    const { els, app } = setup({ extractPdf: vi.fn().mockRejectedValue(error) });
    app.setFile(pdfFile());

    await app.uploadPdf({ preventDefault: vi.fn() });

    expect(els.toast.textContent).toContain("duplicado");
    expect(els.toast.classList.contains("toast--error")).toBe(true);
    expect(els.uploadButton.disabled).toBe(false);
  });
});

describe("documentos", () => {
  it("renderiza la lista al recargar", async () => {
    const { els, app } = setup({
      listDocuments: vi
        .fn()
        .mockResolvedValue([{ id: "1", text: "texto", checksum: "abc" }]),
    });

    await app.loadDocuments();

    expect(els.documents.querySelector(".doc")).not.toBeNull();
  });

  it("abre el modal al ver un documento", async () => {
    const { api, els, app } = setup({
      getDocument: vi.fn().mockResolvedValue({ id: "1", text: "texto", checksum: "abc" }),
    });

    await app.openDocument("1", "view");

    expect(api.getDocument).toHaveBeenCalledWith("1");
    expect(els.dialog.showModal).toHaveBeenCalledOnce();
    expect(els.dialogText.value).toBe("texto");
  });

  it("borra tras confirmar", async () => {
    const { api, els, app, confirmImpl } = setup();

    await app.deleteDocument("1");

    expect(confirmImpl).toHaveBeenCalledOnce();
    expect(api.deleteDocument).toHaveBeenCalledWith("1");
    expect(els.toast.textContent).toContain("borrado");
  });

  it("no borra si el usuario cancela", async () => {
    const { api, app } = setup({}, { confirm: false });

    await app.deleteDocument("1");

    expect(api.deleteDocument).not.toHaveBeenCalled();
  });

  it("guarda cambios de texto", async () => {
    const { api, els, app } = setup({
      getDocument: vi.fn().mockResolvedValue({ id: "1", text: "viejo", checksum: "abc" }),
      updateDocument: vi.fn().mockResolvedValue({ id: "1", text: "nuevo", checksum: "abc" }),
    });
    await app.openDocument("1", "edit");
    els.dialogText.value = "nuevo";

    await app.saveDialog();

    expect(api.updateDocument).toHaveBeenCalledWith("1", { text: "nuevo" });
    expect(els.toast.textContent).toContain("actualizado");
  });

  it("no guarda texto vacío", async () => {
    const { api, els, app } = setup({
      getDocument: vi.fn().mockResolvedValue({ id: "1", text: "viejo", checksum: "abc" }),
    });
    await app.openDocument("1", "edit");
    els.dialogText.value = "   ";

    await app.saveDialog();

    expect(api.updateDocument).not.toHaveBeenCalled();
    expect(els.toast.textContent).toContain("no puede estar vacío");
  });
});
