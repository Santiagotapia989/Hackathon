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

  it("Runner que lanza error (gitleaks ausente) → [] sin fallar", async () => {
    const runner = {
      ejecutar: async () => {
        throw new Error("gitleaks no encontrado");
      },
    };
    const hallazgos = await analizarSecretos("dir", {
      tieneHistorialGit: true,
      offline: true,
      runner: runner as any,
    });
    expect(hallazgos).toHaveLength(0);
  });

  it("la evidencia pasa por prepararEvidencia (sin controles raros)", () => {
    const texto = "GITHUB_TOKEN=ghp_abcdefgh1234567890\x1b[31m";
    const e = prepararEvidencia(texto);
    expect(e).not.toContain("\x1b");
  });
});