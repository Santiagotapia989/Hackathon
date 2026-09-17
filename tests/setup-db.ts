// tests/setup-db.ts
// setupFile de Vitest: corre una vez por CADA archivo de test, antes de que
// ese archivo importe nada. Le asigna una DB temporal propia vía
// ADUANA_DB_PATH (ahora configurable en config.ts) — ya no hace falta
// compartir data/aduana.db entre archivos de test ni con el servidor de
// desarrollo. Los subprocesos que levantan el servidor real (ver
// tests/plataforma/helpers/servidor-test.ts) heredan process.env, así que
// también usan esta misma ruta temporal automáticamente.
import { afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const rutaTemporal = path.join(os.tmpdir(), `aduana-test-${randomUUID()}.db`);
process.env.ADUANA_DB_PATH = rutaTemporal;

afterAll(() => {
  for (const sufijo of ["", "-wal", "-shm"]) {
    fs.rmSync(`${rutaTemporal}${sufijo}`, { force: true });
  }
});
