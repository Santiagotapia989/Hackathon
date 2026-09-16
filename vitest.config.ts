import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Cada archivo de test ahora tiene su propia DB temporal (ver
    // tests/setup-db.ts — ADUANA_DB_PATH, RUTA_DB configurable en
    // config.ts), así que ya no comparten data/aduana.db entre sí. Se
    // mantiene fileParallelism:false igual por simplicidad/estabilidad
    // (menos procesos Node concurrentes en esta máquina, junto a Ollama);
    // globalSetup queda como red de seguridad extra por si algún test
    // llegara a tocar la DB real por error.
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-db.ts"],
  },
});