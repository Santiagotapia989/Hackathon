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
} from "../shared/contrato.js";
import { ejecutarPipeline } from "./pipeline.js";
import { verificarNombre } from "./registro/cliente.js";
import { verificarGitleaks } from "./analizadores/secretos.js";
import { consultarEstado as consultarOllama } from "./llm/ollama.js";
import { CONFUNDIBLES, TOP_NPM, TOP_PYPI, buscarTyposquatting, ANTIGUEDAD_MINIMA_TYPOSQUAT_DIAS } from "./analizadores/dependencias.js";
import { normalizarNombre } from "./util.js";

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
    const hallazgos: import("../shared/contrato.js").Finding[] = [];
    const motivos: string[] = [];

    const topList = ecosistema === "npm" ? TOP_NPM : TOP_PYPI;
    const confundible = CONFUNDIBLES[normalizarNombre(nombre)];
    // Un paquete con más de 1 año en el registro no es typosquatting.
    const esAntiguo =
      resultado.diasCreacion !== undefined &&
      resultado.diasCreacion > ANTIGUEDAD_MINIMA_TYPOSQUAT_DIAS;
    const typosquat = confundible || esAntiguo ? null : buscarTyposquatting(nombre, topList);
    const sugerencia: string | undefined = confundible?.sugerencia ?? typosquat ?? undefined;

    // Mismos chequeos que analizarDependencias (dep-paquete-alucinado,
    // dep-paquete-confundible, dep-typosquatting, dep-paquete-nuevo),
    // reutilizados acá para que check_package (MCP) dé el mismo resultado
    // que un escaneo completo del package.json.
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
    } else if (confundible) {
      motivos.push(confundible.descripcion);
      hallazgos.push({
        id: `verificar-confundible:${ecosistema}:${nombre}`,
        modulo: "dependencias",
        regla: "dep-paquete-confundible",
        titulo: "Dependencia con nombre confundible",
        severidad: "alta",
        determinista: true,
        archivo: `verificarPaquete:${ecosistema}:${nombre}`,
        evidencia: nombre,
        explicacion: confundible.descripcion,
        remediacion: confundible.sugerencia ? [`Reemplazar por ${confundible.sugerencia}`] : undefined,
      });
    } else if (typosquat) {
      const explicacion = `El nombre "${nombre}" es similar al paquete popular "${typosquat}". Esto puede ser typosquatting.`;
      motivos.push(explicacion);
      hallazgos.push({
        id: `verificar-typosquat:${ecosistema}:${nombre}`,
        modulo: "dependencias",
        regla: "dep-typosquatting",
        titulo: "Posible typosquatting",
        severidad: "alta",
        determinista: true,
        archivo: `verificarPaquete:${ecosistema}:${nombre}`,
        evidencia: nombre,
        explicacion,
        remediacion: [`Reemplazar por ${typosquat}`],
      });
    } else if (resultado.existe === true) {
      const esNuevo = resultado.diasCreacion !== undefined && resultado.diasCreacion < 30;
      const esPocoUsado = resultado.descargasSemanales !== undefined && resultado.descargasSemanales < 100;
      if (esNuevo || esPocoUsado) {
        const explicacion = esNuevo
          ? "El paquete tiene menos de 30 días de existencia. Podría ser malicioso."
          : "El paquete tiene menos de 100 descargas semanales. Podría ser malicioso o abandonado.";
        motivos.push(explicacion);
        hallazgos.push({
          id: `verificar-nuevo:${ecosistema}:${nombre}`,
          modulo: "dependencias",
          regla: "dep-paquete-nuevo",
          titulo: esNuevo ? "Paquete muy reciente" : "Paquete con pocas descargas",
          severidad: "media",
          determinista: true,
          archivo: `verificarPaquete:${ecosistema}:${nombre}`,
          evidencia: nombre,
          explicacion,
        });
      }
    }

    // No se pudo verificar (offline)
    if (resultado.existe === null) {
      motivos.push("No se pudo verificar el paquete (modo offline). Revisá manualmente antes de instalar.");
    }

    const bloqueado = resultado.existe === false;
    const requiereConfirmacion = !bloqueado && (resultado.existe === null || hallazgos.length > 0);

    return {
      ecosistema,
      nombre,
      existe: resultado.existe,
      resultado: bloqueado ? "bloqueado" : requiereConfirmacion ? "requiere_confirmacion" : "permitido",
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