// Configuración central: puerto, límites, detección de red.
// Todo lo que otro módulo necesite parametrizar vive acá, no hardcodeado.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..", "..");

export const HOST = "127.0.0.1";
export const PORT = Number(process.env.ADUANA_PORT ?? 3000);

export const ORIGENES_PERMITIDOS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

export const RUTA_DB = process.env.ADUANA_DB_PATH ?? path.join(RAIZ, "data", "aduana.db");
export const RUTA_CUARENTENA = "/tmp/aduana";

export const LIMITES = {
  bodyJson: "10kb",
  repoClonMaxBytes: 200 * 1024 * 1024, // 200 MB
  paqueteDescargaMaxBytes: 50 * 1024 * 1024, // 50 MB
  timeoutCloneMs: 60_000,
  timeoutTrabajoMs: 5 * 60_000, // 5 minutos, ingesta + análisis
  timeoutCheckRepoAgenteMs: 120_000,
  bufferBusExpiraMs: 5 * 60_000, // se libera 5' después de terminar el scan
  heartbeatSseMs: 15_000,
};

export const REPORTE_BASE_URL =
  process.env.ADUANA_REPORTE_URL ?? "http://127.0.0.1:5173/escaneos";

// ─── Motor ──────────────────────────────────────────────────────────────────

export function usarMotorStub(): boolean {
  return process.env.ADUANA_MOTOR === "stub";
}

// ─── Detección de red / modo offline ───────────────────────────────────────

let offline = process.env.ADUANA_OFFLINE === "1";
const forzadoOffline = process.env.ADUANA_OFFLINE === "1";

export function estaOffline(): boolean {
  return offline;
}

async function chequearRed(): Promise<void> {
  if (forzadoOffline) return; // no pisar el flag forzado
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 3_000);
  try {
    const resp = await fetch("https://registry.npmjs.org", {
      method: "HEAD",
      signal: controlador.signal,
    });
    offline = !resp.ok;
  } catch {
    offline = true;
  } finally {
    clearTimeout(timeout);
  }
}

let intervalo: NodeJS.Timeout | undefined;

export function iniciarDeteccionDeRed(): void {
  void chequearRed();
  intervalo = setInterval(() => void chequearRed(), 60_000);
  intervalo.unref();
}

export function detenerDeteccionDeRed(): void {
  if (intervalo) clearInterval(intervalo);
}
