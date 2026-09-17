// npm run db:reset — deja la base limpia antes de la demo.

import fs from "node:fs";
import { RUTA_DB } from "../config.js";

for (const sufijo of ["", "-wal", "-shm", "-journal"]) {
  const ruta = RUTA_DB + sufijo;
  if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
}

// Recrea el esquema de inmediato (import con efecto de creación de tablas).
const { cerrarDb } = await import("../db.js");
cerrarDb();

console.log("Base de datos reiniciada:", RUTA_DB);
