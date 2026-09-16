// src/motor/scoring.ts
// Función pura: calcularVeredicto(hallazgos, etapas) → { veredicto, resumen }.
// Reglas en orden estricto de prioridad.

import type { Finding, Etapa, Veredicto, Resumen, Modulo, Severidad } from "../shared/contrato.js";

// ─── Reglas del veredicto ───────────────────────────────────────────────────

export function calcularVeredicto(
  hallazgos: Finding[],
  etapas: Etapa[],
): { veredicto: Veredicto; resumen: Resumen } {
  // 1. Algún hallazgo CRÍTICO con determinista: true → RETENIDO
  const criticoDeterminista = hallazgos.some(
    (h) => h.severidad === "critica" && h.determinista,
  );
  if (criticoDeterminista) return { veredicto: "retenido", resumen: construirResumen(hallazgos) };

  // 2. Algún análisisIA.clasificacion === "malicioso" con confianza ≥ 0.8 → RETENIDO
  const maliciosoIA = hallazgos.some(
    (h) => h.analisisIA?.clasificacion === "malicioso" && h.analisisIA.confianza >= 0.8,
  );
  if (maliciosoIA) return { veredicto: "retenido", resumen: construirResumen(hallazgos) };

  // 3. Algún análisisIA.intentoManipulacion → RETENIDO
  const manipulacion = hallazgos.some((h) => h.analisisIA?.intentoManipulacion);
  if (manipulacion) return { veredicto: "retenido", resumen: construirResumen(hallazgos) };

  // 4. Algún ALTA, algún IA no-benigno, algún sinEvaluar, o alguna etapa en error → REVISAR
  const tieneAlta = hallazgos.some((h) => h.severidad === "alta");
  const tieneIAOtra = hallazgos.some((h) => {
    const c = h.analisisIA?.clasificacion;
    return c === "malicioso" || c === "sospechoso";
  });
  const tieneSinEvaluar = hallazgos.some((h) => h.sinEvaluar);
  const etapaConError = etapas.some((e) => e.estado === "error");
  if (tieneAlta || tieneIAOtra || tieneSinEvaluar || etapaConError) {
    return { veredicto: "revisar", resumen: construirResumen(hallazgos) };
  }

  // 5. Si no: LIBERADO
  return { veredicto: "liberado", resumen: construirResumen(hallazgos) };
}

// ─── Resumen ────────────────────────────────────────────────────────────────

function construirResumen(hallazgos: Finding[]): Resumen {
  const porSeveridad: Record<Severidad, number> = { critica: 0, alta: 0, media: 0, baja: 0 };
  const porModulo: Record<Modulo, number> = { instrucciones: 0, unicode: 0, dependencias: 0, secretos: 0 };

  for (const h of hallazgos) {
    porSeveridad[h.severidad]++;
    porModulo[h.modulo]++;
  }

  return { porSeveridad, porModulo };
}