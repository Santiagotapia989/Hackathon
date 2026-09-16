// Cola FIFO en memoria, concurrencia 1: con un solo LLM local no conviene
// paralelizar (sección 7 del contexto). Cada trabajo tiene su AbortController
// y un timeout total.

import { LIMITES } from "./config.js";

type Trabajo = {
  id: string;
  ejecutar: (signal: AbortSignal) => Promise<void>;
};

class ColaTrabajos {
  private pendientes: Trabajo[] = [];
  private procesando = false;
  private controladores = new Map<string, AbortController>();

  encolar(id: string, ejecutar: (signal: AbortSignal) => Promise<void>): void {
    this.pendientes.push({ id, ejecutar });
    void this.procesarSiguiente();
  }

  abortar(id: string): void {
    this.controladores.get(id)?.abort();
  }

  private async procesarSiguiente(): Promise<void> {
    if (this.procesando) return;
    const trabajo = this.pendientes.shift();
    if (!trabajo) return;

    this.procesando = true;
    const controlador = new AbortController();
    this.controladores.set(trabajo.id, controlador);
    const timeout = setTimeout(() => controlador.abort(), LIMITES.timeoutTrabajoMs);

    try {
      await trabajo.ejecutar(controlador.signal);
    } catch (err) {
      console.error(`[cola] trabajo ${trabajo.id} terminó con error no manejado:`, err);
    } finally {
      clearTimeout(timeout);
      this.controladores.delete(trabajo.id);
      this.procesando = false;
      void this.procesarSiguiente();
    }
  }
}

export const cola = new ColaTrabajos();
