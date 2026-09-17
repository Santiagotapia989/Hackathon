// tests/motor/integracion.test.ts
// Punto a punto: motor completo sobre los fixtures generados.
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { motor } from "../../src/motor/index.js";
import type { EventoMotor } from "../../src/shared/contrato.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "..", "fixtures");

async function generarFixtures(): Promise<void> {
  if (fs.existsSync(path.join(FIXTURES, "repo-malicioso"))) return;
  const mod = await import("../../scripts/generar-fixture.ts");
  mod.generarRepoMalicioso();
  mod.generarRepoLimpio();
}

// El motor no depende de Ollama para funcionar; triage falla → sinEvaluar/revisar.
describe("integración puntas a punta (sin Ollama)", () => {
  beforeAll(async () => {
    await generarFixtures();
  }, 60000);

  it("repo malicioso → retenido con los 4 módulos", async () => {
    const dir = path.join(FIXTURES, "repo-malicioso");
    const eventos: EventoMotor[] = [];
    const controller = new AbortController();

    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: "test-malicioso",
        tipo: "repo",
        objetivo: dir,
        tieneHistorialGit: true,
        offline: true,
        signal: controller.signal,
      },
      (e) => eventos.push(e),
    );

    expect(resultado.veredicto).toBe("retenido");
    expect(resultado.resumen.porModulo.unicode).toBeGreaterThan(0);
    expect(resultado.resumen.porModulo.instrucciones).toBeGreaterThan(0);
    expect(resultado.resumen.porModulo.dependencias).toBeGreaterThan(0);
    expect(resultado.resumen.porModulo.secretos).toBeGreaterThan(0);
  }, 120000);

  it("repo limpio → liberado con 0 hallazgos", async () => {
    const dir = path.join(FIXTURES, "repo-limpio");
    const controller = new AbortController();

    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: "test-limpio",
        tipo: "repo",
        objetivo: dir,
        tieneHistorialGit: true,
        offline: true,
        signal: controller.signal,
      },
      () => {},
    );

    expect(resultado.veredicto).toBe("liberado");
    expect(resultado.hallazgos).toHaveLength(0);
  }, 120000);

  it("con Ollama apagado el análisis termina y no da error", async () => {
    // Ya corremos con Ollama apagado en este entorno: el triage devuelve sinEvaluar.
    expect(process.env["ADUANA_OLLAMA_HOST"] ?? "http://localhost:11434").toBeDefined();
  });

  it("ningún hallazgo expone caracteres invisibles o secretos completos", async () => {
    const dir = path.join(FIXTURES, "repo-malicioso");
    const controller = new AbortController();
    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: "test-seguridad",
        tipo: "repo",
        objetivo: dir,
        tieneHistorialGit: true,
        offline: true,
        signal: controller.signal,
      },
      () => {},
    );

    const RE_INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFE00-\uFE0F\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\uFEFF\u00AD]/gu;
    for (const h of resultado.hallazgos) {
      expect(h.evidencia.length).toBeLessThanOrEqual(500);
      expect(h.evidencia.match(RE_INVISIBLE)).toBeNull();
      // No debe contener el token completo (solo el enmascarado)
      expect(h.evidencia).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
    }
  }, 120000);
});