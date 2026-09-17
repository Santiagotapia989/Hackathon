// src/motor/analizadores/sast.ts
// Analizador estático de código multilenguaje (C/C++, Java, Python, TypeScript).
// Busca patrones de funciones inseguras en código fuente sin ejecutar nada.

import type { Finding } from "../../shared/contrato.js";
import type { ArchivoLeido } from "../archivos.js";
import reglasSAST from "../reglas/patrones-sast.json" with { type: "json" };
import { prepararEvidencia } from "../evidencia.js";

type ReglaSAST = {
  id: string;
  lenguaje: string;
  patron: string;
  titulo: string;
  severidad: "critica" | "alta" | "media" | "baja";
  explicacion: string;
  remediacion: string[];
};

export function analizarSAST(archivos: ArchivoLeido[]): Finding[] {
  const hallazgos: Finding[] = [];
  const reglas = reglasSAST as ReglaSAST[];

  // Compilar expresiones regulares con límite
  const compiled = reglas.map((r) => ({
    regla: r,
    regex: new RegExp(r.patron, "i"),
  }));

  for (const archivo of archivos) {
    // Filtrar por extensiones relevantes (.c, .cpp, .h, .java, .py, .ts, .js)
    const ext = archivo.ruta.substring(archivo.ruta.lastIndexOf(".")).toLowerCase();
    if (![".c", ".cpp", ".cc", ".h", ".java", ".py", ".ts", ".js"].includes(ext)) {
      continue;
    }

    const mapaExt: Record<string, string[]> = {
      c: [".c", ".cpp", ".cc", ".h"],
      java: [".java"],
      python: [".py"],
      typescript: [".ts", ".js"],
    };

    const lineas = archivo.contenido.split(/\r?\n/);
    for (let numLinea = 0; numLinea < lineas.length; numLinea++) {
      const lineaTexto = lineas[numLinea]!;

      // Evitar escanear líneas extremadamente largas (protección ReDoS)
      if (lineaTexto.length > 2000) continue;

      for (const { regla, regex } of compiled) {
        const extsValidas = mapaExt[regla.lenguaje] ?? [];
        if (!extsValidas.includes(ext)) continue;

        if (regex.test(lineaTexto)) {
          const evidenciaLimpia = prepararEvidencia(lineaTexto, 200);
          hallazgos.push({
            id: `${regla.id}:${archivo.ruta}:${numLinea + 1}`,
            modulo: "instrucciones",
            regla: regla.id,
            titulo: regla.titulo,
            archivo: archivo.ruta,
            linea: numLinea + 1,
            severidad: regla.severidad,
            determinista: true,
            evidencia: evidenciaLimpia,
            explicacion: `${regla.explicacion} Coincidencia en línea ${numLinea + 1}: "${evidenciaLimpia}".`,
            remediacion: regla.remediacion,
          });
        }
      }
    }
  }

  return hallazgos;
}
