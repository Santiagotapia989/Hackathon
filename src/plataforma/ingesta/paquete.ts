// Descarga de paquetes npm/PyPI en cuarentena, sin ejecutar nunca su código.
// npm pack --ignore-scripts; PyPI se descarga con fetch (nunca `pip download`,
// que puede correr el build backend del paquete).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import * as tar from "tar";
import AdmZip from "adm-zip";
import type { Ecosistema } from "../../shared/contrato.js";
import { LIMITES } from "../config.js";

const execFileAsync = promisify(execFile);

export class PaqueteInexistenteError extends Error {}
export class PaqueteDemasiadoGrandeError extends Error {}
export class DescargaFallidaError extends Error {}

export async function descargarPaquete(
  ecosistema: Ecosistema,
  nombre: string,
  destino: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<void> {
  if (ecosistema === "npm") {
    await descargarNpm(nombre, destino, tmpDir, signal);
  } else {
    await descargarPypi(nombre, destino, tmpDir, signal);
  }
}

// ─── npm ────────────────────────────────────────────────────────────────────

async function descargarNpm(
  nombre: string,
  destino: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<void> {
  await fs.mkdir(tmpDir, { recursive: true });
  let stdout: string;
  const comandoNpm = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    const resultado = await execFileAsync(
      comandoNpm,
      ["pack", nombre, "--ignore-scripts", "--pack-destination", tmpDir, "--json"],
      { timeout: LIMITES.timeoutCloneMs, signal, shell: process.platform === "win32" },
    );
    stdout = resultado.stdout;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    if (/404|not found|no existe/i.test(mensaje)) {
      throw new PaqueteInexistenteError("El paquete no existe en el registro.");
    }
    throw new DescargaFallidaError(`No se pudo descargar el paquete npm: ${mensaje}`);
  }

  let filename: string | undefined;
  try {
    const jsonMatch = stdout.match(/[\{\[][\s\S]*[\}\]]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : stdout);
    if (Array.isArray(parsed)) {
      filename = parsed[0]?.filename;
    } else if (typeof parsed === "object" && parsed !== null) {
      const primerValor = Object.values(parsed)[0] as { filename?: string } | undefined;
      filename = primerValor?.filename;
    }
  } catch {
    throw new DescargaFallidaError("Respuesta inesperada de npm pack.");
  }
  if (!filename) throw new DescargaFallidaError("npm pack no devolvió un archivo.");

  const rutaTgz = path.join(tmpDir, filename);
  await verificarTamanio(rutaTgz);
  await extraerTar(rutaTgz, destino, { strip: 1 });
}

// ─── PyPI ───────────────────────────────────────────────────────────────────

interface PypiRelease {
  packagetype: string;
  url: string;
  filename: string;
}

async function descargarPypi(
  nombre: string,
  destino: string,
  tmpDir: string,
  signal?: AbortSignal,
): Promise<void> {
  const respMeta = await fetch(`https://pypi.org/pypi/${encodeURIComponent(nombre)}/json`, { signal });
  if (respMeta.status === 404) {
    throw new PaqueteInexistenteError("El paquete no existe en el registro.");
  }
  if (!respMeta.ok) {
    throw new DescargaFallidaError(`No se pudo consultar PyPI (${respMeta.status}).`);
  }

  const meta = (await respMeta.json()) as { urls?: PypiRelease[] };
  const releases = meta.urls ?? [];
  const sdist = releases.find((r) => r.packagetype === "sdist");
  const wheel = releases.find((r) => r.packagetype === "bdist_wheel");
  const elegido = sdist ?? wheel;
  if (!elegido) {
    throw new DescargaFallidaError("El paquete no tiene archivos descargables en PyPI.");
  }

  const rutaDescarga = path.join(tmpDir, elegido.filename);
  await descargarConLimite(elegido.url, rutaDescarga, LIMITES.paqueteDescargaMaxBytes, signal);

  if (elegido === sdist) {
    await extraerTar(rutaDescarga, destino, { strip: 1 });
  } else {
    await extraerWheel(rutaDescarga, destino);
  }
}

async function descargarConLimite(
  url: string,
  destino: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(url, { signal });
  if (!resp.ok || !resp.body) {
    throw new DescargaFallidaError(`No se pudo descargar ${url} (${resp.status}).`);
  }
  const contentLength = resp.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new PaqueteDemasiadoGrandeError(
      `El paquete supera el límite de ${maxBytes / (1024 * 1024)} MB.`,
    );
  }

  const writable = fsSync.createWriteStream(destino);
  let total = 0;
  try {
    for await (const chunk of resp.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        throw new PaqueteDemasiadoGrandeError(
          `El paquete supera el límite de ${maxBytes / (1024 * 1024)} MB.`,
        );
      }
      writable.write(chunk);
    }
  } finally {
    writable.end();
  }
  await new Promise<void>((resolve, reject) => {
    writable.on("finish", () => resolve());
    writable.on("error", reject);
  });
}

async function verificarTamanio(ruta: string): Promise<void> {
  const stat = await fs.stat(ruta);
  if (stat.size > LIMITES.paqueteDescargaMaxBytes) {
    throw new PaqueteDemasiadoGrandeError(
      `El paquete supera el límite de ${LIMITES.paqueteDescargaMaxBytes / (1024 * 1024)} MB.`,
    );
  }
}

// ─── Extracción segura ──────────────────────────────────────────────────────

function entradaEsSegura(rutaEntrada: string): boolean {
  if (path.isAbsolute(rutaEntrada)) return false;
  const partes = rutaEntrada.split(/[/\\]/);
  if (partes.includes("..")) return false;
  return true;
}

async function extraerTar(archivo: string, destino: string, opts: { strip?: number }): Promise<void> {
  await fs.mkdir(destino, { recursive: true });
  await tar.x({
    file: archivo,
    cwd: destino,
    strip: opts.strip ?? 0,
    filter: (rutaEntrada: string) => entradaEsSegura(rutaEntrada),
    onentry: (entry: { type?: string; resume: () => void }) => {
      if (entry.type === "SymbolicLink" || entry.type === "Link") {
        entry.resume(); // descarta el contenido sin extraer el link
      }
    },
    // el propio módulo tar rechaza rutas que resuelvan fuera de `cwd`.
  });
}

async function extraerWheel(archivo: string, destino: string): Promise<void> {
  const zip = new AdmZip(archivo);
  await fs.mkdir(destino, { recursive: true });
  const raiz = path.resolve(destino);

  for (const entrada of zip.getEntries()) {
    if (!entradaEsSegura(entrada.entryName)) continue;

    // bit S_IFLNK (0xA000) en los atributos unix del zip → symlink, se descarta.
    const modoUnix = (entrada.header.attr >>> 16) & 0xf000;
    if (modoUnix === 0xa000) continue;

    const rutaDestino = path.resolve(destino, entrada.entryName);
    if (!rutaDestino.startsWith(raiz + path.sep) && rutaDestino !== raiz) continue;

    if (entrada.isDirectory) {
      await fs.mkdir(rutaDestino, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(rutaDestino), { recursive: true });
      await fs.writeFile(rutaDestino, entrada.getData());
    }
  }
}
