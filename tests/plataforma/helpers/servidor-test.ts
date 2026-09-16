// tests/plataforma/helpers/servidor-test.ts
// Levanta/baja el servidor real (src/plataforma/server.ts) como subproceso,
// con ADUANA_MOTOR=stub para resultados deterministas y rápidos. No hay
// forma de exportar `app` desde server.ts sin tocar código de producción
// (se autoejecuta al importarse), así que esta es la única vía de probar
// la API HTTP real sin supertest (no instalado, y agregarlo tocaría
// package.json fuera del alcance permitido para esta ronda de QA).
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

const RAIZ = path.resolve(import.meta.dirname!, "..", "..", "..");

export type ServidorTest = {
  baseUrl: string;
  proceso: ChildProcess;
  detener: () => Promise<void>;
};

export async function levantarServidorTest(opts: { puerto: number; motor?: "stub" | "real"; offline?: boolean }): Promise<ServidorTest> {
  const baseUrl = `http://127.0.0.1:${opts.puerto}`;
  const proceso = spawn(
    "npx",
    ["tsx", "src/plataforma/server.ts"],
    {
      cwd: RAIZ,
      env: {
        ...process.env,
        ADUANA_PORT: String(opts.puerto),
        ADUANA_MOTOR: opts.motor === "real" ? undefined : "stub",
        ADUANA_OFFLINE: opts.offline === false ? undefined : "1",
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let salidaAcumulada = "";
  proceso.stdout?.on("data", (d) => (salidaAcumulada += d.toString()));
  proceso.stderr?.on("data", (d) => (salidaAcumulada += d.toString()));

  const inicio = Date.now();
  while (Date.now() - inicio < 15_000) {
    try {
      const resp = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (resp.ok || resp.status === 500) break; // levantado (500 = motor con problemas, pero el server responde)
    } catch {
      // todavía no levantó
    }
    if (proceso.exitCode !== null) {
      throw new Error(`El servidor de test terminó temprano (código ${proceso.exitCode}):\n${salidaAcumulada}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    baseUrl,
    proceso,
    detener: async () => {
      proceso.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        proceso.once("exit", () => resolve());
        setTimeout(resolve, 3000);
      });
    },
  };
}
