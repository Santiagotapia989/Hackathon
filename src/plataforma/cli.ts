#!/usr/bin/env node
// CLI `aduana`: cliente del servidor HTTP. Si /api/health no responde,
// avisa y sale con código 2 (sección 11 del contexto).

import { Command } from "commander";
import pc from "picocolors";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Etapa, Finding, Scan, Severidad, ResultadoPaquete } from "../shared/contrato.js";
import { HOST, PORT } from "./config.js";
import { clonarRepo } from "./ingesta/repo.js";

const BASE_URL = process.env.ADUANA_API_URL ?? `http://${HOST}:${PORT}`;

async function requiereServidorVivo(): Promise<void> {
  try {
    const resp = await fetch(`${BASE_URL}/api/health`);
    if (!resp.ok) throw new Error();
  } catch {
    console.error(pc.red("Aduana no responde. Iniciá el servidor con `npm run server`."));
    process.exit(2);
  }
}

async function crearScanRemoto(objetivo: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objetivo }),
  });
  const data = (await resp.json()) as { id?: string; error?: string };
  if (!resp.ok || !data.id) {
    console.error(pc.red(data.error ?? "No se pudo crear el escaneo."));
    process.exit(2);
  }
  return data.id;
}

async function obtenerScanRemoto(id: string): Promise<Scan> {
  const resp = await fetch(`${BASE_URL}/api/scans/${id}`);
  if (!resp.ok) {
    console.error(pc.red("No se pudo obtener el resultado del escaneo."));
    process.exit(2);
  }
  return (await resp.json()) as Scan;
}

async function checkPackageRemoto(ecosistema: "npm" | "pypi", nombre: string): Promise<ResultadoPaquete> {
  const resp = await fetch(`${BASE_URL}/api/agente/check-package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ecosistema, nombre }),
  });
  const data = (await resp.json()) as ResultadoPaquete & { error?: string };
  if (!resp.ok) {
    console.error(pc.red((data as { error?: string }).error ?? "No se pudo verificar el paquete."));
    process.exit(2);
  }
  return data;
}

// ─── Marcado de invisibles en evidencia (nunca se imprime cruda) ──────────

function marcarInvisibles(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      const invisible =
        (cp >= 0x200b && cp <= 0x200f) ||
        (cp >= 0x202a && cp <= 0x202e) ||
        (cp >= 0x2066 && cp <= 0x2069) ||
        (cp >= 0xe0000 && cp <= 0xe007f) ||
        cp === 0xfeff ||
        (cp < 0x20 && cp !== 0x0a) ||
        cp === 0x7f;
      return invisible ? `[U+${cp.toString(16).toUpperCase().padStart(4, "0")}]` : ch;
    })
    .join("");
}

// ─── SSE: seguir el progreso de un escaneo en vivo ─────────────────────────

function parsearBloqueSse(bloque: string): { evento?: string; data?: unknown } {
  let evento: string | undefined;
  let dataCruda = "";
  for (const linea of bloque.split("\n")) {
    if (linea.startsWith("event:")) evento = linea.slice("event:".length).trim();
    else if (linea.startsWith("data:")) dataCruda += linea.slice("data:".length).trim();
  }
  return { evento, data: dataCruda ? JSON.parse(dataCruda) : undefined };
}

const COLOR_SEVERIDAD: Record<Severidad, (s: string) => string> = {
  critica: pc.bgRed,
  alta: pc.red,
  media: pc.yellow,
  baja: pc.dim,
};

// Cuántas líneas se imprimieron después de cada hallazgo mostrado: permite
// actualizar en el lugar las re-emisiones del triage en vez de imprimirlas
// de nuevo.
const lineasDesdeHallazgo = new Map<string, number>();

function imprimirLineaEnVivo(texto: string): void {
  console.log(texto);
  for (const [id, n] of lineasDesdeHallazgo) lineasDesdeHallazgo.set(id, n + 1);
}

function sufijoIA(h: Finding): string {
  if (h.analisisIA) {
    const pct = Math.round(h.analisisIA.confianza * 100);
    return ` — IA: ${h.analisisIA.clasificacion} (${pct}%)` +
      (h.analisisIA.intentoManipulacion ? ", intento de manipulación" : "");
  }
  if (h.sinEvaluar) return " — IA: sin evaluar";
  return "";
}

function lineaHallazgo(h: Finding): string {
  const color = COLOR_SEVERIDAD[h.severidad] ?? pc.white;
  return `  ${color(`[${h.severidad}]`)} ${h.regla} — ${h.titulo} (${h.archivo})${pc.dim(sufijoIA(h))}`;
}

function mostrarEventoEnVivo(evento: string, data: unknown): void {
  if (evento === "etapa") {
    const e = data as Etapa;
    const marca = e.estado === "lista" ? pc.green("✓") : e.estado === "error" ? pc.red("✗") : pc.yellow("…");
    imprimirLineaEnVivo(`${marca} ${e.nombre}`);
  } else if (evento === "hallazgo") {
    const h = data as Finding;
    const previo = lineasDesdeHallazgo.get(h.id);
    if (previo !== undefined) {
      // Re-emisión post-triage: actualizar la línea ya impresa, en el lugar.
      // Sin TTY no se puede reescribir; el resumen final muestra el estado
      // actualizado igual.
      if (process.stdout.isTTY) {
        const n = previo + 1;
        process.stdout.write(`\x1b[${n}A\r\x1b[2K${lineaHallazgo(h)}\x1b[${n}B\r`);
      }
      return;
    }
    imprimirLineaEnVivo(lineaHallazgo(h));
    lineasDesdeHallazgo.set(h.id, 0);
  } else if (evento === "error") {
    const e = data as { error: string };
    imprimirLineaEnVivo("");
    imprimirLineaEnVivo(pc.red(`Error: ${e.error}`));
  }
}

async function seguirEscaneo(id: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/api/scans/${id}/events`);
  if (!resp.ok || !resp.body) throw new Error("No se pudo conectar al stream de eventos.");

  const lector = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminado = false;

  while (!terminado) {
    const { value, done } = await lector.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const bloques = buffer.split("\n\n");
    buffer = bloques.pop() ?? "";
    for (const bloque of bloques) {
      if (!bloque.trim() || bloque.startsWith(":")) continue;
      const { evento, data } = parsearBloqueSse(bloque);
      if (!evento) continue;
      mostrarEventoEnVivo(evento, data);
      if (evento === "veredicto" || evento === "error") terminado = true;
    }
  }
}

// ─── Resumen final ──────────────────────────────────────────────────────

const ORDEN_SEVERIDAD: Severidad[] = ["critica", "alta", "media", "baja"];

function mostrarResumenFinal(scan: Scan): void {
  console.log();
  if (scan.hallazgos.length > 0) {
    const porSeveridad = new Map<Severidad, Finding[]>();
    for (const h of scan.hallazgos) {
      const lista = porSeveridad.get(h.severidad) ?? [];
      lista.push(h);
      porSeveridad.set(h.severidad, lista);
    }
    for (const severidad of ORDEN_SEVERIDAD) {
      const lista = porSeveridad.get(severidad);
      if (!lista?.length) continue;
      const color = COLOR_SEVERIDAD[severidad];
      console.log(color(`── ${severidad.toUpperCase()} (${lista.length}) ──`));
      for (const h of lista) {
        console.log(`${h.regla} — ${h.titulo}`);
        console.log(`  archivo: ${h.archivo}${h.linea ? `:${h.linea}` : ""}`);
        console.log(`  evidencia: ${marcarInvisibles(h.evidencia)}`);
        if (h.evidenciaDecodificada) {
          console.log(`  evidencia decodificada: ${marcarInvisibles(h.evidenciaDecodificada)}`);
        }
        if (h.analisisIA) {
          const pct = Math.round(h.analisisIA.confianza * 100);
          console.log(
            `  IA: ${h.analisisIA.clasificacion} (confianza ${pct}%)` +
              (h.analisisIA.intentoManipulacion ? ", intento de manipulación" : ""),
          );
        } else if (h.sinEvaluar) {
          console.log("  IA: sin evaluar");
        }
        if (h.explicacion) console.log(`  ${h.explicacion}`);
      }
      console.log();
    }
  }

  if (scan.estado === "error") {
    console.log(pc.red(`Error: ${scan.error ?? "desconocido"}`));
    return;
  }

  const v = scan.veredicto;
  const linea =
    v === "liberado"
      ? pc.green("🟢 LIBERADO")
      : v === "revisar"
        ? pc.yellow("🟡 REVISAR")
        : pc.red("🔴 RETENIDO");
  console.log(`Veredicto: ${linea}`);
}

function codigoSalidaPorVeredicto(scan: Scan): number {
  if (scan.estado === "error") return 2;
  switch (scan.veredicto) {
    case "liberado":
      return 0;
    case "revisar":
      return 3;
    case "retenido":
      return 1;
    default:
      return 2;
  }
}

async function confirmar(pregunta: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const respuesta = await rl.question(`${pregunta} [y/N] `);
    return /^y(es)?$/i.test(respuesta.trim());
  } finally {
    rl.close();
  }
}

function correrComando(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

function nombreRepoDesdeUrl(url: string): string {
  const partes = url.replace(/\/+$/, "").split("/");
  return partes[partes.length - 1] || "repo";
}

// ─── Comandos ───────────────────────────────────────────────────────────

const programa = new Command();
programa.name("aduana").description("Control de seguridad local para agentes de IA").version("0.1.0");

programa
  .command("scan <objetivo>")
  .description('Escanea un repo o paquete ("npm:x", "pypi:x" o una URL) y muestra el veredicto')
  .action(async (objetivo: string) => {
    await requiereServidorVivo();
    const id = await crearScanRemoto(objetivo);
    console.log(pc.dim(`Escaneo ${id} — objetivo: ${objetivo}`));
    await seguirEscaneo(id);
    const scan = await obtenerScanRemoto(id);
    mostrarResumenFinal(scan);
    process.exit(codigoSalidaPorVeredicto(scan));
  });

programa
  .command("clone <url> [destino]")
  .description("Escanea un repo y, si el veredicto lo permite, lo clona")
  .action(async (url: string, destinoArg?: string) => {
    await requiereServidorVivo();
    const id = await crearScanRemoto(url);
    console.log(pc.dim(`Escaneando ${url}...`));
    await seguirEscaneo(id);
    const scan = await obtenerScanRemoto(id);
    mostrarResumenFinal(scan);

    if (scan.estado === "error" || !scan.veredicto) process.exit(2);
    if (scan.veredicto === "retenido") {
      console.log(pc.red("Retenido: no se clona."));
      process.exit(1);
    }

    const destino = destinoArg ?? nombreRepoDesdeUrl(url);

    if (scan.veredicto === "revisar") {
      const ok = await confirmar(`Hay hallazgos a revisar. ¿Clonar igual en "${destino}"?`);
      if (!ok) {
        console.log("Cancelado.");
        process.exit(3);
      }
    }

    console.log(pc.dim(`Clonando en ${destino}...`));
    await clonarRepo(url, destino);
    console.log(pc.green(`Clonado en ${destino}.`));
    process.exit(0);
  });

programa
  .command("install <paquete>")
  .description('Instala un paquete npm tras verificarlo. Formato: "npm:<nombre>"')
  .action(async (paquete: string) => {
    await requiereServidorVivo();
    if (!paquete.startsWith("npm:")) {
      console.error(pc.red('Formato esperado: "npm:<nombre>".'));
      process.exit(2);
    }
    const nombre = paquete.slice("npm:".length);
    const resultado = await checkPackageRemoto("npm", nombre);

    if (resultado.resultado === "bloqueado") {
      console.log(pc.red(`Bloqueado: ${resultado.motivos.join(" ")}`));
      if (resultado.sugerencia) console.log(pc.dim(`Sugerencia: ${resultado.sugerencia}`));
      process.exit(1);
    }

    if (resultado.resultado === "requiere_confirmacion") {
      console.log(pc.yellow(`Revisar: ${resultado.motivos.join(" ")}`));
      if (resultado.sugerencia) console.log(pc.dim(`Sugerencia: ${resultado.sugerencia}`));
      const ok = await confirmar(`¿Instalar "${nombre}" de todas formas?`);
      if (!ok) {
        console.log("Cancelado.");
        process.exit(3);
      }
    }

    console.log(pc.dim(`Instalando ${nombre}...`));
    const codigo = await correrComando("npm", ["install", "--ignore-scripts", nombre]);
    if (codigo !== 0) process.exit(codigo);
    console.log(pc.green("Instalado."));
    process.exit(0);
  });

programa.parseAsync(process.argv);
