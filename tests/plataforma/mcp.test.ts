// tests/plataforma/mcp.test.ts
// Servidor MCP por stdio: expone check_package/check_repo, y sobre todo
// verifica la regla crítica — ninguna respuesta al agente puede contener
// contenido analizado (evidencia, texto del repo, caracteres invisibles).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

const RAIZ = path.resolve(import.meta.dirname!, "..", "..");
let servidor: ServidorTest;
const PUERTO = 39004;

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

type RespuestaJsonRpc = { jsonrpc: "2.0"; id?: number; result?: any; error?: any };

async function hablarMcp(mensajes: object[], env: Record<string, string>, timeoutMs = 15_000): Promise<RespuestaJsonRpc[]> {
  const proceso = spawn("npx", ["tsx", "src/plataforma/mcp.ts"], {
    cwd: RAIZ,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  proceso.stdout.on("data", (d) => (stdout += d.toString()));
  let stderr = "";
  proceso.stderr.on("data", (d) => (stderr += d.toString()));

  proceso.stdin.write(mensajes.map((m) => JSON.stringify(m)).join("\n") + "\n");

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  proceso.kill();

  return stdout
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l));
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

describe("Servidor MCP", () => {
  it("expone check_package y check_repo con descripciones", async () => {
    const respuestas = await hablarMcp(
      [INIT, INITIALIZED, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }],
      { ADUANA_API_URL: servidor.baseUrl },
      5000,
    );
    const listado = respuestas.find((r) => r.id === 2);
    const nombres = listado?.result?.tools?.map((t: any) => t.name);
    expect(nombres).toContain("check_package");
    expect(nombres).toContain("check_repo");
    for (const tool of listado?.result?.tools ?? []) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  }, 10_000);

  it("check_package no filtra contenido analizado en la respuesta", async () => {
    const respuestas = await hablarMcp(
      [
        INIT,
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "check_package", arguments: { ecosistema: "npm", nombre: "unused-imports" } },
        },
      ],
      { ADUANA_API_URL: servidor.baseUrl },
      5000,
    );
    const r = respuestas.find((x) => x.id === 3);
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/colector\.invalid/i);
    expect(texto).not.toMatch(/ignor[aá]\s+las\s+reglas/i);
    expect(texto).not.toMatch(/ghp_[A-Za-z0-9]{10,}/);
    expect(texto).not.toMatch(/[​-‏‪-‮\u{E0000}-\u{E007F}]/u);
    // Y sí debe traer el veredicto/sugerencia esperado (no es una respuesta vacía).
    expect(texto).toContain("eslint-plugin-unused-imports");
  }, 10_000);

  it("check_repo con el repo malicioso (real, con red) no filtra evidencia ni el mensaje oculto", async () => {
    const respuestas = await hablarMcp(
      [
        INIT,
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "check_repo", arguments: { url: "https://github.com/octocat/Hello-World" } },
        },
      ],
      { ADUANA_API_URL: servidor.baseUrl },
      15_000,
    );
    const r = respuestas.find((x) => x.id === 4);
    expect(r).toBeDefined();
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/[​-‏‪-‮\u{E0000}-\u{E007F}]/u);
  }, 20_000);

  it("con el servidor apagado, responde que Aduana no está corriendo (falla cerrado)", async () => {
    const respuestas = await hablarMcp(
      [
        INIT,
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "check_package", arguments: { ecosistema: "npm", nombre: "express" } },
        },
      ],
      { ADUANA_API_URL: "http://127.0.0.1:19999" }, // puerto sin nada escuchando
      5000,
    );
    const r = respuestas.find((x) => x.id === 5);
    const texto = JSON.stringify(r).toLowerCase();
    expect(texto).toContain("no está corriendo");
    expect(r?.result?.isError).toBe(true);
  }, 10_000);
});
