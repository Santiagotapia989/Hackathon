import { useMemo } from "react";
import { Link } from "react-router-dom";
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
      className="inline-block border px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest rounded-sm"
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

function SelloVeredicto({ scan }: { scan: Scan }) {
  const veredicto: Veredicto = scan.veredicto ?? "revisar";
  const color = colorVeredicto[veredicto];

  return (
    <div className="flex flex-col gap-4 border border-tactico bg-panel/80 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-widest text-texto-2">
          DICTAMEN TÉCNICO DE ADUANA
        </p>
        <h1 className="mt-1 truncate font-mono text-3xl font-extrabold tracking-tight text-texto md:text-4xl">
          {scan.objetivo}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-widest text-texto-2">
          <span>
            EXPEDIENTE / ID: <span className="font-bold text-texto">{scan.id}</span>
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

      <div
        className="flex items-center gap-3 border-2 px-5 py-3 rounded"
        style={{
          borderColor: color,
          backgroundColor: `${color}0D`,
        }}
        role="status"
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="flex flex-col">
          <span
            className="font-mono text-2xl font-black uppercase tracking-widest"
            style={{ color }}
          >
            {verboVeredicto[veredicto]}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-texto-2">
            Veredicto Vinculante
          </span>
        </div>
      </div>
    </div>
  );
}

function CabeceraDocumento({ scan }: { scan: Scan }) {
  const informe = scan.informeEjecutivo;
  const cabecera = informe?.cabecera;

  const datos = [
    {
      etiqueta: "Carátula",
      valor:
        cabecera?.caratula ??
        "INFORME TÉCNICO DE AUDITORÍA Y CONTROL PREVIO DE SEGURIDAD OPERACIONAL",
    },
    {
      etiqueta: "Código de documento",
      valor: cabecera?.codigoDocumento ?? `EMCO-DGC4-${scan.id.toUpperCase()}-SEC`,
    },
    {
      etiqueta: "Fecha",
      valor:
        cabecera?.fecha ??
        formatoFecha.format(new Date(scan.creadoEn)),
    },
    {
      etiqueta: "Número de revisión",
      valor: cabecera?.revision ?? "Rev. 1.2 (Definitiva)",
    },
    {
      etiqueta: "Páginas",
      valor: cabecera?.paginas ?? "1 de 6",
    },
    {
      etiqueta: "Carácter",
      valor:
        cabecera?.caracter ??
        "CONFIDENCIAL / DISTRIBUCIÓN RESTRINGIDA - SEGURIDAD NACIONAL",
    },
  ];

  return (
    <div className="border border-tactico bg-panel/60">
      <div className="border-b border-tactico bg-tactico/20 px-4 py-2">
        <span className="text-sm font-bold uppercase tracking-wider text-cian">
          CABECERA FORMAL DEL DOCUMENTO MILITAR
        </span>
      </div>
      <dl className="grid grid-cols-1 divide-y divide-tactico sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {datos.map((item) => (
          <div key={item.etiqueta} className="p-3">
            <dt className="font-mono text-xs uppercase tracking-widest text-texto-2">
              {item.etiqueta}
            </dt>
            <dd className="mt-1 font-mono text-xs font-semibold text-texto">
              {item.valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RayosX({ hallazgo }: { hallazgo: Finding }) {
  if (hallazgo.modulo !== "unicode" || !hallazgo.evidenciaDecodificada) return null;
  const color = colorSeveridad[hallazgo.severidad];
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="border border-tactico bg-noche/60 p-3 rounded">
        <p className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-texto-2">
          Texto visual aparente (Lo que ve el usuario)
        </p>
        <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-texto-2">
          {marcarInvisibles(hallazgo.evidencia)}
        </pre>
      </div>
      <div
        className="border bg-noche/60 p-3 rounded"
        style={{ borderColor: `${color}66` }}
      >
        <p
          className="mb-1 font-mono text-xs font-bold uppercase tracking-widest"
          style={{ color }}
        >
          Texto interpretado por el compilador / IA
        </p>
        <pre
          className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-texto"
        >
          {marcarInvisibles(hallazgo.evidenciaDecodificada)}
        </pre>
      </div>
    </div>
  );
}

function HallazgoItem({ hallazgo }: { hallazgo: Finding }) {
  return (
    <article className="border border-tactico bg-panel/70 p-4 sm:p-5 rounded">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaSeveridad severidad={hallazgo.severidad} />
            <span className="border border-tactico bg-noche/40 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest text-texto-2 rounded-sm">
              {etiquetaModulo[hallazgo.modulo]}
            </span>
            {hallazgo.determinista ? (
              <span className="border border-cian/40 bg-cian/10 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-cian rounded-sm">
                Regla determinista
              </span>
            ) : (
              <span className="border border-ele/40 bg-ele/10 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-ele rounded-sm">
                Triage con IA local
                {hallazgo.analisisIA
                  ? ` · ${Math.round(hallazgo.analisisIA.confianza * 100)}% certeza`
                  : ""}
              </span>
            )}
          </div>
          <h4 className="mt-2 text-base font-bold leading-snug text-texto">
            {hallazgo.titulo}
          </h4>
        </div>
      </div>

      <p className="mt-2 font-mono text-xs text-texto-2">
        <span className="font-semibold text-texto-2">{hallazgo.regla}</span>
        {" · "}
        <span className="text-texto font-medium">{hallazgo.archivo}</span>
        {hallazgo.linea !== undefined ? `:${hallazgo.linea}` : ""}
        {hallazgo.commit ? ` · commit ${hallazgo.commit}` : ""}
      </p>

      {/* Bloque destacado si el hallazgo contiene un CVE */}
      {hallazgo.cve ? (
        <div className="mt-3 border-l-4 border-cian bg-cian/10 p-3 text-base leading-relaxed text-texto rounded-r">
          <div className="flex items-center gap-2 font-mono font-bold text-cian">
            <span className="rounded bg-cian/20 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-cian">
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
            <p className="mt-2 text-texto-2 text-sm leading-relaxed">
              <strong className="text-texto">Contexto de la vulnerabilidad:</strong>{" "}
              {hallazgo.cveContexto}
            </p>
          ) : null}
        </div>
      ) : null}

      {hallazgo.analisisIA?.intentoManipulacion ? (
        <p className="mt-3 border border-emergencia/60 bg-emergencia/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-emergencia rounded">
          ► Alerta de Triage: Este archivo contiene un vector hostil destinado a manipular o engañar al modelo.
        </p>
      ) : null}

      <div className="mt-3">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-texto-2">
          Evidencia de código (Texto plano sin ejecución)
        </p>
        <pre className="mt-1 overflow-auto whitespace-pre-wrap break-all border border-tactico bg-noche p-3 font-mono text-xs leading-relaxed text-texto rounded">
          {marcarInvisibles(hallazgo.evidencia)}
        </pre>
      </div>

      <RayosX hallazgo={hallazgo} />

      {hallazgo.explicacion ? (
        <p className="mt-3 text-base leading-relaxed text-texto-2">
          {hallazgo.explicacion}
        </p>
      ) : null}

      {hallazgo.remediacion?.length ? (
        <div className="mt-3 border-t border-tactico/60 pt-2">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-texto-2">
            Instrucciones obligatorias de remediación
          </p>
          <ol className="mt-1 grid gap-1">
            {hallazgo.remediacion.map((paso, i) => (
              <li
                key={paso}
                className="flex items-start gap-2 font-mono text-xs text-texto"
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
  const resumen = scan.resumen;

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
                ordenSeveridad.indexOf(b.severidad)
            ),
        }))
        .filter((g) => g.items.length > 0),
    [scan.hallazgos]
  );

  return (
    <section
      aria-labelledby="titulo-documento-militar"
      className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6"
    >
      {/* Barra superior de acciones del documento */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-tactico pb-4">
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
            Imprimir documento
          </button>
        </div>
      </div>

      {/* CUERPO PRINCIPAL DEL INFORME MILITAR */}
      <article className="border border-tactico bg-panel p-6 sm:p-10 shadow-sm rounded-md text-texto">
        {/* Cabecera del documento */}
        <div className="mt-6">
          <CabeceraDocumento scan={scan} />
        </div>

        {/* Dictamen formal de Aduana */}
        <div className="mt-6">
          <SelloVeredicto scan={scan} />
        </div>

        {/* SECCIONES FORMALES DEL DOCUMENTO (EN ORDEN ESTRICTO 1 AL 8) */}
        <div className="mt-10 divide-y divide-tactico/80">
          {/* 1. OBJETIVO */}
          <section className="py-6" aria-labelledby="seccion-objetivo">
            <h2
              id="seccion-objetivo"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              1. Objetivo
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
              <p>
                {informe?.objetivo ??
                  informe?.objetivoRepo ??
                  "Establecer la inspección y verificación estricta de seguridad previa sobre el framework de arquitectura para interoperabilidad semántica y técnica C4ISR (Estado Mayor Conjunto) antes de autorizar su habilitación y consumo por agentes autónomos de código y operadores tácticos de la Fuerza de Despliegue Rápido (FDR)."}
              </p>
            </div>
          </section>

          {/* 2. ALCANCE */}
          <section className="py-6" aria-labelledby="seccion-alcance">
            <h2
              id="seccion-alcance"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              2. Alcance
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
              <p>
                {informe?.alcance ??
                  `La presente auditoría técnica comprende la totalidad del repositorio y dependencias de "${scan.objetivo}", incluyendo código fuente, archivos de configuración de despliegue táctico, manifiestos de paquetes, scripts de inicialización de nodos y documentación operacional. El análisis abarca la detección de instrucciones ocultas para agentes de software, secuencias Unicode invisibles o bidireccionales, dependencias alucinadas o no trazables, y claves o secretos expuestos.`}
              </p>
            </div>
          </section>

          {/* 3. PROBLEMÁTICA ANTERIOR */}
          <section className="py-6" aria-labelledby="seccion-problematica">
            <h2
              id="seccion-problematica"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              3. Problemática anterior
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
              <p>
                {informe?.problematicaAnterior ??
                  informe?.desafioDetectado ??
                  "Capacidades C4ISR operando de manera aislada y heterogénea entre fuerzas (fragmentación del conocimiento situacional táctico). La necesidad de interoperabilidad conllevó la incorporación de buses de mensajería y librerías heredadas sin validación criptográfica, incrementando la superficie de ataque frente a interceptaciones y ataques asistidos por IA."}
              </p>
            </div>
          </section>

          {/* 4. INTRODUCCIÓN */}
          <section className="py-6" aria-labelledby="seccion-introduccion">
            <h2
              id="seccion-introduccion"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              4. Introducción
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
              <p>
                {informe?.introduccion ??
                  "En cumplimiento de la Directiva Estratégica de Ciberdefensa y Soberanía Tecnológica, la plataforma Aduana ejecutó una auditoría integral, autónoma y desconectada (100% offline). El procedimiento combina análisis estático determinista (análisis léxico, reglas de secretos Gitleaks, Trojan Source Unicode) con triage semántico asistido por modelos de lenguaje soberanos (Ollama Llama-3.2:3b)."}
              </p>
            </div>
          </section>

          {/* 6. DESARROLLO */}
          <section className="py-6" aria-labelledby="seccion-desarrollo">
            <h2
              id="seccion-desarrollo"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              6. Desarrollo
            </h2>

            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
              <p>
                {informe?.desarrollo ??
                  "Durante la fase de inspección multidimensional se procesaron 4 módulos de control táctico: Ingesta, Instrucciones ocultas, Unicode encubierto, Dependencias y Secretos expuestos. Se detectaron vulnerabilidades de consideración que comprometen la cadena de suministro de software militar."}
              </p>
            </div>

            {/* Subsección: Métricas de impacto operacional proyectadas */}
            {informe?.metricasImpacto?.length ? (
              <div className="mt-4 border border-tactico bg-panel/60 p-4 rounded">
                <p className="text-sm font-bold uppercase tracking-wider text-cian">
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

            {/* Subsección: Resumen Cuantitativo Operacional */}
            {resumen ? (
              <div className="mt-5">
                <p className="text-sm font-bold uppercase tracking-wider text-cian">
                  Balance de Hallazgos por Severidad
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ordenSeveridad.map((sev) => (
                    <div
                      key={sev}
                      className="border border-tactico bg-panel p-3 text-center rounded"
                    >
                      <span className="font-mono text-xs uppercase tracking-widest text-texto-2">
                        {etiquetaSeveridad[sev]}
                      </span>
                      <p
                        className="mt-1 font-mono text-2xl font-bold"
                        style={{ color: colorSeveridad[sev] }}
                      >
                        {resumen.porSeveridad[sev] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ordenModulos.map((mod) => (
                    <span
                      key={mod}
                      className="border border-tactico bg-panel px-2.5 py-1 font-mono text-xs uppercase tracking-widest text-texto-2 rounded"
                    >
                      {etiquetaModulo[mod]}:{" "}
                      <strong className="text-texto">
                        {resumen.porModulo[mod] ?? 0}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Recuadro pedagógico e institucional sobre CVE */}
            <div className="mt-6 border-l-4 border-cian bg-cian/5 p-4 rounded-r border border-tactico/60">
              <h3 className="text-sm font-bold uppercase tracking-wider text-cian">
                Referencia Normativa: Diccionario CVE (Common Vulnerabilities and Exposures)
              </h3>
              <p className="mt-1 text-base leading-relaxed text-texto-2">
                Un <strong>CVE</strong> es un diccionario o lista pública que cataloga fallos de seguridad y vulnerabilidades conocidas en programas de software y equipos de hardware. Cada fallo recibe un identificador único, por ejemplo, <span className="font-mono text-cian font-semibold">CVE-2026-XXXXX</span>. En el presente informe, los hallazgos de dependencias e instrucciones hostiles referencian los identificadores CVE correspondientes para garantizar interoperabilidad técnica y trazabilidad forense.
              </p>
            </div>

            {/* Lista detallada de Hallazgos de Auditoría */}
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-cian">
                Detalle Técnico de Hallazgos por Módulo
              </h3>

              {agrupados.length === 0 ? (
                <div className="mt-3 border border-tactico bg-panel p-6 text-center rounded">
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-sello-liberado">
                    ✓ Sin observaciones críticas
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-texto-2">
                    No se evidenciaron instrucciones maliciosas, caracteres invisibles, vulnerabilidades CVE ni secretos expuestos.
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-6">
                  {agrupados.map((grupo) => (
                    <div key={grupo.modulo}>
                      <h4 className="border-b border-tactico pb-1.5 text-sm font-bold uppercase tracking-wider text-cian">
                        Módulo: {etiquetaModulo[grupo.modulo]} ({grupo.items.length})
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
          <section className="py-6" aria-labelledby="seccion-conclusion">
            <h2
              id="seccion-conclusion"
              className="text-sm font-bold uppercase tracking-wider text-cian"
            >
              7. Conclusión
            </h2>
            <div className="mt-3 text-base leading-relaxed text-texto-2 space-y-2">
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
        <footer className="mt-10 border-t border-tactico pt-4 text-center font-mono text-xs uppercase tracking-widest text-texto-2">
          Documento emitido y validado criptográficamente por la plataforma soberana Aduana · Estado Mayor Conjunto
        </footer>
      </article>
    </section>
  );
}