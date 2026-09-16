// src/motor/index.ts
// Implementación de la interfaz Motor (contrato congelado).
// Exporta el objeto motor que Parte B consume.

import type {
  Motor,
  ContextoAnalisis,
  ResultadoAnalisis,
  EventoMotor,
  Ecosistema,
  ResultadoPaquete,
  EstadoMotor,
} from "../shared/contrato.ts";
import { ejecutarPipeline } from "./pipeline.ts";
import { verificarNombre } from "./registro/cliente.ts";
import { verificarGitleaks } from "./analizadores/secretos.ts";
import { consultarEstado as consultarOllama } from "./llm/ollama.ts";

// ─── Motor ──────────────────────────────────────────────────────────────────

export const motor: Motor = {
  async analizarDirectorio(
    dir: string,
    ctx: ContextoAnalisis,
    emitir: (e: EventoMotor) => void,
  ): Promise<ResultadoAnalisis> {
    return ejecutarPipeline(dir, ctx, emitir);
  },

  async verificarPaquete(
    ecosistema: Ecosistema,
    nombre: string,
    opts: { offline: boolean; signal?: AbortSignal },
  ): Promise<ResultadoPaquete> {
    const resultado = await verificarNombre(ecosistema, nombre, opts);
    const hallazgos: import("../shared/contrato.ts").Finding[] = [];
    const motivos: string[] = [];
    let sugerencia: string | undefined;

    // No existe
    if (resultado.existe === false) {
      motivos.push("El paquete no existe en el registro. Probablemente es una dependencia inventada por un asistente de IA.");
      hallazgos.push({
        id: `verificar:${ecosistema}:${nombre}`,
        modulo: "dependencias",
        regla: "dep-paquete-alucinado",
        titulo: "Dependencia que no existe en el registro",
        severidad: "critica",
        determinista: true,
        archivo: `verificarPaquete:${ecosistema}:${nombre}`,
        evidencia: nombre,
        explicacion: "El paquete no existe en el registro.",
      });
    }

    // No se pudo verificar (offline)
    if (resultado.existe === null) {
      motivos.push("No se pudo verificar el paquete (modo offline). Revisá manualmente antes de instalar.");
    }

    return {
      ecosistema,
      nombre,
      existe: resultado.existe,
      resultado: resultado.existe === false ? "bloqueado" : resultado.existe === null ? "requiere_confirmacion" : "permitido",
      motivos,
      sugerencia,
      hallazgos,
    };
  },

  async estado(): Promise<EstadoMotor> {
    const [ollama, gitleaks] = await Promise.all([consultarOllama(), Promise.resolve(verificarGitleaks())]);
    return {
      ollama,
      gitleaks,
    };
  },
};