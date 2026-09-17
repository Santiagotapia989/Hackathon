import { describe, it, expect } from "vitest";
import { Canal, obtenerOCrearCanalScan } from "../../src/plataforma/bus.js";

describe("Canal de eventos y Buffer", () => {
  it("almacena eventos emitidos en su buffer para clientes tardíos", () => {
    const canal = new Canal();
    canal.emitir("etapa", { nombre: "ingesta", estado: "en_curso" });
    canal.emitir("etapa", { nombre: "ingesta", estado: "lista" });

    expect(canal.buffer).toHaveLength(2);
    expect(canal.buffer[0]).toEqual({
      evento: "etapa",
      data: { nombre: "ingesta", estado: "en_curso" },
    });
  });

  it("notifica a los suscriptores activos en tiempo real", () => {
    const canal = obtenerOCrearCanalScan("test-scan-1");
    const recibidos: unknown[] = [];

    const listener = (item: unknown) => recibidos.push(item);
    canal.emisor.on("evento", listener);

    canal.emitir("hallazgo", { id: "h1", regla: "test-rule" });

    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toEqual({
      evento: "hallazgo",
      data: { id: "h1", regla: "test-rule" },
    });

    canal.emisor.off("evento", listener);
  });
});
