// src/shared/contrato.ts
// Contrato compartido entre el Motor (parte A), la Plataforma (parte B) y el front.
// Congelado desde el inicio. Cualquier cambio se acuerda entre las dos partes
// y se avisa al front antes de hacerlo.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const Modulo = z.enum(["instrucciones", "unicode", "dependencias", "secretos"]);
export type Modulo = z.infer<typeof Modulo>;

export const Severidad = z.enum(["critica", "alta", "media", "baja"]);
export type Severidad = z.infer<typeof Severidad>;

export const Veredicto = z.enum(["liberado", "revisar", "retenido"]);
export type Veredicto = z.infer<typeof Veredicto>;

export const EstadoEtapa = z.enum(["pendiente", "en_curso", "lista", "error"]);
export type EstadoEtapa = z.infer<typeof EstadoEtapa>;

// "ingesta" la emite la Plataforma (B). El resto las emite el Motor (A).
export const NombreEtapa = z.enum([
  "ingesta",
  "instrucciones",
  "unicode",
  "dependencias",
  "secretos",
  "triage_ia",
  "veredicto",
]);
export type NombreEtapa = z.infer<typeof NombreEtapa>;

export const Ecosistema = z.enum(["npm", "pypi"]);
export type Ecosistema = z.infer<typeof Ecosistema>;

// ─── Hallazgos ──────────────────────────────────────────────────────────────

export const AnalisisIA = z.object({
  clasificacion: z.enum(["malicioso", "sospechoso", "benigno"]),
  confianza: z.number().min(0).max(1),
  intentoManipulacion: z.boolean(),
});
export type AnalisisIA = z.infer<typeof AnalisisIA>;

export const Finding = z.object({
  id: z.string(),
  modulo: Modulo,
  regla: z.string(),                          // ej. "unicode-tags-oculto"
  titulo: z.string(),                         // corto y legible
  severidad: Severidad,
  determinista: z.boolean(),                  // true = el LLM no puede bajarla
  archivo: z.string(),                        // ruta relativa a la raíz analizada
  linea: z.number().int().positive().optional(),
  commit: z.string().optional(),              // solo secretos en historial
  evidencia: z.string().max(500),             // texto plano, enmascarado y truncado
  evidenciaDecodificada: z.string().max(500).optional(), // solo unicode
  explicacion: z.string().optional(),         // en español
  remediacion: z.array(z.string()).optional(),
  analisisIA: AnalisisIA.optional(),
  sinEvaluar: z.boolean().optional(),         // necesitaba IA y no se pudo evaluar
});
export type Finding = z.infer<typeof Finding>;

// ─── Escaneos ───────────────────────────────────────────────────────────────

export const Etapa = z.object({
  nombre: NombreEtapa,
  estado: EstadoEtapa,
  duracionMs: z.number().optional(),
  error: z.string().optional(),
});
export type Etapa = z.infer<typeof Etapa>;

export const Resumen = z.object({
  porSeveridad: z.record(Severidad, z.number()),
  porModulo: z.record(Modulo, z.number()),
});
export type Resumen = z.infer<typeof Resumen>;

export const Scan = z.object({
  id: z.string(),
  tipo: z.enum(["repo", "paquete"]),
  objetivo: z.string(),                       // URL o "npm:nombre" / "pypi:nombre"
  estado: z.enum(["en_curso", "terminado", "error"]),
  etapas: z.array(Etapa),
  veredicto: Veredicto.optional(),
  resumen: Resumen.optional(),
  hallazgos: z.array(Finding),
  creadoEn: z.string(),                       // ISO 8601
  duracionMs: z.number().optional(),
  error: z.string().optional(),
});
export type Scan = z.infer<typeof Scan>;

export const Health = z.object({
  ollama: z.object({ activo: z.boolean(), modelo: z.string().optional() }),
  gitleaks: z.boolean(),
  offline: z.boolean(),
});
export type Health = z.infer<typeof Health>;

// ─── Agente (MCP) ───────────────────────────────────────────────────────────

export const ResultadoAgente = z.enum(["permitido", "bloqueado", "requiere_confirmacion"]);
export type ResultadoAgente = z.infer<typeof ResultadoAgente>;

export const ResultadoPaquete = z.object({
  ecosistema: Ecosistema,
  nombre: z.string(),
  existe: z.boolean().nullable(),             // null = no se pudo verificar (offline)
  resultado: ResultadoAgente,
  motivos: z.array(z.string()),               // en español, sin contenido del paquete
  sugerencia: z.string().optional(),          // nombre real si parece confundido
  hallazgos: z.array(Finding),
});
export type ResultadoPaquete = z.infer<typeof ResultadoPaquete>;

export const EventoAgente = z.object({
  id: z.string(),
  fecha: z.string(),
  accion: z.enum(["instalar", "abrir_repo"]),
  objetivo: z.string(),
  resultado: ResultadoAgente,
  motivo: z.string().optional(),
  scanId: z.string().optional(),
});
export type EventoAgente = z.infer<typeof EventoAgente>;

// ─── Requests HTTP ──────────────────────────────────────────────────────────

export const CrearScanBody = z.object({ objetivo: z.string().min(1).max(300) });
export const CheckPackageBody = z.object({ ecosistema: Ecosistema, nombre: z.string().min(1).max(214) });
export const CheckRepoBody = z.object({ url: z.string().url() });
export const ErrorHttp = z.object({ error: z.string() });

// Nombres de eventos SSE
export const EVENTOS_SCAN = ["etapa", "hallazgo", "veredicto", "error"] as const;
export const EVENTO_AGENTE = "agente" as const;

// ─── Interfaz del Motor (A implementa, B consume) ───────────────────────────

export type EventoMotor =
  | { tipo: "etapa"; etapa: Etapa }
  | { tipo: "hallazgo"; hallazgo: Finding };

export type ContextoAnalisis = {
  scanId: string;
  tipo: "repo" | "paquete";
  objetivo: string;
  tieneHistorialGit: boolean;                 // false para paquetes descargados
  offline: boolean;
  signal: AbortSignal;
};

export type ResultadoAnalisis = {
  hallazgos: Finding[];
  etapas: Etapa[];                            // sin "ingesta"
  veredicto: Veredicto;
  resumen: Resumen;
};

export type EstadoMotor = {
  ollama: { activo: boolean; modelo?: string };
  gitleaks: boolean;
};

export interface Motor {
  /** Analiza un directorio ya descargado. Nunca ejecuta nada de su contenido. */
  analizarDirectorio(
    dir: string,
    ctx: ContextoAnalisis,
    emitir: (e: EventoMotor) => void,
  ): Promise<ResultadoAnalisis>;

  /** Chequeo rápido de un paquete por nombre, sin IA. Usado por el MCP. */
  verificarPaquete(
    ecosistema: Ecosistema,
    nombre: string,
    opts: { offline: boolean; signal?: AbortSignal },
  ): Promise<ResultadoPaquete>;

  estado(): Promise<EstadoMotor>;
}
