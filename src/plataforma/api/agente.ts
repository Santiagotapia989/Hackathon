// Endpoints usados por el servidor MCP (mcp.ts). Registran cada chequeo como
// EventoAgente para que el front los vea en /api/agente/events.

import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  CheckPackageBody,
  CheckRepoBody,
  EventoAgente,
  type ResultadoAgente,
  type Veredicto,
  type Resumen,
  type Scan,
} from "../../shared/contrato.js";

type EstadoScan = Scan["estado"];
import { parsearObjetivo, ObjetivoInvalidoError } from "../ingesta/objetivo.js";
import * as db from "../db.js";
import { cola } from "../cola.js";
import { ejecutarScan } from "../orquestador.js";
import { obtenerOCrearCanalScan, canalAgente, emitirEventoAgente } from "../bus.js";
import { iniciarSse, enviarEventoSse, iniciarHeartbeatSse } from "../sse.js";
import { motor } from "../motor.js";
import { estaOffline } from "../config.js";
import { LIMITES } from "../config.js";

export const agenteRouter = Router();

function mapVeredictoAResultado(veredicto: Veredicto): ResultadoAgente {
  if (veredicto === "liberado") return "permitido";
  if (veredicto === "revisar") return "requiere_confirmacion";
  return "bloqueado";
}

function registrarEvento(
  accion: "instalar" | "abrir_repo",
  objetivo: string,
  resultado: ResultadoAgente,
  motivo?: string,
  scanId?: string,
): void {
  const evento = EventoAgente.parse({
    id: randomUUID(),
    fecha: new Date().toISOString(),
    accion,
    objetivo,
    resultado,
    motivo,
    scanId,
  });
  db.insertarEventoAgente(evento);
  emitirEventoAgente(evento);
}

agenteRouter.post("/agente/check-package", async (req, res) => {
  const parseo = CheckPackageBody.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: 'Body inválido: se espera { ecosistema: "npm"|"pypi", nombre: string }.' });
    return;
  }
  const { ecosistema, nombre } = parseo.data;

  try {
    const resultado = await motor.verificarPaquete(ecosistema, nombre, { offline: estaOffline() });
    registrarEvento(
      "instalar",
      `${ecosistema}:${nombre}`,
      resultado.resultado,
      resultado.motivos.join(" ") || undefined,
    );
    res.json(resultado);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `No se pudo verificar el paquete: ${mensaje}` });
  }
});

agenteRouter.post("/agente/check-repo", async (req, res) => {
  const parseo = CheckRepoBody.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Body inválido: se espera { url: string }." });
    return;
  }

  let objetivoParseado;
  try {
    objetivoParseado = parsearObjetivo(parseo.data.url);
  } catch (err) {
    if (err instanceof ObjetivoInvalidoError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
  if (objetivoParseado.tipo !== "repo") {
    res.status(400).json({ error: "La URL no corresponde a un repositorio." });
    return;
  }

  const id = randomUUID();
  db.crearScan(id, "repo", parseo.data.url);
  cola.encolar(id, (signal) => ejecutarScan(id, "repo", parseo.data.url, objetivoParseado, signal));

  const resultado = await esperarResultadoScan(id, LIMITES.timeoutCheckRepoAgenteMs);

  const resultadoAgente: ResultadoAgente =
    resultado.estado === "terminado" && resultado.veredicto
      ? mapVeredictoAResultado(resultado.veredicto)
      : "bloqueado"; // fail closed: error o no terminó a tiempo
  const motivo =
    resultado.estado === "terminado"
      ? undefined
      : resultado.estado === "error"
        ? "El escaneo terminó en error."
        : "El escaneo no terminó dentro del tiempo de espera (120s). No abras el repo hasta confirmar el veredicto.";

  registrarEvento("abrir_repo", parseo.data.url, resultadoAgente, motivo, id);

  res.json({
    scanId: id,
    estado: resultado.estado,
    veredicto: resultado.veredicto,
    resumen: resultado.resumen,
  });
});

agenteRouter.get("/agente/events", (req, res) => {
  iniciarSse(res);
  const detenerHeartbeat = iniciarHeartbeatSse(res);

  for (const item of canalAgente.buffer) enviarEventoSse(res, item.evento, item.data);

  const alRecibirEvento = (item: { evento: string; data: unknown }): void => {
    enviarEventoSse(res, item.evento, item.data);
  };
  canalAgente.emisor.on("evento", alRecibirEvento);

  req.on("close", () => {
    canalAgente.emisor.off("evento", alRecibirEvento);
    detenerHeartbeat();
  });
});

interface ResultadoEspera {
  estado: EstadoScan;
  veredicto?: Veredicto;
  resumen?: Resumen;
}

function esperarResultadoScan(id: string, timeoutMs: number): Promise<ResultadoEspera> {
  const inicial = db.obtenerScan(id);
  if (inicial && inicial.estado !== "en_curso") {
    return Promise.resolve({ estado: inicial.estado, veredicto: inicial.veredicto, resumen: inicial.resumen });
  }

  const canal = obtenerOCrearCanalScan(id);
  return new Promise((resolve) => {
    let resuelto = false;

    const finalizar = (resultado: ResultadoEspera): void => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeout);
      canal.emisor.off("evento", alRecibirEvento);
      resolve(resultado);
    };

    const alRecibirEvento = (item: { evento: string; data: unknown }): void => {
      if (item.evento === "veredicto") {
        const d = item.data as { veredicto: Veredicto; resumen: Resumen };
        finalizar({ estado: "terminado", veredicto: d.veredicto, resumen: d.resumen });
      } else if (item.evento === "error") {
        finalizar({ estado: "error" });
      }
    };

    const timeout = setTimeout(() => finalizar({ estado: "en_curso" }), timeoutMs);
    canal.emisor.on("evento", alRecibirEvento);
  });
}
