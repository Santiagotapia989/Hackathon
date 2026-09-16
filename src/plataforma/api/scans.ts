import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CrearScanBody } from "../../shared/contrato.js";
import { parsearObjetivo, ObjetivoInvalidoError } from "../ingesta/objetivo.js";
import * as db from "../db.js";
import { cola } from "../cola.js";
import { ejecutarScan } from "../orquestador.js";
import { obtenerOCrearCanalScan } from "../bus.js";
import { iniciarSse, enviarEventoSse, iniciarHeartbeatSse } from "../sse.js";

export const scansRouter = Router();

scansRouter.post("/scans", (req, res) => {
  const parseoBody = CrearScanBody.safeParse(req.body);
  if (!parseoBody.success) {
    res.status(400).json({ error: "Body inválido: se espera { objetivo: string }." });
    return;
  }

  let objetivoParseado;
  try {
    objetivoParseado = parsearObjetivo(parseoBody.data.objetivo);
  } catch (err) {
    if (err instanceof ObjetivoInvalidoError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const id = randomUUID();
  const tipo = objetivoParseado.tipo === "repo" ? "repo" : "paquete";
  db.crearScan(id, tipo, parseoBody.data.objetivo);

  cola.encolar(id, (signal) => ejecutarScan(id, tipo, parseoBody.data.objetivo, objetivoParseado, signal));

  res.status(201).json({ id });
});

scansRouter.get("/scans", (_req, res) => {
  res.json(db.listarScansRecientes(50));
});

scansRouter.get("/scans/:id", (req, res) => {
  const scan = db.obtenerScan(req.params.id);
  if (!scan) {
    res.status(404).json({ error: "Escaneo no encontrado." });
    return;
  }
  res.json(scan);
});

scansRouter.get("/scans/:id/events", (req, res) => {
  const { id } = req.params;
  const scan = db.obtenerScan(id);
  if (!scan) {
    res.status(404).json({ error: "Escaneo no encontrado." });
    return;
  }

  iniciarSse(res);
  const detenerHeartbeat = iniciarHeartbeatSse(res);

  // Terminado o en error: la DB ya tiene el estado completo y final, se
  // reconstruye todo desde ahí y se cierra la conexión.
  if (scan.estado === "terminado" || scan.estado === "error") {
    for (const etapa of scan.etapas) enviarEventoSse(res, "etapa", etapa);
    for (const hallazgo of scan.hallazgos) enviarEventoSse(res, "hallazgo", hallazgo);
    if (scan.estado === "terminado") {
      enviarEventoSse(res, "veredicto", { veredicto: scan.veredicto, resumen: scan.resumen });
    } else {
      enviarEventoSse(res, "error", { error: scan.error ?? "Error desconocido." });
    }
    detenerHeartbeat();
    res.end();
    return;
  }

  // En curso: reenviar lo que ya pasó y suscribirse a lo que falta.
  const canal = obtenerOCrearCanalScan(id);
  for (const item of canal.buffer) enviarEventoSse(res, item.evento, item.data);

  const alRecibirEvento = (item: { evento: string; data: unknown }): void => {
    enviarEventoSse(res, item.evento, item.data);
  };
  canal.emisor.on("evento", alRecibirEvento);

  req.on("close", () => {
    canal.emisor.off("evento", alRecibirEvento);
    detenerHeartbeat();
  });
});

