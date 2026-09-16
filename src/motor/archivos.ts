// src/motor/archivos.ts
// Recorrido seguro del directorio: sin symlinks, sin junctions fuera de raíz,
// sin binarios, sin archivos gigantes, con límite total. Nunca ejecuta nada.

import * as fs from "node:fs";
import * as path from "node:path";

export const IGNORAR_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".venv",
  "__pycache__",
]);
export const LIMITE_ARCHIVOS = 5000;
export const TAMANIO_MAX_BYTES = 1024 * 1024; // 1 MB
const BYTES_BINARIO = 8 * 1024; // primeros 8 KB para detectar binarios

export type ArchivoLeido = { ruta: string; contenido: string };
export type Desvio = { ruta: string; destino: string };
export type ResultadoRecorrido = {
  archivos: ArchivoLeido[];
  desvios: Desvio[];
  parcial: boolean;
  vistos: number; // archivos considerados (binarios/grandes cuentan)
  saltados: number;
};

function estaDentroDe(base: string, candidato: string): boolean {
  const rel = path.relative(base, candidato);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Recorre `dir` de forma segura.
 * - No sigue symlinks; un symlink/junction que resuelve fuera de la raíz se reporta como `desvio`.
 * - Salta binarios (byte nulo en los primeros 8 KB) y archivos de más de 1 MB.
 * - Detiene tras `LIMITE_ARCHIVOS` archivos leídos y marca `parcial`.
 */
export async function recorrerDirectorio(dir: string): Promise<ResultadoRecorrido> {
  const raizReal = await fs.promises.realpath(dir);
  const resultado: ResultadoRecorrido = {
    archivos: [],
    desvios: [],
    parcial: false,
    vistos: 0,
    saltados: 0,
  };
  const vistosDirs = new Set<string>([raizReal]);

  const procDir = async (dirActual: string, dirRel: string): Promise<void> => {
    if (resultado.parcial) return;
    let entradas: fs.Dirent[];
    try {
      entradas = await fs.promises.readdir(dirActual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      if (resultado.parcial) return;
      const nombre = entrada.name;
      const rutaAbs = path.join(dirActual, nombre);
      const rutaRel = dirRel ? `${dirRel}/${nombre}` : nombre;

      if (IGNORAR_DIRS.has(nombre)) continue;

      try {
        const stats = await fs.promises.lstat(rutaAbs);

        if (stats.isSymbolicLink()) {
          const destino = await fs.promises.realpath(rutaAbs);
          if (!estaDentroDe(raizReal, destino)) {
            resultado.desvios.push({ ruta: rutaRel, destino });
          }
          continue; // nunca se sigue un symlink
        }

        if (stats.isDirectory()) {
          const real = await fs.promises.realpath(rutaAbs);
          if (!estaDentroDe(raizReal, real)) {
            // Junction NTFS hacia afuera: lstat no la marca como symlink, pero realpath la caza.
            resultado.desvios.push({ ruta: rutaRel, destino: real });
            continue;
          }
          if (vistosDirs.has(real)) continue; // evita ciclos
          vistosDirs.add(real);
          await procDir(rutaAbs, rutaRel);
          continue;
        }

        if (!stats.isFile()) {
          resultado.saltados++;
          continue;
        }
        if (stats.size > TAMANIO_MAX_BYTES) {
          resultado.vistos++;
          resultado.saltados++;
          continue;
        }
        resultado.vistos++;
        if (resultado.archivos.length >= LIMITE_ARCHIVOS) {
          resultado.vistos = LIMITE_ARCHIVOS;
          resultado.parcial = true;
          return;
        }

        const buf = await fs.promises.readFile(rutaAbs);
        if (buf.slice(0, BYTES_BINARIO).includes(0)) {
          resultado.saltados++;
          continue;
        }
        resultado.archivos.push({ ruta: rutaRel, contenido: buf.toString("utf8") });
      } catch {
        resultado.saltados++;
      }
    }
  };

  await procDir(dir, "");
  return resultado;
}

/** Número de línea (1-indexado) de un índice de code-unit dentro del contenido. */
export function lineaDeIndice(contenido: string, indice: number): number {
  let linea = 1;
  const tope = Math.min(indice, contenido.length);
  for (let i = 0; i < tope; i++) {
    if (contenido.charCodeAt(i) === 10) linea++;
  }
  return linea;
}

/** Si `archivo` es o cuelga de un directorio ignorado (node_modules, .git, etc.). */
export function esRutaIgnorada(ruta: string): boolean {
  const partes = ruta.split("/");
  return partes.some((p) => IGNORAR_DIRS.has(p));
}