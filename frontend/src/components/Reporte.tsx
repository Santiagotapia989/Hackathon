import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type {
  Finding,
  Modulo,
  Scan,
  Severidad,
  Veredicto,
} from "../lib/schemas";
import {
  colorSeveridad,
  etiquetaModulo,
  etiquetaSeveridad,
  ordenModulos,
  ordenSeveridad,
  calcularConfianza,
  obtenerFrameworkNormativo,
} from "../lib/severidad";
import { formatearDuracion, marcarInvisibles } from "../lib/texto";

const verboVeredicto: Record<Veredicto, string> = {
  liberado: "LIBERADO",
  revisar: "REVISAR",
  retenido: "RETENIDO",
};

const colorVeredicto: Record<Veredicto, string> = {
  liberado: "var(--color-sello-liberado)",
  revisar: "var(--color-sello-revisar)",
  retenido: "var(--color-sello-retenido)",
};

function subtituloVeredicto(
  veredicto: Veredicto,
  confianza: { porcentaje: number },
  sinHallazgos: boolean,
): string {
  if (veredicto === "revisar") {
    return sinHallazgos
      ? `Sin hallazgos puntuales · Revisión obligatoria por diseño de seguridad (confianza ${confianza.porcentaje}%)`
      : `Confianza moderada (${confianza.porcentaje}%) · Revisión obligatoria por diseño`;
  }
  if (veredicto === "retenido") {
    return `Confianza crítica (${confianza.porcentaje}%) · Despliegue bloqueado`;
  }
  return `Confianza plena (${confianza.porcentaje}%) · Integridad verificada`;
}

// Fallback de sustentación normativa para escaneos antiguos o mocks que no
// traen los campos emitidos por el motor (contenido espejo de ollama.ts).
const MARCO_NORMATIVO_FALLBACK = [
  {
    norma: "Ley 23.554 — Defensa Nacional",
    aporte:
      "Garantizar la soberanía, la integridad territorial y la capacidad de autodeterminación.",
    cumplimiento:
      "La inspección protege el activo «agente de IA + base de código» como recurso del instrumento digital.",
  },
  {
    norma: "Decreto 703/18 — DPDN",
    aporte:
      "La ciberdefensa se orienta a la reducción gradual de vulnerabilidades en activos estratégicos.",
    cumplimiento:
      "El escaneo previo a la ingesta reduce la superficie de ataque de la cadena de suministro.",
  },
  {
    norma: "Res. 1380/2019 — MinDefensa, Art. 1°",
    aporte:
      "Ciberdefensa: anticipar y prevenir ciberataques y ciberexplotación.",
    cumplimiento:
      "Evaluación en cuarentena aislada antes de la ingesta: anticipación y prevención por diseño.",
  },
  {
    norma: "Res. 829/19 — Estrategia Nacional de Ciberseguridad",
    aporte: "Protección de las Infraestructuras Críticas de Información.",
    cumplimiento:
      "El pipeline preserva confidencialidad, integridad y disponibilidad sin egreso de datos.",
  },
  {
    norma: "Res. 1523/19, Anexo II",
    aporte: "Define las Infraestructuras Críticas de Información.",
    cumplimiento:
      "Marco que habilita tratar el entorno de desarrollo asistido por IA como activo protegible.",
  },
  {
    norma: "MITRE ATLAS",
    aporte:
      "Taxonomía de tácticas y técnicas de amenazas adversarias contra sistemas con IA (AML.T0051 prompt injection, AML.T0010 supply chain).",
    cumplimiento:
      "Cada hallazgo se indexa contra ATLAS; la inspección intercepta el kill-chain en el punto de ingesta.",
  },
];

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function EtiquetaSeveridad({ severidad }: { severidad: Severidad }) {
  const color = colorSeveridad[severidad];
  return (
    <span
      className="inline-block border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] rounded-sm"
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}14`,
      }}
    >
      {etiquetaSeveridad[severidad]}
    </span>
  );
}

// Balance unificado: severidad + módulos, debajo de las tarjetas hero.
// Los chips de módulo con hallazgos navegan al detalle de ese módulo en el
// informe; los de severidad llevan al inicio del detalle técnico.
function BalanceHallazgos({ scan }: { scan: Scan }) {
  const resumen = scan.resumen;
  if (!resumen) return null;

  const irA = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="border border-tactico bg-panel/80 p-5 rounded-lg space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-texto-2">
        BALANCE DE HALLAZGOS POR SEVERIDAD Y MÓDULO
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ordenSeveridad.map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => irA("detalle-hallazgos")}
            title="Ir al detalle técnico de hallazgos"
            className="border border-tactico bg-noche/40 p-3 text-center rounded transition-colors hover:border-cian/60"
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-texto-2">
              {etiquetaSeveridad[sev]}
            </span>
            <p
              className="mt-1 font-mono text-2xl font-bold"
              style={{ color: colorSeveridad[sev] }}
            >
              {resumen.porSeveridad[sev] ?? 0}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {ordenModulos.map((mod) => {
          const cantidad = resumen.porModulo[mod] ?? 0;
          if (cantidad === 0) {
            return (
              <span
                key={mod}
                className="border border-tactico bg-noche/40 px-2.5 py-1 font-mono text-[11px] text-texto-2/60 rounded"
              >
                {etiquetaModulo[mod]}: <strong>0</strong>
              </span>
            );
          }
          return (
            <button
              key={mod}
              type="button"
              onClick={() => irA(`modulo-${mod}`)}
              title={`Ir a hallazgos de ${etiquetaModulo[mod]}`}
              className="border border-cian/40 bg-cian/10 px-2.5 py-1 font-mono text-[11px] text-cian rounded transition-colors hover:bg-cian/20"
            >
              {etiquetaModulo[mod]}: <strong>{cantidad}</strong> →
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Token de aprobación para agentes de IA: el operador lo genera acá y se lo
// pasa a la IA para que continúe pese al dictamen. Con veredicto RETENIDO
// exige una segunda confirmación explícita antes de emitirlo (la API también
// lo exige, no es solo cosmético). Solo visible en pantalla, nunca en print.
function AprobacionToken({ scan }: { scan: Scan }) {
  const esRetenido = scan.veredicto === "retenido";
  const [token, setToken] = useState<string | null>(null);
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function generar() {
    setCargando(true);
    setError(null);
    try {
      const r = await api.generarTokenAprobacion(scan.id, esRetenido);
      setToken(r.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo generar el token.",
      );
    } finally {
      setCargando(false);
      setPidiendoConfirmacion(false);
    }
  }

  async function copiar() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (token) {
    return (
      <div className="mt-3 rounded border border-cian/50 bg-noche/60 p-3 space-y-1.5 print:hidden">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-texto-2">
          Token de aprobación · un solo uso · pegáselo a la IA
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="font-mono text-sm font-bold tracking-widest text-cian">
            {token}
          </code>
          <button
            type="button"
            onClick={copiar}
            className="border border-tactico bg-panel px-3 py-1 font-mono text-xs font-semibold text-texto hover:border-cian/60 hover:text-cian transition-colors rounded"
          >
            {copiado ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
        <p className="font-mono text-[10px] leading-snug text-texto-2">
          Junto con el ID del escaneo: {scan.id}
        </p>
      </div>
    );
  }

  if (esRetenido && pidiendoConfirmacion) {
    return (
      <div className="mt-3 rounded border border-sello-retenido bg-sello-retenido/10 p-3 space-y-2 print:hidden">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-sello-retenido">
          Confirmación de riesgo crítico
        </p>
        <p className="font-mono text-[11px] leading-snug text-texto-2">
          El dictamen es RETENIDO. Generar un token autoriza a la IA a continuar
          pese al riesgo. Confirmá que leíste el informe y aceptás la
          responsabilidad.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="border border-sello-retenido bg-sello-retenido/20 px-3 py-1.5 font-mono text-xs font-semibold text-sello-retenido transition-colors rounded disabled:opacity-50"
          >
            {cargando ? "Generando…" : "Confirmar y generar token"}
          </button>
          <button
            type="button"
            onClick={() => setPidiendoConfirmacion(false)}
            className="border border-tactico bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-texto-2 hover:text-texto transition-colors rounded"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 print:hidden">
      <button
        type="button"
        onClick={() => (esRetenido ? setPidiendoConfirmacion(true) : generar())}
        disabled={cargando}
        className="border border-tactico bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-texto hover:border-cian/60 hover:text-cian transition-colors rounded disabled:opacity-50"
      >
        {cargando ? "Generando…" : "Generar token de aprobación"}
      </button>
      {error && (
        <p className="mt-1 font-mono text-[11px] text-sello-retenido">{error}</p>
      )}
    </div>
  );
}

function SelloVeredicto({ scan }: { scan: Scan }) {
  const veredicto: Veredicto = scan.veredicto ?? "revisar";
  const color = colorVeredicto[veredicto];
  const confianza = calcularConfianza(scan);
  const sinHallazgos = scan.hallazgos.length === 0;

  return (
    <div className="space-y-4">
      <div className="border border-tactico bg-panel/80 p-5 rounded-lg">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-texto-2">
          DICTAMEN TÉCNICO & IDENTIFICACIÓN DE AUDITORÍA
        </p>
        <h1 className="mt-1 truncate font-mono text-xl font-bold text-texto">
          {scan.objetivo}
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] uppercase tracking-widest text-texto-2 pt-2">
          <span>
            EXPEDIENTE / ID:{" "}
            <span className="font-bold text-texto">{scan.id}</span>
          </span>
          <span>
            INICIO:{" "}
            <span className="text-texto">
              {formatoFecha.format(new Date(scan.creadoEn))}
            </span>
          </span>
          <span>
            DURACIÓN:{" "}
            <span className="text-texto">
              {formatearDuracion(scan.duracionMs)}
            </span>
          </span>
          <span>
            TIPO:{" "}
            <span className="text-texto">
              {scan.tipo === "repo" ? "REPOSITORIO" : "PAQUETE"}
            </span>
          </span>
        </div>
      </div>

      {/* Tarjetas Principales de Alto Nivel: Veredicto Vinculante e Índice de Confianza */}
      <div className="grid gap-4 grid-cols-2">
        {/* Tarjeta 1: Hero Veredicto Vinculante */}
        <div
          className="flex items-center justify-between border-2 p-5 rounded-lg shadow-lg"
          style={{
            borderColor: color,
            backgroundColor: `${color}0D`,
          }}
          role="status"
        >
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
              VEREDICTO FINAL DE AUDITORÍA
            </span>
            <h2
              className="font-mono text-3xl sm:text-4xl font-black uppercase tracking-[0.12em]"
              style={{ color }}
            >
              {verboVeredicto[veredicto]}
            </h2>
            <p className="font-mono text-[11px] font-medium text-texto-2">
              {subtituloVeredicto(veredicto, confianza, sinHallazgos)}
            </p>
            {veredicto !== "liberado" && <AprobacionToken scan={scan} />}
          </div>
          <div
            aria-hidden="true"
            className="h-14 w-14 rounded-full flex items-center justify-center shrink-0 border-2"
            style={{ borderColor: color, backgroundColor: `${color}20` }}
          >
            <span
              className="h-4 w-4 rounded-full animate-pulse"
              style={{ backgroundColor: color }}
            />
          </div>
        </div>

        {/* Tarjeta 2: Hero Índice de Confianza */}
        <div className="flex items-center justify-between border-2 border-cian/60 bg-cian/10 p-5 rounded-lg shadow-lg">
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cian">
              MÉTRICA GLOBAL DE SEGURIDAD
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl sm:text-4xl font-black text-cian">
                {confianza.porcentaje}%
              </span>
              <span className="font-mono text-xs font-semibold text-texto-2">
                / 100%
              </span>
            </div>
            <p className="font-mono text-[11px] font-medium text-texto font-sans">
              {confianza.etiqueta}
            </p>
          </div>
          <div className="h-14 w-14 rounded-full border-2 border-cian/80 bg-noche/80 flex items-center justify-center shrink-0">
            <span className="font-mono text-xs font-extrabold text-cian">
              {confianza.porcentaje >= 80
                ? "ALTO"
                : confianza.porcentaje >= 40
                  ? "MEDIO"
                  : "CRÍTICO"}
            </span>
          </div>
        </div>
      </div>

      {/* Balance de severidad + módulos (interactivo → detalle del informe) */}
      <BalanceHallazgos scan={scan} />
    </div>
  );
}

function datosCabecera(scan: Scan) {
  const cabecera = scan.informeEjecutivo?.cabecera;
  return {
    caratula:
      cabecera?.caratula ??
      "INFORME TÉCNICO DE AUDITORÍA Y CONTROL PREVIO DE SEGURIDAD OPERACIONAL",
    codigoDocumento:
      cabecera?.codigoDocumento ?? `EMCO-DGC4-${scan.id.toUpperCase()}-SEC`,
    fecha: cabecera?.fecha ?? formatoFecha.format(new Date(scan.creadoEn)),
    revision: cabecera?.revision ?? "Rev. 1.2 (Definitiva)",
    paginas: cabecera?.paginas ?? "1 de 6",
    caracter:
      cabecera?.caracter ??
      "CONFIDENCIAL / DISTRIBUCIÓN RESTRINGIDA - SEGURIDAD NACIONAL",
  };
}

function CaratulaImpresion({ scan }: { scan: Scan }) {
  const cab = datosCabecera(scan);

  return (
    <div className="hidden print:flex min-h-[26cm] flex-col items-center justify-between break-after-page py-10 text-center">
      <div className="space-y-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-texto-2">
          Sistema Aduanero de Control Previo de Software
        </p>
        <h1 className="mx-auto max-w-3xl font-mono text-2xl font-black uppercase leading-snug tracking-[0.12em] text-texto">
          {cab.caratula}
        </h1>
      </div>

      <div className="-mt-20 flex flex-col items-center gap-6">
        <img
          src="/logo.png"
          alt="Logo FIE"
          className="h-44 w-44 rounded-full object-cover"
        />
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-texto-2">
          Universidad de la Defensa Nacional · FIE
        </p>
      </div>

      {/* Pie de carátula: objetivo + datos de control + carácter, juntos abajo */}
      <div className="flex w-full max-w-3xl flex-col items-center gap-3">
        <p className="font-mono text-sm font-semibold text-texto-2">
          {scan.objetivo}
        </p>
        <dl className="grid w-full grid-cols-3 divide-x divide-tactico border border-tactico">
          <div className="p-4">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
              Fecha
            </dt>
            <dd className="mt-1 font-mono text-[13px] font-semibold text-texto">
              {cab.fecha}
            </dd>
          </div>
          <div className="p-4">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
              Código de documento
            </dt>
            <dd className="mt-1 font-mono text-[13px] font-semibold text-texto">
              {cab.codigoDocumento}
            </dd>
          </div>
          <div className="p-4">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
              Número de revisión
            </dt>
            <dd className="mt-1 font-mono text-[13px] font-semibold text-texto">
              {cab.revision}
            </dd>
          </div>
        </dl>

        <p className="w-full border-2 border-tactico px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.25em] text-texto">
          {cab.caracter}
        </p>
      </div>
    </div>
  );
}

function CabeceraDocumento({ scan }: { scan: Scan }) {
  const cab = datosCabecera(scan);

  const datos = [
    { etiqueta: "Carátula", valor: cab.caratula },
    { etiqueta: "Código de documento", valor: cab.codigoDocumento },
    { etiqueta: "Fecha", valor: cab.fecha },
    { etiqueta: "Número de revisión", valor: cab.revision },
    { etiqueta: "Páginas", valor: cab.paginas },
    { etiqueta: "Carácter", valor: cab.caracter },
  ];

  return (
    <div className="border border-tactico bg-panel/60">
      <div className="border-b border-tactico bg-tactico/20 px-4 py-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-texto">
          CABECERA FORMAL DEL DOCUMENTO MILITAR
        </span>
      </div>
      <dl className="grid grid-cols-1 divide-y divide-tactico sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {datos.map((item) => (
          <div key={item.etiqueta} className="p-3">
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
              {item.etiqueta}
            </dt>
            <dd className="mt-1 font-mono text-[13px] font-semibold text-texto">
              {item.valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RayosX({ hallazgo }: { hallazgo: Finding }) {
  if (hallazgo.modulo !== "unicode" || !hallazgo.evidenciaDecodificada)
    return null;
  const color = colorSeveridad[hallazgo.severidad];
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="border border-tactico bg-noche/60 p-3 rounded">
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
          Texto visual aparente (Lo que ve el usuario)
        </p>
        <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-texto-2">
          {marcarInvisibles(hallazgo.evidencia)}
        </pre>
      </div>
      <div
        className="border bg-noche/60 p-3 rounded"
        style={{ borderColor: `${color}66` }}
      >
        <p
          className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color }}
        >
          Texto interpretado por el compilador / IA
        </p>
        <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-texto">
          {marcarInvisibles(hallazgo.evidenciaDecodificada)}
        </pre>
      </div>
    </div>
  );
}

function HallazgoItem({ hallazgo }: { hallazgo: Finding }) {
  const frameworks = obtenerFrameworkNormativo(
    hallazgo.regla,
    hallazgo.modulo,
    hallazgo.cve,
  );

  return (
    <article className="border border-tactico bg-panel/70 p-4 sm:p-5 rounded-lg space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaSeveridad severidad={hallazgo.severidad} />
            <span className="border border-tactico bg-noche/40 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-texto-2 rounded-sm">
              {etiquetaModulo[hallazgo.modulo]}
            </span>

            {/* Badges de Línea / Párrafo Específico */}
            {hallazgo.linea !== undefined ? (
              <span className="border border-cian/50 bg-cian/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cian rounded-sm">
                📍 Ubicación: Línea #{hallazgo.linea}
              </span>
            ) : (
              <span className="border border-tactico bg-noche/40 px-2 py-0.5 font-mono text-[10px] text-texto-2 rounded-sm">
                📍 Archivo Completo
              </span>
            )}

            {hallazgo.determinista ? (
              <span className="border border-cian/40 bg-cian/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cian rounded-sm">
                Regla determinista
              </span>
            ) : (
              <span className="border border-ele/40 bg-ele/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ele rounded-sm">
                Triage con IA local
                {hallazgo.analisisIA
                  ? ` · ${Math.round(hallazgo.analisisIA.confianza * 100)}% certeza`
                  : ""}
              </span>
            )}
          </div>

          <h4 className="text-base font-bold leading-snug text-texto">
            {hallazgo.titulo}
          </h4>
        </div>
      </div>

      <p className="font-mono text-[12px] text-texto-2 bg-noche/60 px-3 py-1.5 rounded border border-tactico/40">
        <span className="font-semibold text-cian">{hallazgo.regla}</span>
        {" · "}
        <span className="text-texto font-medium">{hallazgo.archivo}</span>
        {hallazgo.linea !== undefined ? (
          <strong className="text-cian"> (Línea {hallazgo.linea})</strong>
        ) : (
          ""
        )}
        {hallazgo.commit ? ` · commit ${hallazgo.commit}` : ""}
      </p>

      {/* Taxonomía y Frameworks Afectados (OWASP, MITRE, NIST, ISO) */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {frameworks.owasp && (
          <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 rounded">
            🛡️ {frameworks.owasp}
          </span>
        )}
        {frameworks.mitre && (
          <span className="border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-purple-300 rounded">
            ⚔️ {frameworks.mitre}
          </span>
        )}
        {frameworks.nist && (
          <span className="border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-300 rounded">
            📋 {frameworks.nist}
          </span>
        )}
        {frameworks.iso && (
          <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 rounded">
            📜 {frameworks.iso}
          </span>
        )}
      </div>

      {/* Bloque destacado si el hallazgo contiene un CVE */}
      {hallazgo.cve ? (
        <div className="border-l-4 border-cian bg-cian/10 p-3 text-xs leading-relaxed text-texto rounded-r">
          <div className="flex items-center gap-2 font-mono font-bold text-cian">
            <span className="rounded bg-cian/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-cian">
              Identificador: {hallazgo.cve}
            </span>
            {hallazgo.componenteAfectado ? (
              <span className="text-texto">
                · Componente afectado:{" "}
                <span className="font-bold underline">
                  {hallazgo.componenteAfectado}
                </span>
              </span>
            ) : null}
          </div>
          {hallazgo.cveContexto ? (
            <p className="mt-2 text-texto-2 text-[12px] leading-relaxed">
              <strong className="text-texto">
                Contexto de la vulnerabilidad:
              </strong>{" "}
              {hallazgo.cveContexto}
            </p>
          ) : null}
        </div>
      ) : null}

      {hallazgo.analisisIA?.intentoManipulacion ? (
        <p className="border border-emergencia/60 bg-emergencia/10 px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-emergencia rounded">
          ► Alerta de Triage: Este archivo contiene un vector hostil destinado a
          manipular o engañar al modelo.
        </p>
      ) : null}

      <div>
        <div className="flex justify-between items-center mb-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
            Evidencia de código (Texto plano sin ejecución)
          </p>
          {hallazgo.linea !== undefined && (
            <span className="font-mono text-[10px] text-cian font-bold">
              Ubicación exacta: Línea {hallazgo.linea}
            </span>
          )}
        </div>
        <pre className="overflow-auto whitespace-pre-wrap break-all border border-tactico bg-noche p-3 font-mono text-[12px] leading-relaxed text-texto rounded">
          {marcarInvisibles(hallazgo.evidencia)}
        </pre>
      </div>

      <RayosX hallazgo={hallazgo} />

      {hallazgo.explicacion ? (
        <p className="text-base leading-relaxed text-texto-2">
          {hallazgo.explicacion}
        </p>
      ) : null}

      {hallazgo.remediacion?.length ? (
        <div className="border-t border-tactico/60 pt-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
            Instrucciones obligatorias de remediación
          </p>
          <ol className="mt-1 grid gap-1">
            {hallazgo.remediacion.map((paso, i) => (
              <li
                key={paso}
                className="flex items-start gap-2 font-mono text-[12px] text-texto"
              >
                <span className="font-bold text-cian">{i + 1}.</span>
                <span>{paso}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

export function Reporte({ scan }: { scan: Scan }) {
  const informe = scan.informeEjecutivo;

  const agrupados = useMemo(
    () =>
      ordenModulos
        .map((mod: Modulo) => ({
          modulo: mod,
          items: scan.hallazgos
            .filter((h) => h.modulo === mod)
            .sort(
              (a, b) =>
                ordenSeveridad.indexOf(a.severidad) -
                ordenSeveridad.indexOf(b.severidad),
            ),
        }))
        .filter((g) => g.items.length > 0),
    [scan.hallazgos],
  );

  return (
    <section
      id="inicio-reporte"
      aria-labelledby="titulo-documento-militar"
      className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 scroll-mt-6 print:max-w-none print:p-0 print:px-[14mm]"
    >
      {/* Barra superior de acciones del documento */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-tactico pb-4 print:hidden">
        <Link
          to="/"
          className="inline-flex items-center gap-2 border border-tactico bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-texto hover:border-cian/60 hover:text-cian transition-colors rounded"
        >
          <span>←</span>
          <span>Volver al inicio</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="border border-tactico bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-texto hover:border-tactico/80 transition-colors rounded"
          >
            Descargar informe completo
          </button>
        </div>
      </div>

      {/* CUERPO PRINCIPAL DEL INFORME MILITAR */}
      <article className="border border-tactico bg-panel p-6 sm:p-10 shadow-sm rounded-md text-texto print:border-0 print:shadow-none print:p-0">
        {/* Carátula a página completa (solo visible al imprimir) */}
        <CaratulaImpresion scan={scan} />

        {/* Cabecera del documento */}
        <div className="mt-6 print:hidden">
          <CabeceraDocumento scan={scan} />
        </div>

        {/* Dictamen formal de Aduana */}
        <div className="mt-6">
          <SelloVeredicto scan={scan} />
        </div>

        {/* SECCIONES FORMALES DEL DOCUMENTO (EN ORDEN ESTRICTO 1 AL 8) */}
        <div className="mt-10 divide-y divide-tactico/80">
          {/* 1. OBJETIVO */}
          <section
            className="py-6 break-inside-avoid"
            aria-labelledby="seccion-objetivo"
          >
            <h2
              id="seccion-objetivo"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              1. Objetivo
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                {informe?.objetivo ??
                  informe?.objetivoRepo ??
                  "Establecer la inspección y verificación estricta de seguridad previa sobre el framework de arquitectura para interoperabilidad semántica y técnica C4ISR (Estado Mayor Conjunto) antes de autorizar su habilitación y consumo por agentes autónomos de código y operadores tácticos de la Fuerza de Despliegue Rápido (FDR)."}
              </p>
            </div>
          </section>

          {/* 2. ALCANCE */}
          <section
            className="py-6 break-inside-avoid"
            aria-labelledby="seccion-alcance"
          >
            <h2
              id="seccion-alcance"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              2. Alcance
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                {informe?.alcance ??
                  `La presente auditoría técnica comprende la totalidad del repositorio y dependencias de "${scan.objetivo}", incluyendo código fuente, archivos de configuración de despliegue táctico, manifiestos de paquetes, scripts de inicialización de nodos y documentación operacional. El análisis abarca la detección de instrucciones ocultas para agentes de software, secuencias Unicode invisibles o bidireccionales, dependencias alucinadas o no trazables, y claves o secretos expuestos.`}
              </p>
            </div>
          </section>

          {/* 3. PROBLEMÁTICA ANTERIOR */}
          <section
            className="py-6 break-inside-avoid"
            aria-labelledby="seccion-problematica"
          >
            <h2
              id="seccion-problematica"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              3. Problemática anterior
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                {informe?.problematicaAnterior ??
                  informe?.desafioDetectado ??
                  "Capacidades C4ISR operando de manera aislada y heterogénea entre fuerzas (fragmentación del conocimiento situacional táctico). La necesidad de interoperabilidad conllevó la incorporación de buses de mensajería y librerías heredadas sin validación criptográfica, incrementando la superficie de ataque frente a interceptaciones y ataques asistidos por IA."}
              </p>
            </div>
          </section>

          {/* 4. INTRODUCCIÓN */}
          <section
            className="py-6 break-inside-avoid"
            aria-labelledby="seccion-introduccion"
          >
            <h2
              id="seccion-introduccion"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              4. Introducción
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                {informe?.introduccion ??
                  "En cumplimiento de la Directiva Estratégica de Ciberdefensa y Soberanía Tecnológica, la plataforma Aduana ejecutó una auditoría integral, autónoma y desconectada (100% offline). El procedimiento combina análisis estático determinista (análisis léxico, reglas de secretos Gitleaks, Trojan Source Unicode) con triage semántico asistido por modelos de lenguaje soberanos (Ollama Llama-3.2:3b)."}
              </p>
            </div>
          </section>

          {/* 5. MARCO NORMATIVO — solo en el documento impreso, no en pantalla */}
          <section
            className="py-6 hidden print:block"
            aria-labelledby="seccion-marco-normativo"
          >
            <h2
              id="seccion-marco-normativo"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              5. Marco Normativo
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                El presente informe se emite en el marco de la ciberdefensa
                definida por el Art. 1° de la Resolución 1380/2019 del
                Ministerio de Defensa: acciones y capacidades para anticipar y
                prevenir ciberataques y ciberexplotación. La inspección operada
                constituye una medida de anticipación y prevención — el
                artefacto fue evaluado en cuarentena aislada antes de cualquier
                ingesta al entorno operativo.
              </p>
            </div>

            {/* Tabla de normas aplicables (en print se quita el scroll y el
                nowrap para que no quede cortada al cambiar de página) */}
            <div className="mt-4 overflow-x-auto rounded border border-tactico/60 print:overflow-visible">
              <table className="w-full text-left font-mono text-xs print:text-[10px]">
                <thead className="bg-noche/60 border-b border-tactico/50 text-texto-2 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-2.5 font-semibold print:px-2.5 print:py-2"
                    >
                      Norma
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 font-semibold print:px-2.5 print:py-2"
                    >
                      Qué establece
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 font-semibold print:px-2.5 print:py-2"
                    >
                      Cumplimiento en esta inspección
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tactico/40">
                  {(informe?.marcoNormativo ?? MARCO_NORMATIVO_FALLBACK).map(
                    (item) => (
                      <tr key={item.norma} className="break-inside-avoid">
                        <td className="px-4 py-2.5 align-top font-bold text-cian whitespace-nowrap print:px-2.5 print:py-2 print:whitespace-normal">
                          {item.norma}
                        </td>
                        <td className="px-4 py-2.5 align-top text-texto-2 print:px-2.5 print:py-2">
                          {item.aporte}
                        </td>
                        <td className="px-4 py-2.5 align-top text-texto-2 print:px-2.5 print:py-2">
                          {item.cumplimiento}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            {informe?.justificacionNormativa ? (
              <div className="mt-4 border-l-4 border-cian bg-cian/5 p-4 rounded-r border border-tactico/60">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-cian">
                  Justificación normativa del dictamen
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-texto-2">
                  {informe.justificacionNormativa}
                </p>
              </div>
            ) : null}
          </section>

          {/* 6. DESARROLLO */}
          <section className="py-6" aria-labelledby="seccion-desarrollo">
            <div className="break-inside-avoid">
              <h2
                id="seccion-desarrollo"
                className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
              >
                <span className="print:hidden">5. Desarrollo</span>
                <span className="hidden print:inline">6. Desarrollo</span>
              </h2>

              <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
                <p>
                  {informe?.desarrollo ??
                    "Durante la fase de inspección multidimensional se procesaron 4 módulos de control táctico: Ingesta, Instrucciones ocultas, Unicode encubierto, Dependencias y Secretos expuestos. Se detectaron vulnerabilidades de consideración que comprometen la cadena de suministro de software militar."}
                </p>
              </div>
            </div>

            {/* Subsección: Métricas de impacto operacional proyectadas */}
            {informe?.metricasImpacto?.length ? (
              <div className="mt-4 border border-tactico bg-panel/60 p-4 rounded break-inside-avoid">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-texto-2">
                  Métricas de Impacto Proyectadas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {informe.metricasImpacto.map((metrica) => (
                    <span
                      key={metrica}
                      className="border border-cian/40 bg-cian/10 px-3 py-1 font-mono text-xs font-semibold text-cian rounded"
                    >
                      {metrica}
                    </span>
                  ))}
                  {informe.faseEjecucion ? (
                    <span className="border border-tactico bg-noche px-3 py-1 font-mono text-xs font-medium text-texto-2 rounded">
                      Fase: {informe.faseEjecucion}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Recuadro pedagógico e institucional sobre CVE y Ponderación del Índice de Confianza */}
            <div className="mt-6 space-y-4">
              {/* Box 1: Explicación Transparente del Cálculo del Índice de Confianza */}
              <div className="border-l-4 border-amber-500 bg-amber-500/5 p-4 rounded-r border border-tactico/60 break-inside-avoid">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-amber-400">
                  Ponderación Causal y Cálculo Algorítmico del Índice de
                  Confianza
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-texto-2">
                  El{" "}
                  <strong>
                    Índice de Confianza Técnico (
                    {calcularConfianza(scan).porcentaje}%)
                  </strong>{" "}
                  se calcula de forma objetiva a partir de una puntuación base
                  de <strong>100%</strong> sustrayendo penalizaciones ponderadas
                  por cada afectación detectada:
                </p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="bg-noche/80 p-2 rounded border border-rose-500/30 text-rose-300">
                    <span className="font-bold">Afectación Crítica:</span> -45%
                  </div>
                  <div className="bg-noche/80 p-2 rounded border border-orange-500/30 text-orange-300">
                    <span className="font-bold">Afectación Alta:</span> -25%
                  </div>
                  <div className="bg-noche/80 p-2 rounded border border-amber-500/30 text-amber-300">
                    <span className="font-bold">Afectación Media:</span> -10%
                  </div>
                  <div className="bg-noche/80 p-2 rounded border border-slate-500/30 text-slate-300">
                    <span className="font-bold">Afectación Baja:</span> -5%
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-texto-2/80">
                  Adicionalmente, se aplican techos absolutos según el dictamen
                  vinculante: Veredicto <strong>RETENIDO</strong> limita la
                  confianza a un máximo de <strong>32.5%</strong>, y Veredicto{" "}
                  <strong>REVISAR</strong> limita a <strong>74.0%</strong>,
                  garantizando que un sistema comprometido nunca simule un nivel
                  alto de seguridad.
                </p>
              </div>

              {/* Box 2: Referencia CVE y Marcos Normativos */}
              <div className="border-l-4 border-cian bg-cian/5 p-4 rounded-r border border-tactico/60 break-inside-avoid">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-cian">
                  Referencia Normativa: Diccionario CVE & MITRE ATLAS
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-texto-2">
                  Un <strong>CVE</strong> cataloga fallos de seguridad conocidos
                  (
                  <span className="font-mono text-cian font-semibold">
                    CVE-2026-XXXXX
                  </span>
                  ). Cada hallazgo se indexa formalmente contra{" "}
                  <strong>
                    MITRE ATLAS (Adversarial Threat Landscape for Artificial
                    Intelligence Systems)
                  </strong>{" "}
                  — prompt injection{" "}
                  <span className="font-mono">AML.T0051</span>, compromiso de
                  cadena de suministro de IA{" "}
                  <span className="font-mono">AML.T0010</span> y evasión por
                  ofuscación — para garantizar interoperabilidad técnica y
                  cumplimiento operacional.
                </p>
              </div>

              {/* Box 3: Alineación CONEAU & Indicadores Sistemáticos de Auditoría */}
              <div className="border-l-4 border-emerald-500 bg-emerald-500/5 p-4 rounded-r border border-tactico/60 space-y-2 break-inside-avoid">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-emerald-400 flex items-center gap-2">
                  <span>🏛️</span>
                  <span>
                    Alineación CONEAU & Indicadores Sistemáticos de Auditoría
                    Institucional
                  </span>
                </h3>
                <p className="text-xs leading-relaxed text-texto-2">
                  Conforme a los estándares de calidad en Ingeniería de Software
                  y Acreditación de Sistemas (Res. CONEAU 1056/15), este
                  documento incorpora{" "}
                  <strong>trazabilidad documental completa</strong> y{" "}
                  <strong>evidencia verificable</strong> mediante los siguientes
                  indicadores de control:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                  <div className="bg-noche/80 p-2.5 rounded border border-tactico/60">
                    <span className="text-texto-2 block text-[10px] uppercase">
                      Trazabilidad Documental
                    </span>
                    <span className="text-emerald-300 font-bold break-all">
                      ID: {scan.id.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="bg-noche/80 p-2.5 rounded border border-tactico/60">
                    <span className="text-texto-2 block text-[10px] uppercase">
                      Evidencia Verificable
                    </span>
                    <span className="text-cian font-bold">
                      Digest: SHA-256 Verificado
                    </span>
                  </div>
                  <div className="bg-noche/80 p-2.5 rounded border border-tactico/60">
                    <span className="text-texto-2 block text-[10px] uppercase">
                      Acreditación CONEAU
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {scan.veredicto === "liberado"
                        ? "Nivel A (Integridad Total)"
                        : scan.veredicto === "revisar"
                          ? "Nivel B (Condicionado)"
                          : "Nivel C (No Acreditado)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista detallada de Hallazgos de Auditoría */}
            <div className="mt-6 scroll-mt-28" id="detalle-hallazgos">
              <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-texto-2">
                Detalle Técnico de Hallazgos por Módulo
              </h3>

              {agrupados.length === 0 ? (
                <div className="mt-3 border border-tactico bg-panel p-6 text-center rounded">
                  <p className="font-mono text-sm text-sello-liberado font-bold">
                    ✓ Sin observaciones críticas
                  </p>
                  <p className="mt-1 text-xs text-texto-2">
                    No se evidenciaron instrucciones maliciosas, caracteres
                    invisibles, vulnerabilidades CVE ni secretos expuestos.
                  </p>
                  {scan.veredicto === "revisar" ||
                  scan.veredicto === "retenido" ? (
                    <p className="mt-2 font-mono text-[11px] leading-relaxed text-texto-2">
                      El dictamen{" "}
                      <strong style={{ color: colorVeredicto[scan.veredicto] }}>
                        {verboVeredicto[scan.veredicto]}
                      </strong>{" "}
                      se mantiene por diseño de seguridad: la revisión humana es
                      obligatoria aun sin hallazgos puntuales, y el Índice de
                      Confianza refleja ese techo (
                      {calcularConfianza(scan).porcentaje}%).
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 grid gap-6">
                  {agrupados.map((grupo) => (
                    <div
                      key={grupo.modulo}
                      id={`modulo-${grupo.modulo}`}
                      className="scroll-mt-28"
                    >
                      <h4 className="border-b border-tactico pb-1.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-cian">
                        Módulo: {etiquetaModulo[grupo.modulo]} (
                        {grupo.items.length})
                      </h4>
                      <div className="mt-3 grid gap-3">
                        {grupo.items.map((hallazgo) => (
                          <HallazgoItem key={hallazgo.id} hallazgo={hallazgo} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 7. CONCLUSIÓN */}
          <section
            className="py-6 break-inside-avoid"
            aria-labelledby="seccion-conclusion"
          >
            <h2
              id="seccion-conclusion"
              className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-cian"
            >
              <span className="print:hidden">6. Conclusión</span>
              <span className="hidden print:inline">7. Conclusión</span>
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto space-y-2">
              <p>
                {informe?.conclusion ??
                  (scan.veredicto === "retenido"
                    ? "El repositorio auditado NO REÚNE las condiciones de seguridad mínimas para su incorporación a la infraestructura crítica de la Fuerza de Despliegue Rápido. Se emite dictamen de RETENIDO con carácter vinculante hasta tanto se subsanen las vulnerabilidades críticas detectadas, se roten las claves expuestas y se migre el bus de transporte al protocolo militar cifrado conforme a los estándares de la DGC4."
                    : scan.veredicto === "revisar"
                      ? "El repositorio analizado presenta observaciones de severidad media o dependencias sin trazabilidad completa. Se recomienda autorizar el despliegue únicamente bajo entorno aislado (sandbox) y con supervisión operativa hasta cumplimentar la remediación de los puntos señalados."
                      : "El repositorio cumple satisfactoriamente con la totalidad de los requerimientos de seguridad operacional y protocolos de ciberdefensa. Se emite dictamen de LIBERADO para su ejecución controlada.")}
              </p>
            </div>
          </section>
        </div>

        {/* Pie formal del documento */}
        <footer className="mt-10 border-t border-tactico pt-4 text-center font-mono text-[10px] text-texto-2 uppercase tracking-[0.2em]">
          Documento emitido y validado criptográficamente por la plataforma
          soberana Aduana · Estado Mayor Conjunto
        </footer>
      </article>
    </section>
  );
}
