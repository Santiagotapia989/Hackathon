// tests/motor/verificar-paquete.test.ts
// Matriz de motor.verificarPaquete() — usado por check_package del MCP.
// El agente de IA confía en este resultado ANTES de instalar: es el punto
// de mayor impacto de seguridad de todo el motor.
import { describe, it, expect, vi, afterEach } from "vitest";
import { motor } from "../../src/motor/index.js";
import * as cliente from "../../src/motor/registro/cliente.js";

afterEach(() => vi.restoreAllMocks());

describe("motor.verificarPaquete — matriz", () => {
  it("no existe → bloqueado", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({ nombre: "no-existe-xyz", existe: false });
    const r = await motor.verificarPaquete("npm", "no-existe-xyz", { offline: false });
    expect(r.resultado).toBe("bloqueado");
    expect(r.existe).toBe(false);
  });

  it("offline → requiere_confirmacion, existe: null", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({ nombre: "cualquiera", existe: null });
    const r = await motor.verificarPaquete("npm", "cualquiera", { offline: true });
    expect(r.resultado).toBe("requiere_confirmacion");
    expect(r.existe).toBeNull();
  });

  it("popular y sano → permitido", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "express", existe: true, diasCreacion: 4000, descargasSemanales: 20_000_000,
    });
    const r = await motor.verificarPaquete("npm", "express", { offline: false });
    expect(r.resultado).toBe("permitido");
  });

  it("confundible conocido y existente → requiere_confirmacion con sugerencia", async () => {
    // "unused-imports" es confundible conocido (ver datos/confundibles.json).
    // Simulamos que SÍ existe publicado en el registro (peor caso: alguien
    // registró el nombre trampa de verdad).
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "unused-imports", existe: true, diasCreacion: 4000, descargasSemanales: 5000,
    });
    const r = await motor.verificarPaquete("npm", "unused-imports", { offline: false });
    expect(r.resultado).toBe("requiere_confirmacion");
    expect(r.sugerencia).toBe("eslint-plugin-unused-imports");
  });

  it("typosquatting de un paquete popular y existente → requiere_confirmacion con sugerencia", async () => {
    // "expres" (typo de "express") publicado de verdad por un atacante.
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "expres", existe: true, diasCreacion: 10, descargasSemanales: 3,
    });
    const r = await motor.verificarPaquete("npm", "expres", { offline: false });
    expect(r.resultado).toBe("requiere_confirmacion");
    expect(r.sugerencia).toBe("express");
  });

  it("paquete recién publicado (10 días, 3 descargas/semana) → requiere_confirmacion", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({
      nombre: "paquete-nuevo-random", existe: true, diasCreacion: 10, descargasSemanales: 3,
    });
    const r = await motor.verificarPaquete("npm", "paquete-nuevo-random", { offline: false });
    expect(r.resultado).toBe("requiere_confirmacion");
  });

  it("motivos nunca contienen texto que vendría del paquete (descripción/README)", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({ nombre: "x", existe: false });
    const r = await motor.verificarPaquete("npm", "x", { offline: false });
    for (const m of r.motivos) {
      expect(m).not.toMatch(/<script|README|malicious payload/i);
    }
  });

  it("no llama a Ollama (verificarPaquete es sin IA)", async () => {
    vi.spyOn(cliente, "verificarNombre").mockResolvedValue({ nombre: "x", existe: true, diasCreacion: 4000, descargasSemanales: 999999 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await motor.verificarPaquete("npm", "x", { offline: false });
    const llamoOllama = fetchSpy.mock.calls.some((c) => String(c[0]).includes("11434"));
    expect(llamoOllama).toBe(false);
  });
});
