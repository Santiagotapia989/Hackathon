// tests/plataforma/api-scans.test.ts
// API HTTP real (servidor levantado como subproceso, motor stub para
// determinismo). Casos felices y de error de /api/scans, /api/health,
// objetivos inválidos, límites de body, CORS y bind exclusivo a 127.0.0.1.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { levantarServidorTest, type ServidorTest } from "./helpers/servidor-test.js";

let servidor: ServidorTest;
const PUERTO = 39001;

beforeAll(async () => {
  servidor = await levantarServidorTest({ puerto: PUERTO });
}, 20_000);

afterAll(async () => {
  await servidor.detener();
});

describe("GET /api/health", () => {
  it("responde 200 con el esquema Health (motor stub)", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/health`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(typeof body.ollama.activo).toBe("boolean");
    expect(typeof body.gitleaks).toBe("boolean");
    expect(typeof body.offline).toBe("boolean");
  });
});

describe("POST /api/scans", () => {
  it("responde 201 { id } de inmediato, sin esperar el análisis", async () => {
    const inicio = Date.now();
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "npm:picocolors" }),
    });
    const duracionMs = Date.now() - inicio;
    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(typeof body.id).toBe("string");
    expect(duracionMs).toBeLessThan(500); // el motor stub tarda ~1.8-4.8s en terminar; la respuesta no debe esperar eso
  });

  it("GET /api/scans/:id inexistente → 404", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans/no-existe-este-id`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toBeDefined();
  });

  it("body sin objetivo → 400", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
  });

  const objetivosInvalidos: Array<[string, string]> = [
    ["file:///etc/passwd", "file:// no es http(s)"],
    ["https://evil.invalid/a/b", "host fuera de la allowlist"],
    ["http://github.com/a/b", "http sin s"],
    ["https://user:pass@github.com/a/b", "credenciales en la URL"],
    ["https://github.com/a/b?x=1", "query string"],
    ["https://github.com/a/b;touch /tmp/pwned", "intento de inyección de comando en la URL"],
    ["npm:../../x", "path traversal en nombre npm"],
    ["npm:A Mayúsculas", "nombre npm con mayúsculas/espacio"],
    ["pypi:$(id)", "intento de inyección de comando en nombre pypi"],
    ["", "string vacío"],
    ["a".repeat(301), "más de 300 caracteres"],
  ];

  for (const [objetivo, motivo] of objetivosInvalidos) {
    it(`objetivo inválido (${motivo}) → 400`, async () => {
      const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivo }),
      });
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(typeof body.error).toBe("string");
    });
  }

  it("body de más de 10KB → rechazado (no crea el scan)", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "npm:x", relleno: "a".repeat(11 * 1024) }),
    });
    expect(resp.status).toBeGreaterThanOrEqual(400); // sí rechaza, ver bug de código abajo
    const body = await resp.json().catch(() => null);
    expect(body?.id).toBeUndefined();
  });

  // BUG: el límite de 10KB de express.json({ limit: "10kb" }) SÍ rechaza el
  // body, pero el error que lanza raw-body (PayloadTooLargeError) no es un
  // SyntaxError, así que no cae en la rama especial del error-handler de
  // server.ts (que solo distingue SyntaxError para dar 400) — cae al catch-all
  // genérico y responde 500. Un límite de tamaño excedido es un error del
  // CLIENTE (4xx, idealmente 413 Payload Too Large), no un error interno del
  // servidor (5xx). Un cliente/agente que vea 500 puede reintentar pensando
  // que es un fallo transitorio. Ver PRUEBAS_RESULTADO.md.
  it.fails("body de más de 10KB debería responder 4xx (idealmente 413), no 500", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objetivo: "npm:x", relleno: "a".repeat(11 * 1024) }),
    });
    expect(resp.status).toBeLessThan(500);
  });
});

describe("CORS", () => {
  it("origen permitido (5173) recibe Access-Control-Allow-Origin", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/health`, {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    expect(resp.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });

  it("origen no permitido no recibe el header CORS", async () => {
    const resp = await fetch(`${servidor.baseUrl}/api/health`, {
      headers: { Origin: "https://evil.invalid" },
    });
    expect(resp.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("Bind de red", () => {
  it("el servidor escucha solo en 127.0.0.1, nunca en 0.0.0.0", () => {
    // La columna "Peer Address" de una línea LISTEN siempre muestra "0.0.0.0:*"
    // (es el wildcard de "sin conexión establecida", no el bind local) — hay
    // que mirar específicamente la primera columna de dirección (Local
    // Address:Port), no la línea entera.
    const salida = execSync(`ss -ltnp 2>/dev/null | grep ':${PUERTO} ' || true`, { encoding: "utf8" });
    expect(salida).toContain("LISTEN");
    const localAddr = salida.trim().split(/\s+/)[3]; // Netid Recv-Q Send-Q LocalAddr:Port ...
    expect(localAddr).toBe(`127.0.0.1:${PUERTO}`);
  });
});
