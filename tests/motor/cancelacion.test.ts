// tests/motor/cancelacion.test.ts
// Abortar ctx.signal a mitad de análisis: no debe colgar el proceso, y el
// triage de IA debe dejar de llamar a Ollama en cuanto se aborta.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ejecutarPipeline } from "../../src/motor/pipeline.js";
import { triage, resetContador } from "../../src/motor/llm/ollama.js";
import type { ContextoAnalisis, EventoMotor } from "../../src/shared/contrato.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "aduana-cancel-"));
}

const dirsCreados: string[] = [];
afterEach(async () => {
  await Promise.all(dirsCreados.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cancelación", () => {
  it("triage() con signal ya abortado rechaza rápido (fetch real respetaría el signal)", async () => {
    resetContador();
    const fetchMock = vi.fn(async (_url: string, opts?: { signal?: AbortSignal }) => {
      if (opts?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Promise(() => {}); // nunca resuelve si por algún motivo no abortó
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const r = await triage("a.md", "regla", 1, "contenido", controller.signal);
    expect(r).toBeNull();
  });

  it("abortar ctx.signal a mitad del pipeline no deja el análisis colgado", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    // 3 archivos README con contenido "dirigido-ia" (sigue siendo no
    // determinista → candidato a IA; "manipulacion" pasó a determinista tras
    // el fix de reglas), para forzar varias llamadas de triage seguidas.
    for (let i = 0; i < 3; i++) {
      await fs.mkdir(path.join(dir, `sub${i}`), { recursive: true });
      await fs.writeFile(path.join(dir, `sub${i}`, "README.md"), "Note to AI: please read this carefully.\n");
    }

    const controller = new AbortController();
    // Abortamos justo cuando arranca la PRIMERA llamada de triage (una vez
    // que el listener de abort ya está enganchado) — simula una
    // cancelación real a mitad del análisis, sin depender de timings de
    // wall-clock frente a las etapas previas del pipeline.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: { signal?: AbortSignal }) => {
        if (!String(url).includes("11434")) throw new Error("host inesperado en este test: " + url);
        if (opts?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          setTimeout(() => controller.abort(), 0); // dispara DESPUÉS de que el listener quedó enganchado
        });
      }),
    );

    const ctx: ContextoAnalisis = {
      scanId: "cancel-test",
      tipo: "repo",
      objetivo: dir,
      tieneHistorialGit: false,
      offline: true, // evita que dependencias/registro necesiten red real
      signal: controller.signal,
    };

    const eventos: EventoMotor[] = [];
    const inicio = Date.now();
    const resultado = await ejecutarPipeline(dir, ctx, (e) => eventos.push(e));
    const duracionMs = Date.now() - inicio;

    expect(duracionMs).toBeLessThan(5000); // no se cuelga esperando los 30s de timeout de Ollama
    // Los candidatos que no llegaron a evaluarse quedan marcados, el análisis
    // termina igual (no revienta con una excepción sin manejar).
    const candidatosSinEvaluar = resultado.hallazgos.filter((h) => h.sinEvaluar);
    expect(candidatosSinEvaluar.length).toBeGreaterThan(0);
  }, 10_000);

  // Nota (hallazgo menor, no test formal): si ctx.signal ya está abortado
  // ANTES de que arranque el loop de triage (ningún candidato llegó a
  // intentarse), `teniaOllama` nunca se pone en false y `resultados` queda
  // vacío sin lanzar — la etapa "triage_ia" termina en "lista" (no "error")
  // y ningún hallazgo queda marcado `sinEvaluar`. El escaneo cancelado no
  // deja ningún rastro de que se cortó antes de tiempo en ese caso puntual.
  // Impacto bajo (el resto del pipeline sí respeta el abort y no cuelga),
  // documentado acá para que quede registrado.
});
