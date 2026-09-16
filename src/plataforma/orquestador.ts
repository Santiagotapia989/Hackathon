// Corre un escaneo de punta a punta: ingesta en cuarentena → motor →
// veredicto. Reenvía cada evento al bus (SSE) y lo persiste en DB
// (sección 7 del contexto).

import fs from "node:fs/promises";
import path from "node:path";
import type { ContextoAnalisis, Etapa, EventoMotor } from "../shared/contrato.js";
import type { ObjetivoParseado } from "./ingesta/objetivo.js";
import { clonarRepo } from "./ingesta/repo.js";
import { descargarPaquete } from "./ingesta/paquete.js";
import { motor } from "./motor.js";
import { emitirEventoScan, terminarCanalScan } from "./bus.js";
import * as db from "./db.js";
import { RUTA_CUARENTENA, estaOffline } from "./config.js";

export async function ejecutarScan(
  id: string,
  tipo: "repo" | "paquete",
  objetivo: string,
  parseado: ObjetivoParseado,
  signal: AbortSignal,
): Promise<void> {
  const inicio = Date.now();
  const dir = path.join(RUTA_CUARENTENA, id);
  const etapas: Etapa[] = [];

  const emitirEtapa = (etapa: Etapa): void => {
    const idx = etapas.findIndex((e) => e.nombre === etapa.nombre);
    if (idx >= 0) etapas[idx] = etapa;
    else etapas.push(etapa);
    db.actualizarEtapas(id, etapas);
    emitirEventoScan(id, "etapa", etapa);
  };

  try {
    emitirEtapa({ nombre: "ingesta", estado: "en_curso" });

    const inicioIngesta = Date.now();
    try {
      await fs.mkdir(dir, { recursive: true });
      if (parseado.tipo === "repo") {
        await clonarRepo(parseado.url, dir, signal);
      } else {
        const tmpDir = path.join(dir, "..", `${id}-tmp`);
        await fs.mkdir(tmpDir, { recursive: true });
        try {
          await descargarPaquete(parseado.ecosistema, parseado.nombre, dir, tmpDir, signal);
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      emitirEtapa({ nombre: "ingesta", estado: "error", error: mensaje, duracionMs: Date.now() - inicioIngesta });
      db.marcarError(id, mensaje, Date.now() - inicio);
      emitirEventoScan(id, "error", { error: mensaje });
      return;
    }
    emitirEtapa({ nombre: "ingesta", estado: "lista", duracionMs: Date.now() - inicioIngesta });

    const ctx: ContextoAnalisis = {
      scanId: id,
      tipo,
      objetivo,
      tieneHistorialGit: tipo === "repo",
      offline: estaOffline(),
      signal,
    };

    const emitirDelMotor = (evento: EventoMotor): void => {
      if (evento.tipo === "etapa") {
        emitirEtapa(evento.etapa);
      } else {
        db.upsertHallazgo(id, evento.hallazgo);
        emitirEventoScan(id, "hallazgo", evento.hallazgo);
      }
    };

    let resultado;
    try {
      resultado = await motor.analizarDirectorio(dir, ctx, emitirDelMotor);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      db.marcarError(id, `Falló el análisis: ${mensaje}`, Date.now() - inicio);
      emitirEventoScan(id, "error", { error: `Falló el análisis: ${mensaje}` });
      return;
    }

    const duracionMs = Date.now() - inicio;
    db.finalizarScan(id, { veredicto: resultado.veredicto, resumen: resultado.resumen, duracionMs });
    emitirEventoScan(id, "veredicto", { veredicto: resultado.veredicto, resumen: resultado.resumen });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    terminarCanalScan(id);
  }
}
