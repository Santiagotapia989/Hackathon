// src/motor/pipeline.ts
// Orquesta analizadores, triage con IA y cálculo de veredicto.
// Emite eventos a medida que avanza. Respeta ctx.signal.
// ENFORCE regla de oro: el LLM nunca baja severidad de hallazgos deterministas.

import type { Finding, Etapa, ContextoAnalisis, ResultadoAnalisis, EventoMotor } from "../shared/contrato.js";
import { recorrerDirectorio } from "./archivos.js";
import { analizarUnicode } from "./analizadores/unicode.js";
import { analizarInstrucciones } from "./analizadores/instrucciones.js";
import { analizarDependencias } from "./analizadores/dependencias.js";
import { analizarSecretos } from "./analizadores/secretos.js";
import { triage, resetContador } from "./llm/ollama.js";
import { calcularVeredicto } from "./scoring.js";

// ─── Helper: ejecutar etapa ─────────────────────────────────────────────────

async function ejecutarEtapa<T>(
  nombre: Etapa["nombre"],
  emitir: (e: EventoMotor) => void,
  _signal: AbortSignal,
  fn: () => Promise<T>,
): Promise<T> {
  emitir({ tipo: "etapa", etapa: { nombre, estado: "en_curso" } });
  const inicio = Date.now();
  try {
    const resultado = await fn();
    emitir({
      tipo: "etapa",
      etapa: { nombre, estado: "lista", duracionMs: Date.now() - inicio },
    });
    return resultado;
  } catch (err) {
    emitir({
      tipo: "etapa",
      etapa: {
        nombre,
        estado: "error",
        duracionMs: Date.now() - inicio,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

// ─── Pipeline principal ─────────────────────────────────────────────────────

export async function ejecutarPipeline(
  dir: string,
  ctx: ContextoAnalisis,
  emitir: (e: EventoMotor) => void,
): Promise<ResultadoAnalisis> {
  const allHallazgos: Finding[] = [];
  const allEtapas: Etapa[] = [];
  resetContador();

  // ── Ingesta (recorrer directorio) ────────────────────────────────────
  const recorrido = await ejecutarEtapa("ingesta" as any, emitir, ctx.signal, async () => {
    return recorrerDirectorio(dir);
  });

  // Agregar hallazgo de recorrido parcial
  if (recorrido.parcial) {
    allHallazgos.push({
      id: "recorrido-parcial",
      modulo: "instrucciones",
      regla: "recorrido-parcial",
      titulo: "Análisis parcial: se alcanzó el límite de archivos",
      severidad: "media",
      determinista: true,
      archivo: "(raíz)",
      evidencia: `Se procesaron ${recorrido.archivos.length} de ${recorrido.vistos} archivos. El repositorio supera el límite de 5000 archivos.`,
      explicacion: "El repositorio es demasiado grande para ser analizado completamente. Solo se procesaron los primeros 5000 archivos.",
    });
  }

  // Agregar hallazgos de desvíos de symlinks
  for (const desvio of recorrido.desvios) {
    allHallazgos.push({
      id: `desvio:${desvio.ruta}`,
      modulo: "instrucciones",
      regla: "symlink-fuera-de-raiz",
      titulo: "Symlink o junction fuera del directorio",
      severidad: "media",
      determinista: true,
      archivo: desvio.ruta,
      evidencia: `Destino: ${desvio.destino}`,
      explicacion: `Un symlink o junction en "${desvio.ruta}" apunta a "${desvio.destino}", fuera del directorio analizado.`,
    });
  }

  // ── Unicode ──────────────────────────────────────────────────────────
  const unicodeHallazgos = await ejecutarEtapa("unicode", emitir, ctx.signal, async () => {
    return analizarUnicode(recorrido.archivos);
  });
  allHallazgos.push(...unicodeHallazgos);

  // ── Instrucciones ────────────────────────────────────────────────────
  const instruccionesHallazgos = await ejecutarEtapa("instrucciones", emitir, ctx.signal, async () => {
    return analizarInstrucciones(recorrido.archivos);
  });
  allHallazgos.push(...instruccionesHallazgos);

  // ── Dependencias ─────────────────────────────────────────────────────
  const dependenciasHallazgos = await ejecutarEtapa("dependencias", emitir, ctx.signal, async () => {
    return analizarDependencias(recorrido.archivos, {
      offline: ctx.offline,
      signal: ctx.signal,
    });
  });
  allHallazgos.push(...dependenciasHallazgos);

  // ── Secretos ─────────────────────────────────────────────────────────
  const secretosHallazgos = await ejecutarEtapa("secretos", emitir, ctx.signal, async () => {
    return analizarSecretos(dir, {
      tieneHistorialGit: ctx.tieneHistorialGit,
      offline: ctx.offline,
      signal: ctx.signal,
    });
  });
  allHallazgos.push(...secretosHallazgos);

  // ── Triage con IA ────────────────────────────────────────────────────
  const candidatos = allHallazgos.filter((h) => !h.determinista);
  const triageResult = await ejecutarEtapa("triage_ia", emitir, ctx.signal, async () => {
    const resultados: { hallazgoId: string; resultado: NonNullable<ReturnType<typeof triage> extends Promise<infer R> ? R : never> }[] = [];

    if (candidatos.length === 0) return resultados;

    let teniaOllama = true;
    for (const candidato of candidatos) {
      if (ctx.signal.aborted) break;
      const contenido = candidato.evidencia + (candidato.evidenciaDecodificada ? `\n${candidato.evidenciaDecodificada}` : "");
      const r = await triage(candidato.archivo, candidato.regla, candidato.linea, contenido, ctx.signal);
      if (r) {
        resultados.push({ hallazgoId: candidato.id, resultado: r });
      } else {
        // IA no pudo evaluar: candidato sin evaluar
        candidato.sinEvaluar = true;
        teniaOllama = false;
      }
    }

    // Fallback: si había candidatos y ninguno se pudo evaluar, la etapa queda en error.
    if (!teniaOllama && resultados.length === 0) {
      throw new Error("La IA local no responde. Revisá que Ollama esté corriendo.");
    }
    return resultados;
  }).catch(() => {
    // La etapa ya se emitió como "error" desde ejecutarEtapa; los candidatos quedaron sinEvaluar.
    for (const candidato of candidatos) candidato.sinEvaluar = true;
    return [];
  });

  // Enforce regla de oro: merge de resultados del triage
  for (const { hallazgoId, resultado } of triageResult) {
    const hallazgo = allHallazgos.find((h) => h.id === hallazgoId);
    if (!hallazgo) continue;

    // Para deterministas: solo aceptar explicacion y remediacion
    if (hallazgo.determinista) {
      if (resultado.explicacion) hallazgo.explicacion = resultado.explicacion;
      // NO modificar severidad, clasificacion ni intención de manipulación
      continue;
    }

    // Para no deterministas: aceptar todo
    hallazgo.analisisIA = {
      clasificacion: resultado.clasificacion,
      confianza: resultado.confianza,
      intentoManipulacion: resultado.intentoManipulacion,
    };
    if (resultado.explicacion) hallazgo.explicacion = resultado.explicacion;

    // La IA puede ajustar severidad de no deterministas
    if (resultado.clasificacion === "malicioso" && resultado.confianza >= 0.9 && hallazgo.severidad !== "critica") {
      hallazgo.severidad = "alta";
    }

    // Re-emitir hallazgo actualizado
    emitir({ tipo: "hallazgo", hallazgo });
  }

  // ── Veredicto ────────────────────────────────────────────────────────
  const { veredicto, resumen } = calcularVeredicto(allHallazgos, allEtapas);

  emitir({
    tipo: "etapa",
    etapa: {
      nombre: "veredicto",
      estado: "lista",
      duracionMs: 0,
    },
  });

  return {
    hallazgos: allHallazgos,
    etapas: allEtapas,
    veredicto,
    resumen,
  };
}