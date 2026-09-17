import { describe, it, expect } from "vitest";
import { parsearObjetivo, ObjetivoInvalidoError } from "../../src/plataforma/ingesta/objetivo.js";

describe("parsearObjetivo", () => {
  it("acepta paquetes npm válidos", () => {
    expect(parsearObjetivo("npm:express")).toEqual({
      tipo: "paquete",
      ecosistema: "npm",
      nombre: "express",
    });
    expect(parsearObjetivo("npm:@types/node")).toEqual({
      tipo: "paquete",
      ecosistema: "npm",
      nombre: "@types/node",
    });
  });

  it("rechaza nombres npm inválidos o con path traversal", () => {
    expect(() => parsearObjetivo("npm:../../evil")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("npm:INVALID_UPPERCASE")).toThrow(ObjetivoInvalidoError);
  });

  it("acepta paquetes PyPI válidos", () => {
    expect(parsearObjetivo("pypi:requests")).toEqual({
      tipo: "paquete",
      ecosistema: "pypi",
      nombre: "requests",
    });
  });

  it("rechaza nombres PyPI inválidos", () => {
    expect(() => parsearObjetivo("pypi:req/uests")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("pypi:../../malicious")).toThrow(ObjetivoInvalidoError);
  });

  it("acepta URLs de GitHub y GitLab https", () => {
    expect(parsearObjetivo("https://github.com/owner/repo")).toEqual({
      tipo: "repo",
      url: "https://github.com/owner/repo",
    });
    expect(parsearObjetivo("https://github.com/owner/repo.git")).toEqual({
      tipo: "repo",
      url: "https://github.com/owner/repo",
    });
    expect(parsearObjetivo("https://gitlab.com/owner/subrepo")).toEqual({
      tipo: "repo",
      url: "https://gitlab.com/owner/subrepo",
    });
  });

  it("rechaza protocolos no https o hosts no permitidos", () => {
    expect(() => parsearObjetivo("http://github.com/owner/repo")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("file:///etc/passwd")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("https://evil.com/owner/repo")).toThrow(ObjetivoInvalidoError);
  });

  it("rechaza URLs con credenciales o query/hash", () => {
    expect(() => parsearObjetivo("https://user:pass@github.com/owner/repo")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("https://github.com/owner/repo?branch=main")).toThrow(ObjetivoInvalidoError);
    expect(() => parsearObjetivo("https://github.com/owner/repo#readme")).toThrow(ObjetivoInvalidoError);
  });
});
