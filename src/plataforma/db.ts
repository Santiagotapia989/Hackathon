// Persistencia SQLite. Todo lo que sale de acá hacia HTTP se valida con zod
// antes de responder (sección 9 del contexto).

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  Scan,
  Etapa,
  Finding,
  Resumen,
  Veredicto,
  EventoAgente,
} from "../shared/contrato.js";
import { RUTA_DB } from "./config.js";

fs.mkdirSync(path.dirname(RUTA_DB), { recursive: true });

export const db = new Database(RUTA_DB);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  estado TEXT NOT NULL,
  veredicto TEXT,
  resumen_json TEXT,
  etapas_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  creado_en TEXT NOT NULL,
  duracion_ms INTEGER
);
CREATE TABLE IF NOT EXISTS hallazgos (
  id TEXT NOT NULL,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  json TEXT NOT NULL,
  PRIMARY KEY (scan_id, id)
);
CREATE TABLE IF NOT EXISTS eventos_agente (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  json TEXT NOT NULL
);
`);

// ─── Filas crudas ───────────────────────────────────────────────────────────

interface FilaScan {
  id: string;
  tipo: string;
  objetivo: string;
  estado: string;
  veredicto: string | null;
  resumen_json: string | null;
  etapas_json: string;
  error: string | null;
  creado_en: string;
  duracion_ms: number | null;
}

function filaAScan(fila: FilaScan, hallazgos: Finding[]): Scan {
  const crudo = {
    id: fila.id,
    tipo: fila.tipo,
    objetivo: fila.objetivo,
    estado: fila.estado,
    veredicto: fila.veredicto ?? undefined,
    resumen: fila.resumen_json ? JSON.parse(fila.resumen_json) : undefined,
    etapas: JSON.parse(fila.etapas_json),
    hallazgos,
    creadoEn: fila.creado_en,
    duracionMs: fila.duracion_ms ?? undefined,
    error: fila.error ?? undefined,
  };
  return Scan.parse(crudo);
}

// ─── Scans ──────────────────────────────────────────────────────────────────

export function crearScan(id: string, tipo: "repo" | "paquete", objetivo: string): void {
  db.prepare(
    `INSERT INTO scans (id, tipo, objetivo, estado, etapas_json, creado_en)
     VALUES (?, ?, ?, 'en_curso', '[]', ?)`,
  ).run(id, tipo, objetivo, new Date().toISOString());
}

export function obtenerScan(id: string): Scan | undefined {
  const fila = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(id) as FilaScan | undefined;
  if (!fila) return undefined;
  const hallazgos = obtenerHallazgos(id);
  return filaAScan(fila, hallazgos);
}

export function listarScansRecientes(limite = 50): Scan[] {
  const filas = db
    .prepare(`SELECT * FROM scans ORDER BY creado_en DESC LIMIT ?`)
    .all(limite) as FilaScan[];
  // "sin hallazgos": se devuelve el array vacío, no se omite el campo del contrato.
  return filas.map((fila) => filaAScan(fila, []));
}

export function actualizarEtapas(id: string, etapas: Etapa[]): void {
  db.prepare(`UPDATE scans SET etapas_json = ? WHERE id = ?`).run(
    JSON.stringify(Etapa.array().parse(etapas)),
    id,
  );
}

export function marcarError(id: string, mensaje: string, duracionMs?: number): void {
  db.prepare(
    `UPDATE scans SET estado = 'error', error = ?, duracion_ms = COALESCE(?, duracion_ms) WHERE id = ?`,
  ).run(mensaje, duracionMs ?? null, id);
}

export function finalizarScan(
  id: string,
  datos: { veredicto: Veredicto; resumen: Resumen; duracionMs: number },
): void {
  db.prepare(
    `UPDATE scans SET estado = 'terminado', veredicto = ?, resumen_json = ?, duracion_ms = ? WHERE id = ?`,
  ).run(datos.veredicto, JSON.stringify(datos.resumen), datos.duracionMs, id);
}

export function marcarInterrumpidosPorReinicio(): void {
  db.prepare(
    `UPDATE scans SET estado = 'error', error = 'Interrumpido por reinicio' WHERE estado = 'en_curso'`,
  ).run();
}

// ─── Hallazgos ──────────────────────────────────────────────────────────────

export function upsertHallazgo(scanId: string, hallazgo: Finding): void {
  db.prepare(
    `INSERT INTO hallazgos (id, scan_id, json) VALUES (?, ?, ?)
     ON CONFLICT (scan_id, id) DO UPDATE SET json = excluded.json`,
  ).run(hallazgo.id, scanId, JSON.stringify(hallazgo));
}

export function obtenerHallazgos(scanId: string): Finding[] {
  const filas = db
    .prepare(`SELECT json FROM hallazgos WHERE scan_id = ?`)
    .all(scanId) as { json: string }[];
  return filas.map((fila) => Finding.parse(JSON.parse(fila.json)));
}

// ─── Eventos de agente ──────────────────────────────────────────────────────

export function insertarEventoAgente(evento: EventoAgente): void {
  db.prepare(`INSERT INTO eventos_agente (id, fecha, json) VALUES (?, ?, ?)`).run(
    evento.id,
    evento.fecha,
    JSON.stringify(evento),
  );
}

export function listarEventosAgenteRecientes(limite = 100): EventoAgente[] {
  const filas = db
    .prepare(`SELECT json FROM eventos_agente ORDER BY fecha DESC LIMIT ?`)
    .all(limite) as { json: string }[];
  return filas.map((fila) => EventoAgente.parse(JSON.parse(fila.json))).reverse();
}

export function cerrarDb(): void {
  db.close();
}
