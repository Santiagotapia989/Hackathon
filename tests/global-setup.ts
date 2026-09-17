// tests/global-setup.ts
// Backup/restore de data/aduana.db alrededor de toda la corrida de tests.
// RUTA_DB no es configurable por env var (config.ts, código de producción),
// así que todos los servidores de test comparten la base real — esto evita
// que `npm test` deje pisado el seed de demo (demo-001/002/003).
import * as fs from "node:fs";
import * as path from "node:path";

const RUTA_DB = path.resolve(import.meta.dirname!, "..", "data", "aduana.db");
const RUTA_BACKUP = `${RUTA_DB}.qa-backup`;

function copiarSiExiste(origen: string, destino: string): void {
  for (const sufijo of ["", "-wal", "-shm"]) {
    const o = origen + sufijo;
    const d = destino + sufijo;
    try {
      if (fs.existsSync(o)) fs.copyFileSync(o, d);
      else fs.rmSync(d, { force: true });
    } catch {
      // Ignorar bloqueos en archivos -wal / -shm si el servidor está activo
    }
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  if (fs.existsSync(RUTA_DB)) {
    copiarSiExiste(RUTA_DB, RUTA_BACKUP);
    console.log(`[global-setup] backup de ${RUTA_DB} guardado en ${RUTA_BACKUP}`);
  }

  return async () => {
    if (fs.existsSync(RUTA_BACKUP)) {
      copiarSiExiste(RUTA_BACKUP, RUTA_DB);
      for (const sufijo of ["", "-wal", "-shm"]) {
        fs.rmSync(`${RUTA_BACKUP}${sufijo}`, { force: true });
      }
      console.log(`[global-setup] ${RUTA_DB} restaurada desde el backup`);
    }
  };
}
