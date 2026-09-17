// npm run db:seed — carga escaneos de ejemplo para el historial de la demo.

import * as db from "../db.js";
import { HALLAZGOS_DEMO, construirResumen } from "../motor-stub.js";
import type { Etapa, Finding } from "../../shared/contrato.js";

const ETAPAS_DEMO: Etapa[] = [
  { nombre: "ingesta", estado: "lista", duracionMs: 850 },
  { nombre: "instrucciones", estado: "lista", duracionMs: 420 },
  { nombre: "unicode", estado: "lista", duracionMs: 510 },
  { nombre: "dependencias", estado: "lista", duracionMs: 640 },
  { nombre: "secretos", estado: "lista", duracionMs: 700 },
  { nombre: "triage_ia", estado: "lista", duracionMs: 1200 },
  { nombre: "veredicto", estado: "lista", duracionMs: 20 },
];

function sembrarScan(
  id: string,
  tipo: "repo" | "paquete",
  objetivo: string,
  etapas: Etapa[],
  hallazgos: Finding[],
  veredicto: "liberado" | "revisar" | "retenido",
  antiguedadMs: number,
): void {
  db.crearScan(id, tipo, objetivo);
  db.actualizarEtapas(id, etapas);
  for (const h of hallazgos) db.upsertHallazgo(id, h);
  db.finalizarScan(id, { veredicto, resumen: construirResumen(hallazgos), duracionMs: 4200 });

  // Ajusta creado_en para que el historial se vea escalonado en el tiempo.
  const creadoEn = new Date(Date.now() - antiguedadMs).toISOString();
  db.db.prepare(`UPDATE scans SET creado_en = ? WHERE id = ?`).run(creadoEn, id);
}

const f2Triageado: Finding = {
  ...HALLAZGOS_DEMO[1],
  analisisIA: { clasificacion: "sospechoso", confianza: 0.82, intentoManipulacion: true },
};

sembrarScan(
  "demo-001",
  "repo",
  "https://github.com/ejemplo/repo-sospechoso",
  ETAPAS_DEMO,
  [HALLAZGOS_DEMO[0], f2Triageado, HALLAZGOS_DEMO[2], HALLAZGOS_DEMO[3]],
  "retenido",
  2 * 60 * 60_000,
);

sembrarScan(
  "demo-002",
  "paquete",
  "npm:left-pad",
  ETAPAS_DEMO.map((e) => ({ ...e, duracionMs: Math.round((e.duracionMs ?? 0) / 3) })),
  [],
  "liberado",
  5 * 60 * 60_000,
);

sembrarScan(
  "demo-003",
  "paquete",
  "npm:unused-imports",
  ETAPAS_DEMO.map((e) => ({ ...e, duracionMs: Math.round((e.duracionMs ?? 0) / 2) })),
  [HALLAZGOS_DEMO[2]],
  "revisar",
  30 * 60_000,
);

console.log("Historial de ejemplo cargado: demo-001, demo-002, demo-003.");
db.cerrarDb();
