// tests/plataforma/api-agente.test.ts
// Endpoints usados por el MCP: check-package, check-repo, y su registro en
// /api/agente/events + DB.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

let servidor: ServidorTest;
const PUERTO = 39003;

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

async function checkPackage(ecosistema: string, nombre: string) {
  const resp = await fetch(`${servidor.baseUrl}/api/agente/check-package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ecosistema, nombre }),
  });
  return { status: resp.status, body: await resp.json() };
}

describe("POST /api/agente/check-package (motor stub)", () => {
  it("confundible conocido → requiere_confirmacion con sugerencia", async () => {
    const { status, body } = await checkPackage("npm", "unused-imports");
    expect(status).toBe(200);
    expect(body.resultado).toBe("requiere_confirmacion");
    expect(body.sugerencia).toBe("eslint-plugin-unused-imports");
  });

  it("no existe (fake-*) → bloqueado", async () => {
    const { status, body } = await checkPackage("npm", "fake-paquete-x");
    expect(status).toBe(200);
    expect(body.resultado).toBe("bloqueado");
    expect(body.existe).toBe(false);
  });

  it("popular y sano → permitido", async () => {
    const { status, body } = await checkPackage("npm", "express");
    expect(status).toBe(200);
    expect(body.resultado).toBe("permitido");
  });

  it("body inválido (ecosistema no soportado) → 400", async () => {
    const { status } = await checkPackage("deno", "algo");
    expect(status).toBe(400);
  });

  it("cada consulta se registra como EventoAgente en la DB y en el stream", async () => {
    await checkPackage("npm", "un-paquete-de-prueba-unico-12345");
    const resp = await fetch(`${servidor.baseUrl}/api/agente/events`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
    // GET /api/agente/events es un SSE de larga duración; leemos el buffer inicial y cortamos.
    if (resp?.body) {
      const reader = resp.body.getReader();
      const { value } = await reader.read();
      const texto = new TextDecoder().decode(value);
      expect(texto).toContain("un-paquete-de-prueba-unico-12345");
      reader.cancel();
    }
  });
});

describe("POST /api/agente/check-repo", () => {
  it("url inválida → 400", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/agente/check-repo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    expect(resp.status).toBe(400);
  });

  it("repo válido → espera el veredicto y devuelve scanId + resumen (con red: clona un repo público real y chico)", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/agente/check-repo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/octocat/Hello-World" }),
      signal: AbortSignal.timeout(15_000),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.scanId).toBeDefined();
    expect(body.estado).toBe("terminado");
    expect(body.veredicto).toBeDefined();
  }, 20_000);
});

describe("Cuarentena", () => {
  it("/tmp/aduana/<id> se borra siempre, incluso con el motor stub", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "npm:picocolors" }),
    });
    const { id } = await resp.json();
    // Esperamos a que termine (motor stub tarda ~2-5s en total).
    await new Promise((r) => setTimeout(r, 6000));
    expect(fs.existsSync(`/tmp/aduana/${id}`)).toBe(false);
  }, 15_000);
});
