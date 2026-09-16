// tests/plataforma/db-corrupta.test.ts
// Un registro corrupto en la DB no debe tirar el servidor completo: el
// endpoint que lo toca debe fallar con un error HTTP controlado, y el
// servidor debe seguir respondiendo a otros pedidos después.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import * as path from "node:path";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

let servidor: ServidorTest;
const PUERTO = 39006;
const RUTA_DB = path.resolve(import.meta.dirname!, "..", "..", "data", "aduana.db");

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

describe("Registro corrupto en la DB", () => {
  it("un hallazgo con JSON corrupto no tira el servidor (falla controlado, el server sigue vivo)", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "npm:picocolors" }),
    });
    const { id } = await resp.json();
    await new Promise((r) => setTimeout(r, 5000)); // esperamos a que termine (motor stub)

    // Insertamos un hallazgo con JSON inválido directo en la DB, bypaseando upsertHallazgo.
    const dbDirecta = new Database(RUTA_DB);
    dbDirecta.prepare(`INSERT INTO hallazgos (id, scan_id, json) VALUES (?, ?, ?)`).run(
      "corrupto-1",
      id,
      "{ esto no es json válido ",
    );
    dbDirecta.close();

    const respScanCorrupto = await fetch(`${servidor.baseUrl}/api/scans/${id}`);
    // No debe devolver 200 con datos corruptos silenciados: esperamos un
    // error HTTP controlado (no un crash del proceso).
    expect(respScanCorrupto.status).toBeGreaterThanOrEqual(400);

    // El servidor debe seguir vivo y respondiendo normalmente después.
    const respSalud = await fetch(`${servidor.baseUrl}/api/health`);
    expect(respSalud.status).toBe(200);
  }, 15_000);
});
