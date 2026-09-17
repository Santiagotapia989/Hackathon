import { HealthSchema, ScanSchema } from "./schemas";
import type { Health, Scan } from "./schemas";
import {
  crearScanMock,
  obtenerHealthMock,
  obtenerScanMock,
  obtenerScansMock,
  suscribirseScanMock,
  type ScanEvento,
} from "./mocks";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

async function pedir<T>(url: string, iniciador?: RequestInit): Promise<T> {
  const respuesta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...iniciador,
  });
  if (!respuesta.ok) {
    let mensaje = `El servidor respondió con estado ${respuesta.status}.`;
    try {
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (cuerpo.error) mensaje = cuerpo.error;
    } catch {
      // no hay cuerpo JSON
    }
    throw new Error(mensaje);
  }
  return (await respuesta.json()) as T;
}

const apiReal = {
  async crearScan(objetivo: string): Promise<{ id: string }> {
    return pedir<{ id: string }>("/api/scans", {
      method: "POST",
      body: JSON.stringify({ objetivo }),
    });
  },

  async obtenerScans(): Promise<Scan[]> {
    const datos = await pedir<unknown[]>("/api/scans");
    return datos.map((d) => ScanSchema.parse(d));
  },

  async obtenerScan(id: string): Promise<Scan> {
    const datos = await pedir<unknown>(`/api/scans/${id}`);
    return ScanSchema.parse(datos);
  },

  async obtenerHealth(): Promise<Health> {
    const datos = await pedir<unknown>("/api/health");
    return HealthSchema.parse(datos);
  },

  async generarTokenAprobacion(
    id: string,
    confirmacionCritica = false,
  ): Promise<{ token: string; veredicto: string }> {
    return pedir<{ token: string; veredicto: string }>(
      `/api/scans/${id}/token`,
      {
        method: "POST",
        body: JSON.stringify({ confirmacionCritica }),
      },
    );
  },

  suscribirseScan(id: string, cb: (e: ScanEvento) => void): () => void {
    const fuente = new EventSource(`/api/scans/${id}/events`);
    const escuchar = (tipo: ScanEvento["tipo"]) => (ev: MessageEvent) => {
      try {
        cb({ tipo, data: JSON.parse(ev.data) } as ScanEvento);
      } catch {
        // frame inválido: se ignora
      }
    };
    fuente.addEventListener("etapa", escuchar("etapa"));
    fuente.addEventListener("hallazgo", escuchar("hallazgo"));
    fuente.addEventListener("veredicto", escuchar("veredicto"));
    fuente.addEventListener("error", escuchar("error"));
    return () => fuente.close();
  },
};

const apiMock = {
  async crearScan(objetivo: string): Promise<{ id: string }> {
    await new Promise((r) => setTimeout(r, 400));
    return crearScanMock(objetivo);
  },

  async obtenerScans(): Promise<Scan[]> {
    await new Promise((r) => setTimeout(r, 200));
    return obtenerScansMock();
  },

  async obtenerScan(id: string): Promise<Scan> {
    await new Promise((r) => setTimeout(r, 200));
    const scan = obtenerScanMock(id);
    if (!scan) throw new Error("Escaneo no encontrado.");
    return scan;
  },

  async obtenerHealth(): Promise<Health> {
    await new Promise((r) => setTimeout(r, 150));
    return obtenerHealthMock();
  },

  async generarTokenAprobacion(
    _id: string,
    _confirmacionCritica = false,
  ): Promise<{ token: string; veredicto: string }> {
    await new Promise((r) => setTimeout(r, 300));
    return { token: "SIVAR-DEMO-1234-ABCD", veredicto: "revisar" };
  },

  suscribirseScan(id: string, cb: (e: ScanEvento) => void): () => void {
    return suscribirseScanMock(id, cb);
  },
};

export const api = USE_MOCKS ? apiMock : apiReal;
export { USE_MOCKS };
export type { ScanEvento } from "./mocks";