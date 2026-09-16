// Elige el motor real (parte A, src/motor/index.ts) o el stub.
// Mientras la parte A no exista, correr con ADUANA_MOTOR=stub.

import type { Motor } from "../shared/contrato.js";
import { motorStub } from "./motor-stub.js";
import { usarMotorStub } from "./config.js";

async function cargarMotorReal(): Promise<Motor> {
  try {
    // @ts-ignore El motor real (parte A) se cargará tras el merge
    const mod = (await import("../motor/index.js")) as { motor: Motor };
    return mod.motor;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(
      "No se encontró el motor real en src/motor/index.js (parte A). " +
        `Corré con ADUANA_MOTOR=stub mientras tanto. Detalle: ${detalle}`,
    );
  }
}

export const motor: Motor = usarMotorStub() ? motorStub : await cargarMotorReal();
