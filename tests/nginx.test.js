// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../nginx.conf.template", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

describe("nginx.conf.template", () => {
  it("escucha en el puerto 80", () => {
    expect(template).toMatch(/listen 80;/);
  });

  it("sirve los estáticos con fallback a index.html", () => {
    expect(template).toContain("root /usr/share/nginx/html;");
    expect(template).toContain("try_files $uri $uri/ /index.html;");
  });

  it("proxya /api al backend configurable por entorno", () => {
    expect(template).toContain("location /api/");
    expect(template).toContain("proxy_pass ${API_UPSTREAM}/;");
  });

  it("permite subir un PDF de hasta 15 MB", () => {
    expect(template).toContain("client_max_body_size 16m;");
  });

  it("espera lo suficiente a la extracción", () => {
    expect(template).toMatch(/proxy_read_timeout\s+60s;/);
    expect(template).toMatch(/proxy_send_timeout\s+60s;/);
  });

  it("reenvía headers de proxy", () => {
    expect(template).toContain("proxy_set_header Host $host;");
    expect(template).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
  });
});

describe("Dockerfile", () => {
  it("usa la imagen oficial de nginx", () => {
    expect(dockerfile).toMatch(/^FROM nginx:/m);
  });

  it("copia los estáticos al document root", () => {
    expect(dockerfile).toContain("/usr/share/nginx/html");
  });

  it("instala el template de nginx", () => {
    expect(dockerfile).toContain("/etc/nginx/templates/default.conf.template");
  });

  it("limita envsubst a API_UPSTREAM para no romper variables de nginx", () => {
    expect(dockerfile).toContain("NGINX_ENVSUBST_FILTER=API_UPSTREAM");
  });
});
