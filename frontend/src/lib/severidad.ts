import type { Modulo, Severidad } from "./schemas";

export const ordenSeveridad: Severidad[] = ["critica", "alta", "media", "baja"];

export const ordenModulos: Modulo[] = [
  "instrucciones",
  "unicode",
  "dependencias",
  "secretos",
];

export const colorSeveridad: Record<Severidad, string> = {
  critica: "#EF4444",
  alta: "#F97316",
  media: "#F59E0B",
  baja: "#94A3B8",
};

export const etiquetaSeveridad: Record<Severidad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const etiquetaModulo: Record<Modulo, string> = {
  instrucciones: "Instrucciones",
  unicode: "Unicode oculto",
  dependencias: "Dependencias",
  secretos: "Secretos",
};