// src/motor/registro/cliente.ts
// Cliente para registros de npm y PyPI. Offline-first: si offline, solo listas locales.
// Hosts allowlist, timeout 5s, cache en memoria, max 5 simultáneas.

import type { Ecosistema } from "../../shared/contrato.js";

// ─── Config ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const MAX_SIMULTANEAS = 5;

const HOSTS_ALLOWLIST = new Set([
  "registry.npmjs.org",
  "api.npmjs.org", // descargas semanales (verificarNpm)
  "registry.yarnpkg.com",
  "pypi.org",
  "pypi.python.org",
  "pythonhosted.org",
]);

// Helper para obtener hosts permitidos (incluyendo mirrors locales configurados)
function obtenerHostsPermitidos(): Set<string> {
  const permitidos = new Set(HOSTS_ALLOWLIST);
  const npmMirror = process.env.ADUANA_NPM_MIRROR;
  const pypiMirror = process.env.ADUANA_PYPI_MIRROR;

  if (npmMirror) {
    try { permitidos.add(new URL(npmMirror).hostname); } catch {}
  }
  if (pypiMirror) {
    try { permitidos.add(new URL(pypiMirror).hostname); } catch {}
  }

  return permitidos;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

type CacheEntry = { existe: boolean | null; datos?: { diasCreacion?: number; descargasSemanales?: number } };

const cache = new Map<string, CacheEntry>();

// ─── Concurrency ────────────────────────────────────────────────────────────

let enVuelo = 0;
const cola: (() => void)[] = [];

async function esperarTurno(): Promise<void> {
  if (enVuelo < MAX_SIMULTANEAS) {
    enVuelo++;
    return;
  }
  await new Promise<void>((resolve) => cola.push(resolve));
  enVuelo++;
}

function liberarTurno(): void {
  enVuelo--;
  if (cola.length > 0) {
    const next = cola.shift();
    next?.();
  }
}

// ─── Fetch con timeout y validación de host ─────────────────────────────────

async function fetchSeguro(
  url: string,
  signal?: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  const parsed = new URL(url);
  const hostsPermitidos = obtenerHostsPermitidos();

  if (!hostsPermitidos.has(parsed.hostname)) {
    throw new Error(`Host no permitido: ${parsed.hostname}`);
  }
  const esMirrorConfigurado = Boolean(
    (process.env.ADUANA_NPM_MIRROR && parsed.hostname === new URL(process.env.ADUANA_NPM_MIRROR).hostname) ||
    (process.env.ADUANA_PYPI_MIRROR && parsed.hostname === new URL(process.env.ADUANA_PYPI_MIRROR).hostname)
  );

  if (parsed.protocol !== "https:" && !esMirrorConfigurado && process.env.ADUANA_ALLOW_HTTP !== "true") {
    throw new Error(`Solo se permiten URLs HTTPS, recibido: ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Combinar con signal externo si existe
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const resp = await fetch(url, { signal: controller.signal });
    const body = await resp.json();
    return { status: resp.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Verificar npm ──────────────────────────────────────────────────────────

async function verificarNpm(
  nombre: string,
  signal?: AbortSignal,
): Promise<CacheEntry> {
  const cacheKey = `npm:${nombre}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  await esperarTurno();
  try {
    const baseUrl = process.env.ADUANA_NPM_MIRROR
      ? process.env.ADUANA_NPM_MIRROR.replace(/\/$/, "")
      : "https://registry.npmjs.org";
    const resp = await fetchSeguro(`${baseUrl}/${encodeURIComponent(nombre)}`, signal);

    if (resp.status === 404) {
      const entry: CacheEntry = { existe: false };
      cache.set(cacheKey, entry);
      return entry;
    }

    if (resp.status !== 200) {
      const entry: CacheEntry = { existe: null };
      cache.set(cacheKey, entry);
      return entry;
    }

    // Extraer fecha de creación
    const data = resp.body as any;
    let diasCreacion: number | undefined;
    if (data.time?.created) {
      const created = new Date(data.time.created);
      const now = new Date();
      diasCreacion = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Descargas semanales
    let descargasSemanales: number | undefined;
    try {
      const dlResp = await fetchSeguro(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(nombre)}`, signal);
      descargasSemanales = (dlResp.body as any)?.downloads;
    } catch (err) {
      // No es crítico para el resultado (existe/diasCreacion siguen
      // devolviéndose igual), pero antes esto era un catch {} vacío que
      // tragaba el error sin dejar rastro — incluido el caso real en que
      // api.npmjs.org no estaba en la allowlist. Dejamos un log para poder
      // diagnosticar si vuelve a fallar.
      console.error(
        `[registro] no se pudieron obtener las descargas semanales de "${nombre}":`,
        err instanceof Error ? err.message : err,
      );
    }

    const entry: CacheEntry = { existe: true, datos: { diasCreacion, descargasSemanales } };
    cache.set(cacheKey, entry);
    return entry;
  } catch {
    const entry: CacheEntry = { existe: null };
    cache.set(cacheKey, entry);
    return entry;
  } finally {
    liberarTurno();
  }
}

// ─── Verificar PyPI ─────────────────────────────────────────────────────────

async function verificarPyPI(
  nombre: string,
  signal?: AbortSignal,
): Promise<CacheEntry> {
  const cacheKey = `pypi:${nombre}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  await esperarTurno();
  try {
    const baseUrl = process.env.ADUANA_PYPI_MIRROR
      ? process.env.ADUANA_PYPI_MIRROR.replace(/\/$/, "")
      : "https://pypi.org";
    const resp = await fetchSeguro(`${baseUrl}/pypi/${encodeURIComponent(nombre)}/json`, signal);

    if (resp.status === 404) {
      const entry: CacheEntry = { existe: false };
      cache.set(cacheKey, entry);
      return entry;
    }

    if (resp.status !== 200) {
      const entry: CacheEntry = { existe: null };
      cache.set(cacheKey, entry);
      return entry;
    }

    // PyPI no da fecha de creación fácil; solo confirmamos existencia
    const entry: CacheEntry = { existe: true, datos: {} };
    cache.set(cacheKey, entry);
    return entry;
  } catch {
    const entry: CacheEntry = { existe: null };
    cache.set(cacheKey, entry);
    return entry;
  } finally {
    liberarTurno();
  }
}

// ─── Verificar nombre ───────────────────────────────────────────────────────

export type ResultadoVerificarNombre = {
  nombre: string;
  existe: boolean | null;
  diasCreacion?: number;
  descargasSemanales?: number;
};

export async function verificarNombre(
  ecosistema: Ecosistema,
  nombre: string,
  opts: { offline: boolean; signal?: AbortSignal },
): Promise<ResultadoVerificarNombre> {
  if (opts.offline) {
    return { nombre, existe: null };
  }

  const verificar = ecosistema === "npm" ? verificarNpm : verificarPyPI;
  const entry = await verificar(nombre, opts.signal);

  return {
    nombre,
    existe: entry.existe,
    diasCreacion: entry.datos?.diasCreacion,
    descargasSemanales: entry.datos?.descargasSemanales,
  };
}

// ─── Reset cache (para tests) ───────────────────────────────────────────────

export function resetCache(): void {
  cache.clear();
  enVuelo = 0;
  cola.length = 0;
}