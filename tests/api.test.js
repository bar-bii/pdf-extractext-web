import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "../src/api.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createApiClient", () => {
  it("usa /api como base URL por defecto", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const api = createApiClient({ fetchImpl });

    await api.listDocuments();

    expect(fetchImpl).toHaveBeenCalledWith("/api/documents", expect.anything());
  });

  it("permite configurar otra base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    const api = createApiClient({ baseUrl: "http://localhost:8002", fetchImpl });

    await api.health();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8002/health",
      expect.anything()
    );
  });

  describe("health", () => {
    it("devuelve true cuando la API responde 200", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
      const api = createApiClient({ fetchImpl });

      await expect(api.health()).resolves.toBe(true);
    });

    it("devuelve false cuando la API falla o no hay conexión", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
      const api = createApiClient({ fetchImpl });

      await expect(api.health()).resolves.toBe(false);
    });
  });

  describe("extractPdf", () => {
    it("envía el archivo como multipart a POST /extract", async () => {
      const payload = { text: "hola", checksum: "abc" };
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));
      const api = createApiClient({ fetchImpl });
      const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

      await expect(api.extractPdf(file)).resolves.toEqual(payload);

      const [url, options] = fetchImpl.mock.calls[0];
      expect(url).toBe("/api/extract");
      expect(options.method).toBe("POST");
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get("file")).toBe(file);
    });

    it("lanza ApiError con status, detalle y Retry-After ante una respuesta de error", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(
          { detail: "saturado" },
          { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "12" } }
        )
      );
      const api = createApiClient({ fetchImpl });

      const error = await api
        .extractPdf(new File(["pdf"], "doc.pdf"))
        .catch((cause) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(503);
      expect(error.detail).toBe("saturado");
      expect(error.retryAfter).toBe("12");
    });

    it("lanza ApiError de conexión cuando fetch rechaza", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError("failed to fetch"));
      const api = createApiClient({ fetchImpl });

      const error = await api
        .extractPdf(new File(["pdf"], "doc.pdf"))
        .catch((cause) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBeUndefined();
    });
  });

  describe("documentos", () => {
    it("lista documentos", async () => {
      const docs = [{ id: "1", text: "a", checksum: "b" }];
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(docs));
      const api = createApiClient({ fetchImpl });

      await expect(api.listDocuments()).resolves.toEqual(docs);
    });

    it("obtiene un documento codificando el id", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "a/b" }));
      const api = createApiClient({ fetchImpl });

      await api.getDocument("a/b");

      expect(fetchImpl).toHaveBeenCalledWith("/api/documents/a%2Fb", expect.anything());
    });

    it("actualiza el texto con PATCH y JSON", async () => {
      const updated = { id: "1", text: "nuevo", checksum: "c" };
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(updated));
      const api = createApiClient({ fetchImpl });

      await expect(api.updateDocument("1", { text: "nuevo" })).resolves.toEqual(updated);

      const [url, options] = fetchImpl.mock.calls[0];
      expect(url).toBe("/api/documents/1");
      expect(options.method).toBe("PATCH");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(options.body)).toEqual({ text: "nuevo" });
    });

    it("borra un documento y tolera 204 sin cuerpo", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      const api = createApiClient({ fetchImpl });

      await expect(api.deleteDocument("1")).resolves.toBeUndefined();

      const [url, options] = fetchImpl.mock.calls[0];
      expect(url).toBe("/api/documents/1");
      expect(options.method).toBe("DELETE");
    });
  });
});
