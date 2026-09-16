// tests/plataforma/ingesta-repo.test.ts
// Ingesta de repos: el clon se hace sin credential helpers, así que solo se
// pueden escanear repos públicos — un repo privado falla aunque haya
// credenciales guardadas en la máquina.
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { argsGitClone } from "../../src/plataforma/ingesta/repo.js";

const execFileAsync = promisify(execFile);

describe("ingesta de repos — clonado solo público", () => {
  it("el clon pasa -c credential.helper= para anular helpers guardados", () => {
    const args = argsGitClone("https://github.com/owner/repo", "/tmp/destino");
    const i = args.findIndex((a, j) => a === "-c" && args[j + 1] === "credential.helper=");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args).toContain("--no-recurse-submodules");
  });

  it("con un credential helper configurado, los -c del clon lo anulan: git no obtiene credenciales", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aduana-git-cred-"));
    try {
      // Helper que devolvería credenciales si git lo invocara.
      const helper = path.join(dir, "helper.sh");
      await fs.writeFile(helper, "#!/bin/sh\necho username=test\necho password=test\n", { mode: 0o755 });

      const env = {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "credential.helper",
        GIT_CONFIG_VALUE_0: helper,
        GIT_TERMINAL_PROMPT: "0",
      };

      // Mismos `-c` que recibe `git clone` en producción.
      const args = argsGitClone("https://github.com/owner/repo", "/destino");
      const argsConfig = args.slice(0, args.indexOf("clone"));

      const pedirCredenciales = (extra: string[]) => {
        const proc = execFileAsync("git", [...extra, "credential", "fill"], { env }) as any;
        proc.child.stdin!.write("protocol=https\nhost=github.com\n\n");
        proc.child.stdin!.end();
        return proc;
      };

      // Control: sin los -c, el helper sí responde credenciales.
      const conHelper = await pedirCredenciales([]);
      expect(conHelper.stdout).toMatch(/username=/);

      // Con los -c del clon (credential.helper= vacío): no hay credenciales
      // → un repo privado no se puede clonar.
      const sinHelper = await pedirCredenciales(argsConfig).catch((e: unknown) => e);
      expect(sinHelper).toBeInstanceOf(Error);
      expect(String((sinHelper as any).stderr ?? (sinHelper as Error).message)).toMatch(
        /could not read|prompts disabled/i,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
