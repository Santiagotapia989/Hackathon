// src/motor/analizadores/instrucciones.ts
// Analizador de instrucciones para agentes de IA.
// Escanea archivos sensibles en busca de patrones maliciosos.
// Cruza comentarios HTML y bloques base64 en archivos Markdown.

import * as path from "node:path";
import type { Finding } from "../../shared/contrato.js";
import type { ArchivoLeido } from "../archivos.js";
import { lineaDeIndice } from "../archivos.js";
import { prepararEvidencia } from "../evidencia.js";
import { idHallazgo } from "../util.js";
import patronesInstrucciones from "../reglas/instrucciones.json" with { type: "json" };
import archivosSensibles from "../reglas/archivos-sensibles.json" with { type: "json" };

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Categoria = {
  id: string;
  titulo: string;
  determinista: boolean;
  severidadInicial: string;
  patrones: string[];
  requiereUrl?: boolean;
};

const CATEGORIAS: Categoria[] = (patronesInstrucciones as any).categorias;
const PATRONES_SENSIBLES: string[] = archivosSensibles as unknown as string[];

// ─── Coincidencia de archivos sensibles ──────────────────────────────────────

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
      if (nombre.match(new RegExp("^" + patron.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"))) return true;
    } else if (nombre === patron) {
      return true;
    }
  }
  return false;
}

// ─── Extracción de HTML oculto ──────────────────────────────────────────────

function extraerComentariosHTML(texto: string): { contenido: string; linea: number }[] {
  const resultados: { contenido: string; linea: number }[] = [];
  const regex = /<!--([\s\S]*?)-->/g;
  let match;
  let offset = 0;
  while ((match = regex.exec(texto)) !== null) {
    const contenido = match[1]!;
    if (contenido.trim().length === 0) continue;
    resultados.push({ contenido, linea: lineaDeIndice(texto, match.index + offset) });
    offset = match.index;
  }
  return resultados;
}

// ─── Extracción de bloques base64 ───────────────────────────────────────────

function extraerBase64(texto: string): { contenido: string; linea: number }[] {
  const resultados: { contenido: string; linea: number }[] = [];
  const regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
  let match;
  let offset = 0;
  while ((match = regex.exec(texto)) !== null) {
    const raw = match[0];
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded.length > 20 && /[a-zA-Záéíóúñ]/.test(decoded)) {
        resultados.push({ contenido: decoded, linea: lineaDeIndice(texto, match.index + offset) });
      }
    } catch { /* no era base64 válido */ }
    offset = match.index;
  }
  return resultados;
}

// ─── Matching de patrones ───────────────────────────────────────────────────

function buscarPatronesEnTexto(
  texto: string,
  categorias: Categoria[],
): { categoria: Categoria; patron: string; linea: number; evidencia: string }[] {
  const resultados: { categoria: Categoria; patron: string; linea: number; evidencia: string }[] = [];

  for (const cat of categorias) {
    for (const patronStr of cat.patrones) {
      let patron: RegExp;
      try {
        patron = new RegExp(patronStr, "i");
      } catch {
        continue; // patrón inválido en JSON
      }

      const m = patron.exec(texto);
      if (!m) continue;

      const linea = lineaDeIndice(texto, m.index);
      const lineas = texto.split("\n");
      const evidencia = lineas[linea - 1]?.trim() ?? m[0];

      resultados.push({
        categoria: cat,
        patron: patronStr,
        linea,
        evidencia: evidencia.slice(0, 500),
      });
      break; // un hallazgo por categoría
    }
  }

  return resultados;
}

// ─── Análisis por archivo ───────────────────────────────────────────────────

function analizarArchivo(archivo: ArchivoLeido): Finding[] {
  const { ruta, contenido } = archivo;
  const hallazgos: Finding[] = [];

  if (!esArchivoSensible(ruta)) return [];

  // Buscar en el contenido principal
  const matches = buscarPatronesEnTexto(contenido, CATEGORIAS);

  for (const match of matches) {
    const { categoria, linea, evidencia } = match;

    // Para exfiltración: verificar que haya una URL en la misma línea/contexto
    if ((categoria as any).requiereUrl) {
      const lineas = contenido.split("\n");
      const contexto = lineas.slice(Math.max(0, linea - 2), linea + 2).join(" ");
      if (!/https?:\/\//i.test(contexto)) continue;
    }

    const id = idHallazgo(`instruccion-${categoria.id}`, ruta, linea);

    hallazgos.push({
      id,
      modulo: "instrucciones",
      regla: `instruccion-${categoria.id}`,
      titulo: categoria.titulo,
      severidad: (categoria.severidadInicial as any),
      determinista: categoria.determinista,
      archivo: ruta,
      linea,
      evidencia: prepararEvidencia(evidencia),
      explicacion: `Se detectó un patrón de "${categoria.titulo}" en el archivo sensible.`,
    });
  }

  // Comentarios HTML en archivos Markdown
  if (/\.(md|mdx)$/i.test(ruta)) {
    const comentarios = extraerComentariosHTML(contenido);
    for (const { contenido: contenidoCom, linea } of comentarios) {
      const matchesCom = buscarPatronesEnTexto(contenidoCom, CATEGORIAS);
      for (const match of matchesCom) {
        const { categoria, evidencia } = match;

        if ((categoria as any).requiereUrl) {
          if (!/https?:\/\//i.test(contenidoCom)) continue;
        }

        const id = idHallazgo(`instruccion-${categoria.id}`, ruta, linea);
        // No duplicar si ya se encontró en el contenido principal
        if (hallazgos.some((h) => h.id === id)) continue;

        hallazgos.push({
          id,
          modulo: "instrucciones",
          regla: `instruccion-${categoria.id}`,
          titulo: categoria.titulo,
          severidad: (categoria.severidadInicial as any),
          determinista: categoria.determinista,
          archivo: ruta,
          linea,
          evidencia: prepararEvidencia(`<!-- ${evidencia} -->`),
          explicacion: `Se detectó un patrón de "${categoria.titulo}" en un comentario HTML oculto dentro del Markdown. Los comentarios HTML no se renderizan y pueden ocultar instrucciones.`,
        });
      }
    }
  }

  // Bloques base64 >40 chars en archivos Markdown (decoded content analizado)
  if (/\.(md|mdx)$/i.test(ruta)) {
    const bloques = extraerBase64(contenido);
    for (const { contenido: contenidoDec, linea } of bloques) {
      const matchesB64 = buscarPatronesEnTexto(contenidoDec, CATEGORIAS);
      for (const match of matchesB64) {
        const { categoria, evidencia } = match;

        const id = idHallazgo(`instruccion-${categoria.id}`, ruta, linea);
        if (hallazgos.some((h) => h.id === id)) continue;

        hallazgos.push({
          id,
          modulo: "instrucciones",
          regla: `instruccion-${categoria.id}`,
          titulo: `${categoria.titulo} (contenido base64)`,
          severidad: (categoria.severidadInicial as any),
          determinista: categoria.determinista,
          archivo: ruta,
          linea,
          evidencia: prepararEvidencia(`base64: ${evidencia}`),
          explicacion: `Se encontró un bloque base64 en el archivo que, al decodificarse, contiene patrones de "${categoria.titulo}".`,
        });
      }
    }
  }

  return hallazgos;
}

// ─── Análisis del directorio completo ───────────────────────────────────────

export function analizarInstrucciones(archivos: ArchivoLeido[]): Finding[] {
  const hallazgos: Finding[] = [];
  for (const archivo of archivos) {
    hallazgos.push(...analizarArchivo(archivo));
  }
  return hallazgos;
}