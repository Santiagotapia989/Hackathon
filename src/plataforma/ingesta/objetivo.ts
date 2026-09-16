// Parseo y validación del "objetivo" que llega en CrearScanBody:
// "npm:<nombre>" | "pypi:<nombre>" | URL de repo (github.com / gitlab.com).

import type { Ecosistema } from "../../shared/contrato.js";

export type ObjetivoParseado =
  | { tipo: "paquete"; ecosistema: Ecosistema; nombre: string }
  | { tipo: "repo"; url: string };

export class ObjetivoInvalidoError extends Error {}

const HOSTS_PERMITIDOS = new Set(["github.com", "gitlab.com"]);

// npm: scope opcional, minúsculas, dígitos, "-._"
const RE_NPM = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
// PyPI: letras, dígitos y "-._"
const RE_PYPI = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const EJEMPLO =
  'Formato esperado: "npm:<nombre>", "pypi:<nombre>", o una URL https://github.com/<owner>/<repo> (o gitlab.com).';

export function parsearObjetivo(entrada: string): ObjetivoParseado {
  const valor = entrada.trim();

  if (valor.startsWith("npm:")) {
    const nombre = valor.slice("npm:".length);
    if (!RE_NPM.test(nombre)) {
      throw new ObjetivoInvalidoError(`Nombre de paquete npm inválido: "${nombre}". ${EJEMPLO}`);
    }
    return { tipo: "paquete", ecosistema: "npm", nombre };
  }

  if (valor.startsWith("pypi:")) {
    const nombre = valor.slice("pypi:".length);
    if (!RE_PYPI.test(nombre)) {
      throw new ObjetivoInvalidoError(`Nombre de paquete PyPI inválido: "${nombre}". ${EJEMPLO}`);
    }
    return { tipo: "paquete", ecosistema: "pypi", nombre };
  }

  if (valor.startsWith("https://") || valor.startsWith("http://")) {
    return { tipo: "repo", url: normalizarUrlRepo(valor) };
  }

  throw new ObjetivoInvalidoError(`No se entendió el objetivo "${entrada}". ${EJEMPLO}`);
}

function normalizarUrlRepo(valor: string): string {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ObjetivoInvalidoError(`URL de repo inválida: "${valor}". ${EJEMPLO}`);
  }

  if (url.protocol !== "https:") {
    throw new ObjetivoInvalidoError(`Solo se aceptan URLs https. ${EJEMPLO}`);
  }
  if (url.username || url.password) {
    throw new ObjetivoInvalidoError(`La URL no puede llevar usuario ni contraseña. ${EJEMPLO}`);
  }
  if (url.search || url.hash) {
    throw new ObjetivoInvalidoError(`La URL no puede llevar query ni fragment. ${EJEMPLO}`);
  }
  if (!HOSTS_PERMITIDOS.has(url.hostname)) {
    throw new ObjetivoInvalidoError(
      `Host no permitido: "${url.hostname}". Solo se aceptan ${[...HOSTS_PERMITIDOS].join(", ")}.`,
    );
  }

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith(".git")) pathname = pathname.slice(0, -".git".length);

  const partes = pathname.split("/").filter(Boolean);
  if (partes.length !== 2) {
    throw new ObjetivoInvalidoError(
      `La URL debe apuntar a un repo: https://${url.hostname}/<owner>/<repo>. ${EJEMPLO}`,
    );
  }

  return `https://${url.hostname}/${partes[0]}/${partes[1]}`;
}
