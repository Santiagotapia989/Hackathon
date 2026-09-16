// tests/motor/archivos.test.ts
// Recorrido seguro de directorio: ignora dirs, no sigue symlinks fuera de raíz,
// saltea binarios/grandes, límite total de archivos.
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { recorrerDirectorio, LIMITE_ARCHIVOS, TAMANIO_MAX_BYTES } from "../../src/motor/archivos.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "aduana-test-"));
}

const dirsCreados: string[] = [];
afterEach(async () => {
  await Promise.all(dirsCreados.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("recorrerDirectorio", () => {
  it("ignora node_modules, .git, dist, build, .venv", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    for (const sub of ["node_modules", ".git", "dist", "build", ".venv", "__pycache__"]) {
      await fs.mkdir(path.join(dir, sub), { recursive: true });
      await fs.writeFile(path.join(dir, sub, "x.txt"), "contenido");
    }
    await fs.writeFile(path.join(dir, "src.txt"), "esto sí se lee");

    const r = await recorrerDirectorio(dir);
    expect(r.archivos.map((a) => a.ruta)).toEqual(["src.txt"]);
  });

  it("no sigue symlinks; uno que apunta fuera de la raíz genera un desvío", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    const fuera = await tmpDir();
    dirsCreados.push(fuera);
    await fs.writeFile(path.join(fuera, "secreto.txt"), "fuera de la raíz");
    await fs.symlink(path.join(fuera, "secreto.txt"), path.join(dir, "enlace.txt"));

    const r = await recorrerDirectorio(dir);
    expect(r.archivos).toHaveLength(0); // nunca se sigue el contenido del symlink
    expect(r.desvios).toHaveLength(1);
    expect(r.desvios[0]!.ruta).toBe("enlace.txt");
  });

  it("un symlink que apunta DENTRO de la raíz no genera desvío (pero tampoco se sigue)", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    await fs.writeFile(path.join(dir, "real.txt"), "contenido real");
    await fs.symlink(path.join(dir, "real.txt"), path.join(dir, "enlace.txt"));

    const r = await recorrerDirectorio(dir);
    expect(r.desvios).toHaveLength(0);
    expect(r.archivos.map((a) => a.ruta)).toEqual(["real.txt"]);
  });

  it("saltea binarios (byte nulo en los primeros 8KB)", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    await fs.writeFile(path.join(dir, "imagen.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
    await fs.writeFile(path.join(dir, "texto.txt"), "normal");

    const r = await recorrerDirectorio(dir);
    expect(r.archivos.map((a) => a.ruta)).toEqual(["texto.txt"]);
    expect(r.saltados).toBeGreaterThanOrEqual(1);
  });

  it("saltea archivos de más de 1MB", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    await fs.writeFile(path.join(dir, "grande.txt"), Buffer.alloc(TAMANIO_MAX_BYTES + 1, "a"));
    await fs.writeFile(path.join(dir, "chico.txt"), "ok");

    const r = await recorrerDirectorio(dir);
    expect(r.archivos.map((a) => a.ruta)).toEqual(["chico.txt"]);
  });

  it("con más de LIMITE_ARCHIVOS archivos, marca parcial y corta", async () => {
    const dir = await tmpDir();
    dirsCreados.push(dir);
    const total = LIMITE_ARCHIVOS + 25;
    await Promise.all(
      Array.from({ length: total }, (_, i) => fs.writeFile(path.join(dir, `f${i}.txt`), "x")),
    );

    const r = await recorrerDirectorio(dir);
    expect(r.parcial).toBe(true);
    expect(r.archivos.length).toBeLessThanOrEqual(LIMITE_ARCHIVOS);
  }, 30_000);
});
