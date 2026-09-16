import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const EXTENSIONES = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PATRONES_PELIGROSOS = [
  { patron: /dangerouslySetInnerHTML/, motivo: "injección de HTML desde hallazgos hostiles" },
  { patron: /\.innerHTML\s*=/, motivo: "asignación de HTML generado" },
  { patron: /document\.write\(/, motivo: "escritura directa de HTML" },
];

function archivosDe(dir) {
  const resultado = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      resultado.push(...archivosDe(ruta));
    } else if (EXTENSIONES.has(extname(ruta))) {
      resultado.push(ruta);
    }
  }
  return resultado;
}

const raiz = join(import.meta.dirname, "..", "src");
let fallos = 0;

for (const archivo of archivosDe(raiz)) {
  const contenido = readFileSync(archivo, "utf8");
  for (const { patron, motivo } of PATRONES_PELIGROSOS) {
    const coincidencia = contenido.match(patron);
    if (coincidencia) {
      fallos += 1;
      console.error(
        `[SEGURIDAD] ${archivo}: se encontró "${coincidencia[0]}" (${motivo}).`
      );
    }
  }
}

if (fallos > 0) {
  console.error(
    `\nFALLÓ: la evidencia de Aduana proviene de repos hostiles y debe renderizarse SIEMPRE como texto plano.`
  );
  process.exit(1);
}

console.log("SEGURIDAD OK: ninguna evidencia se renderiza como HTML.");