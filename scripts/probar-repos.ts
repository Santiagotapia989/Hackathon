#!/usr/bin/env node
// scripts/probar-repos.ts
// Módulo de pruebas de repositorios: lee la base de casos persistente en un
// archivo de texto y ejecuta el motor de análisis para CADA caso (recursivo
// sobre todas las líneas del archivo). Compara lo obtenido contra la "idea"
// de la respuesta esperada (veredicto + módulos) y emite KPIs verificables.
//
// Cada caso corre en un PROCESO HIJO independiente (aislamiento de memoria y
// de crashes) con timeout duro. El padre orquesta un pool de N en paralelo y
// procesa los casos en BLOQUES con checkpoint: guarda estado + reporte parcial
// tras cada bloque y reanuda automáticamente donde quedó.
//
// Uso:
//   npm run probar-repos                          → casos por defecto (fixtures/casos-repos.txt)
//   npm run probar-repos -- <ruta-casos.txt>      → base de casos alterna
//   npm run probar-repos -- -r <ruta-casos.txt>   → modo masivo/recursivo: escanea TODAS las líneas;
//                                                    tolera URLs sueltas (modo descubrimiento) y compara
//                                                    las líneas que traen "idea" (veredicto | módulos).
//   npm run probar-repos -- --umbral 100          → exit 0 si (modo -r: tasa de ejecución) / (normal: completitud) >= umbral
//   npm run probar-repos -- --paralelo 4          → procesa 4 casos a la vez (default: igual al tamaño de bloque)
//   npm run probar-repos -- --bloque 5            → 5 casos por bloque, en paralelo, con checkpoint (default 5)
//   npm run probar-repos -- --pausa 5             → segundos de enfriamiento entre bloques (default 5)
//   npm run probar-repos -- --timeout-caso 900    → mata el caso si supera 900s (default 300)
//   npm run probar-repos -- --timeout-clon 600    → aborta el git clone si supera 600s (default 120)
//   npm run probar-repos -- --estado <ruta.json>  → archivo de checkpoint (default prueba-repos-estado.json)
//   npm run probar-repos -- --reiniciar           → ignora el estado previo y arranca de cero
//   npm run probar-repos -- --continuar           → fuerza reanudación (default: automática si hay estado válido)
//   npm run probar-repos -- --reintentar-fallidos → al reanudar, vuelve a correr los casos que fallaron (timeout/error)
//   npm run probar-repos -- --json                → imprime el reporte JSON al final
//
// Requiere: fixtures generados (npm run generar-fixtures) y gitleaks en bin/
// o en PATH para que el módulo "secretos" corra con determinismo.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import type { Finding, EventoMotor, Modulo, Veredicto } from "../src/shared/contrato.js";

const RAIZ = path.resolve(import.meta.dirname!, "..");
const RUTA_DEFAULT = path.join(RAIZ, "fixtures", "casos-repos.txt");
const REPORTE = path.join(RAIZ, "prueba-repos-reporte.json");
const SCRIPT = import.meta.filename!;

const VEREDICTOS = ["liberado", "revisar", "retenido"] as const;
const MODULOS: Modulo[] = ["instrucciones", "unicode", "dependencias", "secretos"];
const SEV_ICONO: Record<string, string> = { critica: "🔴", alta: "🟠", media: "🟡", baja: "⚪" };

// ─── Config por argumentos ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const FLAGS_CON_VALOR = ["--umbral", "--paralelo", "--bloque", "--pausa", "--timeout-caso", "--timeout-clon", "--estado", "--interno"];

function valorFlag(nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

function posicionales(): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (FLAGS_CON_VALOR.includes(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

const umbral = Number(valorFlag("--umbral") ?? 100);
const conJson = args.includes("--json");
const modoMasivo = args.includes("-r") || args.includes("--recursivo");
const bloque = Math.max(1, Number(valorFlag("--bloque") ?? 5) || 5);
// Si no se especifica --paralelo, se procesan tantos a la vez como el tamaño de bloque
// (así "--bloque 5" = 5 en paralelo por tanda). Usar --paralelo 1 para ir de a uno.
const paralelo = Math.max(1, Number(valorFlag("--paralelo") ?? bloque) || 1);
const pausaMs = Math.max(0, Number(valorFlag("--pausa") ?? 5) || 0) * 1000;
const timeoutCasoMs = Math.max(1, Number(valorFlag("--timeout-caso") ?? 300) || 300) * 1000;
const timeoutClonMs = Math.max(1, Number(valorFlag("--timeout-clon") ?? 120) || 120) * 1000;
const banderaReiniciar = args.includes("--reiniciar");
const banderaContinuar = args.includes("--continuar");
const banderaReintentar = args.includes("--reintentar-fallidos");
const configInterno = valorFlag("--interno") ?? null;
const estadoPath = path.resolve(RAIZ, valorFlag("--estado") ?? "prueba-repos-estado.json");
const posicional = posicionales()[0];
if (modoMasivo && !posicional && !configInterno) {
  console.error("❌ Modo masivo (-r) requiere una ruta: npm run probar-repos -- -r <ruta-casos.txt>");
  process.exit(2);
}
const archivoCasos: string = posicional ?? RUTA_DEFAULT;

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Caso = {
  linea: number;
  objetivo: string;
  modo: "verificacion" | "descubrimiento"; // en -r, las líneas sin "idea" se escanean igual
  veredictoEsperado: Veredicto | null;      // null = descubrimiento (sin "idea" aún)
  modulosEsperados: Modulo[];               // [] = sin módulos esperados (0 hallazgos o descubrimiento)
};

type ResultadoCaso = {
  caso: Caso;
  ok: boolean;                       // verificacion: cumple la "idea"; descubrimiento: escaneo sin error
  ejecucionExitosa: boolean;         // el motor terminó el escaneo sin excepción (KPI del modo -r)
  veredictoObtenido: Veredicto | null;
  hallazgos: Finding[];
  faltantes: Modulo[];
  inesperados: Finding[];
  duracionMs: number;
  detalles: string[];
};

type ConfigCaso = {
  caso: Caso;
  dirCuarentena: string | null; // ruta única que el padre reserva para el clon (null = caso local)
  resultPath: string;
  timeoutClonMs: number;
};

type Estado = {
  version: 1;
  archivoCasos: string;
  huella: string;
  actualizado: string;
  resultados: Record<string, ResultadoCaso>;
};

// ─── Parseo de la base de casos ─────────────────────────────────────────────

function parsearCasos(contenido: string, ruta: string): Caso[] {
  const casos: Caso[] = [];
  const lineas = contenido.split(/\r?\n/);
  lineas.forEach((raw, i) => {
    const linea = raw.trim();
    const num = i + 1;
    if (!linea || linea.startsWith("#")) return;

    const partes = linea.split("|").map((p) => p.trim());
    if (partes.length < 2) {
      if (modoMasivo) {
        // Modo -r: línea con solo la URL → caso descubrimiento (se registra el resultado, sin "idea").
        const objetivo = partes[0];
        if (!objetivo) throw new Error(`Casos ${ruta}:${num}: objetivo vacío`);
        casos.push({ linea: num, objetivo, modo: "descubrimiento", veredictoEsperado: null, modulosEsperados: [] });
        return;
      }
      throw new Error(`Casos ${ruta}:${num}: se esperaba "<objetivo> | <veredicto> | <modulos>"`);
    }
    const [objetivo, veredictoRaw, modulosRaw] = partes;

    if (!objetivo) throw new Error(`Casos ${ruta}:${num}: objetivo vacío`);
    if (!VEREDICTOS.includes(veredictoRaw as Veredicto)) {
      throw new Error(`Casos ${ruta}:${num}: veredicto inválido "${veredictoRaw}" (esperaba ${VEREDICTOS.join("|")})`);
    }

    let modulos: Modulo[] = [];
    if (modulosRaw && modulosRaw !== "0") {
      modulos = modulosRaw.split(",").map((m) => m.trim()).filter(Boolean) as Modulo[];
      for (const m of modulos) {
        if (!MODULOS.includes(m)) {
          throw new Error(`Casos ${ruta}:${num}: módulo inválido "${m}" (esperaba ${MODULOS.join("|")})`);
        }
      }
    }

    casos.push({ linea: num, objetivo, modo: "verificacion", veredictoEsperado: veredictoRaw as Veredicto, modulosEsperados: modulos });
  });
  return casos;
}

// ─── Checkpoint (estado de progreso) ────────────────────────────────────────

function claveCaso(caso: Caso): string {
  return `${caso.linea}|${caso.objetivo}|${caso.modo}`;
}

function huellaCasos(casos: Caso[]): string {
  return createHash("sha1").update(casos.map(claveCaso).join("\n")).digest("hex");
}

function leerEstado(ruta: string): Estado | null {
  if (!fs.existsSync(ruta)) return null;
  try {
    const e = JSON.parse(fs.readFileSync(ruta, "utf8")) as Estado;
    if (e?.version === 1 && typeof e.huella === "string" && e.resultados && typeof e.resultados === "object") {
      return e;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Helpers de resolución ──────────────────────────────────────────────────

function esRemoto(objetivo: string): boolean {
  return /^(https?:\/\/|git@)/.test(objetivo);
}

function clonarEnCuarentena(objetivo: string, dir: string, timeoutMs: number): void {
  console.log(`  📥 Clonando en cuarentena (--depth 1, timeout ${Math.round(timeoutMs / 1000)}s)...`);
  execFileSync("git", ["clone", "--depth", "1", objetivo, dir], { stdio: "pipe", timeout: timeoutMs });
}

function dormirSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// En Windows matar el proceso hijo (node) NO mata a su nieto `git.exe`, que sigue
// escribiendo en la cuarentena y hace fallar el borrado. Matamos el árbol completo.
function matarArbol(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    /* el proceso ya terminó */
  }
}

function purgar(dir: string, silencioso = false): void {
  if (!fs.existsSync(dir)) return;
  for (let intento = 1; intento <= 6; intento++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      if (!silencioso) console.log(`  🧹 Cuarentena purgada del disco: ${dir}`);
      return;
    } catch {
      if (intento < 6) {
        dormirSync(400); // damos tiempo a que git.exe libere los handles
        continue;
      }
      try {
        execFileSync("cmd", ["/c", "rmdir", "/s", "/q", dir], { stdio: "ignore" });
        return;
      } catch (e) {
        console.error(`  ⚠️ No se pudo purgar: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

// Barrido de seguridad: si una corrida anterior murió de golpe (cerrar la terminal,
// apagar la máquina), pueden quedar clones en %TEMP%. Borramos los que superen las 6h.
function limpiarCuarentenasViejas(horas = 6): number {
  const tmp = os.tmpdir();
  const limite = Date.now() - horas * 3600_000;
  let borrados = 0;
  let entradas: string[] = [];
  try { entradas = fs.readdirSync(tmp); } catch { return 0; }
  for (const nombre of entradas) {
    if (!nombre.startsWith("aduana-prueba-") && !nombre.startsWith("aduana-run-")) continue;
    const p = path.join(tmp, nombre);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory() && st.mtimeMs < limite) {
        fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
        borrados++;
      }
    } catch { /* en uso o sin permisos: se ignora */ }
  }
  return borrados;
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

function calcularKpis(rs: ResultadoCaso[]) {
  const total = rs.length;
  const verif = rs.filter((r) => r.caso.modo === "verificacion");
  const veriTotal = verif.length;
  const ejecutadosBien = rs.filter((r) => r.ejecucionExitosa).length;
  const tasaEjecucionExitosa = total ? (ejecutadosBien / total) * 100 : 100;

  const aciertosVeredicto = verif.filter((r) => r.veredictoObtenido === r.caso.veredictoEsperado).length;
  const perfectos = verif.filter((r) => r.ok).length;
  const modulosEsperadosTotal = verif.reduce((n, r) => n + r.caso.modulosEsperados.length, 0);
  const modulosDetectados = verif.reduce((n, r) => n + r.caso.modulosEsperados.length - r.faltantes.length, 0);
  const exactitudVeredicto = veriTotal ? (aciertosVeredicto / veriTotal) * 100 : null;
  const coberturaModulos = modulosEsperadosTotal ? (modulosDetectados / modulosEsperadosTotal) * 100 : null;
  const completitud = veriTotal ? (perfectos / veriTotal) * 100 : null;

  return {
    total,
    veriTotal,
    ejecutadosBien,
    tasaEjecucionExitosa,
    aciertosVeredicto,
    perfectos,
    modulosEsperadosTotal,
    modulosDetectados,
    exactitudVeredicto,
    coberturaModulos,
    completitud,
  };
}

// ─── Ejecución de un caso (proceso hijo) ────────────────────────────────────

async function ejecutarCasoInterno(configPath: string): Promise<void> {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as ConfigCaso;
  const { caso, dirCuarentena, resultPath, timeoutClonMs: timeoutClon } = cfg;
  const inicio = Date.now();

  const detalles: string[] = [];
  let veredictoObtenido: Veredicto | null = null;
  let hallazgos: Finding[] = [];
  let faltantes: Modulo[] = [];
  let inesperados: Finding[] = [];
  let ok = false;
  let ejecucionExitosa = false;

  try {
    let dir: string;
    let tieneHistorialGit = false;
    if (esRemoto(caso.objetivo)) {
      if (!dirCuarentena) throw new Error("config interna sin dirCuarentena para objetivo remoto");
      clonarEnCuarentena(caso.objetivo, dirCuarentena, timeoutClon);
      dir = dirCuarentena;
      tieneHistorialGit = true;
    } else {
      dir = path.resolve(RAIZ, caso.objetivo);
      if (!fs.existsSync(dir)) {
        throw new Error(`Directorio local no encontrado: ${dir}. ¿Corriste "npm run generar-fixtures"?`);
      }
      tieneHistorialGit = fs.existsSync(path.join(dir, ".git"));
    }

    const { motor } = await import("../src/motor/index.ts");
    const resultado = await motor.analizarDirectorio(
      dir,
      {
        scanId: `probar-repos:${caso.linea}:${Date.now()}`,
        tipo: "repo",
        objetivo: caso.objetivo,
        tieneHistorialGit,
        offline: true,
      },
      (evento: EventoMotor) => {
        if (evento.tipo === "etapa") {
          const { nombre, estado, duracionMs } = evento.etapa;
          const icono = estado === "lista" ? "✅" : estado === "error" ? "❌" : "🔄";
          const dur = duracionMs ? ` (${(duracionMs / 1000).toFixed(1)}s)` : "";
          console.log(`  ${icono} ${nombre}: ${estado}${dur}`);
        } else if (evento.tipo === "hallazgo") {
          const h = evento.hallazgo;
          const sev = SEV_ICONO[h.severidad] ?? "⚪";
          console.log(`    ${sev} [${h.modulo}] ${h.titulo} (${h.archivo}:${h.linea ?? "?"})`);
        }
      },
    );

    const modulosReales = new Set(resultado.hallazgos.map((h) => h.modulo));

    if (caso.modo === "verificacion") {
      const vEsp = caso.veredictoEsperado as Veredicto;
      faltantes = caso.modulosEsperados.filter((m) => !modulosReales.has(m));
      inesperados = resultado.hallazgos.filter((h) => !caso.modulosEsperados.includes(h.modulo));
      const veredictoOK = resultado.veredicto === vEsp;
      ok = veredictoOK && faltantes.length === 0;

      if (veredictoOK) {
        detalles.push(`✅ veredicto coincide (${vEsp})`);
      } else {
        detalles.push(`❌ veredicto esperado "${vEsp}", obtenido "${resultado.veredicto}"`);
      }
      if (faltantes.length > 0) {
        detalles.push(`❌ faltan hallazgos en: ${faltantes.join(", ")}`);
      }
      if (caso.modulosEsperados.length === 0 && resultado.hallazgos.length > 0) {
        detalles.push(`❌ se esperaban 0 hallazgos, se encontraron ${resultado.hallazgos.length}`);
      } else if (caso.modulosEsperados.length > 0 && inesperados.length > 0) {
        detalles.push(`ℹ️ hallazgos fuera de los módulos esperados: ${[...new Set(inesperados.map((h) => h.modulo))].join(", ")}`);
      }
    } else {
      ok = true;
      detalles.push(
        `ℹ️ descubrimiento: veredicto "${resultado.veredicto}", ${resultado.hallazgos.length} hallazgo(s) en módulos: ${[...modulosReales].join(",") || "ninguno"}`,
      );
    }

    veredictoObtenido = resultado.veredicto;
    hallazgos = resultado.hallazgos;
    ejecucionExitosa = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const esTimeout = (err as any)?.killed || /ETIMEDOUT|timed? ?out/i.test(msg);
    detalles.push(`❌ ${esTimeout ? `timeout de clonado (${Math.round(timeoutClon / 1000)}s)` : `error de ejecución: ${msg}`}`);
  } finally {
    if (dirCuarentena) purgar(dirCuarentena);
  }

  const result: ResultadoCaso = {
    caso,
    ok,
    ejecucionExitosa,
    veredictoObtenido,
    hallazgos,
    faltantes,
    inesperados,
    duracionMs: Date.now() - inicio,
    detalles,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result), "utf8");
  process.stdout.write("", () => process.exit(0));
}

// ─── Main (orquestador) ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (configInterno) {
    await ejecutarCasoInterno(configInterno);
    return;
  }

  console.log("═".repeat(70));
  console.log("🧪 MÓDULO DE PRUEBAS DE REPOSITORIOS — KPI verificables");
  console.log(`📄 Base de casos: ${archivoCasos}`);
  console.log(
    `🔄 Modo: ${modoMasivo ? "MASIVO (-r) — escanea todas las líneas, tolera URLs sueltas (descubrimiento)" : "estándar — formato estricto con 'idea'"}`,
  );
  console.log(`🎯 Umbral de aprobación: ${umbral}% (${modoMasivo ? "tasa de ejecución exitosa" : "completitud"})`);
  console.log(
    `⚙️  Bloques de ${bloque} · ${paralelo} proceso(s) simultáneo(s) · pausa ${Math.round(pausaMs / 1000)}s · timeout caso ${Math.round(timeoutCasoMs / 1000)}s · timeout clonado ${Math.round(timeoutClonMs / 1000)}s`,
  );
  console.log("═".repeat(70));

  const viejos = limpiarCuarentenasViejas(6);
  if (viejos > 0) console.log(`🧹 Limpiados ${viejos} directorio(s) temporal(es) de corridas anteriores.`);

  if (!fs.existsSync(archivoCasos)) {
    console.error(`❌ No existe el archivo de casos: ${archivoCasos}`);
    process.exit(2);
  }

  const casos = parsearCasos(fs.readFileSync(archivoCasos, "utf8"), archivoCasos);
  if (casos.length === 0) {
    console.error("❌ El archivo de casos no tiene casos. Agregá líneas o descomentá los ejemplos.");
    process.exit(2);
  }
  console.log(`✅ ${casos.length} caso(s) cargado(s).\n`);

  const { motor } = await import("../src/motor/index.ts");

  let estadoHerramienta: { gitleaks: boolean; ollama: { activo: boolean; modelo?: string } } | null = null;
  try {
    estadoHerramienta = await motor.estado();
  } catch {
    estadoHerramienta = null;
  }

  const archivoCasosAbs = path.resolve(archivoCasos);
  const huella = huellaCasos(casos);

  // ── Reanudación desde checkpoint ──────────────────────────────────────────
  const resultados: (ResultadoCaso | null)[] = new Array(casos.length).fill(null);
  let reanudados = 0;
  if (banderaReiniciar) {
    if (fs.existsSync(estadoPath)) {
      fs.rmSync(estadoPath, { force: true });
      console.log(`🔄 --reiniciar: descartado el estado previo (${path.basename(estadoPath)})\n`);
    }
  } else {
    const estado = leerEstado(estadoPath);
    if (estado && estado.archivoCasos === archivoCasosAbs && estado.huella === huella) {
      for (let i = 0; i < casos.length; i++) {
        const prev = estado.resultados[claveCaso(casos[i]!)];
        if (prev) {
          if (banderaReintentar && !prev.ejecucionExitosa) continue; // se reencola para reintento
          resultados[i] = prev;
          reanudados++;
        }
      }
      const pendientesTrasReanudar = casos.length - reanudados;
      if (reanudados > 0) {
        console.log(`♻️  Reanudando: ${reanudados}/${casos.length} caso(s) ya completados (${path.basename(estadoPath)})`);
      }
      if (banderaReintentar) {
        console.log(`🔁 --reintentar-fallidos: ${pendientesTrasReanudar} caso(s) pendientes se ejecutarán (incluye fallidos previos).`);
      }
      if (reanudados > 0 || banderaReintentar) console.log("");
    } else if (banderaContinuar) {
      console.log("⚠️  --continuar: no hay estado válido para este archivo de casos; arranco de cero.\n");
    }
  }

  const pendientes = casos.map((_, i) => i).filter((i) => !resultados[i]);

  const dirRun = fs.mkdtempSync(path.join(os.tmpdir(), "aduana-run-"));
  const activos = new Set<ChildProcess>();
  const cuarentenas = new Map<number, string>();

  const resultadosFinales = (): ResultadoCaso[] => resultados.filter((r): r is ResultadoCaso => r !== null);

  function construirReporte() {
    const rs = resultadosFinales();
    const k = calcularKpis(rs);
    return {
      fecha: new Date().toISOString(),
      modo: modoMasivo ? "masivo (-r)" : "estándar",
      archivoCasos,
      umbral,
      bloque,
      paralelo,
      pausaSeg: pausaMs / 1000,
      timeoutCasoMs: timeoutCasoMs / 1000,
      timeoutClonMs: timeoutClonMs / 1000,
      progreso: { completados: rs.length, total: casos.length },
      kpis: {
        tasaEjecucionExitosa: k.tasaEjecucionExitosa,
        exactitudVeredicto: k.exactitudVeredicto,
        coberturaModulos: k.coberturaModulos,
        completitud: k.completitud,
      },
      estadoHerramienta,
      casos: rs.map((r) => ({
        linea: r.caso.linea,
        objetivo: r.caso.objetivo,
        modo: r.caso.modo,
        esperado:
          r.caso.modo === "verificacion"
            ? { veredicto: r.caso.veredictoEsperado, modulos: r.caso.modulosEsperados }
            : null,
        obtenido: {
          veredicto: r.veredictoObtenido,
          modulos: [...new Set(r.hallazgos.map((h) => h.modulo))],
        },
        hallazgos: r.hallazgos.map((h) => ({
          modulo: h.modulo,
          regla: h.regla,
          severidad: h.severidad,
          archivo: `${h.archivo}${h.linea ? `:${h.linea}` : ""}`,
        })),
        faltantes: r.faltantes,
        ok: r.ok,
        ejecucionExitosa: r.ejecucionExitosa,
        duracionMs: r.duracionMs,
        detalles: r.detalles,
      })),
    };
  }

  function guardarProgreso(): void {
    fs.writeFileSync(REPORTE, JSON.stringify(construirReporte(), null, 2), "utf8");
    const mapa: Record<string, ResultadoCaso> = {};
    for (const r of resultadosFinales()) mapa[claveCaso(r.caso)] = r;
    const estado: Estado = {
      version: 1,
      archivoCasos: archivoCasosAbs,
      huella,
      actualizado: new Date().toISOString(),
      resultados: mapa,
    };
    fs.writeFileSync(estadoPath, JSON.stringify(estado, null, 2), "utf8");
  }

  process.on("SIGINT", () => {
    console.log("\n\n⚠️ Interrumpido por el usuario. Guardando progreso y matando procesos hijos...");
    for (const child of activos) {
      matarArbol(child.pid);
      try { child.kill("SIGKILL"); } catch { /* ya terminó */ }
    }
    for (const dir of cuarentenas.values()) purgar(dir, true);
    try { guardarProgreso(); } catch { /* best effort */ }
    fs.rmSync(dirRun, { recursive: true, force: true });
    console.log(`💾 Progreso guardado. Reanudá con: npm run probar-repos -- ... --continuar`);
    process.exit(130);
  });

  async function ejecutarCasoEnHijo(i: number): Promise<ResultadoCaso> {
    const caso = casos[i]!;
    const dirCuarentena = esRemoto(caso.objetivo)
      ? path.join(os.tmpdir(), `aduana-prueba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      : null;
    const cfgPath = path.join(dirRun, `cfg-${i}.json`);
    const resPath = path.join(dirRun, `res-${i}.json`);
    const cfg: ConfigCaso = { caso, dirCuarentena, resultPath: resPath, timeoutClonMs };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));

    console.log(`\n── Caso ${i + 1}/${casos.length} (línea ${caso.linea}) ──`);
    console.log(`  🎯 Objetivo: ${caso.objetivo}`);
    console.log(
      caso.modo === "verificacion"
        ? `  🧿 Idea esperada: ${caso.veredictoEsperado}` +
            (caso.modulosEsperados.length ? ` · módulos: ${caso.modulosEsperados.join(", ")}` : " · 0 hallazgos")
        : "  🧿 Modo descubrimiento: se escanea y se registra el resultado (sin expectativa)",
    );

    const prefijo = casos.length > 1 ? `  [${i + 1}] ` : "  ";
    const inicio = Date.now();

    const child = spawn(process.execPath, ["--import", "tsx", SCRIPT, "--interno", cfgPath], {
      cwd: RAIZ,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    activos.add(child);
    if (dirCuarentena) cuarentenas.set(i, dirCuarentena);

    const emitir = (buf: Buffer, esErr: boolean): void => {
      for (const linea of buf.toString("utf8").split(/\r?\n/)) {
        if (linea.length === 0) continue;
        (esErr ? process.stderr : process.stdout).write(prefijo + linea + "\n");
      }
    };
    child.stdout!.on("data", (b: Buffer) => emitir(b, false));
    child.stderr!.on("data", (b: Buffer) => emitir(b, true));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      matarArbol(child.pid);
      try { child.kill("SIGKILL"); } catch { /* ya terminó */ }
    }, timeoutCasoMs);

    const code = await new Promise<number | null>((resolve) => child.on("close", (c) => resolve(c)));
    clearTimeout(timer);
    activos.delete(child);
    cuarentenas.delete(i);

    const duracionMs = Date.now() - inicio;
    let result: ResultadoCaso | null = null;
    if (fs.existsSync(resPath)) {
      try { result = JSON.parse(fs.readFileSync(resPath, "utf8")) as ResultadoCaso; } catch { result = null; }
    }

    if (!result) {
      // El hijo fue matado por timeout o murió antes de escribir el resultado.
      if (dirCuarentena) purgar(dirCuarentena, true);
      result = {
        caso,
        ok: false,
        ejecucionExitosa: false,
        veredictoObtenido: null,
        hallazgos: [],
        faltantes: caso.modulosEsperados,
        inesperados: [],
        duracionMs,
        detalles: [
          timedOut
            ? `⏱️ timeout: el caso superó ${Math.round(timeoutCasoMs / 1000)}s (proceso terminado)`
            : `❌ el proceso del caso murió sin resultado (código ${code ?? "?"})`,
        ],
      };
    }

    console.log(`  ──`);
    console.log(
      `  ${result.ok ? "✅ CASO OK" : "❌ CASO FALLÓ"} ${(result.duracionMs / 1000).toFixed(1)}s   ${result.detalles.join("  ")}`,
    );
    return result;
  }

  async function correrBloque(indices: number[]): Promise<void> {
    let cursor = 0;
    async function trabajador(): Promise<void> {
      while (true) {
        const j = cursor++;
        if (j >= indices.length) return;
        const idx = indices[j]!;
        resultados[idx] = await ejecutarCasoEnHijo(idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(paralelo, indices.length) }, () => trabajador()));
  }

  // ── Bloques ───────────────────────────────────────────────────────────────
  const totalBloques = Math.ceil(pendientes.length / bloque);
  let completados = reanudados;

  if (pendientes.length === 0) {
    console.log("🎉 Todos los casos ya estaban completados según el checkpoint.\n");
  }

  for (let b = 0; b < totalBloques; b++) {
    const indices = pendientes.slice(b * bloque, b * bloque + bloque);
    const lineaIni = casos[indices[0]!]!.linea;
    const lineaFin = casos[indices[indices.length - 1]!]!.linea;

    console.log(`\n${"━".repeat(70)}`);
    console.log(`🧱 Bloque ${b + 1}/${totalBloques} — ${indices.length} caso(s) (líneas ${lineaIni}–${lineaFin})`);
    console.log(`${"━".repeat(70)}`);

    const inicioBloque = Date.now();
    await correrBloque(indices);
    const durBloque = Date.now() - inicioBloque;

    const resBloque = indices.map((i) => resultados[i]!).filter(Boolean);
    const okBloque = resBloque.filter((r) => r.ejecucionExitosa).length;
    completados += indices.length;

    console.log(`\n  📦 Bloque ${b + 1}/${totalBloques} listo: ${okBloque}/${indices.length} con ejecución exitosa · ${(durBloque / 1000).toFixed(1)}s`);
    console.log(`  📊 Progreso: ${completados}/${casos.length} caso(s) procesado(s)`);
    guardarProgreso();
    console.log(`  💾 Checkpoint guardado: ${path.basename(REPORTE)} + ${path.basename(estadoPath)}`);

    if (b < totalBloques - 1 && pausaMs > 0) {
      console.log(`  🧊 Enfriando ${Math.round(pausaMs / 1000)}s antes del próximo bloque...`);
      await new Promise((r) => setTimeout(r, pausaMs));
    }
  }

  fs.rmSync(dirRun, { recursive: true, force: true });

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const rs = resultadosFinales();
  const k = calcularKpis(rs);

  console.log(`\n${"═".repeat(70)}`);
  console.log("📈 KPI VERIFICABLES");
  console.log(`  ${k.total} casos (${k.veriTotal} verificables + ${k.total - k.veriTotal} descubrimiento)`);
  console.log(`  ${"─".repeat(60)}`);
  console.log(`  Tasa de ejecución exitosa : ${k.tasaEjecucionExitosa.toFixed(1)}%  (${k.ejecutadosBien}/${k.total})`);
  if (k.veriTotal > 0) {
    console.log(`  ${"─".repeat(60)}`);
    console.log(`  [solo verificables] Exactitud de veredicto : ${k.exactitudVeredicto!.toFixed(1)}%  (${k.aciertosVeredicto}/${k.veriTotal})`);
    console.log(`  [solo verificables] Cobertura de módulos   : ${k.coberturaModulos!.toFixed(1)}%  (${k.modulosDetectados}/${k.modulosEsperadosTotal})`);
    console.log(`  [solo verificables] Completitud (perfecto) : ${k.completitud!.toFixed(1)}%  (${k.perfectos}/${k.veriTotal})`);
  }
  console.log(`  ${"─".repeat(60)}`);
  console.log(
    `  Herramienta: gitleaks=${estadoHerramienta?.gitleaks ? "✅ disponible" : "❌ ausente (secretos degradado)"} · ` +
      `ollama=${estadoHerramienta?.ollama.activo ? "activa" : "no (modo offline)"}`,
  );

  console.log(`\n📄 Reporte verificable: ${REPORTE}`);
  if (conJson) console.log(JSON.stringify(construirReporte()));

  const verificablesFallados = rs.filter((r) => r.caso.modo === "verificacion" && !r.ok).length;
  const exitCode = k.tasaEjecucionExitosa >= umbral && verificablesFallados === 0 ? 0 : 1;
  console.log(
    `\n🏁 exitCode=${exitCode} (tasa de ejecución ${k.tasaEjecucionExitosa.toFixed(1)}% >= ${umbral}%` +
      (verificablesFallados > 0 ? ` · ❌ ${verificablesFallados} verificable(s) fallado(s))` : " · ✅ 0 verificables fallados)"),
  );
  process.exit(exitCode);
}

main();
