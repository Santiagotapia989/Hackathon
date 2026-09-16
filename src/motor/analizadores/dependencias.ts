// src/motor/analizadores/dependencias.ts
// Analiza dependencias en package.json y requirements.txt.
// Verifica existencia en registros, typosquatting, paquetes nuevos.
// Detecta scripts de instalación sospechosos.

import type { Finding } from "../../shared/contrato.js";
import type { ArchivoLeido } from "../archivos.js";
import { prepararEvidencia } from "../evidencia.js";
import { idHallazgo, levenshtein, normalizarNombre } from "../util.js";
import { verificarNombre } from "../registro/cliente.js";
import confundibles from "../datos/confundibles.json" with { type: "json" };
import topNpm from "../datos/top-npm.json" with { type: "json" };
import topPypi from "../datos/top-pypi.json" with { type: "json" };

export const CONFUNDIBLES: Record<string, { sugerencia: string | null; descripcion: string }> = confundibles as any;
export const TOP_NPM: string[] = topNpm as unknown as string[];
export const TOP_PYPI: string[] = topPypi as unknown as string[];

// ─── Scripts de instalación ─────────────────────────────────────────────────

const SCRIPTS_INSTALACION = ["preinstall", "install", "postinstall", "prepare"];
const SCRIPTS_SOSPECHOSOS = /curl|wget|node\s+-[eE]|eval\s*\(|base64\s+-d|iex\s*\(|Invoke-|\/bin\/sh/i;
const SCRIPTS_CON_URL = /https?:\/\//i;

// ─── Typosquatting ─────────────────────────────────────────────────────────

export function buscarTyposquatting(
  nombre: string,
  topList: string[],
): string | null {
  const norm = normalizarNombre(nombre);
  if (topList.includes(norm)) return null; // es popular, no es typosquatting

  for (const top of topList) {
    const dist = levenshtein(norm, top);
    if (dist >= 1 && dist <= 2) return top;
  }
  return null;
}

// ─── Scripts de instalación ─────────────────────────────────────────────────

function analizarScriptsInstalacion(
  scripts: Record<string, string> | undefined,
  archivo: string,
): Finding[] {
  if (!scripts) return [];
  const hallazgos: Finding[] = [];

  for (const [scriptName, scriptContent] of Object.entries(scripts)) {
    if (!SCRIPTS_INSTALACION.includes(scriptName)) continue;

    const esSospechoso = SCRIPTS_SOSPECHOSOS.test(scriptContent);
    const tieneURL = SCRIPTS_CON_URL.test(scriptContent);

    if (esSospechoso || tieneURL) {
      hallazgos.push({
        id: idHallazgo(`dep-script-instalacion-sospechoso:${scriptName}`, archivo),
        modulo: "dependencias",
        regla: "dep-script-instalacion-sospechoso",
        titulo: `Script "${scriptName}" sospechoso`,
        severidad: "alta",
        determinista: true,
        archivo,
        evidencia: prepararEvidencia(`${scriptName}: ${scriptContent}`),
        explicacion: `El script "${scriptName}" contiene comandos que podrían ejecutar código remoto o manipular el sistema.`,
      });
    } else {
      hallazgos.push({
        id: idHallazgo(`dep-script-instalacion:${scriptName}`, archivo),
        modulo: "dependencias",
        regla: "dep-script-instalacion",
        titulo: `Script de instalación "${scriptName}"`,
        severidad: "baja",
        determinista: true,
        archivo,
        evidencia: prepararEvidencia(`${scriptName}: ${scriptContent}`),
        explicacion: `El script "${scriptName}" existe en el paquete. Revisá si es necesario.`,
      });
    }
  }

  return hallazgos;
}

// ─── Análisis de package.json ───────────────────────────────────────────────

async function analizarPackageJson(
  archivo: ArchivoLeido,
  opts: { offline: boolean; signal?: AbortSignal },
): Promise<Finding[]> {
  const hallazgos: Finding[] = [];

  let pkg: any;
  try {
    pkg = JSON.parse(archivo.contenido);
  } catch {
    return []; // JSON inválido, otro analizador lo detecta
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  };

  const ecosistema = "npm" as const;
  const topList = TOP_NPM;

  // Verificar cada dependencia
  for (const [nombre, version] of Object.entries(deps)) {
    if (typeof nombre !== "string" || typeof version !== "string") continue;

    // 1. Confundibles conocidos
    const confundible = CONFUNDIBLES[normalizarNombre(nombre)];
    if (confundible) {
      hallazgos.push({
        id: idHallazgo("dep-paquete-confundible", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-paquete-confundible",
        titulo: "Dependencia con nombre confundible",
        severidad: "alta",
        determinista: true,
        archivo: archivo.ruta,
        evidencia: prepararEvidencia(`"${nombre}": "${version}"`),
        explicacion: confundible.descripcion,
        remediacion: confundible.sugerencia
          ? [`Reemplazar por ${confundible.sugerencia}`]
          : undefined,
      });
    }

    // 2. Typosquatting contra top list
    const sugerencia = buscarTyposquatting(nombre, topList);
    if (sugerencia && !confundible) {
      hallazgos.push({
        id: idHallazgo("dep-typosquatting", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-typosquatting",
        titulo: "Posible typosquatting",
        severidad: "alta",
        determinista: true,
        archivo: archivo.ruta,
        evidencia: prepararEvidencia(`"${nombre}": "${version}" (similar a "${sugerencia}")`),
        explicacion: `El nombre "${nombre}" es similar al paquete popular "${sugerencia}". Esto puede ser typosquatting.`,
        remediacion: [`Reemplazar por ${sugerencia}`],
      });
    }

    // 3. Verificación de existencia en registro
    const resultado = await verificarNombre(ecosistema, nombre, opts);

    if (resultado.existe === false && !confundible) {
      hallazgos.push({
        id: idHallazgo("dep-paquete-alucinado", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-paquete-alucinado",
        titulo: "Dependencia que no existe en el registro",
        severidad: "critica",
        determinista: true,
        archivo: archivo.ruta,
        evidencia: prepararEvidencia(`"${nombre}": "${version}"`),
        explicacion: `El paquete "${nombre}" no existe en npm. Esto es una dependencia inventada (alucinación de un asistente de IA).`,
        remediacion: ["Verificar el nombre del paquete correcto"],
      });
    }

    // 4. Paquete nuevo o poco usado
    if (resultado.existe === true) {
      const esNuevo = resultado.diasCreacion !== undefined && resultado.diasCreacion < 30;
      const esPocoUsado = resultado.descargasSemanales !== undefined && resultado.descargasSemanales < 100;

      if (esNuevo || esPocoUsado) {
        hallazgos.push({
          id: idHallazgo("dep-paquete-nuevo", archivo.ruta),
          modulo: "dependencias",
          regla: "dep-paquete-nuevo",
          titulo: esNuevo ? "Paquete muy reciente" : "Paquete con pocas descargas",
          severidad: "media",
          determinista: true,
          archivo: archivo.ruta,
          evidencia: prepararEvidencia(
            `"${nombre}": creado hace ${resultado.diasCreacion ?? "?"} días, ${resultado.descargasSemanales ?? "?"} descargas/semana`
          ),
          explicacion: esNuevo
            ? `El paquete tiene menos de 30 días de existencia. Podría ser malicioso.`
            : `El paquete tiene menos de 100 descargas semanales. Podría ser malicioso o abandonado.`,
        });
      }
    }
  }

  // Scripts de instalación
  hallazgos.push(...analizarScriptsInstalacion(pkg.scripts, archivo.ruta));

  return hallazgos;
}

// ─── Análisis de requirements.txt ───────────────────────────────────────────

async function analizarRequirements(
  archivo: ArchivoLeido,
  opts: { offline: boolean; signal?: AbortSignal },
): Promise<Finding[]> {
  const hallazgos: Finding[] = [];
  const lineas = archivo.contenido.split("\n");

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]!.trim();
    if (!linea || linea.startsWith("#")) continue;

    // Extraer nombre del paquete (ignorar versiones y extras)
    const match = linea.match(/^([a-zA-Z0-9_-]+)/);
    if (!match) continue;

    const nombre = match[1]!;
    const ecosistema = "pypi" as const;
    const topList = TOP_PYPI;

    // Confundibles
    const confundible = CONFUNDIBLES[normalizarNombre(nombre)];
    if (confundible) {
      hallazgos.push({
        id: idHallazgo("dep-paquete-confundible", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-paquete-confundible",
        titulo: "Dependencia con nombre confundible",
        severidad: "alta",
        determinista: true,
        archivo: archivo.ruta,
        linea: i + 1,
        evidencia: prepararEvidencia(linea),
        explicacion: confundible.descripcion,
      });
    }

    // Typosquatting
    const sugerencia = buscarTyposquatting(nombre, topList);
    if (sugerencia && !confundible) {
      hallazgos.push({
        id: idHallazgo("dep-typosquatting", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-typosquatting",
        titulo: "Posible typosquatting",
        severidad: "alta",
        determinista: true,
        archivo: archivo.ruta,
        linea: i + 1,
        evidencia: prepararEvidencia(`${linea} (similar a "${sugerencia}")`),
        explicacion: `El nombre "${nombre}" es similar al paquete "${sugerencia}".`,
        remediacion: [`Reemplazar por ${sugerencia}`],
      });
    }

    // Verificar existencia
    const resultado = await verificarNombre(ecosistema, nombre, opts);

    if (resultado.existe === false && !confundible) {
      hallazgos.push({
        id: idHallazgo("dep-paquete-alucinado", archivo.ruta),
        modulo: "dependencias",
        regla: "dep-paquete-alucinado",
        titulo: "Dependencia que no existe en el registro",
        severidad: "critica",
        determinista: true,
        archivo: archivo.ruta,
        linea: i + 1,
        evidencia: prepararEvidencia(linea),
        explicacion: `El paquete "${nombre}" no existe en PyPI. Esto es una dependencia inventada (alucinación de un asistente de IA).`,
      });
    }
  }

  return hallazgos;
}

// ─── Análisis del directorio completo ───────────────────────────────────────

export async function analizarDependencias(
  archivos: ArchivoLeido[],
  opts: { offline: boolean; signal?: AbortSignal },
): Promise<Finding[]> {
  const hallazgos: Finding[] = [];

  for (const archivo of archivos) {
    const nombre = archivo.ruta.split("/").pop() ?? "";

    if (nombre === "package.json") {
      hallazgos.push(...await analizarPackageJson(archivo, opts));
    } else if (nombre === "requirements.txt") {
      hallazgos.push(...await analizarRequirements(archivo, opts));
    }
  }

  return hallazgos;
}