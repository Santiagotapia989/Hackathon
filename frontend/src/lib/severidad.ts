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
  secretos: "Credenciales",
};

export interface FrameworkNormativo {
  owasp?: string;
  mitre?: string;
  nist?: string;
  iso?: string;
}

export function obtenerFrameworkNormativo(
  _reglaId: string,
  modulo: Modulo,
  _cve?: string
): FrameworkNormativo {
  if (modulo === "instrucciones") {
    return {
      owasp: "OWASP LLM01: Prompt Injection",
      mitre: "MITRE ATLAS AML.T0051 (Prompt Injection)",
      nist: "NIST SP 800-53 SI-10 (Information Input Validation)",
      iso: "ISO/IEC 27001 A.14.2.5 (Secure System Architecture)",
    };
  }
  if (modulo === "unicode") {
    return {
      owasp: "OWASP Top 10 A03: Injection (Hidden Control Flow)",
      mitre: "MITRE ATT&CK T1036 (Masquerading / Trojan Source)",
      nist: "NIST SP 800-160 (Software Supply Chain Security)",
      iso: "ISO/IEC 27001 A.14.2.1 (Secure Development Policy)",
    };
  }
  if (modulo === "dependencias") {
    return {
      owasp: "OWASP Top 10 A06: Vulnerable & Outdated Components",
      mitre: "MITRE ATT&CK T1195 (Supply Chain Compromise)",
      nist: "NIST SP 800-161 (Cybersecurity Supply Chain Risk Management)",
      iso: "ISO/IEC 27001 A.12.6.1 (Technical Vulnerability Management)",
    };
  }
  if (modulo === "secretos") {
    return {
      owasp: "OWASP Top 10 A07: Identification & Authentication Failures",
      mitre: "MITRE ATT&CK T1552 (Unsecured Credentials)",
      nist: "NIST SP 800-53 IA-5 (Authenticator Management)",
      iso: "ISO/IEC 27001 A.9.4.3 (Password Management System)",
    };
  }
  return {
    owasp: "OWASP Top 10 Compliance",
    nist: "NIST Cybersecurity Framework v2.0",
  };
}

export function calcularConfianza(scan: {
  veredicto?: string;
  resumen?: { porSeveridad: Record<Severidad, number> };
  hallazgos: Array<{ severidad: Severidad }>;
}): { porcentaje: number; etiqueta: string } {
  if (scan.veredicto === "liberado" && scan.hallazgos.length === 0) {
    return { porcentaje: 99.8, etiqueta: "Certeza Absoluta (Integridad Verificada)" };
  }

  const criticas = scan.resumen?.porSeveridad.critica ?? scan.hallazgos.filter(h => h.severidad === "critica").length;
  const altas = scan.resumen?.porSeveridad.alta ?? scan.hallazgos.filter(h => h.severidad === "alta").length;
  const medias = scan.resumen?.porSeveridad.media ?? scan.hallazgos.filter(h => h.severidad === "media").length;
  const bajas = scan.resumen?.porSeveridad.baja ?? scan.hallazgos.filter(h => h.severidad === "baja").length;

  let penalizacion = (criticas * 45) + (altas * 25) + (medias * 10) + (bajas * 5);
  let resultado = Math.max(12.5, Math.min(99.8, 100 - penalizacion));

  if (scan.veredicto === "retenido") {
    resultado = Math.min(resultado, 32.5);
    return { porcentaje: Number(resultado.toFixed(1)), etiqueta: "Confianza Crítica - Compromiso Severo" };
  }

  if (scan.veredicto === "revisar") {
    resultado = Math.min(resultado, 74.0);
    return { porcentaje: Number(resultado.toFixed(1)), etiqueta: "Confianza Moderada - Requiere Auditoría" };
  }

  return { porcentaje: Number(resultado.toFixed(1)), etiqueta: "Medición de Seguridad Calculada" };
}