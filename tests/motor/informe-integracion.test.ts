// tests/motor/informe-integracion.test.ts
// Prueba de integración del módulo InformeEjecutivo en escaneos completos.

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { motor } from "../../src/motor/index.js";
import { generarInformeEjecutivo } from "../../src/motor/llm/ollama.js";
import { Scan, InformeEjecutivo } from "../../src/shared/contrato.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "..", "fixtures");

async function generarFixtures(): Promise<void> {
  if (fs.existsSync(path.join(FIXTURES, "repo-malicioso"))) return;
  const mod = await import("../../scripts/generar-fixture.ts");
  mod.generarRepoMalicioso();
  mod.generarRepoLimpio();
}

describe("Integración - Informe Ejecutivo en escaneos completos", () => {
  beforeAll(async () => {
    await generarFixtures();
  }, 60000);

  it("escaneo repo malicioso → genera InformeEjecutivo estructurado y retenido", async () => {
    const dir = path.join(FIXTURES, "repo-malicioso");
    const controller = new AbortController();

    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: "scan-integracion-malicioso",
        tipo: "repo",
        objetivo: "https://github.com/defensa/repo-malicioso",
        tieneHistorialGit: true,
        offline: true,
        signal: controller.signal,
      },
      () => {},
    );

    const scanMock: Scan = {
      id: "scan-integracion-malicioso",
      tipo: "repo",
      objetivo: "https://github.com/defensa/repo-malicioso",
      estado: "terminado",
      etapas: resultado.etapas,
      veredicto: resultado.veredicto,
      resumen: resultado.resumen,
      hallazgos: resultado.hallazgos,
      creadoEn: new Date().toISOString(),
      duracionMs: 1200,
    };

    const informe = await generarInformeEjecutivo(scanMock);

    // Validación estricta con schema Zod de contrato
    const resultadoValidacion = InformeEjecutivo.safeParse(informe);
    expect(resultadoValidacion.success).toBe(true);

    // Verificación de contenido del informe
    expect(informe.cabecera?.caratula).toContain("CIBERDEFENSA");
    expect(informe.cabecera?.codigoDocumento).toContain("ADUANA-DEF-SCAN-INT");
    expect(informe.objetivo).toContain("repo-malicioso");
    expect(informe.desarrollo).toContain("retenido");
    expect(informe.desafioDetectado).toContain("anomalía(s)");
    expect(informe.personal?.[0]?.nombre).toBeDefined();
    expect(informe.metricasImpacto?.some((m) => m.includes("retenido"))).toBe(true);
  }, 120000);

  it("escaneo repo limpio → genera InformeEjecutivo liberado sin vulnerabilidades", async () => {
    const dir = path.join(FIXTURES, "repo-limpio");
    const controller = new AbortController();

    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: "scan-integracion-limpio",
        tipo: "repo",
        objetivo: "https://github.com/defensa/repo-limpio",
        tieneHistorialGit: true,
        offline: true,
        signal: controller.signal,
      },
      () => {},
    );

    const scanMock: Scan = {
      id: "scan-integracion-limpio",
      tipo: "repo",
      objetivo: "https://github.com/defensa/repo-limpio",
      estado: "terminado",
      etapas: resultado.etapas,
      veredicto: resultado.veredicto,
      resumen: resultado.resumen,
      hallazgos: resultado.hallazgos,
      creadoEn: new Date().toISOString(),
      duracionMs: 800,
    };

    const informe = await generarInformeEjecutivo(scanMock);
    const resultadoValidacion = InformeEjecutivo.safeParse(informe);
    expect(resultadoValidacion.success).toBe(true);

    expect(informe.conclusion).toContain("cumple con los criterios mínimos");
    expect(informe.desafioDetectado).toContain("No se identificaron vectores de ataque");
  }, 120000);
});
