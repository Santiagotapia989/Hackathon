// Eventos en memoria por escaneo, con buffer de todo lo emitido.
// El front abre el SSE después de recibir el id, así que necesita poder
// "ponerse al día" con lo que ya pasó (sección 6 del contexto).

import { EventEmitter } from "node:events";
import { LIMITES } from "./config.js";

export interface EventoBus {
  evento: string;
  data: unknown;
}

export class Canal {
  readonly emisor = new EventEmitter();
  readonly buffer: EventoBus[] = [];
  private expiracion?: NodeJS.Timeout;

  constructor() {
    this.emisor.setMaxListeners(50);
  }

  emitir(evento: string, data: unknown): void {
    const item: EventoBus = { evento, data };
    this.buffer.push(item);
    this.emisor.emit("evento", item);
  }

  programarExpiracion(msExpiracion: number, alExpirar: () => void): void {
    if (this.expiracion) clearTimeout(this.expiracion);
    this.expiracion = setTimeout(alExpirar, msExpiracion);
    this.expiracion.unref();
  }
}

// ─── Canales por escaneo ────────────────────────────────────────────────────

const canalesScan = new Map<string, Canal>();

export function obtenerOCrearCanalScan(scanId: string): Canal {
  let canal = canalesScan.get(scanId);
  if (!canal) {
    canal = new Canal();
    canalesScan.set(scanId, canal);
  }
  return canal;
}

export function obtenerCanalScan(scanId: string): Canal | undefined {
  return canalesScan.get(scanId);
}

export function emitirEventoScan(scanId: string, evento: string, data: unknown): void {
  obtenerOCrearCanalScan(scanId).emitir(evento, data);
}

/** Se llama cuando el escaneo termina (terminado o error): el buffer se libera 5' después. */
export function terminarCanalScan(scanId: string): void {
  const canal = canalesScan.get(scanId);
  if (!canal) return;
  canal.programarExpiracion(LIMITES.bufferBusExpiraMs, () => {
    canalesScan.delete(scanId);
  });
}

// ─── Canal global de eventos de agente (EVENTO_AGENTE = "agente") ──────────

const MAX_BUFFER_AGENTE = 200;

export const canalAgente = new Canal();

export function emitirEventoAgente(data: unknown): void {
  canalAgente.emitir("agente", data);
  if (canalAgente.buffer.length > MAX_BUFFER_AGENTE) {
    canalAgente.buffer.splice(0, canalAgente.buffer.length - MAX_BUFFER_AGENTE);
  }
}
