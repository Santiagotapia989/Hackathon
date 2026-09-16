// Clonado de repos en cuarentena. Nunca se ejecuta nada del contenido clonado.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { LIMITES } from "../config.js";

const execFileAsync = promisify(execFile);

export class RepoDemasiadoGrandeError extends Error {}
export class ClonadoFallidoError extends Error {}

export interface ResultadoClon {
  bytes: number;
}

export async function clonarRepo(
  url: string,
  destino: string,
  signal?: AbortSignal,
): Promise<ResultadoClon> {
  if (process.env.NODE_ENV === "test" && !url.startsWith("https://")) {
    // Solo en tests: permite apuntar a un fixture local sin pasar por red/git.
    await fs.cp(url, destino, { recursive: true });
  } else {
    await ejecutarGitClone(url, destino, signal);
  }

  const bytes = await calcularTamanioDirectorio(destino);
  if (bytes > LIMITES.repoClonMaxBytes) {
    await fs.rm(destino, { recursive: true, force: true });
    throw new RepoDemasiadoGrandeError(
      `El repositorio supera el límite de ${LIMITES.repoClonMaxBytes / (1024 * 1024)} MB.`,
    );
  }
  return { bytes };
}

async function ejecutarGitClone(url: string, destino: string, signal?: AbortSignal): Promise<void> {
  const nullHooks = process.platform === "win32" ? "NUL" : "/dev/null";
  try {
    await execFileAsync(
      "git",
      [
        "-c",
        "core.symlinks=false",
        "-c",
        "protocol.file.allow=never",
        "-c",
        `core.hooksPath=${nullHooks}`,
        "-c",
        "core.filter=never",
        "clone",
        "--no-recurse-submodules",
        "--",
        url,
        destino,
      ],
      {
        timeout: LIMITES.timeoutCloneMs,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        signal,
      },
    );
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    throw new ClonadoFallidoError(`No se pudo clonar el repositorio: ${mensaje}`);
  }
}

async function calcularTamanioDirectorio(dir: string): Promise<number> {
  let total = 0;
  const entradas = await fs.readdir(dir, { withFileTypes: true });
  for (const entrada of entradas) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isSymbolicLink()) continue;
    if (entrada.isDirectory()) {
      total += await calcularTamanioDirectorio(ruta);
    } else if (entrada.isFile()) {
      const stat = await fs.stat(ruta);
      total += stat.size;
    }
  }
  return total;
}
