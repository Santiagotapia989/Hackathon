// tests/motor/unicode.test.ts
import { describe, it, expect } from "vitest";
import { analizarArchivoUnicode } from "../../src/motor/analizadores/unicode.js";
import type { ArchivoLeido } from "../../src/motor/archivos.js";

function archivo(ruta: string, contenido: string): ArchivoLeido {
  return { ruta, contenido };
}

describe("analizador unicode", () => {
  it("detecta Unicode Tags y los decodifica", () => {
    const oculto = "Ignora esto";
    const tags = [...oculto].map((ch) => String.fromCodePoint(ch.codePointAt(0)! + 0xe0000)).join("");
    const a = archivo(".cursorrules", `Usa TypeScript estricto.${tags}`);
    const hallazgos = analizarArchivoUnicode(a);

    expect(hallazgos).toHaveLength(1);
    const h = hallazgos[0]!;
    expect(h.regla).toBe("unicode-tags-oculto");
    expect(h.severidad).toBe("critica");
    expect(h.determinista).toBe(true);
    expect(h.evidenciaDecodificada).toBe(oculto);
    expect(h.evidencia).toContain("⟦U+E00");
  });

  it("detecta controles bidireccionales como alta en código", () => {
    const a = archivo("src/x.ts", "const a = \u202E(nombre);");
    const hallazgos = analizarArchivoUnicode(a);
    const bidi = hallazgos.find((h) => h.regla === "unicode-bidi");
    expect(bidi).toBeDefined();
    expect(bidi?.severidad).toBe("alta");
    expect(bidi?.determinista).toBe(true);
  });

  it("marca ancho cero como baja en archivos no sensibles", () => {
    const a = archivo("src/foo.ts", "const x = a\u200Bb;");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-ancho-cero");
    expect(h?.severidad).toBe("baja");
  });

  it("sube a media con 3+ ancho cero en archivo sensible", () => {
    const a = archivo("README.md", "a\u200Bb c\u200Bd e\u200Bf");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-ancho-cero");
    expect(h?.severidad).toBe("media");
  });

  it("detecta selectores de variación", () => {
    const a = archivo("src/foo.ts", "let codigo = 1\uFE0F;");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeDefined();
    expect(h?.determinista).toBe(true);
  });

  it("bidi en texto (no-código) da severidad media, no alta", () => {
    const a = archivo("README.md", "Estado del proyecto: ‮atpecxe‬ bien encaminado.");
    const hallazgos = analizarArchivoUnicode(a);
    const bidi = hallazgos.find((h) => h.regla === "unicode-bidi");
    expect(bidi).toBeDefined();
    expect(bidi?.severidad).toBe("media");
  });

  // BUG: un selector de variación DENTRO de un emoji real (ej. corazón + VS16,
  // uso normalísimo en cualquier README) se reporta igual que uno fuera de
  // contexto. La especificación pide explícitamente que el que está dentro
  // de un emoji NO se reporte; el código no distingue los dos casos, siempre
  // reporta. Este test documenta el comportamiento CORRECTO esperado con
  // it.fails: hoy falla porque el emoji genera un hallazgo "media" (falso
  // positivo). Ver PRUEBAS_RESULTADO.md.
  it.fails("selector de variación dentro de un emoji real no debería reportarse", () => {
    const corazonConVS16 = "❤️"; // ❤️
    const a = archivo("README.md", `Estado: liberado. Hecho con ${corazonConVS16} para el hackathon.`);
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeUndefined();
  });

  it("ignora BOM al inicio", () => {
    const a = archivo("src/foo.ts", "\uFEFFconst x = 1;");
    const hallazgos = analizarArchivoUnicode(a);
    expect(hallazgos).toHaveLength(0);
  });

  it("no emite nada en texto normal", () => {
    const a = archivo("README.md", "Const x = 1;\nHola mundo");
    const hallazgos = analizarArchivoUnicode(a);
    expect(hallazgos).toHaveLength(0);
  });
});