// tests/motor/scoring.test.ts
import { describe, it, expect } from "vitest";
import { calcularVeredicto } from "../../src/motor/scoring.js";
import type { Finding, Etapa } from "../../src/shared/contrato.js";

function hallazgo(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "h1",
    modulo: "instrucciones",
    regla: "test",
    titulo: "test",
    severidad: "baja",
    determinista: true,
    archivo: "README.md",
    evidencia: "evidencia",
    ...overrides,
  };
}

describe("calcularVeredicto", () => {
  it("liberado sin hallazgos ni errores", () => {
    const r = calcularVeredicto([], []);
    expect(r.veredicto).toBe("liberado");
  });

  it("regla 1: crítico determinista → retenido aunque el LLM diga benigno", () => {
    const conCritico = hallazgo({
      severidad: "critica",
      determinista: true,
      analisisIA: { clasificacion: "benigno", confianza: 0.99, intentoManipulacion: false },
    });
    const r = calcularVeredicto([conCritico], []);
    expect(r.veredicto).toBe("retenido");
  });

  it("regla 2: IA malicioso con confianza alta, solo → revisar (la IA sola nunca retiene)", () => {
    const conIA = hallazgo({
      determinista: false,
      analisisIA: { clasificacion: "malicioso", confianza: 0.9, intentoManipulacion: false },
    });
    const r = calcularVeredicto([conIA], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("regla 2: IA malicioso + hallazgo determinista alta en el mismo archivo → retenido", () => {
    const conIA = hallazgo({
      id: "ia",
      determinista: false,
      archivo: "README.md",
      analisisIA: { clasificacion: "malicioso", confianza: 0.9, intentoManipulacion: false },
    });
    const respaldo = hallazgo({ id: "det", severidad: "alta", determinista: true, archivo: "README.md" });
    const r = calcularVeredicto([conIA, respaldo], []);
    expect(r.veredicto).toBe("retenido");
  });

  it("regla 2: IA malicioso + determinista alta en OTRO archivo → revisar", () => {
    const conIA = hallazgo({
      id: "ia",
      determinista: false,
      archivo: "README.md",
      analisisIA: { clasificacion: "malicioso", confianza: 0.9, intentoManipulacion: false },
    });
    const respaldo = hallazgo({ id: "det", severidad: "alta", determinista: true, archivo: "src/x.ts" });
    const r = calcularVeredicto([conIA, respaldo], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("regla 3: intento de manipulación sin respaldo → revisar, no retenido", () => {
    const conManip = hallazgo({
      determinista: false,
      analisisIA: { clasificacion: "benigno", confianza: 0.95, intentoManipulacion: true },
    });
    const r = calcularVeredicto([conManip], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("regla 3: intento de manipulación + determinista alta en el mismo archivo → retenido", () => {
    const conManip = hallazgo({
      id: "ia",
      determinista: false,
      archivo: "CLAUDE.md",
      analisisIA: { clasificacion: "benigno", confianza: 0.95, intentoManipulacion: true },
    });
    const respaldo = hallazgo({ id: "det", severidad: "critica", determinista: true, archivo: "CLAUDE.md" });
    const r = calcularVeredicto([conManip, respaldo], []);
    expect(r.veredicto).toBe("retenido");
  });

  it("regla 4a: algún alto → revisar", () => {
    const conAlta = hallazgo({ severidad: "alta", determinista: true });
    const r = calcularVeredicto([conAlta], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("regla 4b: algún sinEvaluar → revisar", () => {
    const conSinEval = hallazgo({ determinista: false, sinEvaluar: true });
    const r = calcularVeredicto([conSinEval], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("regla 4c: alguna etapa en error → revisar", () => {
    const etapaError: Etapa = { nombre: "triage_ia", estado: "error", error: "ollama caído" };
    const r = calcularVeredicto([], [etapaError]);
    expect(r.veredicto).toBe("revisar");
  });

  it("IA dice malicioso con confianza baja → no retenido, cae a revisar", () => {
    const bajaConf = hallazgo({
      determinista: false,
      analisisIA: { clasificacion: "malicioso", confianza: 0.5, intentoManipulacion: false },
    });
    const r = calcularVeredicto([bajaConf], []);
    expect(r.veredicto).toBe("revisar");
  });

  it("resumen cuenta por severidad y por módulo", () => {
    const hallazgos = [
      hallazgo({ id: "a", severidad: "critica", modulo: "unicode", determinista: true }),
      hallazgo({ id: "b", severidad: "alta", modulo: "dependencias", determinista: true }),
      hallazgo({ id: "c", severidad: "media", modulo: "instrucciones", determinista: false }),
      hallazgo({ id: "d", severidad: "media", modulo: "instrucciones", determinista: true }),
    ];
    const r = calcularVeredicto(hallazgos, []);
    expect(r.resumen.porSeveridad).toEqual({ critica: 1, alta: 1, media: 2, baja: 0 });
    expect(r.resumen.porModulo).toEqual({
      instrucciones: 2, unicode: 1, dependencias: 1, secretos: 0,
    });
  });
});