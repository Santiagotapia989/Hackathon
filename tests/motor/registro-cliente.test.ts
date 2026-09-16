// tests/motor/registro-cliente.test.ts
// Cliente de registros npm/PyPI: allowlist de hosts, timeout, caché, offline.
// Mockeamos fetch global (vi.stubGlobal) en vez de nock/msw: el cliente usa
// fetch nativo contra una allowlist fija, no hay endpoint real que interceptar
// por DNS sin tocar código de producción.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verificarNombre, resetCache } from "../../src/motor/registro/cliente.js";

function respuestaJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("registro/cliente", () => {
  beforeEach(() => resetCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("offline: no hace ninguna request y existe = null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await verificarNombre("npm", "cualquier-paquete", { offline: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.existe).toBeNull();
  });

  it("online: paquete existente devuelve diasCreacion", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("registry.npmjs.org")) {
        return respuestaJson(200, { time: { created: new Date(Date.now() - 5 * 86_400_000).toISOString() } });
      }
      if (String(url).includes("api.npmjs.org")) {
        return respuestaJson(200, { downloads: 42 });
      }
      throw new Error("host inesperado: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await verificarNombre("npm", "paquete-x", { offline: false });
    expect(r.existe).toBe(true);
    expect(r.diasCreacion).toBe(5);
  });

  it("online: paquete existente devuelve descargasSemanales (api.npmjs.org ya está en la allowlist)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("registry.npmjs.org")) return respuestaJson(200, {});
      if (String(url).includes("api.npmjs.org")) return respuestaJson(200, { downloads: 42 });
      throw new Error("host inesperado: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await verificarNombre("npm", "paquete-x", { offline: false });
    expect(r.descargasSemanales).toBe(42);
  });

  it("online: 404 del registro → existe = false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuestaJson(404, {})));
    const r = await verificarNombre("npm", "no-existe", { offline: false });
    expect(r.existe).toBe(false);
  });

  it("timeout del registro no cuelga el análisis (existe = null)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );
    const inicio = Date.now();
    const r = await verificarNombre("npm", "paquete-lento", { offline: false });
    const duracionMs = Date.now() - inicio;
    expect(r.existe).toBeNull();
    expect(duracionMs).toBeLessThan(6000); // timeout interno del cliente es 5s
  }, 8000);

  it("caché: el mismo paquete consultado dos veces solo dispara una request", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("registry.npmjs.org")) return respuestaJson(200, {});
      if (String(url).includes("api.npmjs.org")) return respuestaJson(200, { downloads: 1 });
      throw new Error("host inesperado");
    });
    vi.stubGlobal("fetch", fetchMock);
    await verificarNombre("npm", "repetido", { offline: false });
    await verificarNombre("npm", "repetido", { offline: false });
    // 2 llamadas por resolución completa (registry + downloads) — la segunda
    // consulta a "repetido" debe venir de caché, sin llamadas nuevas.
    const llamadasARegistryNpm = fetchMock.mock.calls.filter((c) => String(c[0]).includes("registry.npmjs.org")).length;
    expect(llamadasARegistryNpm).toBe(1);
  });

  it("PyPI: consulta el host correcto y respeta el JSON de pypi.org", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain("pypi.org");
      return respuestaJson(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await verificarNombre("pypi", "requests", { offline: false });
    expect(r.existe).toBe(true);
  });

  it("nunca llama a un host fuera de la allowlist (URL construida siempre apunta a los hosts fijos)", async () => {
    const fetchMock = vi.fn(async () => respuestaJson(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await verificarNombre("npm", "algo", { offline: false });
    for (const call of fetchMock.mock.calls) {
      const host = new URL(String(call[0])).hostname;
      expect(["registry.npmjs.org", "api.npmjs.org"]).toContain(host);
    }
  });
});
