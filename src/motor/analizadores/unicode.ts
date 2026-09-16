// src/motor/analizadores/unicode.ts
// Analizador determinístico: detecta caracteres invisibles, tags Unicode y resultados cruzados con instrucciones.

import * as path from "node:path";
import type { Finding } from "../../shared/contrato.js";
import type { ArchivoLeido } from "../archivos.js";
import { lineaDeIndice } from "../archivos.js";
import { prepararEvidencia, marca } from "../evidencia.js";
import { idHallazgo } from "../util.js";
import archivosSensibles from "../reglas/archivos-sensibles.json" with { type: "json" };
import patronesInstrucciones from "../reglas/instrucciones.json" with { type: "json" };

// ─── Helpers ────────────────────────────────────────────────────────────────

const PATRONES_SENSIBLES: string[] = archivosSensibles as unknown as string[];

/** Coincidencia simple de patrones de archivos sensibles (sin picomatch, solo exact y glob básico). */
function esArchivoSensible(ruta: string): boolean {
  const nombre = path.basename(ruta);
  for (const patron of PATRONES_SENSIBLES) {
    if (patron.endsWith("/**")) {
      const prefijo = patron.slice(0, -3);
      if (ruta.startsWith(prefijo) || ruta.startsWith(prefijo.replace(/^\.\//, ""))) return true;
    } else if (patron.startsWith("**/")) {
      const sufijo = patron.slice(3);
      if (nombre === sufijo || ruta.endsWith("/" + sufijo)) return true;
    } else if (patron.includes("*")) {
      const partesPatron = patron.split("*");
      if (partesPatron.length === 2) {
        const [pref, suf] = partesPatron as [string, string];
        if (nombre.startsWith(pref.slice(1)) && nombre.endsWith(suf.replace(/^\./, ""))) return true;
        if (nombre.endsWith(suf) && nombre.endsWith(pref.replace(/^\./, ""))) return true;
      }
      if (nombre === patron.replace("*", "")) return true;
    } else if (nombre === patron) {
      return true;
    }
  }
  return false;
}

/** Patrones de instrucciones para cruzar con tags decodificados. */
function patronesInstruccionesFlat(): RegExp[] {
  const out: RegExp[] = [];
  for (const cat of (patronesInstrucciones as any).categorias) {
    for (const p of cat.patrones) {
      try {
        out.push(new RegExp(p, "i"));
      } catch {
        // patrón inválido, ignorar
      }
    }
  }
  return out;
}

const PATRONES_IA = patronesInstruccionesFlat();

// ─── Tipos auxiliares ───────────────────────────────────────────────────────

type CmdUnicode = {
  cp: number;
  linea: number;
  tipo: string;
  bloque: number[]; // para tags: codepoints consecutivos; para otros: [cp]
};

// ─── Detección ──────────────────────────────────────────────────────────────

function detectarInvisibles(contenido: string): CmdUnicode[] {
  const vistos = new Map<number, CmdUnicode>(); // cp → cmd activo
  const resultados: CmdUnicode[] = [];
  const limite = Math.min(contenido.length, 500_000); // proteger contra archivos gigantes

  for (let i = 0; i < limite; ) {
    const cp = contenido.codePointAt(i)!;
    i += cp > 0xFFFF ? 2 : 1;

    // BOM al inicio del archivo: ignorar
    if (cp === 0xFEFF && i <= 4) continue;

    // Tags Unicode: U+E0000–U+E007F — acumular secuencias
    if (cp >= 0xE0000 && cp <= 0xE007F) {
      if (!vistos.has(0xE0000)) {
        const cmd: CmdUnicode = { cp: 0xE0000, linea: lineaDeIndice(contenido, i), tipo: "unicode-tags-oculto", bloque: [] };
        vistos.set(0xE0000, cmd);
      }
      vistos.get(0xE0000)!.bloque.push(cp);
      continue;
    }

    // Cerrar bloque de tags si había uno activo
    if (vistos.has(0xE0000)) {
      resultados.push(vistos.get(0xE0000)!);
      vistos.delete(0xE0000);
    }

    // Bidi controls: U+202A–U+202E, U+2066–U+2069
    if ((cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069)) {
      resultados.push({ cp, linea: lineaDeIndice(contenido, i), tipo: "unicode-bidi", bloque: [cp] });
      continue;
    }

    // Zero-width: U+200B–U+200F, U+2060–U+2064
    if ((cp >= 0x200B && cp <= 0x200F) || (cp >= 0x2060 && cp <= 0x2064)) {
      resultados.push({ cp, linea: lineaDeIndice(contenido, i), tipo: "unicode-ancho-cero", bloque: [cp] });
      continue;
    }

    // Variation selectors: U+FE00–U+FE0F, U+E0100–U+E01EF
    if ((cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0100 && cp <= 0xE01EF)) {
      resultados.push({ cp, linea: lineaDeIndice(contenido, i), tipo: "unicode-selector-variacion", bloque: [cp] });
      continue;
    }
  }

  // Cerrar tag bloque pendiente
  if (vistos.has(0xE0000)) {
    resultados.push(vistos.get(0xE0000)!);
  }

  return resultados;
}

// ─── Severidad por contexto ─────────────────────────────────────────────────

function severidadBidi(esCodigo: boolean): "alta" | "media" {
  return esCodigo ? "alta" : "media";
}

function severidadAnchoCero(ruta: string, ocurrencias: number): "media" | "baja" {
  return esArchivoSensible(ruta) && ocurrencias >= 3 ? "media" : "baja";
}

function esCodigo(ruta: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|c|cpp|h)$/.test(ruta);
}

// ─── Análisis por archivo ───────────────────────────────────────────────────

export function analizarArchivoUnicode(archivo: ArchivoLeido): Finding[] {
  const { ruta, contenido } = archivo;
  const hallazgos: Finding[] = [];
  const cmds = detectarInvisibles(contenido);

  // Agrupar tags por secuencia
  const tags = cmds.filter((c) => c.tipo === "unicode-tags-oculto");
  const otros = cmds.filter((c) => c.tipo !== "unicode-tags-oculto");

  // ── Tags Unicode (critica, determinista) ────────────────────────────────
  for (const tag of tags) {
    const msgBytes = tag.bloque.map((cp) => cp - 0xE0000);
    const msgDecodificado = String.fromCharCode(...msgBytes);

    // Generar línea visible con marcas
    const evidenciaOriginal = contenido.split("\n")[tag.linea - 1] ?? "";
    const evidenciaConMarcas = tag.bloque.map((cp) => marca(cp)).join("");

    // Cruzar con patrones de instrucciones
    let explicacionExtra = "";
    const patronesEncontrados = PATRONES_IA.filter((p) => p.test(msgDecodificado));
    if (patronesEncontrados.length > 0) {
      explicacionExtra = ` El mensaje oculto contiene ${patronesEncontrados.length === 1 ? "una instrucción" : "instrucciones"} para un asistente de IA.`;
    }

    hallazgos.push({
      id: idHallazgo("unicode-tags-oculto", ruta, tag.linea),
      modulo: "unicode",
      regla: "unicode-tags-oculto",
      titulo: "Mensaje oculto en caracteres Unicode Tags",
      severidad: "critica",
      determinista: true,
      archivo: ruta,
      linea: tag.linea,
      evidencia: prepararEvidencia(`${evidenciaOriginal.trimEnd()}\n${evidenciaConMarcas}`),
      evidenciaDecodificada: msgDecodificado.slice(0, 500),
      explicacion: `El archivo contiene una secuencia Unicode Tags (U+E0000–U+E007F) que oculta un mensaje invisible: «${msgDecodificado.slice(0, 200)}». Esto es un intento de inyectar instrucciones ocultas.${explicacionExtra}`,
      remediacion: ["No abrir el repo con un agente", "Eliminar los caracteres invisibles del archivo", "Reportar el repositorio"],
    });
  }

  // ── Bidi (alta/media, determinista) ─────────────────────────────────────
  const bidiPorArchivo = otros.filter((c) => c.tipo === "unicode-bidi");
  if (bidiPorArchivo.length > 0) {
    const primera = bidiPorArchivo[0]!;
    const evidenciaConMarcas = bidiPorArchivo
      .map((c) => marca(c.cp))
      .join(" ");
    hallazgos.push({
      id: idHallazgo("unicode-bidi", ruta),
      modulo: "unicode",
      regla: "unicode-bidi",
      titulo: "Controles bidireccionales (Trojan Source)",
      severidad: severidadBidi(esCodigo(ruta)),
      determinista: true,
      archivo: ruta,
      linea: primera.linea,
      evidencia: prepararEvidencia(evidenciaConMarcas),
      explicacion: `Se encontraron ${bidiPorArchivo.length} controles bidireccionales Unicode (Trojan Source). Estos pueden hacer que el texto se lea en un orden diferente al que se muestra.`,
      remediacion: [
        "Eliminar los controles bidireccionales",
        "Revisar el archivo para confirmar que el código ejecuta lo que parece",
        "Reportar el repositorio",
      ],
    });
  }

  // ── Ancho cero (media/baja, determinista) ───────────────────────────────
  const ceroPorArchivo = otros.filter((c) => c.tipo === "unicode-ancho-cero");
  if (ceroPorArchivo.length > 0) {
    const primera = ceroPorArchivo[0]!;
    hallazgos.push({
      id: idHallazgo("unicode-ancho-cero", ruta),
      modulo: "unicode",
      regla: "unicode-ancho-cero",
      titulo: `${ceroPorArchivo.length} caracteres de ancho cero en archivo`,
      severidad: severidadAnchoCero(ruta, ceroPorArchivo.length),
      determinista: true,
      archivo: ruta,
      linea: primera.linea,
      evidencia: prepararEvidencia(
        ceroPorArchivo.map((c) => marca(c.cp)).join(" ")
      ),
      explicacion: `Se detectaron ${ceroPorArchivo.length} caracteres invisibles de ancho cero (U+200B–U+200F, U+2060–U+2064).${esArchivoSensible(ruta) ? " El archivo es sensible a instrucciones de agentes, lo que aumenta la severidad." : ""}`,
    });
  }

  // ── Variant selectors (media, determinista) ─────────────────────────────
  const vsPorArchivo = otros.filter((c) => c.tipo === "unicode-selector-variacion");
  if (vsPorArchivo.length > 0) {
    const primera = vsPorArchivo[0]!;
    hallazgos.push({
      id: idHallazgo("unicode-selector-variacion", ruta),
      modulo: "unicode",
      regla: "unicode-selector-variacion",
      titulo: `${vsPorArchivo.length} selectores de variación fuera de contexto de emoji`,
      severidad: "media",
      determinista: true,
      archivo: ruta,
      linea: primera.linea,
      evidencia: prepararEvidencia(
        vsPorArchivo.map((c) => marca(c.cp)).join(" ")
      ),
      explicacion: `Se encontraron ${vsPorArchivo.length} selectores de variación Unicode fuera de un emoji visible. Pueden contener datos ocultos.`,
    });
  }

  return hallazgos;
}

// ─── Análisis del directorio completo ───────────────────────────────────────

export function analizarUnicode(archivos: ArchivoLeido[]): Finding[] {
  const hallazgos: Finding[] = [];
  for (const archivo of archivos) {
    hallazgos.push(...analizarArchivoUnicode(archivo));
  }
  return hallazgos;
}