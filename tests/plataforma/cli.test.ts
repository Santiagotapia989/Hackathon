// tests/plataforma/cli.test.ts
// CLI `aduana` como subproceso, contra el servidor de test (motor stub).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

const RAIZ = path.resolve(import.meta.dirname!, "..", "..");
let servidor: ServidorTest;
const PUERTO = 39005;

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

function correrCli(args: string[], env: Record<string, string> = {}, timeoutMs = 15_000): Promise<{ codigo: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proceso = spawn("npx", ["tsx", "src/plataforma/cli.ts", ...args], {
      cwd: RAIZ,
      env: { ...process.env, ADUANA_API_URL: servidor.baseUrl, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proceso.stdout.on("data", (d) => (stdout += d.toString()));
    proceso.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => proceso.kill(), timeoutMs);
    proceso.on("exit", (codigo) => {
      clearTimeout(timer);
      resolve({ codigo, stdout, stderr });
    });
  });
}

describe("CLI aduana scan", () => {
  it("veredicto retenido (motor stub siempre da retenido) → exit code 1", async () => {
    const { codigo, stdout } = await correrCli(["scan", "npm:picocolors"]);
    expect(codigo).toBe(1);
    expect(stdout).toMatch(/RETENIDO/);
  }, 15_000);

  it("objetivo inválido → error claro en español, sin crashear", async () => {
    const { codigo, stdout, stderr } = await correrCli(["scan", "file:///etc/passwd"]);
    expect(codigo).not.toBe(0);
    const salida = stdout + stderr;
    expect(salida.length).toBeGreaterThan(0);
    expect(salida).not.toMatch(/at Object\.<anonymous>|TypeError|ReferenceError/); // no es un stack trace crudo
  }, 10_000);

  it("con el servidor apagado (puerto sin nada escuchando) → mensaje claro y exit code 2", async () => {
    const { codigo, stdout, stderr } = await correrCli(["scan", "npm:picocolors"], { ADUANA_API_URL: "http://127.0.0.1:19998" });
    expect(codigo).toBe(2);
    expect((stdout + stderr).toLowerCase()).toMatch(/no responde|iniciá el servidor/);
  }, 10_000);

  it("la evidencia impresa nunca lleva caracteres invisibles crudos (van marcados ⟦U+...⟧ o [U+...])", async () => {
    const { stdout } = await correrCli(["scan", "npm:picocolors"]);
    // eslint-disable-next-line no-control-regex
    const RE_INVISIBLE = /[​-‏‪-‮\u{E0000}-\u{E007F}]/u;
    expect(RE_INVISIBLE.test(stdout)).toBe(false);
  }, 15_000);
});

describe("CLI aduana install", () => {
  it("formato inválido (sin npm:) → error y exit code 2", async () => {
    const { codigo, stdout, stderr } = await correrCli(["install", "picocolors"]);
    expect(codigo).toBe(2);
    expect((stdout + stderr)).toMatch(/npm:/);
  }, 10_000);

  it("paquete bloqueado (fake-*) → no instala, exit code 1", async () => {
    const { codigo, stdout } = await correrCli(["install", "npm:fake-paquete-cli-test"]);
    expect(codigo).toBe(1);
    expect(stdout).toMatch(/[Bb]loqueado/);
  }, 10_000);
});
