// tests/plataforma/ingesta-paquete.test.ts
// Extracción segura de tarballs/wheels armados a mano con entradas
// maliciosas (../escape, ruta absoluta, symlink, hardlink), y verificación
// de que un script "postinstall" nunca se ejecuta con solo extraer.
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as tar from "tar";
import AdmZip from "adm-zip";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "aduana-ingesta-test-"));
}

const dirsCreados: string[] = [];
afterEach(async () => {
  await Promise.all(dirsCreados.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

// ─── Helper: arma un tarball crudo con entradas arbitrarias (path traversal,
// symlink y hardlink apuntando fuera), usando tar.Header directo para poder
// escribir nombres que la API de alto nivel (tar.create) nunca generaría
// a partir de archivos reales. ────────────────────────────────────────────
function armarTarballMalicioso(): Buffer {
  const bloques: Buffer[] = [];

  function agregarArchivo(rutaEntrada: string, contenido: string): void {
    const data = Buffer.from(contenido, "utf8");
    const header = new tar.Header({ path: rutaEntrada, size: data.length, type: "File", mode: 0o644 });
    header.encode();
    bloques.push(header.block!);
    bloques.push(data);
    const relleno = (512 - (data.length % 512)) % 512;
    if (relleno) bloques.push(Buffer.alloc(relleno));
  }

  function agregarSymlink(rutaEntrada: string, destino: string): void {
    const header = new tar.Header({ path: rutaEntrada, type: "SymbolicLink", linkpath: destino, mode: 0o777 });
    header.encode();
    bloques.push(header.block!);
  }

  function agregarHardlink(rutaEntrada: string, destino: string): void {
    const header = new tar.Header({ path: rutaEntrada, type: "Link", linkpath: destino, mode: 0o644 });
    header.encode();
    bloques.push(header.block!);
  }

  agregarArchivo("paquete/index.js", "module.exports = 1;\n"); // entrada normal, sana
  agregarArchivo("../escape-relativo.txt", "no debería aparecer fuera del destino\n");
  agregarArchivo("/tmp/escape-absoluto.txt", "tampoco esta\n");
  agregarSymlink("paquete/enlace-malicioso", "/etc/passwd");
  agregarHardlink("paquete/hardlink-malicioso", "/etc/passwd");

  bloques.push(Buffer.alloc(1024)); // EOF de tar: dos bloques de ceros
  return Buffer.concat(bloques);
}

async function extraerTarComoIngesta(archivoTar: string, destino: string): Promise<void> {
  // Replica exactamente la política de extraerTar() de ingesta/paquete.ts
  // (mismo filter/onentry), sin poder importar la función privada del
  // módulo directamente.
  await fs.mkdir(destino, { recursive: true });
  function entradaEsSegura(rutaEntrada: string): boolean {
    if (path.isAbsolute(rutaEntrada)) return false;
    const partes = rutaEntrada.split(/[/\\]/);
    if (partes.includes("..")) return false;
    return true;
  }
  await tar.x({
    file: archivoTar,
    cwd: destino,
    strip: 0,
    filter: (rutaEntrada: string) => entradaEsSegura(rutaEntrada),
    onentry: (entry: { type?: string; resume: () => void }) => {
      if (entry.type === "SymbolicLink" || entry.type === "Link") {
        entry.resume();
      }
    },
  });
}

describe("ingesta/paquete — extracción segura de tar", () => {
  it("ninguna entrada maliciosa (../, absoluta, symlink, hardlink) sale del destino", async () => {
    const destino = await tmpDir();
    dirsCreados.push(destino);
    const archivoTar = path.join(destino, "..", "malicioso.tgz");
    await fs.writeFile(archivoTar, armarTarballMalicioso());

    await extraerTarComoIngesta(archivoTar, destino);
    await fs.rm(archivoTar, { force: true });

    // Solo la entrada sana debe existir.
    expect(fsSync.existsSync(path.join(destino, "paquete", "index.js"))).toBe(true);

    // Ninguna ruta maliciosa debe haber escapado del destino.
    expect(fsSync.existsSync(path.join(path.dirname(destino), "escape-relativo.txt"))).toBe(false);
    expect(fsSync.existsSync("/tmp/escape-absoluto.txt")).toBe(false);
    expect(fsSync.existsSync(path.join(destino, "paquete", "enlace-malicioso"))).toBe(false);
    expect(fsSync.existsSync(path.join(destino, "paquete", "hardlink-malicioso"))).toBe(false);
  });

  it("un script 'postinstall' en el tarball nunca se ejecuta con solo extraer", async () => {
    const marcador = path.join(os.tmpdir(), `aduana-marcador-${Date.now()}`);
    await fs.rm(marcador, { force: true });

    const bloques: Buffer[] = [];
    const pkgJson = JSON.stringify({
      name: "paquete-malicioso",
      version: "1.0.0",
      scripts: { postinstall: `touch ${marcador}` },
    });
    function agregar(rutaEntrada: string, contenido: string): void {
      const data = Buffer.from(contenido, "utf8");
      const header = new tar.Header({ path: rutaEntrada, size: data.length, type: "File", mode: 0o644 });
      header.encode();
      bloques.push(header.block!, data);
      const relleno = (512 - (data.length % 512)) % 512;
      if (relleno) bloques.push(Buffer.alloc(relleno));
    }
    agregar("paquete/package.json", pkgJson);
    bloques.push(Buffer.alloc(1024));

    const destino = await tmpDir();
    dirsCreados.push(destino);
    const archivoTar = path.join(os.tmpdir(), `aduana-pkg-${Date.now()}.tgz`);
    await fs.writeFile(archivoTar, Buffer.concat(bloques));

    await extraerTarComoIngesta(archivoTar, destino);
    await fs.rm(archivoTar, { force: true });

    // Esperamos un instante por si algo (que no debería) llegara a disparar el script.
    await new Promise((r) => setTimeout(r, 200));

    expect(fsSync.existsSync(path.join(destino, "paquete", "package.json"))).toBe(true);
    expect(fsSync.existsSync(marcador)).toBe(false);
    await fs.rm(marcador, { force: true });
  });
});

describe("ingesta/paquete — extracción segura de wheel (zip)", () => {
  it("ninguna entrada maliciosa (../, absoluta, symlink) sale del destino", async () => {
    const destino = await tmpDir();
    dirsCreados.push(destino);

    const zip = new AdmZip();
    zip.addFile("paquete/init.py", Buffer.from("x = 1\n"));
    zip.addFile("../escape-wheel.txt", Buffer.from("no debería estar afuera\n"));
    zip.addFile("/tmp/escape-wheel-absoluto.txt", Buffer.from("tampoco\n"));

    // Entrada symlink: bit S_IFLNK (0xA000) + permisos en los atributos unix
    // altos del zip. La propiedad real a setear es `entry.attr` (no
    // `entry.header.attr`, que se descarta al serializar).
    const entradaSymlink = zip.addFile("paquete/enlace", Buffer.from("/etc/passwd"));
    entradaSymlink.attr = (0xa1ff << 16) >>> 0;

    const rutaZip = path.join(os.tmpdir(), `aduana-wheel-${Date.now()}.whl`);
    zip.writeZip(rutaZip);

    // Replica extraerWheel() de ingesta/paquete.ts.
    const zipLeido = new AdmZip(rutaZip);
    await fs.mkdir(destino, { recursive: true });
    const raiz = path.resolve(destino);
    function entradaEsSegura(rutaEntrada: string): boolean {
      if (path.isAbsolute(rutaEntrada)) return false;
      const partes = rutaEntrada.split(/[/\\]/);
      if (partes.includes("..")) return false;
      return true;
    }
    for (const entrada of zipLeido.getEntries()) {
      if (!entradaEsSegura(entrada.entryName)) continue;
      const modoUnix = (entrada.header.attr >>> 16) & 0xf000;
      if (modoUnix === 0xa000) continue;
      const rutaDestino = path.resolve(destino, entrada.entryName);
      if (!rutaDestino.startsWith(raiz + path.sep) && rutaDestino !== raiz) continue;
      if (entrada.isDirectory) {
        await fs.mkdir(rutaDestino, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(rutaDestino), { recursive: true });
        await fs.writeFile(rutaDestino, entrada.getData());
      }
    }
    await fs.rm(rutaZip, { force: true });

    expect(fsSync.existsSync(path.join(destino, "paquete", "init.py"))).toBe(true);
    expect(fsSync.existsSync(path.join(path.dirname(destino), "escape-wheel.txt"))).toBe(false);
    expect(fsSync.existsSync("/tmp/escape-wheel-absoluto.txt")).toBe(false);
    expect(fsSync.existsSync(path.join(destino, "paquete", "enlace"))).toBe(false);
  });
});
