#!/usr/bin/env node
// scripts/escanear-repo-remoto.ts
// Workflow completo: Recibe URL de GitHub -> Clona en cuarentena aislada -> Analiza estáticamente -> Purga automáticamente la cuarentena

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import type { EventoMotor } from "../src/shared/contrato.js";

const urlArg = process.argv[2];
if (!urlArg || (!urlArg.startsWith("https://") && !urlArg.startsWith("git@") && !urlArg.startsWith("http://"))) {
  console.error("❌ Uso incorrecto.");
  console.error("Uso: npm run escanear-repo -- <url-del-repo-github>");
  console.error("Ejemplo: npm run escanear-repo -- https://github.com/OWASP-Benchmark/BenchmarkUtils.git");
  process.exit(1);
}

// Generar directorio de cuarentena aislado en el sistema de archivos temporal
const idCuarentena = `aduana-quarantine-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
const dirCuarentena = path.join(os.tmpdir(), idCuarentena);

console.log(`\n🔒 === WORKFLOW DE ANÁLISIS DE SEGURIDAD EN CUARENTENA ===`);
console.log(`📡 URL Objetivo: ${urlArg}`);
console.log(`📁 Directorio de Cuarentena: ${dirCuarentena}`);
console.log(`─`.repeat(65));

// Manejador para asegurar limpieza incluso si el usuario presiona Ctrl+C (SIGINT)
const controller = new AbortController();
const signal = controller.signal;

function limpiarCuarentena() {
  if (fs.existsSync(dirCuarentena)) {
    try {
      fs.rmSync(dirCuarentena, { recursive: true, force: true });
      console.log(`\n🧹 [Cuarentena] Directorio aislado purgado correctamente del disco: ${dirCuarentena}`);
      console.log(`✨ Tu equipo ha quedado 100% limpio y protegido.\n`);
    } catch (e) {
      console.error(`⚠️ Error al borrar cuarentena: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

process.on("SIGINT", () => {
  console.log("\n\n⚠️ Análisis interrumpido por el usuario.");
  controller.abort();
  limpiarCuarentena();
  process.exit(130);
});

const { motor } = await import("../src/motor/index.ts");

const inicio = Date.now();

try {
  // 1. Clonar en cuarentena con --depth 1 (shallow clone rápido)
  console.log(`\n📥 1. Clonando repositorio en cuarentena segura (--depth 1)...`);
  execSync(`git clone --depth 1 "${urlArg}" "${dirCuarentena}"`, { stdio: "pipe" });
  console.log(`✅ Clonado en cuarentena completado.`);

  const tieneGit = fs.existsSync(path.join(dirCuarentena, ".git"));

  console.log(`\n🔍 2. Iniciando análisis estático con Aduana Motor...`);
  console.log(`─`.repeat(65));

  // 2. Ejecutar análisis del motor
  const resultado = await motor.analizarDirectorio(
    dirCuarentena,
    {
      scanId: idCuarentena,
      tipo: "repo",
      objetivo: urlArg,
      tieneHistorialGit: tieneGit,
      offline: true,
      signal,
    },
    (evento: EventoMotor) => {
      if (evento.tipo === "etapa") {
        const { nombre, estado, duracionMs } = evento.etapa;
        const icono = estado === "lista" ? "✅" : estado === "error" ? "❌" : "🔄";
        const dur = duracionMs ? ` (${(duracionMs / 1000).toFixed(1)}s)` : "";
        console.log(`  ${icono} ${nombre}: ${estado}${dur}`);
      } else if (evento.tipo === "hallazgo") {
        const h = evento.hallazgo;
        const sev = { critica: "🔴", alta: "🟠", media: "🟡", baja: "⚪" }[h.severidad];
        const det = h.determinista ? " [det]" : " [ia]";
        console.log(`    ${sev} [${h.modulo}] ${h.titulo} (${h.archivo}:${h.linea ?? "?"})${det}`);
      }
    },
  );

  const duracion = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(65)}`);
  console.log(`\n🏁 VEREDICTO FINAL: ${resultado.veredicto.toUpperCase()}`);
  console.log(`📊 Resumen:`);
  console.log(`  Por severidad: ${JSON.stringify(resultado.resumen.porSeveridad)}`);
  console.log(`  Por módulo: ${JSON.stringify(resultado.resumen.porModulo)}`);
  console.log(`  Total Hallazgos: ${resultado.hallazgos.length}`);
  console.log(`  Duración Total: ${duracion}s`);

  if (resultado.hallazgos.length > 0) {
    console.log(`\n📋 Detalle de Hallazgos:`);
    for (const h of resultado.hallazgos) {
      const sev = { critica: "🔴", alta: "🟠", media: "🟡", baja: "⚪" }[h.severidad];
      const det = h.determinista ? "det" : "ia";
      console.log(`\n  ${sev} [${h.modulo}] ${h.titulo}`);
      console.log(`     Archivo: ${h.archivo}${h.linea ? `:${h.linea}` : ""}`);
      console.log(`     Severidad: ${h.severidad} (${det})`);
      if (h.explicacion) console.log(`     Explicación: ${h.explicacion}`);
      if (h.evidenciaDecodificada) console.log(`     Decodificado: ${h.evidenciaDecodificada}`);
      if (h.remediacion) console.log(`     Remediación: ${h.remediacion.join(", ")}`);
    }
  }
} catch (err) {
  console.error(`\n❌ Error durante el workflow: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  // 3. Purga garantizada del directorio de cuarentena
  limpiarCuarentena();
}
