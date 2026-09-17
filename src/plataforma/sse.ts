// Helpers genéricos para responder Server-Sent Events.
// La lógica de "qué mandar" (replay de DB vs. buffer vs. suscripción) vive
// en cada ruta; acá solo el protocolo.

import type { Response } from "express";
import { LIMITES } from "./config.js";

export function iniciarSse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
}

export function enviarEventoSse(res: Response, evento: string, data: unknown): void {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function iniciarHeartbeatSse(res: Response): () => void {
  const id = setInterval(() => {
    res.write(`: ping\n\n`);
  }, LIMITES.heartbeatSseMs);
  return () => clearInterval(id);
}
