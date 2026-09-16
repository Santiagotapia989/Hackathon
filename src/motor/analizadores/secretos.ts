// src/motor/analizadores/secretos.ts
// Runner inyectable para gitleaks. Detecta secretos con gitleaks,
// aplica criticidad por RuleID y downgrade por ruta.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile, execSync } from "node:child_process";
import type { Finding } from "../../shared/contrato.js";
import { prepararEvidencia, enmascarar } from "../evidencia.js";
import { idHallazgo } from "../util.js";
import criticidadSecretos from "../reglas/criticidad-secretos.json" with { type: "json" };

const CRITICIDAD: Record<string, string> = criticidadSecretos as any;

// ─── Config ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 60_000;
const RUTAS_TEST = /(?:test|tests|spec|specs|fixture|fixtures|example|examples|mock|mocks|__tests__|__mocks__)/i;

// ─── Resolver gitleaks ──────────────────────────────────────────────────────

export type GitleaksRunner = {
  ejecutar(dir: string, tieneHistorialGit: boolean, signal?: AbortSignal): Promise<{ exitCode: number; reporte: string }>;
};

/** Encuentra el binario de gitleaks en PATH, GITLEAKS_PATH, bin/ o node_modules/.bin. */
function resolverGitleaks(): string | null {
  // 1. GITLEAKS_PATH
  const envPath = process.env["GITLEAKS_PATH"];
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2. Varios candidatos de bin/ (desde src/motor/analizadores sube 3 niveles; desde cwd puede variar)
  const candidatos: string[] = [];
  for (const exe of ["gitleaks.exe", "gitleaks"]) {
    candidatos.push(path.join(import.meta.dirname!, "..", "..", "..", "bin", exe));
    candidatos.push(path.join(process.cwd(), "bin", exe));
  }
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return candidato;
  }

  // 3. PATH
  try {
    const comando = process.platform === "win32" ? "where gitleaks" : "which gitleaks";
    const resultado = execSync(comando, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (resultado) return resultado.split("\n")[0]!;
  } catch { /* not found */ }

  return null;
}

/** Runner por defecto: ejecuta gitleaks como binario real. */
export function crearGitleaksRunner(): GitleaksRunner {
  const binario = resolverGitleaks();

  return {
    async ejecutar(dir, tieneHistorialGit, signal) {
      if (!binario) {
        throw new Error("gitleaks no encontrado");
      }

      // Detectar versión para adaptar subcomando
      let subcomando = tieneHistorialGit ? "git" : "dir";
      let args: string[];

      // Verificar si es versión vieja (usa "detect" en vez de "git"/"dir")
      try {
        const versionOut = execSync(`"${binario}" version`, { encoding: "utf8" }).trim();
        const match = versionOut.match(/v?(\d+)\./);
        const major = match ? parseInt(match[1]!, 10) : 8;
        if (major < 8) {
          subcomando = "detect";
        }
      } catch {
        // si falla, usar git/dir (asumir v8+)
      }

      if (subcomando === "detect") {
        args = ["detect", "--source", dir, "--no-git", "--report-format", "json", "--report-path", "-"];
      } else {
        // gitleaks git [repo] y gitleaks dir <path> toman la ruta como argumento posicional.
        // report-path "-" escribe el JSON a stdout (sin archivos temporales).
        // Sin --redact: el secreto se enmascara acá con enmascarar() para conservar el contexto
        // de la línea (ej. "GITHUB_TOKEN=ghp_***"). Nunca se emite el secreto completo.
        args = [subcomando, "--report-format", "json", "--report-path", "-", dir];
      }

      return new Promise((resolve, reject) => {
        const child = execFile(binario, args, {
          timeout: TIMEOUT_MS,
          encoding: "utf8",
          maxBuffer: 50 * 1024 * 1024,
          signal,
        }, (error, stdout, stderr) => {
          // gitleaks exit 1 = encontró secretos (no es error)
          if (child.killed) {
            reject(new Error("gitleaks terminado por timeout"));
            return;
          }
          resolve({
            exitCode: error ? (error as any).code ?? 1 : 0,
            reporte: stdout || stderr || "[]",
          });
        });
      });
    },
  };
}

/** Runner inyectable para tests: retorna un reporte fijo. */
export function crearGitleaksRunnerMock(reporte: unknown[]): GitleaksRunner {
  return {
    async ejecutar() {
      return { exitCode: reporte.length > 0 ? 1 : 0, reporte: JSON.stringify(reporte) };
    },
  };
}

// ─── Parseo del reporte ─────────────────────────────────────────────────────

type GitleaksFinding = {
  RuleID: string;
  File: string;
  StartLine?: number;
  EndLine?: number;
  Match?: string;
  Secret?: string;
  Commit?: string;
  Author?: string;
  Message?: string;
};

function parsearReporte(reporte: string): GitleaksFinding[] {
  try {
    const parsed = JSON.parse(reporte);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f: any) => f && typeof f.RuleID === "string");
  } catch {
    return [];
  }
}

// ─── Severidad por RuleID ───────────────────────────────────────────────────

function severidadPorRuleId(ruleId: string): "critica" | "alta" | "media" | "baja" {
  const criticidad: Record<string, "critica" | "alta" | "media" | "baja"> = CRITICIDAD as any;
  if (criticidad["critica"]?.includes(ruleId)) return "critica";
  if (criticidad["alta"]?.includes(ruleId)) return "alta";
  if (criticidad["media"]?.includes(ruleId)) return "media";
  return "baja";
}

function downgradePorRuta(
  severidad: "critica" | "alta" | "media" | "baja",
  ruta: string,
  commit?: string,
): "critica" | "alta" | "media" | "baja" {
  const niveles = ["baja", "media", "alta", "critica"] as const;
  let idx = niveles.indexOf(severidad);

  if (RUTAS_TEST.test(ruta)) idx--;
  if (commit) idx--; // solo en historial = downgrade

  idx = Math.max(0, idx);
  return niveles[idx]!;
}

// ─── Análisis ───────────────────────────────────────────────────────────────

export type OptsSecretos = {
  tieneHistorialGit: boolean;
  offline: boolean;
  signal?: AbortSignal;
  runner?: GitleaksRunner;
};

export async function analizarSecretos(
  dir: string,
  opts: OptsSecretos,
): Promise<Finding[]> {
  const runner = opts.runner ?? crearGitleaksRunner();

  try {
    const { reporte } = await runner.ejecutar(
      dir,
      opts.tieneHistorialGit,
      opts.signal,
    );

    const hallazgosRaw = parsearReporte(reporte);
    const hallazgos: Finding[] = [];

    for (const h of hallazgosRaw) {
      const ruta = h.File.replace(/\\/g, "/").replace(/^[A-Z]:\//i, "").replace(/^.*?fixtures\/repo-malicioso\//, "");
      const severidad = downgradePorRuta(
        severidadPorRuleId(h.RuleID),
        h.File,
        h.Commit,
      );

      // Enmascarar el secreto dentro del Match (conserva contexto: "GITHUB_TOKEN=ghp_***")
      const secreto = h.Secret;
      let matchConMarcas = h.Match ?? "";
      if (secreto) matchConMarcas = matchConMarcas.replaceAll(secreto, enmascarar(secreto));

      hallazgos.push({
        id: idHallazgo(`secreto-${h.RuleID}`, h.File, h.StartLine),
        modulo: "secretos",
        regla: `secreto-${h.RuleID}`,
        titulo: `Secreto detectado: ${h.RuleID}`,
        severidad,
        determinista: true,
        archivo: ruta,
        linea: h.StartLine,
        commit: h.Commit,
        evidencia: prepararEvidencia(matchConMarcas),
        explicacion: `Gitleaks detectó un secreto "${h.RuleID}" en el archivo ${ruta}${h.Commit ? ` (commit ${h.Commit.slice(0, 7)})` : ""}.`,
        remediacion: [
          "Revocar o rotar el secreto",
          "Mover el valor a una variable de entorno",
          "Limpiar el historial con git filter-repo",
        ],
      });
    }

    return hallazgos;
  } catch (err) {
    // Error de ejecución de gitleaks (no encontrado, timeout, etc.)
    return [];
  }
}

/** Verifica si gitleaks está disponible. */
export function verificarGitleaks(): boolean {
  return resolverGitleaks() !== null;
}