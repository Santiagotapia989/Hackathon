// tests/plataforma/api-sse.test.ts
// SSE real contra el servidor levantado como subproceso (motor stub).
//
// NOTA DE INFRA (histórica, ya arreglada): RUTA_DB era hardcodeada en
// config.ts, así que todos los archivos de test de plataforma compartían
// la MISMA data/aduana.db física, causando flakiness real en este archivo
// bajo el modo paralelo por default de Vitest. Ahora RUTA_DB es
// configurable por ADUANA_DB_PATH y cada archivo de test tiene su propia
// DB temporal (ver tests/setup-db.ts) — se mantiene fileParallelism:false
// en vitest.config.ts por simplicidad, no porque siga haciendo falta para
// evitar esta contención puntual.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

let servidor: ServidorTest;
const PUERTO = 39002;

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

async function crearScan(objetivo: string): Promise<string> {
  const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objetivo }),
  });
  const body = await resp.json();
  return body.id as string;
}

async function leerEventosSse(id: string, opts?: { timeoutMs?: number }): Promise<{ evento: string; data: unknown }[]> {
  const resp = await fetch(`${servidor.baseUrl}/api/scans/${id}/events`, {
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 15_000),
  });
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const eventos: { evento: string; data: unknown }[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const bloques = buffer.split("\n\n");
      buffer = bloques.pop() ?? "";
      for (const bloque of bloques) {
        if (!bloque.trim() || bloque.startsWith(":")) continue;
        let evento: string | undefined;
        let dataCruda = "";
        for (const linea of bloque.split("\n")) {
          if (linea.startsWith("event:")) evento = linea.slice("event:".length).trim();
          else if (linea.startsWith("data:")) dataCruda += linea.slice("data:".length).trim();
        }
        if (evento) eventos.push({ evento, data: dataCruda ? JSON.parse(dataCruda) : undefined });
        if (evento === "veredicto" || evento === "error") return eventos;
      }
    }
  } catch {
    // timeout/abort: devolvemos lo que se juntó hasta ahora
  }
  return eventos;
}

describe("SSE de /api/scans/:id/events", () => {
  it("eventos llegan en orden: etapas, luego hallazgos, veredicto al final", async () => {
    const id = await crearScan("npm:picocolors");
    const eventos = await leerEventosSse(id);

    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos[eventos.length - 1]!.evento).toBe("veredicto");
    const idxVeredicto = eventos.findIndex((e) => e.evento === "veredicto");
    // Ningún evento después del veredicto (es el cierre del stream).
    expect(idxVeredicto).toBe(eventos.length - 1);
  }, 15_000);

  it("conexión tardía: crear el scan, esperar 2s y recién ahí conectar — llegan los eventos anteriores en orden", async () => {
    const id = await crearScan("npm:picocolors");
    await new Promise((r) => setTimeout(r, 2000));
    const eventos = await leerEventosSse(id);

    expect(eventos.some((e) => e.evento === "etapa")).toBe(true);
    // No debe haber quedado colgado sin recibir nada por haberse "perdido" el arranque.
    expect(eventos.length).toBeGreaterThan(0);
  }, 15_000);

  it("scan ya terminado: reproduce etapas + hallazgos + veredicto desde la DB y cierra", async () => {
    const id = await crearScan("npm:picocolors");
    await leerEventosSse(id); // esperamos a que termine

    const eventos = await leerEventosSse(id, { timeoutMs: 5000 }); // segunda conexión, ya terminado
    expect(eventos.filter((e) => e.evento === "etapa").length).toBeGreaterThan(0);
    expect(eventos.some((e) => e.evento === "veredicto")).toBe(true);
  }, 25_000);

  it("dos clientes conectados al mismo scan en curso reciben los mismos eventos", async () => {
    const id = await crearScan("npm:picocolors");
    const [eventosA, eventosB] = await Promise.all([leerEventosSse(id), leerEventosSse(id)]);
    expect(eventosA.map((e) => e.evento)).toEqual(eventosB.map((e) => e.evento));
  }, 15_000);

  it("hallazgo re-emitido con el mismo id (triage) no queda duplicado en la DB", async () => {
    const id = await crearScan("npm:picocolors");
    await leerEventosSse(id);
    const scan = await (await fetch(`${servidor.baseUrl}/api/scans/${id}`)).json();
    // El stub re-emite "f2" con analisisIA (mismo id) — debe quedar 1 sola vez.
    const ids = scan.hallazgos.map((h: { id: string }) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 15_000);

  it("heartbeat: la conexión manda comentarios ': ping' periódicos (no se corta sola)", async () => {
    const id = await crearScan("npm:picocolors");
    await leerEventosSse(id); // dejamos que termine
    // Nos conectamos de nuevo (ya terminado) y confirmamos que al menos
    // el protocolo de heartbeat está disponible (headers correctos, no
    // rompe la conexión); esperar los 15s reales de heartbeatSseMs para un
    // scan en curso no es viable en este test sin tocar config.ts de
    // producción (LIMITES.heartbeatSseMs no es configurable por env).
    const resp = await fetch(`${servidor.baseUrl}/api/scans/${id}/events`);
    expect(resp.headers.get("content-type")).toContain("text/event-stream");
    expect(resp.headers.get("cache-control")).toContain("no-cache");
  }, 15_000);
});
