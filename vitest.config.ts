import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Varios tests de plataforma levantan un servidor real (subproceso) que
    // escribe en data/aduana.db — RUTA_DB no es configurable por env var, así
    // que todos comparten la misma base física. Sin esto, correr los
    // archivos de test en paralelo (el default de Vitest) causa contención
    // real entre esos procesos (confirmado: tests/plataforma/api-sse.test.ts
    // es intermitente en paralelo, estable en serie).
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
  },
});