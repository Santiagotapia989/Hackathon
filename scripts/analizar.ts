#!/usr/bin/env node
// scripts/analizar.ts
// CLI de prueba: npm run motor -- <directorio>
// Imprime cada evento a medida que sale y el veredicto final.

import * as path from "node:path";
import type { EventoMotor } from "../src/shared/contrato.js";

const dirArg = process.argv[2];
if (!dirArg) {
  console.error("Uso: npm run motor -- <directorio>");
  process.exit(1);
}

const dir = path.resolve(dirArg);
if (!dir) {
  console.error(`Directorio no encontrado: ${dirArg}`);
  process.exit(1);
}

// Importar motor dinámicamente para que funcione con strip-types
const { motor } = await import("../src/motor/index.ts");
const { recorrerDirectorio } = await import("../src/motor/archivos.ts");

// Verificar que el directorio existe
const fs = await import("node:fs");
if (!fs.existsSync(dir)) {
  console.error(`El directorio "${dir}" no existe.`);
  process.exit(1);
}

// Verificar si tiene .git
const tieneGit = fs.existsSync(path.join(dir, ".git"));

console.log(`\n🔍 Analizando: ${dir}`);
console.log(`📁 Historial git: ${tieneGit ? "sí" : "no"}`);
console.log(`─`.repeat(60));

const controller = new AbortController();
const signal = controller.signal;

// Manejar Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Análisis abortado.");
  controller.abort();
  process.exit(130);
});

const inicio = Date.now();

try {
  const resultado = await motor.analizarDirectorio(dir, {
    scanId: "cli-test",
    tipo: "repo",
    objetivo: dir,
    tieneHistorialGit: tieneGit,
    offline: true,
    signal,
  }, (evento: EventoMotor) => {
    const elapsed = ((Date.now() - inicio) / 1000).toFixed(1);

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
  });

  const duracion = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`\n🏁 Veredicto: ${resultado.veredicto.toUpperCase()}`);
  console.log(`📊 Resumen:`);
  console.log(`  Por severidad: ${JSON.stringify(resultado.resumen.porSeveridad)}`);
  console.log(`  Por módulo: ${JSON.stringify(resultado.resumen.porModulo)}`);
  console.log(`  Hallazgos: ${resultado.hallazgos.length}`);
  console.log(`  Duración: ${duracion}s`);

  if (resultado.hallazgos.length > 0) {
    console.log(`\n📋 Hallazgos:`);
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
  console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}