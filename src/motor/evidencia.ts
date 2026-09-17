// src/motor/evidencia.ts
// Toda la evidencia que sale del motor pasa por la cadena:
//   desinfectarTexto → marcarInvisibles → truncar → enmascarar

import { z } from "zod";
import { Finding } from "../shared/contrato.js";

export const LONGITUD_EVIDENCIA = 500;
export const LIMITE_INPUT_PATRON = 64 * 1024; // 64 KB por coincidencia

// ─── Rangos de caracteres invisibles/control ────────────────────────────────

export type RangoUnicode = { desde: number; hasta: number; nombre: string };

export const RANGOS_INVISIBLES: RangoUnicode[] = [
  { desde: 0x200b, hasta: 0x200f, nombre: "espacio de ancho cero" },
  { desde: 0x202a, hasta: 0x202e, nombre: "control bidireccional" },
  { desde: 0x2060, hasta: 0x2064, nombre: "operador invisible" },
  { desde: 0xfe00, hasta: 0xfe0f, nombre: "selector de variación" },
  { desde: 0xe0000, hasta: 0xe007f, nombre: "unicode tags" },
  { desde: 0xe0100, hasta: 0xe01ef, nombre: "selector de variación suplementario" },
  { desde: 0xfeff, hasta: 0xfeff, nombre: "BOM" },
  { desde: 0x00ad, hasta: 0x00ad, nombre: "guión blando" },
];

const RANGOS_TAGS: RangoUnicode = { desde: 0xe0000, hasta: 0xe007f, nombre: "unicode tags" };

export function estaEnRango(cp: number, rango: RangoUnicode): boolean {
  return cp >= rango.desde && cp <= rango.hasta;
}

export function esInvisible(cp: number): boolean {
  return RANGOS_INVISIBLES.some((r) => estaEnRango(cp, r));
}

export function esTag(cp: number): boolean {
  return estaEnRango(cp, RANGOS_TAGS);
}

export function marca(cp: number): string {
  return `⟦U+${cp.toString(16).toUpperCase().padStart(4, "0")}⟧`;
}

// ─── Cadena de desinfección ─────────────────────────────────────────────────

// Secuencias de escape de terminal (CSI, OSC, charset) y ESC suelto.
const ESC_SEQUENCE =
  /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][0-9A-B]|\x1b/g;
// Controles C0 restantes (se conservan \t \r \n).
const CONTROL_C0 = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Quita/neutraliza controles de terminal para que el texto no pueda ejecutar ANSI ni falsificar la CLI. */
export function desinfectarTexto(texto: string): string {
  return texto
    .replace(ESC_SEQUENCE, (m) => (m.length === 1 ? marca(0x1b) : ""))
    .replace(CONTROL_C0, (m) => marca(m.charCodeAt(0)));
}

/** Reemplaza caracteres invisibles por marcas visibles ⟦U+XXXX⟧. Nunca deja uno crudo. */
export function marcarInvisibles(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    salida += esInvisible(ch.codePointAt(0)!) ? marca(ch.codePointAt(0)!) : ch;
  }
  return salida;
}

/** Corta a `max` caracteres agregando …(+N) con la cantidad omitida. Total nunca pasa `max`. */
export function truncar(texto: string, max = LONGITUD_EVIDENCIA): string {
  if (texto.length <= max) return texto;
  let base = max;
  const sufijo = (omitidos: number) => `…(+${omitidos})`;
  while (base > 0 && base + sufijo(texto.length - base).length > max) {
    base--;
  }
  return texto.slice(0, base) + sufijo(texto.length - base);
}

/** Deja los primeros 4 caracteres y reemplaza el resto por *. Pasa todo a estrellas si es muy corto. */
export function enmascarar(secreto: string): string {
  if (secreto.length <= 4) return "*".repeat(secreto.length);
  return secreto.slice(0, 4) + "*".repeat(secreto.length - 4);
}

/** Cadena completa que toda evidencia debe atravesar. */
export function prepararEvidencia(texto: string, max = LONGITUD_EVIDENCIA): string {
  return truncar(marcarInvisibles(desinfectarTexto(texto)), max);
}

// ─── Validación Zod antes de emitir ─────────────────────────────────────────

/** Valida y devuelve Result (discriminated por éxito). Fallo = bug del motor, se loguea. */
export function validarHallazgo(h: unknown): { ok: true; value: z.infer<typeof Finding> } | { ok: false; error: string } {
  const res = Finding.safeParse(h);
  if (res.success) return { ok: true, value: res.data };
  return { ok: false, error: res.error.message };
}