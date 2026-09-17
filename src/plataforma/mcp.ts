// Servidor MCP por stdio. Proceso separado del server HTTP: es un cliente
// finito de /api/agente/*, así los eventos quedan registrados y el front
// los ve (sección 10 del contexto).
//
// Regla crítica: nunca devolver evidencia/evidenciaDecodificada/explicacion
// al agente — eso sería inyectarle nosotros mismos el contenido malicioso.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Finding, ResultadoPaquete } from "../shared/contrato.js";
import { HOST, PORT, REPORTE_BASE_URL } from "./config.js";

const BASE_URL = process.env.ADUANA_API_URL ?? `http://${HOST}:${PORT}`;

interface RespuestaCheckRepo {
  scanId: string;
  estado: "en_curso" | "terminado" | "error";
  veredicto?: "liberado" | "revisar" | "retenido";
  resumen?: { porSeveridad: Record<string, number>; porModulo: Record<string, number> };
}

async function llamarApi<T>(ruta: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE_URL}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `La API respondió ${resp.status}.`);
  }
  return (await resp.json()) as T;
}

function resumenHallazgos(hallazgos: Finding[]): string {
  if (hallazgos.length === 0) return "";
  return hallazgos.map((h) => `${h.regla} [${h.severidad}] en ${h.archivo}`).join("; ");
}

function formatearCheckPackage(r: ResultadoPaquete): string {
  const lineas: string[] = [];

  if (r.resultado === "bloqueado") {
    const razon = r.existe === false ? "no existe en el registro" : "fue bloqueado por Aduana";
    lineas.push(`BLOQUEADO: el paquete "${r.nombre}" ${razon}. No lo instales.`);
    if (r.sugerencia) lineas.push(`Sugerencia: ${r.sugerencia}`);
  } else if (r.resultado === "requiere_confirmacion") {
    lineas.push(`REVISAR: el paquete "${r.nombre}" requiere confirmación humana antes de instalar.`);
    if (r.sugerencia) lineas.push(`Sugerencia: ${r.sugerencia}`);
  } else {
    lineas.push(`PERMITIDO: el paquete "${r.nombre}" no presenta problemas detectados por Aduana.`);
  }

  if (r.motivos.length) lineas.push(`Motivos: ${r.motivos.join(" ")}`);
  const hallazgos = resumenHallazgos(r.hallazgos);
  if (hallazgos) lineas.push(`Hallazgos: ${hallazgos}`);

  return lineas.join("\n");
}

function formatearCheckRepo(r: RespuestaCheckRepo): string {
  const link = `${REPORTE_BASE_URL}/${r.scanId}`;

  if (r.estado === "en_curso") {
    return `EN CURSO: el escaneo del repo sigue corriendo. No lo abras todavía. Reporte: ${link}`;
  }
  if (r.estado === "error") {
    return `ERROR: el escaneo no pudo completarse. No abras el repo hasta reintentar. Reporte: ${link}`;
  }

  const cuentas = r.resumen
    ? `Hallazgos por severidad: ${Object.entries(r.resumen.porSeveridad)
        .map(([s, n]) => `${s}=${n}`)
        .join(", ")}.`
    : "";

  if (r.veredicto === "retenido") {
    return `BLOQUEADO: el repositorio fue retenido por Aduana. No lo abras. ${cuentas} Reporte: ${link}`;
  }
  if (r.veredicto === "revisar") {
    return `REVISAR: el repositorio requiere revisión antes de abrirlo. ${cuentas} Reporte: ${link}`;
  }
  return `PERMITIDO: el repositorio fue liberado por Aduana. ${cuentas} Reporte: ${link}`;
}

const MENSAJE_SERVIDOR_CAIDO = "Aduana no está corriendo. No instales hasta verificar.";

const server = new McpServer({ name: "aduana", version: "0.1.0" });

server.tool(
  "check_package",
  "Llamá a esta herramienta ANTES de instalar cualquier dependencia (npm o pypi). " +
    "Devuelve si Aduana permite, bloquea o pide confirmación para instalarla.",
  { ecosistema: z.enum(["npm", "pypi"]), nombre: z.string().min(1) },
  async ({ ecosistema, nombre }) => {
    try {
      const resultado = await llamarApi<ResultadoPaquete>("/api/agente/check-package", {
        ecosistema,
        nombre,
      });
      return { content: [{ type: "text", text: formatearCheckPackage(resultado) }] };
    } catch {
      return { content: [{ type: "text", text: MENSAJE_SERVIDOR_CAIDO }], isError: true };
    }
  },
);

server.tool(
  "check_repo",
  "Llamá a esta herramienta ANTES de clonar o abrir un repositorio externo. " +
    "Escanea el repo con Aduana y devuelve el veredicto (podés tardar hasta 2 minutos).",
  { url: z.string().url() },
  async ({ url }) => {
    try {
      const resultado = await llamarApi<RespuestaCheckRepo>("/api/agente/check-repo", { url });
      return { content: [{ type: "text", text: formatearCheckRepo(resultado) }] };
    } catch {
      return { content: [{ type: "text", text: MENSAJE_SERVIDOR_CAIDO }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
