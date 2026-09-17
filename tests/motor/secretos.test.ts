// tests/motor/secretos.test.ts
import { describe, it, expect } from "vitest";
import { analizarSecretos, crearGitleaksRunnerMock } from "../../src/motor/analizadores/secretos.js";
import { enmascarar, prepararEvidencia } from "../../src/motor/evidencia.js";

describe("analizador de secretos", () => {
  it("detecta un secreto del reporte y lo enmascara", async () => {
    const runner = crearGitleaksRunnerMock([
      {
        RuleID: "github-pat",
        File: "scripts/deploy.sh",
        StartLine: 3,
        Match: "GITHUB_TOKEN=ghp_abcdefgh1234567890",
        Secret: "ghp_abcdefgh1234567890",
      },
    ]);
    const hallazgos = await analizarSecretos("dir", {
      tieneHistorialGit: true,
      offline: true,
      runner,
    });

    expect(hallazgos).toHaveLength(1);
    const h = hallazgos[0]!;
    expect(h.regla).toBe("secreto-github-pat");
    expect(h.severidad).toBe("alta"); // github-pat → alta
    expect(h.commit).toBeUndefined();
    expect(h.evidencia).toContain(enmascarar("ghp_abcdefgh1234567890"));
    expect(h.evidencia).not.toContain("ghp_abcdefgh1234567890"); // no filtra secreto completo
    expect(h.remediacion?.length).toBe(3);
  });

  it("baja severidad si el secreto está en historial", async () => {
    const runner = crearGitleaksRunnerMock([
      {
        RuleID: "github-pat",
        File: "scripts/deploy.sh",
        StartLine: 3,
        Match: "ghp_abcdefgh1234567890",
        Secret: "ghp_abcdefgh1234567890",
        Commit: "abc123", // en historial → downgrade
      },
    ]);
    const hallazgos = await analizarSecretos("dir", {
      tieneHistorialGit: true,
      offline: true,
      runner,
    });
    expect(hallazgos[0]?.severidad).toBe("media");
  });

  it("baja severidad si la ruta sugiere tests", async () => {
    const runner = crearGitleaksRunnerMock([
      {
        RuleID: "slack-webhook-url",
        File: "tests/fixture.json",
        StartLine: 1,
        Match: "https://hooks.slack.com/services/x",
        Secret: "https://hooks.slack.com/services/x",
      },
    ]);
    const hallazgos = await analizarSecretos("dir", {
      tieneHistorialGit: false,
      offline: true,
      runner,
    });
    expect(hallazgos[0]?.severidad).toBe("baja"); // media → downgrade por test
  });

  it("reporte vacío → sin hallazgos", async () => {
    const runner = crearGitleaksRunnerMock([]);
    const hallazgos = await analizarSecretos("dir", {
      tieneHistorialGit: true,
      offline: true,
      runner,
    });
    expect(hallazgos).toHaveLength(0);
  });

  it("Runner que lanza error (gitleaks ausente) → propaga la excepción (no devuelve [] silenciosamente)", async () => {
    // Antes, analizarSecretos() atrapaba este error y devolvía [] —
    // exactamente igual que "gitleaks corrió de verdad y no encontró nada".
    // Ahora deja que suba: pipeline.ts la captura, marca la etapa "secretos"
    // en error, y scoring.ts fuerza al menos "revisar" (ver
    // tests/motor/pipeline.test.ts para el comportamiento end-to-end).
    const runner = {
      ejecutar: async () => {
        throw new Error("gitleaks no encontrado");
      },
    };
    await expect(
      analizarSecretos("dir", { tieneHistorialGit: true, offline: true, runner: runner as any }),
    ).rejects.toThrow("gitleaks no encontrado");
  });

  it("el commit completo viaja en el hallazgo (no solo en la explicación truncada)", async () => {
    const commitCompleto = "f3fa111e2233445566778899aabbccddeeff001";
    const runner = crearGitleaksRunnerMock([
      {
        RuleID: "generic-api-key",
        File: "scripts/deploy.sh",
        StartLine: 2,
        Match: "API_KEY=abcdefghij1234567890",
        Secret: "abcdefghij1234567890",
        Commit: commitCompleto,
      },
    ]);
    const hallazgos = await analizarSecretos("dir", { tieneHistorialGit: true, offline: true, runner });
    expect(hallazgos[0]?.commit).toBe(commitCompleto);
    expect(hallazgos[0]?.explicacion).toContain(commitCompleto.slice(0, 7));
  });

  it("paquete sin .git usa modo 'dir' (tieneHistorialGit: false)", async () => {
    const args: unknown[] = [];
    const runnerEspia = {
      ejecutar: async (dir: string, tieneHistorialGit: boolean) => {
        args.push(tieneHistorialGit);
        return { exitCode: 0, reporte: "[]" };
      },
    };
    await analizarSecretos("dir-sin-git", { tieneHistorialGit: false, offline: true, runner: runnerEspia });
    expect(args[0]).toBe(false);
  });

  it("la evidencia pasa por prepararEvidencia (sin controles raros)", () => {
    const texto = "GITHUB_TOKEN=ghp_abcdefgh1234567890\x1b[31m";
    const e = prepararEvidencia(texto);
    expect(e).not.toContain("\x1b");
  });
});