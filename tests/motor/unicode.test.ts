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

  it("detecta runs de 2+ selectores de variación consecutivos", () => {
    const a = archivo("src/foo.ts", "let codigo = 1\uFE0F\uFE0F;");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeDefined();
    expect(h?.determinista).toBe(true);
  });

  it("detecta un selector FE00–FE0D aislado si no sigue a un ideograma CJK", () => {
    const a = archivo("src/foo.ts", "let codigo = a\uFE05;");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeDefined();
  });

  it("un selector FE00–FE0D tras ideograma CJK es legítimo y no se reporta", () => {
    const a = archivo("locales/zh.yml", "texto: 葛\uFE05 normal");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeUndefined();
  });

  it("un selector FE0E/FE0F aislado es de presentación y no se reporta", () => {
    const a = archivo("src/foo.ts", "let codigo = a\uFE0F;");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeUndefined();
  });

  it("una secuencia keycap (dígito + FE0F + U+20E3) no se reporta", () => {
    const a = archivo("README.md", "Presioná 1\uFE0F\u20E3 para continuar.");
    const hallazgos = analizarArchivoUnicode(a);
    const h = hallazgos.find((h) => h.regla === "unicode-selector-variacion");
    expect(h).toBeUndefined();
  });

  it("bidi en texto (no-código) da severidad media, no alta", () => {
    const a = archivo("README.md", "Estado del proyecto: ‮atpecxe‬ bien encaminado.");
    const hallazgos = analizarArchivoUnicode(a);
    const bidi = hallazgos.find((h) => h.regla === "unicode-bidi");
    expect(bidi).toBeDefined();
    expect(bidi?.severidad).toBe("media");
  });

  // Ex-it.fails (B4 en PRUEBAS_RESULTADO.md): un selector de variación
  // DENTRO de un emoji real (corazón + VS16) ya no se reporta — FE0F aislado
  // es un selector de presentación legítimo.
  it("selector de variación dentro de un emoji real no se reporta", () => {
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