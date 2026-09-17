// tests/motor/sast.test.ts
import { describe, it, expect } from "vitest";
import { analizarSAST } from "../../src/motor/analizadores/sast.js";
import type { ArchivoLeido } from "../../src/motor/archivos.js";

describe("analizadorSAST", () => {
  it("detecta funciones de ejecución de comandos en C/C++", () => {
    const archivos: ArchivoLeido[] = [
      {
        ruta: "src/native.c",
        contenido: '#include <stdlib.h>\nvoid run() {\n  system("ls -la");\n}\n',
      },
    ];
    const r = analizarSAST(archivos);
    expect(r).toHaveLength(1);
    expect(r[0]?.titulo).toContain("Ejecución de comandos del sistema en C/C++");
    expect(r[0]?.severidad).toBe("alta");
  });

  it("detecta operaciones de buffer inseguras en C", () => {
    const archivos: ArchivoLeido[] = [
      {
        ruta: "src/buffer.c",
        contenido: 'void copy(char *input) {\n  char buf[64];\n  strcpy(buf, input);\n}\n',
      },
    ];
    const r = analizarSAST(archivos);
    expect(r).toHaveLength(1);
    expect(r[0]?.titulo).toContain("Operación de buffer insegura");
  });

  it("detecta invocación de Runtime.exec en Java", () => {
    const archivos: ArchivoLeido[] = [
      {
        ruta: "src/App.java",
        contenido: 'public class App {\n  public void exec(String cmd) throws Exception {\n    Runtime.getRuntime().exec(cmd);\n  }\n}\n',
      },
    ];
    const r = analizarSAST(archivos);
    expect(r).toHaveLength(1);
    expect(r[0]?.titulo).toContain("Invocación de subproceso en Java");
  });

  it("detecta os.system y eval en Python", () => {
    const archivos: ArchivoLeido[] = [
      {
        ruta: "script.py",
        contenido: 'import os\nos.system("rm -rf /tmp")\neval("print(1)")\n',
      },
    ];
    const r = analizarSAST(archivos);
    expect(r).toHaveLength(2);
  });
});
