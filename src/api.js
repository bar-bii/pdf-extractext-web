// Cliente HTTP puro: no conoce el DOM ni el estado de la interfaz.
// Todas las rutas cuelgan de /api, que nginx reenvía al backend (12-Factor: config externa).

export class ApiError extends Error {
  constructor(message, { status, detail, retryAfter, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter ?? null;
  }
}

async function readDetail(response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    return JSON.stringify(data?.detail ?? data);
  } catch {
    return `Error ${response.status}`;
  }
}

export function createApiClient({
  baseUrl = "/api",
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, options);
    } catch (cause) {
      throw new ApiError("No se pudo conectar con la API.", { cause });
    }

    if (!response.ok) {
      const detail = await readDetail(response);
      throw new ApiError(detail, {
        status: response.status,
        detail,
        retryAfter: response.headers?.get?.("Retry-After") ?? null,
      });
    }

    return response;
  }

  return {
    async health() {
      try {
        await request("/health");
        return true;
      } catch {
        return false;
      }
    },

    async extractPdf(file) {
      const body = new FormData();
      body.append("file", file);
      const response = await request("/extract", { method: "POST", body });
      return response.json();
    },

    async listDocuments() {
      const response = await request("/documents");
      return response.json();
    },

    async getDocument(id) {
      const response = await request(`/documents/${encodeURIComponent(id)}`);
      return response.json();
    },

    async updateDocument(id, changes) {
      const response = await request(`/documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      return response.json();
    },

    async deleteDocument(id) {
      await request(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}
