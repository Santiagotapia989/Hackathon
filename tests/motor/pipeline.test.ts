// tests/motor/pipeline.test.ts
// Comportamiento end-to-end del pipeline cuando una etapa determinista
// falla (hoy: solo "secretos" puede fallar así, si gitleaks no está
// disponible). La etapa debe quedar en error y el veredicto no puede ser
// "liberado" — la regla de scoring.ts que fuerza "revisar" por etapa en
// error depende de que allEtapas esté poblado de verdad.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ejecutarPipeline } from "../../src/motor/pipeline.js";
import * as secretosMod from "../../src/motor/analizadores/secretos.js";
import type { ContextoAnalisis } from "../../src/shared/contrato.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "aduana-pipeline-test-"));
}

const dirsCreados: string[] = [];
afterEach(async () => {
  await Promise.all(dirsCreados.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe("ejecutarPipeline — etapa secretos en error", () => {
  it("gitleaks ausente/falla: la etapa 'secretos' queda en error y el veredicto no es 'liberado'", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    await fs.writeFile(path.join(dir, "README.md"), "Proyecto limpio, sin nada raro.\n");

    vi.spyOn(secretosMod, "analizarSecretos").mockRejectedValue(new Error("gitleaks no encontrado"));

    const ctx: ContextoAnalisis = {
      scanId: "pipeline-test-secretos-error",
      tipo: "repo",
      objetivo: dir,
      tieneHistorialGit: false,
      offline: true,
      signal: new AbortController().signal,
    };
    const resultado = await ejecutarPipeline(dir, ctx, () => {});

    const etapaSecretos = resultado.etapas.find((e) => e.nombre === "secretos");
    expect(etapaSecretos?.estado).toBe("error");
    expect(etapaSecretos?.error).toContain("gitleaks no encontrado");
    expect(resultado.veredicto).not.toBe("liberado");
    // El resto del pipeline no se aborta: sigue habiendo un veredicto y
    // las demás etapas (que sí corrieron) quedan registradas.
    expect(resultado.etapas.some((e) => e.nombre === "unicode" && e.estado === "lista")).toBe(true);
  });

  it("gitleaks funciona bien: la etapa 'secretos' queda 'lista' (sin falso positivo del fix)", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    await fs.writeFile(path.join(dir, "README.md"), "Proyecto limpio, sin nada raro.\n");

    const ctx: ContextoAnalisis = {
      scanId: "pipeline-test-secretos-ok",
      tipo: "repo",
      objetivo: dir,
      tieneHistorialGit: false,
      offline: true,
      signal: new AbortController().signal,
    };
    const resultado = await ejecutarPipeline(dir, ctx, () => {});

    const etapaSecretos = resultado.etapas.find((e) => e.nombre === "secretos");
    expect(etapaSecretos?.estado).toBe("lista");
    expect(resultado.veredicto).toBe("liberado");
  });
});
