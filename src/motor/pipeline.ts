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
  etapasAcumuladas: Etapa[],
  fn: () => Promise<T>,
): Promise<T> {
  emitir({ tipo: "etapa", etapa: { nombre, estado: "en_curso" } });
  const inicio = Date.now();
  try {
    const resultado = await fn();
    const etapa: Etapa = { nombre, estado: "lista", duracionMs: Date.now() - inicio };
    etapasAcumuladas.push(etapa);
    emitir({ tipo: "etapa", etapa });
    return resultado;
  } catch (err) {
    const etapa: Etapa = {
      nombre,
      estado: "error",
      duracionMs: Date.now() - inicio,
      error: err instanceof Error ? err.message : String(err),
    };
    etapasAcumuladas.push(etapa);
    emitir({ tipo: "etapa", etapa });
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
  const recorrido = await ejecutarEtapa("ingesta" as any, emitir, ctx.signal, allEtapas, async () => {
    return recorrerDirectorio(dir);
  });

  // Helper: agrega un hallazgo al acumulado y lo emite de inmediato (SSE + persistencia en B).
  const agregarHallazgo = (hallazgo: Finding): void => {
    allHallazgos.push(hallazgo);
    emitir({ tipo: "hallazgo", hallazgo });
  };

  // Agregar hallazgo de recorrido parcial
  if (recorrido.parcial) {
    agregarHallazgo({
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
    agregarHallazgo({
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
  const unicodeHallazgos = await ejecutarEtapa("unicode", emitir, ctx.signal, allEtapas, async () => {
    return analizarUnicode(recorrido.archivos);
  });
  for (const h of unicodeHallazgos) agregarHallazgo(h);

  // ── Instrucciones ────────────────────────────────────────────────────
  const instruccionesHallazgos = await ejecutarEtapa("instrucciones", emitir, ctx.signal, allEtapas, async () => {
    return analizarInstrucciones(recorrido.archivos);
  });
  for (const h of instruccionesHallazgos) agregarHallazgo(h);

  // ── Dependencias ─────────────────────────────────────────────────────
  const dependenciasHallazgos = await ejecutarEtapa("dependencias", emitir, ctx.signal, allEtapas, async () => {
    return analizarDependencias(recorrido.archivos, {
      offline: ctx.offline,
      signal: ctx.signal,
    });
  });
  for (const h of dependenciasHallazgos) agregarHallazgo(h);

  // ── Secretos ─────────────────────────────────────────────────────────
  // Si gitleaks no está disponible (o falla), analizarSecretos() ahora deja
  // el error propagar: ejecutarEtapa ya marcó la etapa "secretos" en error
  // (y quedó en allEtapas) antes de este catch — scoring.ts fuerza al menos
  // "revisar" por esa etapa en error. El escaneo sigue igual, sin abortar
  // el resto del pipeline, con [] hallazgos de este módulo.
  const secretosHallazgos = await ejecutarEtapa("secretos", emitir, ctx.signal, allEtapas, async () => {
    return analizarSecretos(dir, {
      tieneHistorialGit: ctx.tieneHistorialGit,
      offline: ctx.offline,
      signal: ctx.signal,
    });
  }).catch(() => []);
  for (const h of secretosHallazgos) agregarHallazgo(h);

  // ── Triage con IA ────────────────────────────────────────────────────
  const candidatos = allHallazgos.filter((h) => !h.determinista);
  const triageResult = await ejecutarEtapa("triage_ia", emitir, ctx.signal, allEtapas, async () => {
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