#!/usr/bin/env node
// scripts/test-demo.ts — Script de humo antes de la demo.
// Corre en <2 minutos y verifica, con ✅/❌ por punto:
//   1. servidor y Ollama responden
//   2. repo malicioso → retenido, con hallazgos en los 4 módulos
//   3. repo limpio → liberado
//   4. check_package("unused-imports") → requiere_confirmacion con
//      sugerencia "eslint-plugin-unused-imports"
//      Nació como CONTROL: motor.verificarPaquete() no chequeaba
//      confundibles/typosquatting (bug documentado en
//      tests/motor/verificar-paquete.test.ts) y este check daba ❌ a
//      propósito, como gate para no presentar el guion de "detecta el
//      confundible" en vivo. Ya se aplicó el fix (reutiliza la misma
//      lógica que analizarDependencias) — si esto vuelve a dar ❌ sin que
//      nadie haya tocado motor.verificarPaquete(), es una regresión real.
//   5. las respuestas del MCP no contienen contenido analizado
//
// Requiere: servidor levantado (`npm run server`) y Ollama corriendo.
// Uso: npm run test:demo

import { spawn } from "node:child_process";
import * as path from "node:path";
import { motor } from "../src/motor/index.js";
import type { ContextoAnalisis } from "../src/shared/contrato.js";

const RAIZ = path.resolve(import.meta.dirname!, "..");
const BASE_URL = process.env.ADUANA_API_URL ?? "http://127.0.0.1:3000";

type Resultado = { ok: boolean; nombre: string; detalle: string; ms: number };
const resultados: Resultado[] = [];

async function chequear(nombre: string, fn: () => Promise<{ ok: boolean; detalle: string }>): Promise<void> {
  const inicio = Date.now();
  let r: { ok: boolean; detalle: string };
  try {
    r = await fn();
  } catch (err) {
    r = { ok: false, detalle: `excepción: ${err instanceof Error ? err.message : String(err)}` };
  }
  const ms = Date.now() - inicio;
  resultados.push({ ok: r.ok, nombre, detalle: r.detalle, ms });
  console.log(`${r.ok ? "✅" : "❌"} [${resultados.length}/5] ${nombre} (${ms}ms)`);
  console.log(`   ${r.detalle}`);
}

async function main(): Promise<void> {
  console.log("═".repeat(80));
  console.log("SCRIPT DE HUMO — antes de la demo");
  console.log("═".repeat(80));

  // 1. Servidor y Ollama responden
  await chequear("Servidor y Ollama responden", async () => {
    const resp = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return { ok: false, detalle: `/api/health respondió ${resp.status}. ¿Corriste "npm run server"?` };
    const health = await resp.json();
    if (!health.ollama?.activo) return { ok: false, detalle: `Servidor arriba, pero Ollama no está activo: ${JSON.stringify(health)}` };
    return { ok: true, detalle: `Health OK: ${JSON.stringify(health)}` };
  });

  // 2. repo malicioso → retenido, 4 módulos
  await chequear("repo-malicioso → retenido, hallazgos en los 4 módulos", async () => {
    const dir = path.join(RAIZ, "fixtures", "repo-malicioso");
    const ctx: ContextoAnalisis = {
      scanId: "test-demo-malicioso",
      tipo: "repo",
      objetivo: dir,
      tieneHistorialGit: true,
      offline: true,
      signal: new AbortController().signal,
    };
    const resultado = await motor.analizarDirectorio(dir, ctx, () => {});
    const modulos = new Set(resultado.hallazgos.map((h) => h.modulo));
    const modulosEsperados = ["instrucciones", "unicode", "dependencias", "secretos"];
    const faltantes = modulosEsperados.filter((m) => !modulos.has(m as any));
    if (resultado.veredicto !== "retenido") {
      return { ok: false, detalle: `Veredicto fue "${resultado.veredicto}", esperaba "retenido".` };
    }
    if (faltantes.length > 0) {
      return { ok: false, detalle: `Faltan hallazgos en: ${faltantes.join(", ")}. Módulos con hallazgos: ${[...modulos].join(", ")}.` };
    }
    return { ok: true, detalle: `retenido, ${resultado.hallazgos.length} hallazgos, 4/4 módulos cubiertos.` };
  });

  // 3. repo limpio → liberado
  await chequear("repo-limpio → liberado", async () => {
    const dir = path.join(RAIZ, "fixtures", "repo-limpio");
    const ctx: ContextoAnalisis = {
      scanId: "test-demo-limpio",
      tipo: "repo",
      objetivo: dir,
      tieneHistorialGit: true,
      offline: true,
      signal: new AbortController().signal,
    };
    const resultado = await motor.analizarDirectorio(dir, ctx, () => {});
    if (resultado.veredicto !== "liberado") {
      return { ok: false, detalle: `Veredicto fue "${resultado.veredicto}" con ${resultado.hallazgos.length} hallazgos, esperaba "liberado".` };
    }
    return { ok: true, detalle: "liberado, 0 hallazgos." };
  });

  // 4. check_package(confundible) → requiere_confirmacion + sugerencia
  //    Ex-control (ver comentario arriba): ya arreglado, ahora es una
  //    prueba de regresión normal.
  await chequear('check_package("unused-imports") → requiere_confirmacion con sugerencia', async () => {
    const resp = await fetch(`${BASE_URL}/api/agente/check-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ecosistema: "npm", nombre: "unused-imports" }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await resp.json();
    if (body.resultado !== "requiere_confirmacion" || body.sugerencia !== "eslint-plugin-unused-imports") {
      return {
        ok: false,
        detalle: `resultado="${body.resultado}" sugerencia="${body.sugerencia ?? "undefined"}" — esperaba resultado="requiere_confirmacion" sugerencia="eslint-plugin-unused-imports". Esto ya estaba arreglado — es una REGRESIÓN, revisar motor.verificarPaquete(). No presentar el guion de "confundible" hasta que esto vuelva a ✅.`,
      };
    }
    return { ok: true, detalle: `resultado="${body.resultado}" sugerencia="${body.sugerencia}"` };
  });

  // 5. MCP no filtra contenido analizado
  await chequear("Respuestas del MCP no contienen contenido analizado", async () => {
    const proceso = spawn("npx", ["tsx", "src/plataforma/mcp.ts"], {
      cwd: RAIZ,
      env: { ...process.env, ADUANA_API_URL: BASE_URL },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    proceso.stdout.on("data", (d) => (stdout += d.toString()));
    proceso.stdin.write(
      [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-demo", version: "1.0" } } }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_package", arguments: { ecosistema: "npm", nombre: "express" } } }),
      ].join("\n") + "\n",
    );
    await new Promise((r) => setTimeout(r, 3000));
    proceso.kill();

    const prohibido = /colector\.invalid|ignor[aá]\s+las\s+reglas|ghp_[A-Za-z0-9]{10,}|[​-‏‪-‮\u{E0000}-\u{E007F}]/u;
    if (prohibido.test(stdout)) {
      return { ok: false, detalle: "¡Se encontró contenido prohibido en la respuesta del MCP!" };
    }
    if (!stdout.includes('"id":2')) {
      return { ok: false, detalle: "No llegó respuesta al tools/call (revisar que el servidor esté arriba)." };
    }
    return { ok: true, detalle: "Sin coincidencias de evidencia/contenido analizado en la respuesta." };
  });

  console.log("═".repeat(80));
  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`${resultados.length - fallidos.length}/${resultados.length} OK`);
  if (fallidos.length > 0) {
    console.log(`❌ Fallaron: ${fallidos.map((r) => r.nombre).join("; ")}`);
  }
  console.log("═".repeat(80));

  process.exit(fallidos.length > 0 ? 1 : 0);
}

main();
