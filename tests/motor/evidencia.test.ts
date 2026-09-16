// tests/motor/evidencia.test.ts
import { describe, it, expect } from "vitest";
import {
  marcarInvisibles,
  desinfectarTexto,
  truncar,
  enmascarar,
  prepararEvidencia,
} from "../../src/motor/evidencia.js";

describe("marcarInvisibles", () => {
  it("marca caracteres invisibles", () => {
    const texto = "hola\u200Bmundo"; // ZWSP
    expect(marcarInvisibles(texto)).toBe("hola⟦U+200B⟧mundo");
  });

  it("marca Unicode Tags", () => {
    const tag = String.fromCodePoint(0xe0049); // 'I'
    expect(marcarInvisibles(`x${tag}y`)).toBe("x⟦U+E0049⟧y");
  });

  it("marca controles bidireccionales", () => {
    expect(marcarInvisibles("a\u202Eb")).toBe("a⟦U+202E⟧b");
  });

  it("no altera texto normal", () => {
    const texto = "Hola, normal.";
    expect(marcarInvisibles(texto)).toBe(texto);
  });
});

describe("desinfectarTexto", () => {
  it("elimina secuencias CSI", () => {
    const texto = "normal\x1b[31mrojo";
    expect(desinfectarTexto(texto)).toBe("normalrojo");
  });

  it("marca otros controles C0", () => {
    const texto = "a\x00b\x07";
    expect(desinfectarTexto(texto)).toContain("⟦U+0000⟧");
    expect(desinfectarTexto(texto)).toContain("⟦U+0007⟧");
  });

  it("preserva saltos de línea y tabs", () => {
    const texto = "a\nb\tc";
    expect(desinfectarTexto(texto)).toBe(texto);
  });
});

describe("truncar", () => {
  it("no trunca texto corto", () => {
    expect(truncar("abc", 10)).toBe("abc");
  });

  it("trunca y agrega …(+N) sin pasarse del máximo", () => {
    const t = truncar("a".repeat(600), 500);
    expect(t.length).toBeLessThanOrEqual(500);
    expect(t).toMatch(/…\(\+\d+\)$/);
  });
});

describe("enmascarar", () => {
  it("deja los primeros 4 caracteres y enmascara el resto", () => {
    expect(enmascarar("ghp_abcdefgh1234567890")).toBe("ghp_******************");
  });

  it("enmascara secretos muy cortos por completo", () => {
    expect(enmascarar("abc")).toBe("***");
  });
});

describe("prepararEvidencia", () => {
  it("desinfecta y marca invisibles sin borrar el contexto visible", () => {
    const texto = `GITHUB_TOKEN=ghp_abcdefgh1234567890\x1b[0m\u200B`;
    const evidencia = prepararEvidencia(texto, 500);
    expect(evidencia).toContain("GITHUB_TOKEN");
    expect(evidencia).not.toContain("\u200B");
    expect(evidencia).not.toContain("\x1b");
    expect(evidencia).toContain("⟦U+200B⟧");
  });

  it("el enmascarado de secretos es responsabilidad de cada analizador", () => {
    const secretEnmascarado = enmascarar("ghp_abcdefgh1234567890");
    const texto = `GITHUB_TOKEN=${secretEnmascarado}`;
    const evidencia = prepararEvidencia(texto, 500);
    expect(evidencia).toContain("ghp_****");
    expect(evidencia).not.toContain("ghp_abcdefgh1234567890");
  });
});