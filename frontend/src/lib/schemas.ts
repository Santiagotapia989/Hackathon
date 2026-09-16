import { z } from "zod";

export const ModuloSchema = z.enum([
  "instrucciones",
  "unicode",
  "dependencias",
  "secretos",
]);
export type Modulo = z.infer<typeof ModuloSchema>;

export const SeveridadSchema = z.enum(["critica", "alta", "media", "baja"]);
export type Severidad = z.infer<typeof SeveridadSchema>;

export const VeredictoSchema = z.enum(["liberado", "revisar", "retenido"]);
export type Veredicto = z.infer<typeof VeredictoSchema>;

export const EstadoEtapaSchema = z.enum([
  "pendiente",
  "en_curso",
  "lista",
  "error",
]);
export type EstadoEtapa = z.infer<typeof EstadoEtapaSchema>;

export const AnalisisIASchema = z.object({
  clasificacion: z.enum(["malicioso", "sospechoso", "benigno"]),
  confianza: z.number().min(0).max(1),
  intentoManipulacion: z.boolean(),
});

export const FindingSchema = z.object({
  id: z.string(),
  modulo: ModuloSchema,
  regla: z.string(),
  titulo: z.string(),
  severidad: SeveridadSchema,
  determinista: z.boolean(),
  archivo: z.string(),
  linea: z.number().optional(),
  commit: z.string().optional(),
  evidencia: z.string(),
  evidenciaDecodificada: z.string().optional(),
  explicacion: z.string().optional(),
  remediacion: z.array(z.string()).optional(),
  analisisIA: AnalisisIASchema.optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const EtapaSchema = z.object({
  nombre: z.enum([
    "ingesta",
    "instrucciones",
    "unicode",
    "dependencias",
    "secretos",
    "triage_ia",
    "veredicto",
  ]),
  estado: EstadoEtapaSchema,
  duracionMs: z.number().optional(),
  error: z.string().optional(),
});
export type Etapa = z.infer<typeof EtapaSchema>;

export const ResumenSchema = z.object({
  porSeveridad: z.record(SeveridadSchema, z.number()),
  porModulo: z.record(ModuloSchema, z.number()),
});
export type Resumen = z.infer<typeof ResumenSchema>;

export const InformeEjecutivoSchema = z.object({
  desafioDetectado: z.string(),
  objetivoRepo: z.string(),
  metricasImpacto: z.array(z.string()),
  faseEjecucion: z.string(),
});
export type InformeEjecutivo = z.infer<typeof InformeEjecutivoSchema>;

export const ScanSchema = z.object({
  id: z.string(),
  tipo: z.enum(["repo", "paquete"]),
  objetivo: z.string(),
  estado: z.enum(["en_curso", "terminado", "error"]),
  etapas: z.array(EtapaSchema),
  veredicto: VeredictoSchema.optional(),
  resumen: ResumenSchema.optional(),
  hallazgos: z.array(FindingSchema),
  creadoEn: z.string(),
  duracionMs: z.number().optional(),
  informeEjecutivo: InformeEjecutivoSchema.optional(),
});
export type Scan = z.infer<typeof ScanSchema>;

export const HealthSchema = z.object({
  ollama: z.object({
    activo: z.boolean(),
    modelo: z.string().optional(),
  }),
  gitleaks: z.boolean(),
  offline: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

export const EventoAgenteSchema = z.object({
  id: z.string(),
  fecha: z.string(),
  accion: z.enum(["instalar", "abrir_repo"]),
  objetivo: z.string(),
  resultado: z.enum(["permitido", "bloqueado", "requiere_confirmacion"]),
  motivo: z.string().optional(),
  scanId: z.string().optional(),
});
export type EventoAgente = z.infer<typeof EventoAgenteSchema>;
