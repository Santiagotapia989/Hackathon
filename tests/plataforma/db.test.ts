import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../../src/plataforma/db.js";
import type { Finding } from "../../src/shared/contrato.js";

describe("Base de datos SQLite", () => {
  beforeEach(() => {
    db.db.exec("DELETE FROM hallazgos; DELETE FROM scans; DELETE FROM eventos_agente;");
  });

  it("crea un scan y lo recupera por id", () => {
    const id = "test-scan-db-1";
    db.crearScan(id, "repo", "https://github.com/owner/repo");

    const scan = db.obtenerScan(id);
    expect(scan).toBeDefined();
    expect(scan?.id).toBe(id);
    expect(scan?.tipo).toBe("repo");
    expect(scan?.estado).toBe("en_curso");
    expect(scan?.etapas).toEqual([]);
    expect(scan?.hallazgos).toEqual([]);
  });

  it("actualiza hallazgos y soporta upsert sin duplicados", () => {
    const id = "test-scan-db-2";
    db.crearScan(id, "paquete", "npm:left-pad");

    const hallazgo: Finding = {
      id: "h1",
      modulo: "unicode",
      regla: "unicode-tags-oculto",
      titulo: "Tag invisible",
      severidad: "alta",
      determinista: true,
      archivo: "index.js",
      evidencia: "abc",
    };

    db.upsertHallazgo(id, hallazgo);
    expect(db.obtenerHallazgos(id)).toHaveLength(1);

    // Upsert con modificación
    const modificado: Finding = { ...hallazgo, severidad: "critica" };
    db.upsertHallazgo(id, modificado);

    const hallazgosFinales = db.obtenerHallazgos(id);
    expect(hallazgosFinales).toHaveLength(1);
    expect(hallazgosFinales[0].severidad).toBe("critica");
  });

  it("marca scans en curso como interrumpidos por reinicio", () => {
    const id = "test-scan-db-3";
    db.crearScan(id, "repo", "https://github.com/owner/repo2");

    db.marcarInterrumpidosPorReinicio();

    const scan = db.obtenerScan(id);
    expect(scan?.estado).toBe("error");
    expect(scan?.error).toBe("Interrumpido por reinicio");
  });
});
